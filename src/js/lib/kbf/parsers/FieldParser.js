// FieldParser.js - KBF Field Parsing Module
// Field-level parsing utilities for STO Keybind application .kbf archives
// Dependencies: Only core JavaScript APIs
//
// This module handles field-level parsing for KBF records:
// - Semicolon-delimited record parsing
// - GROUPSET/KEYSET record field extraction
// - Name, Key, KeyToken, Numeric, Boolean, Combo, and Activity field parsing
// - Bindset name sanitization
// - Key token normalization to match application's internal representation

import { STO_KEY_NAMES } from '../../../data/stoKeyNames.js'

/**
 * KBF Field Parser for handling field-level parsing in KBF records
 * Provides utilities for parsing individual fields within KBF data structures
 */
export class FieldParser {
  constructor(options = {}) {
    this.options = {
      validateUtf8: true,
      strictMode: false, // Throw errors vs. collecting warnings
      maxFileSize: 1024 * 1024, // 1MB default limit
      ...options,
    }

    // Reference to decoder for error/warning reporting
    this.decoder = options.decoder || null

    // Initialize activity translation map
    this.activityTranslations = new Map()
    this.keyTokenMap = new Map()

    // Parse state tracking
    this.parseState = {
      currentLayer: 0,
      processedBytes: 0,
      totalBytes: 0,
      errors: [],
      warnings: [],
    }
  }

  /**
   * Add error to decoder's parse state
   * @param {string} message - Error message
   * @param {Object} context - Optional context
   * @private
   */
  addError(message, context = {}) {
    if (this.decoder && typeof this.decoder.addError === 'function') {
      this.decoder.addError(message, context)
    }
  }

  /**
   * Add warning to decoder's parse state
   * @param {string} message - Warning message
   * @param {Object} context - Optional context
   * @private
   */
  addWarning(message, context = {}) {
    if (this.decoder && typeof this.decoder.addWarning === 'function') {
      this.decoder.addWarning(message, context)
    }
  }

  /**
   * Validate Base64 string format
   * @param {string} base64String - String to validate
   * @returns {boolean} True if valid Base64
   * @private
   */
  isValidBase64(base64String) {
    if (this.decoder && typeof this.decoder.isValidBase64 === 'function') {
      return this.decoder.isValidBase64(base64String)
    }
    // Fallback validation if decoder not available
    try {
      return btoa(atob(base64String)) === base64String
    } catch (error) {
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 2: GROUPSET/KEYSET record parsing
  // ---------------------------------------------------------------------------


  /**
   * Parse semicolon-delimited records into structured objects
   * @param {string} content - Semicolon-delimited content
   * @returns {Object[]} Array of record objects with fieldName and value
   * @private
   */
  parseSemicolonRecords(content) {
    const records = []

    // Split by semicolon, handling empty final segment
    const segments = content.split(';')

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i].trim()

      // Skip empty segments (including trailing empty segment)
      if (segment.length === 0) {
        continue
      }

      // Find the first colon to separate field name from value
      const colonIndex = segment.indexOf(':')

      if (colonIndex === -1) {
        // Record without colon - could be malformed or just a field name
        this.addWarning(`Record without colon separator: "${segment}"`, {
          recordIndex: i,
          segment,
        })
        records.push({
          fieldName: segment,
          value: '',
          hasColon: false,
        })
        continue
      }

      const fieldName = segment.slice(0, colonIndex).trim()
      const value = segment.slice(colonIndex + 1).trim()

      if (fieldName.length === 0) {
        this.addWarning(`Record with empty field name: "${segment}"`, {
          recordIndex: i,
          segment,
        })
        continue
      }

      records.push({
        fieldName,
        value,
        hasColon: true,
      })
    }

    return records
  }

  /**
   * Parse GROUPSET record to extract version information
   * @param {Object} record - GROUPSET record object
   * @returns {string|null} Groupset version or null if invalid
   * @private
   */
  parseGroupsetRecord(record) {
    if (!record.hasColon || !record.value) {
      this.addWarning('Invalid GROUPSET record: missing colon or value', {
        fieldName: record.fieldName,
        value: record.value,
      })
      return null
    }

    const version = record.value.trim()

    // Validate version format (should be numeric string)
    if (!/^\d+$/.test(version)) {
      this.addWarning(`Unexpected GROUPSET version format: "${version}"`, {
        version,
        expectedFormat: 'numeric string',
      })
      // Still return the version for compatibility, but log warning
    }

    return version
  }

  /**
   * Parse KEYSET record to extract payload data
   * @param {Object} record - KEYSET record object
   * @param {number} recordIndex - Record index for error reporting
   * @returns {Object} KEYSET record object with payload
   * @private
   */
  parseKeysetRecord(record, recordIndex) {
    if (!record.hasColon || !record.value) {
      this.addError('Invalid KEYSET record: missing colon or value', {
        fieldName: record.fieldName,
        value: record.value,
        recordIndex,
      })
      return null
    }

    const payload = record.value.trim()

    if (payload.length === 0) {
      this.addError('Empty KEYSET payload', {
        recordIndex,
      })
      return null
    }

    // Basic validation that payload looks like Base64
    if (!this.isValidBase64(payload)) {
      this.addWarning('KEYSET payload may not be valid Base64 data', {
        recordIndex,
        payloadLength: payload.length,
        payloadPreview: payload.slice(0, 50),
      })
      // Still include it - let Layer 3 handle the validation
    }

    return {
      type: 'KEYSET',
      payload,
      recordIndex,
      payloadSize: payload.length,
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 3: KEYSET payload decoding
  // ---------------------------------------------------------------------------

  /**
   * Parse NAME field from KEYSET record
   * @param {Object} record - NAME record object
   * @param {number} recordIndex - Record index for error reporting
   * @returns {Object|null} Name object with sanitized and display names
   * @private
   */
  parseNameField(record, recordIndex) {
    if (!record.hasColon || !record.value) {
      this.addError('Invalid NAME record: missing colon or value', {
        fieldName: record.fieldName,
        value: record.value,
        recordIndex,
      })
      return null
    }

    const displayName = record.value.trim()

    if (displayName.length === 0) {
      this.addError('Empty NAME field', {
        recordIndex,
      })
      return null
    }

    // Sanitize the name for use in identifiers
    const sanitized = this.sanitizeBindsetName(displayName)

    return {
      display: displayName,
      sanitized,
    }
  }

  /**
   * Parse KEY field from KEYSET record
   * @param {Object} record - KEY record object
   * @param {number} recordIndex - Record index within KEYSET
   * @param {number} keysetRecordIndex - Parent KEYSET record index
   * @returns {Object|null} Key record with payload data
   * @private
   */
  parseKeyField(record, recordIndex, keysetRecordIndex) {
    if (!record.hasColon || !record.value) {
      this.addError('Invalid KEY record: missing colon or value', {
        keysetRecordIndex,
        recordIndex,
        fieldName: record.fieldName,
        value: record.value,
      })
      return null
    }

    const payload = record.value.trim()

    if (payload.length === 0) {
      this.addError('Empty KEY payload', {
        keysetRecordIndex,
        recordIndex,
      })
      return null
    }

    // Basic validation that payload looks like Base64
    // Only warn if it contains characters that are clearly not base64-like
    // Allow underscores and other reasonable characters since they might be intentional
    if (!/^[A-Za-z0-9+/=_-]*$/.test(payload)) {
      this.addWarning('KEY payload may not be valid Base64 data', {
        keysetRecordIndex,
        recordIndex,
        payloadLength: payload.length,
        payloadPreview: payload.slice(0, 50),
      })
      // Still include it - let Layer 4 handle the validation
    }

    return {
      type: 'KEY',
      payload,
      recordIndex,
      keysetRecordIndex,
      payloadSize: payload.length,
    }
  }

  /**
   * Sanitize bindset name for use in alias identifiers
   * Uses established rules: lowercase, replace non-alphanumeric with underscores,
   * collapse duplicate underscores, trim, prefix numeric identifiers with `bs_`
   * @param {string} name - Original bindset name
   * @returns {string} Sanitized name suitable for alias identifiers
   * @private
   */
  sanitizeBindsetName(name) {
    if (name === null || name === undefined) {
      return 'unknown_bindset'
    }

    if (typeof name !== 'string') {
      return 'unknown_bindset'
    }

    if (name.length === 0) {
      return 'unnamed_bindset'
    }

    // Apply established sanitization rules
    let sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric characters with underscores
      .replace(/_+/g, '_') // Collapse multiple consecutive underscores
      .replace(/^_+|_+$/g, '') // Trim leading and trailing underscores

    // Prefix names starting with numbers with 'bs_'
    if (/^[0-9]/.test(sanitized)) {
      sanitized = 'bs_' + sanitized
    }

    // Ensure we have at least one character
    if (sanitized.length === 0) {
      sanitized = 'unnamed_bindset'
    }

    return sanitized
  }

  // ---------------------------------------------------------------------------
  // Layer 4: KEY record parsing
  // ---------------------------------------------------------------------------

  /**
   * Normalize key token to match application's internal key representation
   * This method ensures that KBF tokens like "SPACE", "CTRL", "ALT" are normalized
   * to match the application's STO_KEY_NAMES format (e.g., "Space", "Control", "Alt")
   * @param {string} keyToken - Raw key token from KBF file
   * @returns {string} Normalized key token
   * @private
   */
  normalizeKeyToken(keyToken) {
    // Create a case-insensitive lookup map for STO key names
    const lowerCaseMap = new Map()
    STO_KEY_NAMES.forEach(stoKey => {
      lowerCaseMap.set(stoKey.toLowerCase(), stoKey)
    })

    // Try to find exact match first
    if (STO_KEY_NAMES.includes(keyToken)) {
      return keyToken
    }

    // Try case-insensitive match
    const lowerKey = keyToken.toLowerCase()
    if (lowerCaseMap.has(lowerKey)) {
      return lowerCaseMap.get(lowerKey)
    }

    // Special case handling for common variations
    const specialCases = new Map([
      ['space', 'Space'],
      ['ctrl', 'Control'],
      ['control', 'Control'],
      ['alt', 'ALT'],
      ['shift', 'Shift'],
      ['tab', 'Tab'],
      ['enter', 'enter'],
      ['escape', 'delete'],
      ['esc', 'delete'],
      ['capslock', 'CapsLock'],
      ['backspace', 'delete'],
      ['pageup', 'PageUp'],
      ['pagedown', 'PageDown'],
      ['home', 'Home'],
      ['end', 'End'],
      ['insert', 'insert'],
      ['del', 'delete']
    ])

    if (specialCases.has(lowerKey)) {
      return specialCases.get(lowerKey)
    }

    // Return original if no match found
    return keyToken
  }

  /**
   * Parse Key token field from KEY record
   * @param {Object} record - Key field record
   * @param {number} fieldIndex - Field index for error reporting
   * @returns {string|null} Key token
   * @private
   */
  parseKeyTokenField(record, fieldIndex) {
    if (!record.hasColon) {
      this.addError('Invalid Key field: missing colon', {
        fieldName: record.fieldName,
        value: record.value,
        fieldIndex,
      })
      return null
    }

    // Handle the case where field has colon but no value (empty key)
    if (record.value === null || record.value === undefined) {
      this.addError('Empty Key field: null or undefined value', {
        fieldName: record.fieldName,
        fieldIndex,
      })
      return null
    }

    let keyToken = record.value.trim()

    if (keyToken.length === 0) {
      this.addError('Empty Key field', {
        fieldIndex,
      })
      return null
    }

    // Handle special token "SemiColon" conversion to ";"
    if (keyToken === 'SemiColon') {
      keyToken = ';'
    } else if (keyToken === 'Space') {
      // Handle special token "Space" conversion to quoted space character
      keyToken = ' '
    } else {
      // Apply key token normalization for all other keys
      // This ensures uppercase tokens like "SPACE", "CTRL", "ALT" are normalized
      // to match the application's internal key representation
      keyToken = this.normalizeKeyToken(keyToken)
    }

    return keyToken
  }

  /**
   * Parse numeric field with optional range validation
   * @param {Object} record - Record object
   * @param {number} fieldIndex - Field index for error reporting
   * @param {string} fieldName - Name of the field for error messages
   * @param {number} minValue - Minimum allowed value (optional)
   * @param {number} maxValue - Maximum allowed value (optional)
   * @returns {number|null} Parsed numeric value or null if invalid
   * @private
   */
  parseNumericField(
    record,
    fieldIndex,
    fieldName,
    minValue = null,
    maxValue = null
  ) {
    if (!record.hasColon || !record.value) {
      this.addError(`Invalid ${fieldName} field: missing colon or value`, {
        fieldName: record.fieldName,
        value: record.value,
        fieldIndex,
      })
      return null
    }

    const value = record.value.trim()

    if (value.length === 0) {
      this.addError(`Empty ${fieldName} field`, {
        fieldIndex,
      })
      return null
    }

    // Validate that value is numeric (allow negative numbers)
    if (!/^-?\d+$/.test(value)) {
      this.addError(`Invalid ${fieldName} field: must be numeric`, {
        fieldIndex,
        value,
      })
      return null
    }

    const numericValue = parseInt(value, 10)

    // Range validation if provided
    if (minValue !== null && numericValue < minValue) {
      this.addWarning(`${fieldName} value below minimum, using minimum`, {
        fieldIndex,
        value: numericValue,
        minValue,
      })
      return minValue
    }

    if (maxValue !== null && numericValue > maxValue) {
      this.addWarning(`${fieldName} value above maximum, using maximum`, {
        fieldIndex,
        value: numericValue,
        maxValue,
      })
      return maxValue
    }

    return numericValue
  }

  /**
   * Parse boolean field (0 or 1)
   * @param {Object} record - Record object
   * @param {number} fieldIndex - Field index for error reporting
   * @param {string} fieldName - Name of the field for error messages
   * @returns {boolean} Parsed boolean value
   * @private
   */
  parseBooleanField(record, fieldIndex, fieldName) {
    if (!record.hasColon || !record.value) {
      this.addError(`Invalid ${fieldName} field: missing colon or value`, {
        fieldName: record.fieldName,
        value: record.value,
        fieldIndex,
      })
      return false
    }

    const value = record.value.trim()

    if (value.length === 0) {
      this.addError(`Empty ${fieldName} field`, {
        fieldIndex,
      })
      return false
    }

    // Accept only "0" or "1" as valid boolean values
    if (value === '1') {
      return true
    } else if (value === '0') {
      return false
    } else {
      this.addWarning(
        `Invalid ${fieldName} field: expected 0 or 1, using false`,
        {
          fieldIndex,
          value,
        }
      )
      return false
    }
  }

  /**
   * Parse Combo field with *-delimited base64 tokens
   * @param {Object} record - Combo field record
   * @param {number} fieldIndex - Field index for error reporting
   * @returns {string[]} Array of decoded combo tokens
   * @private
   */
  parseComboField(record, fieldIndex) {
    if (!record.hasColon) {
      this.addError('Invalid Combo field: missing colon', {
        fieldName: record.fieldName,
        value: record.value,
        fieldIndex,
      })
      return []
    }

    const comboValue = record.value.trim()

    if (comboValue.length === 0) {
      // Empty combo field is valid (no combo)
      return []
    }

    // Split by * delimiter and trim trailing empty entries (including trailing * delimiters)
    // Remove empty strings from the result
    const tokens = comboValue.split('*').filter((token) => token.length > 0)

    if (tokens.length === 0) {
      // All tokens were empty after filtering (e.g., just "*" or empty)
      return []
    }

    const decodedTokens = []

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].trim()

      if (token.length === 0) {
        // Skip empty tokens (shouldn't happen due to filtering, but be safe)
        continue
      }

      // Basic validation that token looks like Base64
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(token)) {
        this.addWarning(`Combo token may not be valid Base64 data`, {
          fieldIndex,
          tokenIndex: i,
          token,
        })
        // Skip invalid tokens completely
        continue
      }

      // Base64-decode each token
      try {
        const decodedToken = atob(token)
        if (decodedToken.length > 0) {
          decodedTokens.push(decodedToken)
        }
      } catch (error) {
        this.addWarning(`Failed to decode combo token: ${error.message}`, {
          fieldIndex,
          tokenIndex: i,
          token,
          errorType: error.name,
        })
        // Skip this token and continue with others
      }
    }

    return decodedTokens
  }

  /**
   * Parse ACT field containing base64 activity payload
   * @param {Object} record - ACT field record
   * @param {number} fieldIndex - Field index for error reporting
   * @returns {Object|null} Activity record with payload
   * @private
   */
  parseActivityField(record, fieldIndex) {
    if (!record.hasColon || !record.value) {
      this.addError('Invalid ACT field: missing colon or value', {
        fieldName: record.fieldName,
        value: record.value,
        fieldIndex,
      })
      return null
    }

    const payload = record.value.trim()

    if (payload.length === 0) {
      this.addError('Empty ACT payload', {
        fieldIndex,
      })
      return null
    }

    // Basic validation that payload looks like Base64
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
      this.addWarning('ACT payload may not be valid Base64 data', {
        fieldIndex,
        payloadLength: payload.length,
        payloadPreview: payload.slice(0, 50),
      })
      // Still include it - let Layer 5 handle the validation
    }

    return {
      type: 'ACT',
      payload,
      fieldIndex,
      payloadSize: payload.length,
    }
  }

  /**
   * Parse Base64-encoded text field from ACT record
   * @param {Object} record - Text field record
   * @param {number} fieldIndex - Field index for error reporting
   * @returns {string|null} Decoded UTF-8 string or null if invalid
   * @private
   */
  parseBase64TextField(record, fieldIndex) {
    if (!record.hasColon) {
      this.addError(`Invalid ${record.fieldName} field: missing colon`, {
        fieldName: record.fieldName,
        value: record.value,
        fieldIndex,
      })
      return null
    }

    // Handle the case where field has colon but no value (empty text field)
    if (record.value === null || record.value === undefined) {
      // Empty text fields are valid in KBF format
      return ''
    }

    const base64Text = record.value.trim()

    if (base64Text.length === 0) {
      // Empty text fields are valid in KBF format
      return ''
    }

    // Basic validation that text looks like Base64
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Text)) {
      this.addWarning(
        `${record.fieldName} field may not be valid Base64 data`,
        {
          fieldIndex,
          textLength: base64Text.length,
          textPreview: base64Text.slice(0, 50),
        }
      )
      // Still try to decode it - let Base64 decoding handle the error
    }

    // Base64 decode the text content
    try {
      // Convert base64 to binary string, then to Uint8Array for proper UTF-8 decoding
      const binaryString = atob(base64Text)
      const utf8Bytes = new Uint8Array(binaryString.length)

      for (let i = 0; i < binaryString.length; i++) {
        utf8Bytes[i] = binaryString.charCodeAt(i)
      }

      // Decode UTF-8 bytes properly
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true })
        const validUtf8Text = decoder.decode(utf8Bytes)
        return validUtf8Text
      } catch (utf8Error) {
        // If UTF-8 validation fails, fall back to non-fatal decoding
        this.addWarning(
          `${record.fieldName} field contains invalid UTF-8 data, using fallback decoding`,
          {
            fieldIndex,
            errorType: utf8Error.name,
            errorMessage: utf8Error.message,
          }
        )

        try {
          const decoder = new TextDecoder('utf-8', { fatal: false })
          const fallbackText = decoder.decode(utf8Bytes)
          return fallbackText
        } catch (fallbackError) {
          this.addError(
            `Complete ${record.fieldName} field UTF-8 decoding failure`,
            {
              fieldIndex,
              errorType: fallbackError.name,
              errorMessage: fallbackError.message,
            }
          )
          return '' // Return empty string as last resort
        }
      }
    } catch (error) {
      this.addError(`Failed to Base64 decode ${record.fieldName} field`, {
        fieldIndex,
        errorType: error.name,
        errorMessage: error.message,
        textLength: base64Text.length,
      })
      return '' // Return empty string as last resort
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 5: ACT activity record parsing
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Layer 6: Text/Text2 UTF-8 decoding
  // ---------------------------------------------------------------------------
}

/**
 * Create a standalone KBF field parser instance
 * @param {Object} options - Configuration options
 * @returns {FieldParser} Configured field parser instance
 */
export function createFieldParser(options = {}) {
  return new FieldParser(options)
}

export default FieldParser
