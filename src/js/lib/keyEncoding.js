/**
 * keyEncoding.js - Handles encoding/decoding of special keys for STO keybind files
 *
 * Some keys need to be encoded as hex values in keybind files but displayed
 * as their normal character representation in the UI.
 */

// Mapping of display key names to their encoded keybind file representation
const KEY_ENCODE_MAP = {
  '`': '0x29', // Backtick needs to be encoded as 0x29
}

// Reverse mapping for decoding (auto-generated from encode map)
const KEY_DECODE_MAP = Object.fromEntries(
  Object.entries(KEY_ENCODE_MAP).map(([key, encoded]) => [encoded, key])
)

/**
 * Encode a key name for use in keybind files
 * @param {string} keyName - Display key name (e.g., '`', 'ALT+`')
 * @returns {string} - Encoded key name for keybind file (e.g., '0x29', 'ALT+0x29')
 */
export function encodeKeyForExport(keyName) {
  // Input validation: return as-is if not a valid string
  if (typeof keyName !== 'string') {
    return keyName
  }

  // Handle chord combinations (e.g., "ALT+`" becomes "ALT+0x29")
  if (keyName.includes('+')) {
    return keyName
      .split('+')
      .map((part) => {
        const trimmedPart = part.trim()
        return KEY_ENCODE_MAP[trimmedPart] || trimmedPart
      })
      .join('+')
  }

  // Single key encoding
  return KEY_ENCODE_MAP[keyName] || keyName
}

/**
 * Decode a key name from keybind files to display name
 * @param {string} encodedKey - Encoded key from keybind file (e.g., '0x29', 'ALT+0x29')
 * @returns {string} - Display key name (e.g., '`', 'ALT+`')
 */
export function decodeKeyFromImport(encodedKey) {
  // Input validation: return as-is if not a valid string
  if (typeof encodedKey !== 'string') {
    return encodedKey
  }

  // Handle chord combinations (e.g., "ALT+0x29" becomes "ALT+`")
  if (encodedKey.includes('+')) {
    return encodedKey
      .split('+')
      .map((part) => {
        const trimmedPart = part.trim()
        return KEY_DECODE_MAP[trimmedPart] || trimmedPart
      })
      .join('+')
  }

  // Single key decoding
  return KEY_DECODE_MAP[encodedKey] || encodedKey
}

/**
 * Check if a key needs encoding for export
 * @param {string} keyName - Key name to check
 * @returns {boolean} - True if key needs encoding
 */
export function keyNeedsEncoding(keyName) {
  return keyName in KEY_ENCODE_MAP
}

/**
 * Check if a key is an encoded hex value that needs decoding
 * @param {string} keyName - Key name to check
 * @returns {boolean} - True if key is encoded and needs decoding
 */
export function keyNeedsDecoding(keyName) {
  return keyName in KEY_DECODE_MAP
}

/**
 * Get all keys that need encoding (for validation/testing)
 * @returns {string[]} - Array of key names that need encoding
 */
export function getEncodableKeys() {
  return Object.keys(KEY_ENCODE_MAP)
}

/**
 * Get all encoded key values (for validation/testing)
 * @returns {string[]} - Array of encoded key values
 */
export function getEncodedKeys() {
  return Object.values(KEY_ENCODE_MAP)
}
