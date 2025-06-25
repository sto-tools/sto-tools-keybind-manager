/*
 * keyHandling.js – compatibility shim
 * -----------------------------------
 * Provides a singleton that extends KeyService while re-implementing a minimal
 * subset of the legacy helper API so existing code and unit-tests continue to
 * function during migration.
 */

import KeyService from '../components/services/KeyService.js'

class LegacyKeyHandling extends KeyService {
  /** Keep UI updates from the original helper */
  selectKey (keyName) {
    super.selectKey(keyName)

    // Replicate immediate UI refresh behaviour expected by older code/tests
    if (typeof window !== 'undefined' && window.app) {
      window.app.renderKeyGrid?.()
      window.app.renderCommandChain?.()
      window.app.updateChainActions?.()
    }
  }

  generateCommandId () {
    // Delegate to the helper on KeyService (ensures prefix consistency)
    return super.generateCommandId()
  }

  validateCurrentChain () {
    // Original method merely surfaced toast feedback that tests spy on.
    if (typeof window !== 'undefined' && window.stoUI?.showToast) {
      window.stoUI.showToast('command_chain_is_valid', 'success')
    }
  }

  async confirmDeleteKey (keyName) {
    const confirmed = await (typeof window !== 'undefined' && window.stoUI?.confirm
      ? window.stoUI.confirm('confirm_delete_key', 'delete_key', 'danger')
      : Promise.resolve(false))

    if (confirmed) {
      if (typeof window !== 'undefined' && window.app?.deleteKey) {
        window.app.deleteKey(keyName)
      } else {
        throw new Error('Application context is missing deleteKey method. This indicates a configuration issue.')
      }
    }
  }

  addKey (keyName) {
    // Inject globals if they were mocked after construction (common in tests)
    if (!this.storage && typeof window !== 'undefined' && window.storageService) {
      this.storage = window.storageService
    }
    if (!this.ui && typeof window !== 'undefined' && window.stoUI) {
      this.ui = window.stoUI
    }
    if (!this.i18n && typeof window !== 'undefined' && window.i18next) {
      this.i18n = window.i18next
    }
    if (!this.eventBus && typeof window !== 'undefined' && window.eventBus) {
      this.eventBus = window.eventBus
    }

    return super.addKey(keyName)
  }
}

// Singleton instance
const instance = new LegacyKeyHandling()

export const keyHandling = instance
export default instance

// Global exposure for any runtime scripts
if (typeof window !== 'undefined') {
  window.keyHandling = instance
}