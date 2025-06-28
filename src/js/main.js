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
import { KeyService } from './components/services/index.js'
import STOExportManager from './features/export.js'
import STOUIManager from './ui/ui.js'
// import STOCommandManager from './features/commands.js' // DEPRECATED: see CommandBuilderService
import FileExplorerUI from './components/ui/FileExplorerUI.js'
import { SyncService } from './components/services/index.js'
import { VFX_EFFECTS } from './features/vertigo_data.js'
import STOToolsKeybindManager from './app.js'
// Version display functionality - moved inline to reduce file count
import { DISPLAY_VERSION } from './core/constants.js'
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

  // Apply translations and set up version display
  function initializeUI() {
    applyTranslations()
    
    // Update version in header and about modal (migrated from ui/version.js)
    const appVersionElement = document.getElementById('appVersion')
    if (appVersionElement) {
      appVersionElement.textContent = DISPLAY_VERSION
    }
    const aboutVersionElement = document.getElementById('aboutVersion')
    if (aboutVersionElement) {
      aboutVersionElement.textContent = DISPLAY_VERSION
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUI)
  } else {
    initializeUI()
  }

  // Create dependencies first
  const stoKeybinds = new KeyService()
  const stoExport = new STOExportManager({ storage: storageService })
  const stoUI = new STOUIManager()
  const stoFileExplorer = new FileExplorerUI({ storage: storageService, exportManager: stoExport, ui: stoUI })
  // Init immediately so header Explorer button works without waiting for sto-app-ready
  stoFileExplorer.init()
  const stoSync = new SyncService({ storage: storageService, ui: stoUI })
  
  // Minimal global assignments - only what's absolutely necessary for legacy compatibility
  Object.assign(window, {
    storageService, // Required by some legacy components and tests
    stoKeybinds,    // Required by app initialization callback
    stoExport,      // Required by app initialization callback  
    stoUI,          // Required by many components for toast notifications
    stoFileExplorer, // Required by header file explorer button
    stoSync,        // Required by sync UI components
    eventBus,       // Required for component communication debugging
    VFX_EFFECTS,    // Required by VFXManagerUI for effect data
  })

  // Initialize app after dependencies are available
  const app = new STOToolsKeybindManager()
  
  // App instance is NOT exposed globally - components communicate via eventBus
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

    // Debug Settings button functionality
    console.log('=== Settings Button Debug ===')
    const settingsBtn = document.getElementById('settingsBtn')
    const settingsMenu = document.getElementById('settingsMenu')
    const preferencesBtn = document.getElementById('preferencesBtn')

    console.log('1. Elements exist check:')
    console.log('- settingsBtn:', !!settingsBtn)
    console.log('- settingsMenu:', !!settingsMenu)
    console.log('- preferencesBtn:', !!preferencesBtn)

    if (settingsBtn) {
      console.log('\n2. Settings Button properties:')
      console.log('- tagName:', settingsBtn.tagName)
      console.log('- className:', settingsBtn.className)
      console.log('- parent dropdown:', settingsBtn.closest('.dropdown')?.className)
      
      console.log('\n3. Event Listeners:')
      console.log('- Has onclick:', !!settingsBtn.onclick)
      console.log('- Has click listeners:', !!settingsBtn._listeners)
      
      console.log('\n4. Event-based architecture check:')
      console.log('- eventBus exists:', !!window.eventBus)
      console.log('- Settings managed by HeaderMenuUI via events')
    }

    if (settingsMenu) {
      console.log('\n5. Settings Menu properties:')
      console.log('- display:', settingsMenu.style.display)
      console.log('- visibility:', settingsMenu.style.visibility)
      console.log('- parent dropdown active:', settingsBtn?.closest('.dropdown')?.classList.contains('active'))
    }
  })
})()
