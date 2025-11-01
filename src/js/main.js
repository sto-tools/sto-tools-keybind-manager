import './core/constants.js'
import eventBus from './core/eventBus.js'
import './data.js'
import './core/errors.js'
import i18next from 'i18next'
import en from '../i18n/en.json'
import de from '../i18n/de.json'
import fr from '../i18n/fr.json'
import es from '../i18n/es.json'
import { StorageService, DataCoordinator, ToastService } from './components/services/index.js'
import { KeyService } from './components/services/index.js'
import DataService from './components/services/DataService.js'
// ExportService is now created and managed by app.js
import { UIUtilityService } from './components/services/index.js'
import { FileOperationsService } from './components/services/index.js'
import FileExplorerUI from './components/ui/FileExplorerUI.js'
import { SyncService } from './components/services/index.js'
// VFX_EFFECTS now available globally from data.js
import STOToolsKeybindManager from './app.js'
// Version display functionality - moved inline to reduce file count
import { DISPLAY_VERSION } from './core/constants.js'
import { CommandChainValidatorService } from './components/services/index.js'
import devMonitor from './dev/DevMonitor.js'

// Create new StorageService component
const storageService = new StorageService({ eventBus })
storageService.init()

// Create DataService first so it's available for DataCoordinator
const dataService = new DataService({ 
  eventBus,
  data: typeof globalThis !== 'undefined' ? globalThis.STO_DATA : null
})
dataService.init()

// Create DataCoordinator - the single source of truth for data operations
const dataCoordinator = new DataCoordinator({ eventBus, storage: storageService })
dataCoordinator.init()
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
  
  // Initialize DevMonitor after i18next is available
  if (devMonitor.isDevelopment) {
    console.log('🔧 DevMonitor: Development mode detected, monitoring tools available')
  }

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
    
    // Update version in header (about modal version is now handled by AboutModalUI)
    const appVersionElement = document.getElementById('appVersion')
    if (appVersionElement) {
      appVersionElement.textContent = DISPLAY_VERSION
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUI)
  } else {
    initializeUI()
  }

  // Create dependencies first
  const stoKeybinds = new KeyService()
  // ExportService is now created and managed by app.js - remove duplicate instance
  // Initialize FileOperationsService to register RPC endpoints (mirroring, parsing, etc.)
  const fileOpsService = new FileOperationsService({ eventBus, storage: storageService })
  fileOpsService.init()
  // Create UI utility service
  const uiUtilityService = new UIUtilityService(eventBus)
  
  // Helper to bridge legacy UI components with the new utility service
  const initDragAndDropBridge = (container, options = {}) => {
    if (uiUtilityService && typeof uiUtilityService.initDragAndDrop === 'function') {
      uiUtilityService.initDragAndDrop(container, options)
    } else {
      // Fallback via eventBus so a remote service instance can handle it (test env)
      eventBus.emit('ui:init-drag-drop', { container, options })
    }
  }
  
  // Create toast service to handle notifications
  const toastService = new ToastService({ eventBus })
  
  // Create UI compatibility facade for legacy components
  const stoUI = {
    showToast: (message, type = 'info') => eventBus.emit('toast:show', { message, type }),
    confirm: (message, callback) => eventBus.emit('confirm:show', { message, callback }),
    showModal: (modalId) => eventBus.emit('modal:show', { modalId }),
          hideModal: (modalId) => eventBus.emit('modal:hide', { modalId }),
    copyToClipboard: (text) => eventBus.emit('ui:copy-to-clipboard', { text }),
    // New: expose drag-and-drop helper for components
    initDragAndDrop: initDragAndDropBridge
  }
  
  // Initialize command chain validator service (after stoUI is defined)
  const chainValidatorService = new CommandChainValidatorService({ eventBus, i18n: i18next, ui: stoUI })
  chainValidatorService.init()
  
  const stoFileExplorer = new FileExplorerUI({ eventBus, storage: storageService, ui: stoUI })
  // Init immediately so header Explorer button works without waiting for sto-app-ready
  stoFileExplorer.init()
  const stoSync = new SyncService({ eventBus, storage: storageService, ui: stoUI })
  
  // Minimal global assignments - only what's absolutely necessary for legacy compatibility
  Object.assign(window, {
    storageService, // Required by some legacy components and tests
    dataService,    // Required by app initialization
    dataCoordinator, // Required by other services
    stoKeybinds,    // Required by app initialization callback
    // stoExport removed - now managed by app.js
    stoUI,          // Required by many components for toast notifications
    stoFileExplorer, // Required by header file explorer button
    stoSync,        // Required by sync UI components
    eventBus,       // Required for component communication debugging
    fileOpsService,
    // VFX_EFFECTS now available globally from data.js
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
        // DEBUG: This message is used exclusively for test diagnostics and will be stripped
        // from production builds by Rollup's console.log removal plugin.
        console.log('TEST: app.init() did not return a Promise')
      }
    } catch (error) {
      // DEBUG: This message is used exclusively for test diagnostics and will be stripped
      // from production builds by Rollup's console.log removal plugin.
      console.log('TEST: app.init() failed:', error)
    }
  }

  // Set up event handler for when app is ready
  eventBus.on('sto-app-ready', () => {
    // Profile initialization is now handled by the app instance
    stoKeybinds.init()
    // ExportService is now managed by app.js
    // Already initialized above, but ensure ready when app starts
    if (!stoFileExplorer.isInitialized()) {
      stoFileExplorer.init()
    }

    // DEBUG: The following block logs detailed UI state for debugging purposes.
    // Rollup is configured to strip console.log statements from production builds,
    // ensuring no debug output ships to users.
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
