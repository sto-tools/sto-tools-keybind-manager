/**
 * @typedef {Object} ValidationContext
 * @property {string} [key]
 * @property {Array<string | { command?: string }>} [commands]
 * @property {number} [length]
 * @property {boolean} [stabilized]
 * @property {boolean} [isAlias]
 * @property {string} [generatedCommand]
 *
 * @typedef {Object} ValidationResult
 * @property {'warning' | 'error'} [severity]
 * @property {string | ((ctx: ValidationContext) => string)} [key]
 * @property {Record<string, unknown>} [params]
 * @property {string} [defaultMessage]
 *
 * @typedef {Object} CommandWarning
 * @property {string} name
 * @property {string} warnText
 *
 * @typedef {ValidationResult | CommandWarning[]} RawValidationResult
 *
 * @typedef {Object} ValidationIssue
 * @property {string} id
 * @property {'warning' | 'error'} severity
 * @property {string} [key]
 * @property {Record<string, unknown>} [params]
 * @property {string} [defaultMessage]
 */
export default class ValidatorBase {
  /**
   * @param {Object} opts
   * @param {string} opts.id – unique identifier of the rule
   * @param {'warning'|'error'} opts.defaultSeverity – default severity when validate() returns a truthy result without explicit severity
   * @param {string | ((ctx: ValidationContext) => string)} opts.messageKey – i18n key or function returning key
   * @param {string[]} [opts.tags]
   */
  constructor({ id, defaultSeverity, messageKey, tags = [] }) {
    if (!id) throw new Error('Validator requires "id"');
    if (!defaultSeverity)
      throw new Error('Validator requires "defaultSeverity"');
    if (!messageKey) throw new Error('Validator requires "messageKey"');

    this.id = id;
    this.level = defaultSeverity;
    this.messageKey = messageKey;
    this.tags = tags;
  }

  /**
   * Subclasses must override to implement validation.
   * Return one of:
   *   – null/undefined → passes validation
   *   – object { severity?, key?, params? }
   * @param {ValidationContext} ctx – { key, commands, length, stabilized, ... }
   * @returns {RawValidationResult | null}
   */
  validate(ctx) {
    void ctx;
    throw new Error("validate(ctx) not implemented");
  }

  /**
   * Wrapper called by engine – normalises result
   */
  /**
   * @param {ValidationContext} ctx
   * @returns {ValidationIssue | ValidationIssue[] | null}
   */
  run(ctx) {
    const res = this.validate(ctx);
    if (!res) return null;
    // Array-valued validators provide their own run() implementation. Keeping
    // the fallback shape here preserves the base wrapper's historic behavior.
    const normalized = Array.isArray(res) ? {} : res;
    const messageKey = normalized.key || this.messageKey;

    return {
      id: this.id,
      severity: normalized.severity || this.level,
      key: typeof messageKey === "function" ? messageKey(ctx) : messageKey,
      params: normalized.params || {},
      defaultMessage: normalized.defaultMessage,
    };
  }
}
