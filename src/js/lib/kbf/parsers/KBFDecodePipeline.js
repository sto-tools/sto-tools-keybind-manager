import {
  normalizeInputForDecoding,
  decodeBase64,
  decodeUtf8,
} from './decoderUtils.js'
import { parseStructuredRecords } from './recordParser.js'

export class KBFDecodePipeline {
  constructor({ decoder, fieldParser, activityTranslator, parseState }) {
    this.decoder = decoder
    this.fieldParser = fieldParser
    this.activityTranslator = activityTranslator
    this.parseState = parseState

    this.addError = this.decoder.addError.bind(this.decoder)
    this.addWarning = this.decoder.addWarning.bind(this.decoder)
  }

  run(content, options = {}) {
    const {
      targetEnvironment = 'space',
      includeMetadata = true,
    } = options

    const parseResult = this.createEmptyResult()

    const layer1 = this.decodeLayer1(content)
    if (!layer1) {
      return this.finalizeResult(parseResult)
    }

    const layer2 = this.parseLayer2(layer1)

    
    if (!layer2.success || layer2.keysets.length === 0) {
      return this.finalizeResult(parseResult)
    }

    for (const keysetRecord of layer2.keysets) {
      const layer3 = this.parseLayer3(keysetRecord)
      if (!layer3.success) {
        continue
      }

      const bindsetName = layer3.name
      parseResult.bindsets[bindsetName] = {
        keys: {},
        aliases: {},
        metadata: {},
      }

      console.log(`DEBUG: Processing bindset "${bindsetName}" with ${layer3.keys.length} keys`);

      for (const keyData of layer3.keys) {
        const layer4 = this.parseLayer4(keyData)
        console.log(`DEBUG: Layer4 for key:`, {
          success: layer4.success,
          hasKey: !!layer4.key,
          key: layer4.key,
          hasActivities: layer4.activities?.length || 0,
          errors: layer4.errors?.length || 0
        })

        if (!layer4.success) {
          console.log(`DEBUG: Skipping key due to layer4 failure`);
          continue
        }

        const canonicalKey = this.activityTranslator.mapKeyToken(
          layer4.key,
          layer4.modifiers,
          layer4.combo
        )

        if (!canonicalKey) {
          this.addWarning(
            `Failed to create canonical key for token: ${layer4.key}`,
            {
              keyToken: layer4.key,
              modifiers: layer4.modifiers,
              combo: layer4.combo,
            }
          )
          continue
        }

        parseResult.bindsets[bindsetName].keys[canonicalKey] = {
          commands: [],
          metadata: {},
        }

        // Track if stabilization-requiring activities were processed
        let requiresStabilization = false
        const processedActivities = []
        for (const activityData of layer4.activities) {
          const layer5 = this.parseLayer5(activityData)
          if (!layer5.success) {
            continue
          }

          // Track if stabilization-requiring activities were processed
          if (layer5.activity === 13 || layer5.activity === 26 || layer5.activity === 95) {
            requiresStabilization = true
          }

          // Only decode text fields as Base64 for specific activities that require it
          // Activities 99 and 105 use plain text, not Base64
          const requiresBase64Decoding = [
            // Add activity IDs that actually need Base64 decoding here
            // Currently none identified as needing Base64 decoding
          ]

          let decodedText = layer5.text || ''
          let decodedText2 = layer5.text2 || ''

          if (requiresBase64Decoding.includes(layer5.activity)) {
            decodedText = layer5.text ? this.decodeLayer6(layer5.text) : ''
            decodedText2 = layer5.text2 ? this.decodeLayer6(layer5.text2) : ''
          }

          const context = {
            environment: targetEnvironment,
            bindsetName,
            keyToken: canonicalKey,
            modifiers: layer4.modifiers || {},
            combo: layer4.combo || [],
            sanitize: (name) => this.fieldParser.sanitizeBindsetName(name),
          }

          const translation = this.activityTranslator.translateActivity(
            layer5.activity,
            {
              ...context,
              activity: layer5.activity,
              text: decodedText,
              text2: decodedText2,
              n1: layer5.n1,
              n2: layer5.n2,
              n3: layer5.n3,
              order: layer5.order,
            }
          )

          const { commands, aliases } =
            this.normalizeTranslationResult(translation)

          if (commands.length > 0) {
            processedActivities.push({
              activity: layer5.activity,
              commands,
              order: layer5.order || 0,
            })

            aliases.forEach((alias) => {
              parseResult.aliases[alias.name] = alias
            })
          } else {
            parseResult.stats.skippedActivities++
          }
        }

        processedActivities.sort((a, b) => a.order - b.order)
        for (const activity of processedActivities) {
          parseResult.bindsets[bindsetName].keys[
            canonicalKey
          ].commands.push(...activity.commands)
        }

        // Set stabilization metadata based on activity tracking (replacing PriorityOrder logic)
        if (requiresStabilization && includeMetadata) {
          parseResult.bindsets[bindsetName].keys[
            canonicalKey
          ].metadata.stabilizeExecutionOrder = true
        }

        parseResult.stats.totalKeys++
      }

      parseResult.stats.totalBindsets++
    }

    return this.finalizeResult(parseResult)
  }

  createEmptyResult() {
    return {
      bindsets: {},
      aliases: {},
      errors: [],
      warnings: [],
      stats: {
        totalBindsets: 0,
        totalKeys: 0,
        totalAliases: 0,
        processedLayers: [],
        skippedActivities: 0,
      },
    }
  }

  finalizeResult(result) {
    result.errors = [...this.parseState.errors]
    result.warnings = [...this.parseState.warnings]
    result.stats.totalAliases = Object.keys(result.aliases).length
    result.stats.processedLayers = [1, 2, 3, 4, 5, 6]
    return result
  }

  decodeLayer1(content) {
    const normalized = normalizeInputForDecoding(content, {
      addError: this.addError,
      layerName: 'Layer 1',
    })

    if (!normalized.success) {
      return ''
    }

    const decoded = decodeBase64(normalized.content, {
      addError: this.addError,
      addWarning: this.addWarning,
      layerName: 'Layer 1',
      minSize: 8,
      cleanWhitespace: true,
    })

    return decoded
  }

  parseLayer2(content) {
    const resultShape = { keysets: [] }

    if (typeof content !== 'string') {
      this.addError('Invalid Layer 2 content: expected string', {
        contentType: typeof content,
      })
      return { ...resultShape, success: false }
    }

    const trimmed = content.trim()
    if (trimmed.length === 0) {
      this.addError('Layer 2 content is empty after trimming')
      return { ...resultShape, success: false }
    }

    const records = this.fieldParser.parseSemicolonRecords(trimmed)
    if (records.length === 0) {
      this.addError('No records found in Layer 2 content', {
        decodedLength: trimmed.length,
      })
      return { ...resultShape, success: false }
    }

    const keysetRecords = []
    let groupsetVersion = null

    records.forEach((record, index) => {
      if (!record || !record.fieldName) {
        this.addWarning('Skipping empty or invalid record in Layer 2', {
          recordIndex: index,
          record,
        })
        return
      }

      const fieldName = record.fieldName.toUpperCase()

      switch (fieldName) {
        case 'GROUPSET': {
          const version = this.fieldParser.parseGroupsetRecord(record)
          if (version) {
            groupsetVersion = version
          }
          break
        }

        case 'KEYSET': {
          const keysetRecord = this.fieldParser.parseKeysetRecord(
            record,
            index
          )
          if (keysetRecord) {
            keysetRecord.recordIndex = index
            keysetRecords.push(keysetRecord)
          }
          break
        }

        default:
          this.addWarning(
            `Ignoring unknown Layer 2 record type: ${record.fieldName}`,
            {
              recordIndex: index,
              fieldName: record.fieldName,
            }
          )
      }
    })

    if (keysetRecords.length === 0) {
      this.addError(
        'No KEYSET records found in Layer 2 content - KEYSET wrapper is required',
        {
          foundRecords: records.length,
          hasGroupset: !!groupsetVersion,
        }
      )
      return { ...resultShape, success: false }
    }

    const validKeysets = keysetRecords.filter(
      (keyset) => keyset && keyset.payload
    )

    if (validKeysets.length === 0) {
      this.addError('All KEYSET records were invalid or empty', {
        originalCount: keysetRecords.length,
      })
    }

    validKeysets.forEach((keyset) => {
      keyset.groupsetVersion = groupsetVersion
    })

    return { ...resultShape, keysets: validKeysets, success: true }
  }

  parseLayer3(keysetRecord) {

    if (!keysetRecord || typeof keysetRecord !== 'object') {
        this.addError('Invalid keysetRecord parameter for Layer 3 parsing', {
          keysetRecord,
          expectedType: 'object',
        })
        return { success: false }
      }

      const decoded = decodeBase64(keysetRecord.payload, {
        addError: this.addError,
        addWarning: this.addWarning,
        layerName: 'Layer 3',
        context: { recordIndex: keysetRecord.recordIndex },
      })

      if (!decoded) {
        return { success: false }
      }

      const records = this.fieldParser.parseSemicolonRecords(decoded)

      if (records.length === 0) {
        this.addError('No records found in KEYSET payload', {
          recordIndex: keysetRecord.recordIndex,
          decodedLength: decoded.length,
        })
      }

      const baseContext = {
        keysetRecordIndex: keysetRecord.recordIndex,
      }

      const spec = {
        fields: {
          NAME: {
            key: 'name',
            parser: (record, meta) =>
              this.fieldParser.parseNameField(record, meta.index),
            set: (values, parsed) => {
              if (parsed) {
                values.name = parsed.sanitized
                values.displayName = parsed.display
              }
            },
            onDuplicate: (meta) =>
              this.addWarning(
                'Multiple NAME fields found in KEYSET, using first one',
                {
                  keysetRecordIndex: keysetRecord.recordIndex,
                  recordIndex: meta.index,
                }
              ),
          },
        },
        collections: {
          KEY: {
            key: 'keys',
            parser: (record, meta) =>
              this.fieldParser.parseKeyField(
                record,
                meta.index,
                keysetRecord.recordIndex
              ),
          },
        },
        onUnknown: (record, meta) => {
          this.addWarning(
            `Ignoring unknown KEYSET record type: ${record.fieldName}`,
            {
              keysetRecordIndex: keysetRecord.recordIndex,
              recordIndex: meta.index,
              fieldName: record.fieldName,
              hasValue: !!record.value,
            }
          )

          if (record.fieldName.toUpperCase().includes('UNKNOWN')) {
            this.addWarning(`Ignoring UNKNOWN record type: ${record.fieldName}`, {
              keysetRecordIndex: keysetRecord.recordIndex,
              recordIndex: meta.index,
              fieldName: record.fieldName,
              hasValue: !!record.value,
            })
          }
        },
        postProcess: ({ values, collections }) => {
          if (!values.name) {
            const defaultName = `Imported_Keyset_${keysetRecord.recordIndex}`
            values.name = this.fieldParser.sanitizeBindsetName(defaultName)
            values.displayName = defaultName
            this.addWarning('No NAME field found in KEYSET, using generated name', {
              keysetRecordIndex: keysetRecord.recordIndex,
              generatedName: defaultName,
            })
          }

          if (!collections.keys || collections.keys.length === 0) {
            this.addError('No KEY entries found in KEYSET', {
              keysetRecordIndex: keysetRecord.recordIndex,
              keysetName: values.displayName,
            })
          }
        },
      }

      const { values, collections } = parseStructuredRecords(
        records,
        spec,
        this.helpers(),
        baseContext
      )

      return {
        recordIndex: keysetRecord?.recordIndex || 0,
        name: values.name,
        displayName: values.displayName,
        keys: collections.keys || [],
        groupsetVersion: keysetRecord.groupsetVersion || null,
        success: true,
      }
  }

  parseLayer4(keyData) {

    const context = {
        recordIndex: keyData?.recordIndex || 0,
        keysetRecordIndex: keyData?.keysetRecordIndex || 0,
      }

      let payload
      const buildDefaultResult = () => ({
        recordIndex: context.recordIndex,
        keysetRecordIndex: context.keysetRecordIndex,
        key: null,
        priorityOrder: 0,
        modifiers: { control: false, alt: false, shift: false },
        combo: [],
        activities: [],
        success: false,
      })

      if (typeof keyData === 'string') {
        payload = keyData
      } else if (keyData && typeof keyData === 'object' && keyData.payload) {
        payload = keyData.payload
        context.recordIndex = keyData.recordIndex || 0
        context.keysetRecordIndex = keyData.keysetRecordIndex || 0
      } else {
        this.addError('Invalid keyData parameter for Layer 4 parsing', {
          keyData,
          expectedType: 'string|object',
        })
        return buildDefaultResult()
      }

      if (payload === undefined || payload === null) {
        this.addError('KEY payload is missing, invalid, or empty', {
          ...context,
          payloadType: typeof payload,
        })
        return buildDefaultResult()
      }

      if (typeof payload !== 'string') {
        this.addError('KEY payload is missing, invalid, or empty', {
          ...context,
          payloadType: typeof payload,
        })
        return buildDefaultResult()
      }

      const trimmedPayload = payload.trim()
      if (trimmedPayload.length === 0) {
        this.addError('KEY payload is empty', {
          ...context,
        })
        return buildDefaultResult()
      }

      const decoded = decodeBase64(trimmedPayload, {
        addError: this.addError,
        addWarning: this.addWarning,
        layerName: 'Layer 4',
        context,
        errorMessages: {
          invalidBase64: 'KEY payload contains invalid Base64 data',
          decodeFailed: 'Layer 4 Base64 decoding failed',
          emptyResult: 'Layer 4 decoding produced empty result',
        },
      })

      if (!decoded) {
        return buildDefaultResult()
      }

      const records = this.fieldParser.parseSemicolonRecords(decoded)
      if (records.length === 0) {
        this.addError('No records found in KEY payload', {
          recordIndex: context.recordIndex,
          decodedLength: decoded.length,
        })
        return buildDefaultResult()
      }

      const spec = {
        fields: {
          KEY: {
            key: 'key',
            parser: (record, meta) =>
              this.fieldParser.parseKeyTokenField(record, meta.index),
            onDuplicate: (meta) =>
              this.addWarning(
                'Multiple Key fields found in KEY, using first one',
                {
                  keysetRecordIndex: context.keysetRecordIndex,
                  recordIndex: context.recordIndex,
                  fieldIndex: meta.index,
                }
              ),
          },
          PRIORITYORDER: {
            key: 'priorityOrder',
            parser: (record, meta) =>
              this.fieldParser.parseNumericField(
                record,
                meta.index,
                'PriorityOrder',
                0,
                1
              ),
            onDuplicate: (meta) =>
              this.addWarning(
                'Multiple PriorityOrder fields found in KEY, using first one',
                {
                  keysetRecordIndex: context.keysetRecordIndex,
                  recordIndex: context.recordIndex,
                  fieldIndex: meta.index,
                }
              ),
          },
          CONTROL: {
            key: 'control',
            parser: (record, meta) =>
              this.fieldParser.parseBooleanField(record, meta.index, 'Control'),
            onDuplicate: (meta) =>
              this.addWarning('Multiple Control fields found in KEY, using first one', {
                keysetRecordIndex: context.keysetRecordIndex,
                recordIndex: context.recordIndex,
                fieldIndex: meta.index,
              }),
          },
          ALT: {
            key: 'alt',
            parser: (record, meta) =>
              this.fieldParser.parseBooleanField(record, meta.index, 'Alt'),
            onDuplicate: (meta) =>
              this.addWarning('Multiple Alt fields found in KEY, using first one', {
                keysetRecordIndex: context.keysetRecordIndex,
                recordIndex: context.recordIndex,
                fieldIndex: meta.index,
              }),
          },
          SHIFT: {
            key: 'shift',
            parser: (record, meta) =>
              this.fieldParser.parseBooleanField(record, meta.index, 'Shift'),
            onDuplicate: (meta) =>
              this.addWarning(
                'Multiple Shift fields found in KEY, using first one',
                {
                  keysetRecordIndex: context.keysetRecordIndex,
                  recordIndex: context.recordIndex,
                  fieldIndex: meta.index,
                }
              ),
          },
          COMBO: {
            key: 'combo',
            parser: (record, meta) =>
              this.fieldParser.parseComboField(record, meta.index),
            onDuplicate: (meta) =>
              this.addWarning(
                'Multiple Combo fields found in KEY, using first one',
                {
                  keysetRecordIndex: context.keysetRecordIndex,
                  recordIndex: context.recordIndex,
                  fieldIndex: meta.index,
                }
              ),
          },
        },
        collections: {
          ACT: {
            key: 'activities',
            parser: (record, meta) =>
              this.fieldParser.parseActivityField(record, meta.index),
          },
        },
        onUnknown: (record, meta) => {
          this.addWarning(
            `Ignoring unknown KEY record type: ${record.fieldName}`,
            {
              keysetRecordIndex: context.keysetRecordIndex,
              recordIndex: context.recordIndex,
              fieldIndex: meta.index,
              fieldName: record.fieldName,
              hasValue: !!record.value,
            }
          )
        },
      }

      const { values, collections } = parseStructuredRecords(
        records,
        spec,
        this.helpers(),
        {
          keysetRecordIndex: context.keysetRecordIndex,
          recordIndex: context.recordIndex,
        }
      )

      if (!values.key) {
        this.addError('Missing required Key field in KEY payload', {
          keysetRecordIndex: context.keysetRecordIndex,
          recordIndex: context.recordIndex,
        })
        return buildDefaultResult()
      }

      return {
        recordIndex: context.recordIndex,
        keysetRecordIndex: context.keysetRecordIndex,
        key: values.key,
        priorityOrder: values.priorityOrder || 0,
        modifiers: {
          control: !!values.control,
          alt: !!values.alt,
          shift: !!values.shift,
        },
        combo: values.combo || [],
        activities: collections.activities || [],
        success: true,
      }
  }

  parseLayer5(activityData) {

    const { payload, context } = this.extractPayload(activityData)

      const buildDefaultResult = () => ({
        activity: null,
        text: null,
        text2: null,
        n1: null,
        n2: null,
        n3: null,
        order: 0,
        fieldIndex: context.fieldIndex,
        recordIndex: context.recordIndex,
        keysetRecordIndex: context.keysetRecordIndex,
        success: false,
      })

      let inputPayload = payload
      if (typeof activityData === 'object' && activityData?.payload) {
        inputPayload = activityData.payload
      }

      if (!inputPayload || typeof inputPayload !== 'string') {
        this.addError('ACT payload is missing, invalid, or empty', {
          ...context,
          payloadType: typeof inputPayload,
        })
        return buildDefaultResult()
      }

      const trimmedPayload = inputPayload.trim()
      if (trimmedPayload.length === 0) {
        this.addError('ACT payload is empty', context)
        return buildDefaultResult()
      }

      const decoded = decodeBase64(trimmedPayload, {
        addError: this.addError,
        addWarning: this.addWarning,
        layerName: 'Layer 5',
        context: {
          fieldIndex: context.fieldIndex,
          recordIndex: context.recordIndex,
          keysetRecordIndex: context.keysetRecordIndex,
        },
        errorMessages: {
          invalidBase64: 'ACT payload contains invalid Base64 data',
          decodeFailed: 'Layer 5 Base64 decoding failed',
          emptyResult: 'Layer 5 decoding produced empty result',
        },
      })

      if (!decoded) {
        return buildDefaultResult()
      }

      const records = this.fieldParser.parseSemicolonRecords(decoded)
      if (records.length === 0) {
        this.addError('No records found in ACT payload', {
          fieldIndex: context.fieldIndex,
          decodedLength: decoded.length,
        })
        return buildDefaultResult()
      }

      const spec = {
        fields: {
          ACTIVITY: {
            key: 'activity',
            parser: (record, meta) =>
              this.fieldParser.parseNumericField(record, meta.index, 'Activity'),
            onDuplicate: (meta) =>
              this.addWarning(
                'Multiple Activity fields found in ACT, using first one',
                {
                  keysetRecordIndex: context.keysetRecordIndex,
                  recordIndex: context.recordIndex,
                  fieldIndex: context.fieldIndex,
                  activityFieldIndex: meta.index,
                }
              ),
          },
          TEXT: {
            key: 'text',
            parser: (record, meta) =>
              this.fieldParser.parseBase64TextField(record, meta.index),
            onDuplicate: (meta) =>
              this.addWarning('Multiple Text fields found in ACT, using first one', {
                keysetRecordIndex: context.keysetRecordIndex,
                recordIndex: context.recordIndex,
                fieldIndex: context.fieldIndex,
                activityFieldIndex: meta.index,
              }),
          },
          TEXT2: {
            key: 'text2',
            parser: (record, meta) =>
              this.fieldParser.parseBase64TextField(record, meta.index),
            onDuplicate: (meta) =>
              this.addWarning('Multiple Text2 fields found in ACT, using first one', {
                keysetRecordIndex: context.keysetRecordIndex,
                recordIndex: context.recordIndex,
                fieldIndex: context.fieldIndex,
                activityFieldIndex: meta.index,
              }),
          },
          N1: {
            key: 'n1',
            parser: (record, meta) =>
              this.fieldParser.parseNumericField(record, meta.index, 'N1'),
            onDuplicate: (meta) =>
              this.addWarning('Multiple N1 fields found in ACT, using first one', {
                keysetRecordIndex: context.keysetRecordIndex,
                recordIndex: context.recordIndex,
                fieldIndex: context.fieldIndex,
                activityFieldIndex: meta.index,
              }),
          },
          N2: {
            key: 'n2',
            parser: (record, meta) =>
              this.fieldParser.parseNumericField(record, meta.index, 'N2'),
            onDuplicate: (meta) =>
              this.addWarning('Multiple N2 fields found in ACT, using first one', {
                keysetRecordIndex: context.keysetRecordIndex,
                recordIndex: context.recordIndex,
                fieldIndex: context.fieldIndex,
                activityFieldIndex: meta.index,
              }),
          },
          N3: {
            key: 'n3',
            parser: (record, meta) =>
              this.fieldParser.parseNumericField(record, meta.index, 'N3'),
            onDuplicate: (meta) =>
              this.addWarning('Multiple N3 fields found in ACT, using first one', {
                keysetRecordIndex: context.keysetRecordIndex,
                recordIndex: context.recordIndex,
                fieldIndex: context.fieldIndex,
                activityFieldIndex: meta.index,
              }),
          },
          ORDER: {
            key: 'order',
            parser: (record, meta) =>
              this.fieldParser.parseNumericField(record, meta.index, 'Order'),
            onDuplicate: (meta) =>
              this.addWarning('Multiple Order fields found in ACT, using first one', {
                keysetRecordIndex: context.keysetRecordIndex,
                recordIndex: context.recordIndex,
                fieldIndex: context.fieldIndex,
                activityFieldIndex: meta.index,
              }),
          },
          O: {
            key: 'order',
            parser: (record, meta) =>
              this.fieldParser.parseNumericField(record, meta.index, 'O', 0),
            onDuplicate: (meta) =>
              this.addWarning('Multiple O fields found in ACT, using first one', {
                keysetRecordIndex: context.keysetRecordIndex,
                recordIndex: context.recordIndex,
                fieldIndex: context.fieldIndex,
                activityFieldIndex: meta.index,
              }),
          },
        },
        onUnknown: (record, meta) =>
          this.addWarning(
            `Ignoring unknown ACT record type: ${record.fieldName}`,
            {
              keysetRecordIndex: context.keysetRecordIndex,
              recordIndex: context.recordIndex,
              fieldIndex: context.fieldIndex,
              activityFieldIndex: meta.index,
              fieldName: record.fieldName,
              hasValue: !!record.value,
            }
          ),
      }

      const { values } = parseStructuredRecords(
        records,
        spec,
        this.helpers(),
        {
          keysetRecordIndex: context.keysetRecordIndex,
          recordIndex: context.recordIndex,
          fieldIndex: context.fieldIndex,
        }
      )

      if (values.activity === undefined || values.activity === null) {
        this.addError('Missing required Activity field in ACT payload', {
          keysetRecordIndex: context.keysetRecordIndex,
          recordIndex: context.recordIndex,
          fieldIndex: context.fieldIndex,
        })
        return buildDefaultResult()
      }

      if (values.activity < 0 || values.activity > 123) {
        this.addWarning('Activity ID outside valid range (0-123)', {
          keysetRecordIndex: context.keysetRecordIndex,
          recordIndex: context.recordIndex,
          fieldIndex: context.fieldIndex,
          activity: values.activity,
        })
      }

      return {
        activity: values.activity,
        text: values.text !== undefined ? values.text : null,
        text2: values.text2 !== undefined ? values.text2 : null,
        n1:
          values.n1 !== undefined && values.n1 !== null ? values.n1 : null,
        n2:
          values.n2 !== undefined && values.n2 !== null ? values.n2 : null,
        n3:
          values.n3 !== undefined && values.n3 !== null ? values.n3 : null,
        order:
          values.order !== undefined && values.order !== null
            ? values.order
            : 0,
        fieldIndex: context.fieldIndex,
        recordIndex: context.recordIndex,
        keysetRecordIndex: context.keysetRecordIndex,
        success: true,
      }
  }

  decodeLayer6(text) {
    if (text === null || text === undefined) {
      return ''
    }

    if (typeof text !== 'string') {
      this.addError('Invalid input for Layer 6 decoding: expected string', {
        inputType: typeof text,
        isEmpty: !text,
      })
      return ''
    }

    const trimmed = text.trim()
    if (trimmed.length === 0) {
      return ''
    }

    const binaryString = decodeBase64(trimmed, {
      addError: this.addError,
      addWarning: this.addWarning,
      layerName: 'Layer 6',
      context: { fieldName: 'text' },
    })

    if (!binaryString) {
      return ''
    }

    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return decodeUtf8(bytes, {
      addError: this.addError,
      addWarning: this.addWarning,
      validateUtf8: this.decoder.options.validateUtf8,
      context: { fieldName: 'text' },
    })
  }

  extractPayload(input, options = {}) {
    const context = {
      recordIndex: input?.recordIndex || options.recordIndex || 0,
      keysetRecordIndex:
        input?.keysetRecordIndex || options.keysetRecordIndex || 0,
      fieldIndex: input?.fieldIndex || options.fieldIndex || 0,
    }

    if (typeof input === 'string') {
      return { payload: input, context }
    }

    if (input && typeof input === 'object' && input.payload) {
      return {
        payload: input.payload,
        context: { ...context, ...input },
      }
    }

    return { payload: null, context }
  }

  normalizeTranslationResult(translation) {
    if (!translation) {
      return { commands: [], aliases: [] }
    }

    let commands = []
    const aliases = []

    if (Array.isArray(translation?.aliases)) {
      aliases.push(...translation.aliases)
    }

    const pushAliasesFromGroup = (group) => {
      if (group && Array.isArray(group.aliases)) {
        aliases.push(...group.aliases)
      }
    }

    if (translation.commands && Array.isArray(translation.commands)) {
      commands = translation.commands
    } else if (Array.isArray(translation)) {
      translation.forEach((group) => {
        if (Array.isArray(group?.forward)) {
          commands.push(...group.forward)
        }
        pushAliasesFromGroup(group)
      })
    }

    return { commands, aliases }
  }

  
  helpers() {
    return {
      addError: this.addError,
      addWarning: this.addWarning,
    }
  }
}

export default KBFDecodePipeline
