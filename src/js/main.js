import './core/constants.js'
import eventBus from './core/eventBus.js'
import './data.js'
import './core/errors.js'
import i18next from 'i18next'
import en from '../i18n/en.json'
import de from '../i18n/de.json'
import fr from '../i18n/fr.json'
import es from '../i18n/es.json'
import { StorageService } from './components/services/index.js'
import STOKeybindFileManager from './features/keybinds.js'
import STOExportManager from './features/export.js'
import STOModalManager from './ui/modalManager.js'
import STOUIManager from './ui/ui.js'
// import STOCommandManager from './features/commands.js' // DEPRECATED: see CommandBuilderService
import FileExplorerUI from './components/ui/FileExplorerUI.js'
import { SyncService } from './components/services/index.js'
import VertigoManager, { VFX_EFFECTS } from './features/vertigo_data.js'
import STOToolsKeybindManager from './app.js'
import './ui/version.js'
// Create new StorageService component
const storageService = new StorageService({ eventBus })
storageService.init()
// Get settings from the new StorageService
const settings = storageService.getSettings()

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

  // Make storageService globally available immediately
  window.storageService = storageService

  // Create dependencies first
  const stoKeybinds = new STOKeybindFileManager()
  const stoExport = new STOExportManager()
  const modalManager = new STOModalManager()
  const stoUI = new STOUIManager()
  // const stoCommands = new STOCommandManager() // DEPRECATED: see CommandBuilderService
  const stoFileExplorer = new FileExplorerUI({ storage: storageService, exportManager: stoExport, ui: stoUI })
  // Init immediately so header Explorer button works without waiting for sto-app-ready
  stoFileExplorer.init()
  const vertigoManager = new VertigoManager()
  const stoSync = new SyncService({ storage: storageService, ui: window.stoUI })
  Object.assign(window, {
    storageService, // Keep this for backward compatibility
    stoKeybinds,
    stoExport,
    modalManager,
    stoUI,
    // stoCommands, // DEPRECATED: see CommandBuilderService
    stoFileExplorer,
    vertigoManager,
    stoSync,
    VFX_EFFECTS,
    eventBus, // Make eventBus globally available
  })

  // Initialize app after dependencies are available

  const app = new STOToolsKeybindManager()
  window.app = app
  // Initialize the app - this will emit 'sto-app-ready' when complete
  if (typeof app.init !== 'function') {
    console.error('app.init is not a function!')
  } else {
    try {
      const initPromise = app.init()

      if (initPromise && typeof initPromise.catch === 'function') {
        await initPromise
      } else {
        console.error('TEST: app.init() did not return a Promise')
      }
    } catch (error) {
      console.error('TEST: app.init() failed:', error)
    }
  }

  // Set up event handler for when app is ready
  eventBus.on('sto-app-ready', () => {
    // Profile initialization is now handled by the app instance
    stoKeybinds.init()
    stoExport.init()
    // Already initialized above, but ensure ready when app starts
    if (!stoFileExplorer.isInitialized()) {
      stoFileExplorer.init()
    }
  })
})()
