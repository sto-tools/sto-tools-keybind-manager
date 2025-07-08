import ValidatorBase from './ValidatorBase.js'
import { UNSAFE_KEYBINDS } from '../../../core/constants.js'

// Pre-compute uppercase set for efficient case-insensitive matching
const UNSAFE_SET = new Set(UNSAFE_KEYBINDS.map(k => k.toUpperCase()))

export default class UnsafeKeybindRule extends ValidatorBase {
  constructor () {
    super({
      id: 'unsafeKeybind',
      defaultSeverity: 'warning',
      // Re-use generic i18n key shared with capture service.
      messageKey: 'unsafe_keybind'
    })
  }

  /**
   * Validate current key against UNSAFE_KEYBINDS list.
   * @param {Object} ctx – Validation context from CommandChainValidatorService
   * @returns {null|Object}
   */
  validate (ctx) {
    const { key } = ctx || {}
    if (!key) return null

    const normalized = key.trim().toUpperCase()
    if (UNSAFE_SET.has(normalized)) {
      return {
        severity: 'warning',
        params: { key }
      }
    }

    return null
  }
} 