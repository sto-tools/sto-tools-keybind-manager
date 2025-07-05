import ValidatorBase from './ValidatorBase.js'

export default class MaxLengthRule extends ValidatorBase {
  constructor () {
    super({
      id: 'maxLength',
      defaultSeverity: 'warning',
      messageKey: 'command_chain_near_limit',
      tags: ['length', 'performance']
    })
  }

  /**
   * @param {Object} ctx – { length, stabilized }
   */
  validate (ctx) {
    const { length } = ctx
    if (length >= 990) {
      return {
        severity: 'error',
        key: 'command_chain_too_long',
        params: { length },
        defaultMessage: `Command chain exceeds safe length (${length}/999). It may fail in game.`
      }
    }
    if (length >= 900) {
      return {
        params: { length },
        defaultMessage: `Command chain is ${length} characters; consider shortening (limit 999).`
      }
    }
    return null
  }
} 