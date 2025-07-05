import ComponentBase from '../ComponentBase.js'
import RULES from './validators/index.js'

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

      // ------------------------------------
      // Run modular validators
      const ctx = { key, commands, length, stabilized }
      const issues = RULES.map(r => r.run(ctx)).filter(Boolean)

      const errors   = issues.filter(i => i.severity === 'error')
      const warnings = issues.filter(i => i.severity === 'warning')

      const severity = errors.length ? 'error' : warnings.length ? 'warning' : 'success'

      this.emit('command-chain:validation-result', { key, length, severity, warnings, errors })

      // Show toast(s)
      if (issues.length === 0) {
        const okMsg = await this.getI18nMessage('command_chain_is_valid', { length }) || `Command chain is valid (${length}/999)`
        await this.showToast(okMsg, 'success')
      } else {
        for (const issue of issues) {
          const msg = await this.getI18nMessage(issue.key, issue.params) || issue.defaultMessage || issue.key
          await this.showToast(msg, issue.severity)
        }
      }
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
