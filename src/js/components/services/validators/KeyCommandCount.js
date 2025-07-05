import ValidatorBase from './ValidatorBase.js'

export default class KeyCommandCountRule extends ValidatorBase {
  constructor () {
    super({
      id: 'keyCommandCount',
      defaultSeverity: 'warning',
      messageKey: 'too_many_commands_on_key'
    })
  }

  validate (ctx) {
    const { isAlias, commands } = ctx
    if (isAlias || !Array.isArray(commands)) return null

    if (commands.length > 20) {
      return {
        severity: 'warning',
        key: 'too_many_commands_on_key',
        params: { count: commands.length },
        defaultMessage: `Binding ${commands.length} commands to one key may fail in game (max recommended 20).`
      }
    }
    return null
  }
} 