export function parseStructuredRecords(records, spec, helpers, baseContext = {}) {
  const values = {}
  const collections = {}

  if (!records || records.length === 0) {
    return { values, collections }
  }

  const { addError, addWarning } = helpers

  records.forEach((record, index) => {
    if (!record || !record.fieldName) {
      addWarning?.('Skipping empty or invalid record', {
        ...baseContext,
        recordIndex: index,
        record,
      })
      return
    }

    const fieldName = record.fieldName.toUpperCase()
    const meta = { index, record, context: baseContext }

    if (spec.fields && spec.fields[fieldName]) {
      handleField(record, spec.fields[fieldName], meta, { values, helpers })
      return
    }

    if (spec.collections && spec.collections[fieldName]) {
      handleCollection(record, spec.collections[fieldName], meta, {
        collections,
        helpers,
      })
      return
    }

    if (typeof spec.onUnknown === 'function') {
      spec.onUnknown(record, meta, helpers)
    }
  })

  if (typeof spec.postProcess === 'function') {
    spec.postProcess({ values, collections }, helpers, baseContext)
  }

  return { values, collections }
}

function handleField(record, config, meta, state) {
  const { values, helpers } = state
  const { addError } = helpers
  const targetKey = config.key || record.fieldName.toLowerCase()

  let parsed
  try {
    parsed = config.parser(record, meta, helpers)
  } catch (error) {
    addError?.(
      config.errorMessage ||
        `Failed to process ${record.fieldName} at position ${meta.index}: ${error.message}`,
      {
        ...meta.context,
        fieldName: record.fieldName,
        recordIndex: meta.index,
      }
    )
    return
  }

  if (parsed === undefined) {
    return
  }

  if (config.allowMultiple) {
    if (!values[targetKey]) {
      values[targetKey] = []
    }
    values[targetKey].push(parsed)
    return
  }

  if (Object.prototype.hasOwnProperty.call(values, targetKey)) {
    if (config.onDuplicate) {
      config.onDuplicate(meta, helpers)
    }
    if (config.duplicateStrategy === 'overwrite') {
      values[targetKey] = parsed
    }
    return
  }

  if (typeof config.set === 'function') {
    config.set(values, parsed, meta, helpers)
  } else {
    values[targetKey] = parsed
  }
}

function handleCollection(record, config, meta, state) {
  const { collections, helpers } = state
  const targetKey = config.key || record.fieldName.toLowerCase()

  let parsed
  try {
    parsed = config.parser(record, meta, helpers)
  } catch (error) {
    helpers.addError?.(
      config.errorMessage ||
        `Failed to process ${record.fieldName} at position ${meta.index}: ${error.message}`,
      {
        ...meta.context,
        fieldName: record.fieldName,
        recordIndex: meta.index,
      }
    )
    return
  }

  if (parsed === undefined || parsed === null) {
    return
  }

  if (!collections[targetKey]) {
    collections[targetKey] = []
  }
  collections[targetKey].push(parsed)
}
