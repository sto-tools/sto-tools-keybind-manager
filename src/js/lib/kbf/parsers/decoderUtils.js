const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

export function normalizeInputForDecoding(input, { addError, layerName = 'Unknown', context = {} } = {}) {
  if (input instanceof ArrayBuffer) {
    try {
      const content = new TextDecoder('utf-8').decode(input)
      return { content, success: true }
    } catch (error) {
      addError?.(`Failed to decode ArrayBuffer to string: ${error.message}`, {
        contentType: 'ArrayBuffer',
        contentSize: input.byteLength,
        ...context,
      })
      return { content: '', success: false }
    }
  }

  if (typeof input === 'string') {
    return { content: input, success: true }
  }

  addError?.(`Invalid content type for ${layerName} decoding`, {
    contentType: typeof input,
    expectedType: 'string|ArrayBuffer',
    ...context,
  })
  return { content: '', success: false }
}

export function decodeBase64(payload, options = {}) {
  const {
    addError,
    addWarning,
    layerName = 'Unknown',
    allowEmpty = false,
    cleanWhitespace = false,
    minSize = 0,
    context = {},
  } = options

  if (typeof payload !== 'string') {
    addError?.(`${layerName}: payload is missing or invalid`, {
      ...context,
      payloadType: typeof payload,
    })
    return null
  }

  let trimmed = payload.trim()
  if (trimmed.length === 0) {
    addError?.(`${layerName}: payload is empty`, context)
    return null
  }

  if (cleanWhitespace) {
    trimmed = trimmed.replace(/\s+/g, '').replace(/[\r\n\t]/g, '')
  }

  if (!BASE64_PATTERN.test(trimmed)) {
    addError?.(`${layerName} payload contains invalid Base64 data`, {
      ...context,
      payloadLength: trimmed.length,
      payloadPreview: trimmed.slice(0, 50),
    })
    return null
  }

  if (trimmed.length % 4 !== 0) {
    addError?.(
      `${layerName} payload length ${trimmed.length} is not a multiple of 4`,
      {
        ...context,
        remainder: trimmed.length % 4,
      }
    )
    return null
  }

  if (minSize && trimmed.length < minSize) {
    addError?.(`${layerName} content too small to contain valid KBF data`, {
      ...context,
      payloadLength: trimmed.length,
      minimumExpected: minSize,
    })
    return null
  }

  try {
    const decoded = atob(trimmed)
    if (!decoded && !allowEmpty) {
      addError?.(`${layerName} decoding produced empty result`, context)
      return null
    }
    if (options.validateContent) {
      const validation = options.validateContent(decoded, context) || {}
      if (!validation.valid) {
        if (validation.warning) {
          addWarning?.(validation.message, validation.context)
        } else {
          addError?.(validation.message, validation.context)
          return null
        }
      }
    }
    return decoded
  } catch (error) {
    addError?.(`${layerName} Base64 decoding failed`, {
      ...context,
      errorType: error.name,
      errorMessage: error.message,
      payloadLength: trimmed.length,
    })
    return null
  }
}

export function decodeUtf8(bytes, options = {}) {
  const { addError, addWarning, validateUtf8 = true, context = {} } = options

  if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) {
    addError?.('UTF-8 bytes must be a Uint8Array or ArrayBuffer', {
      constructorName: bytes?.constructor?.name,
      ...context,
    })
    return ''
  }

  const byteArray = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes

  if (byteArray.length === 0) {
    addWarning?.('UTF-8 byte array is empty', context)
    return ''
  }

  try {
    const decoder = new TextDecoder('utf-8', { fatal: validateUtf8 })
    return decoder.decode(byteArray)
  } catch (error) {
    addError?.(`UTF-8 decoding failed: ${error.name}: ${error.message}`, {
      ...context,
      errorType: error.name,
      errorMessage: error.message,
      inputLength: byteArray.length,
    })

    try {
      const fallbackDecoder = new TextDecoder('utf-8', { fatal: false })
      return fallbackDecoder.decode(byteArray)
    } catch (fallbackError) {
      addError?.(`UTF-8 fallback decoding failed: ${fallbackError.message}`, {
        ...context,
        originalError: error.message,
        fallbackError: fallbackError.message,
      })
      return ''
    }
  }
}

export function isValidBase64(base64String) {
  try {
    return btoa(atob(base64String)) === base64String
  } catch {
    return false
  }
}
