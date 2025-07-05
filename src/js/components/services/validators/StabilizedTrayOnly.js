import ValidatorBase from './ValidatorBase.js'

const TRAY_REGEX = /trayexec|slot|stotrayexec/i

export default class StabilizedTrayOnlyRule extends ValidatorBase {
  constructor () {
    super({
      id: 'stabilizedTrayOnly',
      defaultSeverity: 'warning',
      messageKey: 'stabilized_non_tray_warning'
    })
  }

  validate (ctx) {
    const { stabilized, commands } = ctx
    if (!stabilized || !Array.isArray(commands) || commands.length === 0) return null

    // If any command does NOT match tray pattern -> issue
    const hasNonTray = commands.some(c => {
      const str = typeof c === 'string' ? c : (c.command || '')
      return !TRAY_REGEX.test(str)
    })

    if (hasNonTray) {
      return {
        severity: 'warning',
        key: 'stabilized_non_tray_warning',
        defaultMessage: 'Stabilized execution should only be used with tray execution abilities.'
      }
    }
    return null
  }
} 