import ComponentBase from '../ComponentBase.js'

/**
 * CommandChainValidatorService
 *
 * Listens for `command-chain:validate` events (triggered by CommandUI)
 * and performs length-based validation of the generated keybind line.
 *
 * Current rules (can be expanded later):
 *   • If preview length >= 990 – emit error + toast (red)
 *   • If preview length >= 900 – emit warning + toast (yellow)
 *   • Otherwise emit success (green)
 */
export default class CommandChainValidatorService extends ComponentBase {
  constructor({ eventBus, i18n = null, ui = null } = {}) {
    super(eventBus)
    this.componentName = 'CommandChainValidatorService'
    this.i18n = i18n
    this.ui = ui
  }

  /* ------------------------------------------------------------
   * Lifecycle
   * ---------------------------------------------------------- */
  onInit() {
    // Listen for validate events coming from the UI
    this.addEventListener('command-chain:validate', async ({ key, stabilized }) => {
      await this.validateChain(key, stabilized)
    })
  }

  /* ------------------------------------------------------------
   * Public validation entry
   * ---------------------------------------------------------- */
  async validateChain(key, stabilizedFlag = undefined) {
    if (this._busy) return
    this._busy = true
    try {
      // Retrieve the command list for the CURRENTLY SELECTED key via existing RPC
      // Note: CommandUI ensures key is selected before emitting validate.
      const commands = await this.request('command:get-for-selected-key')
      if (!Array.isArray(commands)) {
        console.warn('[CommandChainValidatorService] No commands returned for validation')
        return
      }

      // Generate the exact preview line used in the command-chain editor
      const previewUnstabilized = await this.request('fileops:generate-command-preview', {
        key,
        commands,
        stabilize: false
      })

      // Determine if stabilization (mirroring) is enabled for this key
      const stabilized = stabilizedFlag !== undefined ? stabilizedFlag : false

      let length
      if (stabilized && commands.length > 1) {
        const previewStabilized = await this.request('fileops:generate-command-preview', {
          key,
          commands,
          stabilize: true
        })
        length = previewStabilized.length
      } else {
        length = previewUnstabilized.length
      }

      let severity = 'success'
      let i18nKey = 'command_chain_is_valid'

      if (length >= 990) {
        severity = 'error'
        i18nKey = 'command_chain_too_long'
      } else if (length >= 900) {
        severity = 'warning'
        i18nKey = 'command_chain_near_limit'
      }

      // Build warnings/errors arrays
      const warnings = []
      const errors   = []

      if (stabilized && commands.length > 1 && length >= 900 && length < 990) {
        warnings.push({ key: 'command_chain_near_limit', params: { length } })
      }
      if (length >= 990) {
        errors.push({ key: 'command_chain_too_long', params: { length } })
      }

      // Emit structured result so UI components can react if needed
      this.emit('command-chain:validation-result', { key, length, severity, warnings, errors })

      // Show toast if UI is available – do not block execution flow
      const defaultMessages = {
        success: `Command chain is valid (${length}/999)`,
        warning: `Command chain is ${length} characters; consider shortening (limit 999).`,
        error: `Command chain exceeds safe length (${length}/999). It may fail in game.`
      }

      const message = await this.getI18nMessage(i18nKey, { length }) || defaultMessages[severity]
      await this.showToast(message, severity)
    } catch (error) {
      console.error('[CommandChainValidatorService] validateChain failed:', error)
    } finally {
      this._busy = false
    }
  }

  /* ------------------------------------------------------------
   * Helper – i18n wrapper (mirrors CommandUI implementation)
   * ---------------------------------------------------------- */
  async getI18nMessage(key, params = {}) {
    try {
      if (this.i18n && typeof this.i18n.t === 'function') {
        return this.i18n.t(key, params)
      }
      return await this.request('i18n:translate', { key, params })
    } catch (err) {
      return null
    }
  }

  /* ------------------------------------------------------------
   * Helper – toast wrapper (mirrors CommandUI implementation)
   * ---------------------------------------------------------- */
  async showToast(message, type = 'info') {
    try {
      if (this.ui?.showToast) {
        this.ui.showToast(message, type)
      } else {
        await this.request('toast:show', { message, type })
      }
    } catch (err) {
      // Fallback – swallow to avoid breaking validation flow
      console.error('[CommandChainValidatorService] showToast failed:', err)
    }
  }
}
