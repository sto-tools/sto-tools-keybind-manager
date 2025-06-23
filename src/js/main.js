import './core/constants.js'
import eventBus from './core/eventBus.js'
import './data.js'
import './core/errors.js'
import i18next from 'i18next'
import en from '../i18n/en.json'
import de from '../i18n/de.json'
import fr from '../i18n/fr.json'
import es from '../i18n/es.json'
import STOStorage from './services/storage.js'
// Profile functionality is now handled by the app instance
import STOKeybindFileManager from './features/keybinds.js'
import STOAliasManager from './features/aliases.js'
import STOExportManager from './features/export.js'
import STOModalManager from './ui/modalManager.js'
import STOUIManager from './ui/ui.js'
import STOCommandManager from './features/commands.js'
import STOFileExplorer from './ui/fileexplorer.js'
import STOSyncManager from './services/sync.js'
import VertigoManager, { VFX_EFFECTS } from './features/vertigo_data.js'
import STOToolsKeybindManager from './app.js'
import './ui/version.js'

const stoStorage = new STOStorage()
const settings = stoStorage.getSettings()

;(async () => {
  await i18next.init({
    lng: settings.language || 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      de: { translation: de },
      fr: { translation: fr },
      es: { translation: es },
    },
  })

  // Make i18next available globally for data.js and other modules that need it
  window.i18next = i18next

  if (window.localizeCommandData) {
    window.localizeCommandData()
  }

  function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n')
      const attr = el.getAttribute('data-i18n-attr')
      if (!key) return
      const text = i18next.t(key)
      if (attr) {
        el.setAttribute(attr, text)
      } else {
        el.textContent = text
      }
    })

    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder')
      if (key) {
        el.setAttribute('placeholder', i18next.t(key))
      }
    })

    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title')
      if (key) {
        el.setAttribute('title', i18next.t(key))
      }
    })

    root.querySelectorAll('[data-i18n-alt]').forEach((el) => {
      const key = el.getAttribute('data-i18n-alt')
      if (key) {
        el.setAttribute('alt', i18next.t(key))
      }
    })
  }

  window.applyTranslations = applyTranslations

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyTranslations())
  } else {
    applyTranslations()
  }
})()
// Profile functionality is now handled by the app instance
const stoKeybinds = new STOKeybindFileManager()
const stoAliases = new STOAliasManager()
const stoExport = new STOExportManager()
const modalManager = new STOModalManager()
const stoUI = new STOUIManager()
const stoCommands = new STOCommandManager()
const stoFileExplorer = new STOFileExplorer()
const vertigoManager = new VertigoManager()
const stoSync = new STOSyncManager(stoStorage)
Object.assign(window, {
  stoStorage,
  stoKeybinds,
  stoAliases,
  stoExport,
  modalManager,
  stoUI,
  stoCommands,
  stoFileExplorer,
  vertigoManager,
  stoSync,
  VFX_EFFECTS,
})

const app = new STOToolsKeybindManager()
window.app = app

eventBus.on('sto-app-ready', () => {
  // Profile initialization is now handled by the app instance
  stoKeybinds.init()
  stoAliases.init()
  stoExport.init()
  stoFileExplorer.init()
})

