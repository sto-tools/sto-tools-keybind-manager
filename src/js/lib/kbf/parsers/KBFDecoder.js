// KBFDecoder.js - High-level decoder orchestrator
// Coordinates the 6-layer decode pipeline, diagnostic tracking, and validation helpers

import FieldParser from './FieldParser.js'
import ActivityTranslator from '../translation/ActivityTranslator.js'
import ParseState from './ParseState.js'
import KBFDecodePipeline from './KBFDecodePipeline.js'
import eventBus from '../../../core/eventBus.js'
import {
  normalizeInputForDecoding,
  decodeBase64,
  isValidBase64,
} from './decoderUtils.js'

export class KBFDecoder {
  constructor(options = {}) {
    this.options = {
      validateUtf8: true,
      strictMode: false,
      maxFileSize: 1024 * 1024,
      ...options,
    }

    // Initialize EventBus and pass to ParseState
    this.eventBus = options.eventBus || eventBus
    this.parseState = new ParseState(this.eventBus)
    this.fieldParser = new FieldParser({ ...options, decoder: this })
    this.activityTranslator = new ActivityTranslator({
      ...options,
      decoder: this,
    })
    this.pipeline = new KBFDecodePipeline({
      decoder: this,
      fieldParser: this.fieldParser,
      activityTranslator: this.activityTranslator,
      parseState: this.parseState,
    })
  }

  parseFile(content, options = {}) {
    this.resetParseState()

    try {
      return this.pipeline.run(content, {
        targetEnvironment: options.targetEnvironment || 'space',
        includeMetadata:
          options.includeMetadata !== undefined ? options.includeMetadata : true,
      })
    } catch (error) {
      this.addError(`Critical parsing error: ${error.message}`, {
        error: error.name,
        stack: error.stack,
      })
      return this.buildParseResult()
    }
  }

  buildParseResult() {
    return {
      bindsets: {},
      aliases: {},
      errors: [...this.parseState.errors],
      warnings: [...this.parseState.warnings],
      stats: {
        totalBindsets: 0,
        totalKeys: 0,
        totalAliases: 0,
        processedLayers: [],
        skippedActivities: 0,
      },
    }
  }

  validateFormat(content) {
    const startTime = Date.now()
    const result = {
      isValid: false,
      isKBF: false,
      estimatedSize: 0,
      estimatedKeysets: 0,
      format: 'unknown',
      errors: [],
      warnings: [],
      processingTime: 0,
    }

    const originalSize =
      typeof content === 'string'
        ? content.length
        : content &&
          typeof content === 'object' &&
          content.byteLength !== undefined
        ? content.byteLength
        : 0

    const addError = (message) => result.errors.push(message)
    const addWarning = (message) => result.warnings.push(message)

    try {
      if (!content) {
        addError('No content provided for validation')
        return result
      }

      const normalized = normalizeInputForDecoding(content, {
        addError: (message) => addError(message),
        layerName: 'Validation',
      })

      if (!normalized.success) {
        return result
      }

      let base64Content = normalized.content
      result.estimatedSize = originalSize

      if (typeof base64Content === 'string') {
        result.estimatedSize = Math.max(
          result.estimatedSize,
          base64Content.length
        )
      }

      if (base64Content.length < 8) {
        addError('Content too small to be a valid KBF file')
        return result
      }

      const cleanedContent = base64Content
        .trim()
        .replace(/\s+/g, '')
        .replace(/[\r\n\t]/g, '')

      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
      if (!base64Regex.test(cleanedContent)) {
        addError('Invalid Base64 format')
        return result
      }

      if (cleanedContent.length < 8) {
        addError('Base64 content too small to contain valid KBF data')
        return result
      }

      const layer2Content = decodeBase64(cleanedContent, {
        addError: (message) => addError(message),
        addWarning: (message) => addWarning(message),
        layerName: 'Validation',
      })

      if (!layer2Content || layer2Content.length === 0) {
        addError('Base64 decoding produced empty result')
        return result
      }

      const hasSemicolons = layer2Content.includes(';')
      const hasKeysetMarkers = layer2Content.includes('KEYSET:')
      const hasGroupsetMarkers = layer2Content.includes('GROUPSET:')

      if (!hasKeysetMarkers && !hasGroupsetMarkers) {
        addError(
          'Content does not appear to be a valid KBF format - KEYSET or GROUPSET markers required'
        )
        return result
      }

      if (!hasSemicolons) {
        addError('Invalid KBF format - missing semicolon record delimiters')
        return result
      }

      result.isKBF = true
      result.format = hasGroupsetMarkers ? 'kbf-groupset' : 'kbf-keyset'

      const keysetMatches = (layer2Content.match(/KEYSET:/g) || []).length
      result.estimatedKeysets = Math.max(1, keysetMatches)

      const validRecordPattern = /^[A-Z_]+:[^;]*;/gm
      const validRecords = (layer2Content.match(validRecordPattern) || []).length
      const totalRecords = (layer2Content.match(/;/g) || []).length

      if (totalRecords > 0 && validRecords / totalRecords < 0.8) {
        addWarning('Many records appear to have invalid format')
      }

      result.isValid = result.isKBF
    } catch (error) {
      addError(`Validation error: ${error.message}`)
      result.isValid = false
    } finally {
      result.processingTime = Date.now() - startTime
    }

    return result
  }

  addError(message, context = {}) {
    const error = {
      message,
      layer: this.parseState.currentLayer,
      ...(context.recordIndex !== undefined && {
        recordIndex: context.recordIndex,
      }),
      ...(context.timestamp !== undefined && { timestamp: context.timestamp }),
      ...(context.recoverable !== undefined && {
        recoverable: context.recoverable,
      }),
      ...Object.fromEntries(
        Object.entries(context).filter(
          ([key]) =>
            ![
              'recordIndex',
              'timestamp',
              'recoverable',
              'category',
              'severity',
              'fieldName',
              'recordType',
              'suggestion',
            ].includes(key)
        )
      ),
    }

    this.parseState.errors.push(error)

    if (this.options.strictMode && context.severity === 'critical') {
      throw new Error(
        `KBF Decoder Critical Error [Layer ${this.parseState.currentLayer}]: ${message}`
      )
    }
  }

  addWarning(message, context = {}) {
    const warning = {
      message,
      layer: this.parseState.currentLayer,
      ...(context.recordIndex !== undefined && {
        recordIndex: context.recordIndex,
      }),
      ...Object.fromEntries(
        Object.entries(context).filter(
          ([key]) =>
            ![
              'category',
              'severity',
              'fieldName',
              'recordType',
              'suggestion',
            ].includes(key)
        )
      ),
    }

    this.parseState.warnings.push(warning)
  }

  
  isValidBase64(base64String) {
    return isValidBase64(base64String)
  }

  decodeLayer1(content) {
    return this.pipeline.decodeLayer1(content)
  }

  parseLayer2(content) {
    return this.pipeline.parseLayer2(content)
  }

  parseLayer3(keysetRecord) {
    return this.pipeline.parseLayer3(keysetRecord)
  }

  parseLayer4(keyData) {
    return this.pipeline.parseLayer4(keyData)
  }

  parseLayer5(activityData) {
    return this.pipeline.parseLayer5(activityData)
  }

  decodeLayer6(text) {
    return this.pipeline.decodeLayer6(text)
  }

  
  resetParseState() {
    this.parseState.reset()
  }
}

export function createKBFDecoder(options = {}) {
  return new KBFDecoder(options)
}

export default KBFDecoder
