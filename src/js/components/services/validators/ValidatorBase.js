export default class ValidatorBase {
  /**
   * @param {Object} opts
   * @param {string} opts.id – unique identifier of the rule
   * @param {'warning'|'error'} opts.defaultSeverity – default severity when validate() returns a truthy result without explicit severity
   * @param {string|Function} opts.messageKey – i18n key or function returning key
   * @param {string[]} [opts.tags]
   */
  constructor ({ id, defaultSeverity, messageKey, tags = [] } = {}) {
    if (!id) throw new Error('Validator requires "id"')
    if (!defaultSeverity) throw new Error('Validator requires "defaultSeverity"')
    if (!messageKey) throw new Error('Validator requires "messageKey"')

    this.id = id
    this.level = defaultSeverity
    this.messageKey = messageKey
    this.tags = tags
  }

  /**
   * Subclasses must override to implement validation.
   * Return one of:
   *   – null/undefined → passes validation
   *   – object { severity?, key?, params? }
   * @param {Object} ctx – { key, commands, length, stabilized, ... }
   */
  validate (/* ctx */) {
    throw new Error('validate(ctx) not implemented')
  }

  /**
   * Wrapper called by engine – normalises result
   */
  run (ctx) {
    const res = this.validate(ctx)
    if (!res) return null

    return {
      id: this.id,
      severity: res.severity || this.level,
      key: typeof res.key === 'function' ? res.key(ctx) : (res.key || this.messageKey),
      params: res.params || {},
      defaultMessage: res.defaultMessage
    }
  }
} 