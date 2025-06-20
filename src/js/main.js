import './constants.js'
import eventBus from './eventBus.js'
import './data.js'
import './errors.js'
import i18next from 'i18next'
import en from '../i18n/en.json'
import de from '../i18n/de.json'
import fr from '../i18n/fr.json'
import es from '../i18n/es.json'
import STOStorage from './storage.js'
import STOProfileManager from './profiles.js'
import STOKeybindFileManager from './keybinds.js'
import STOAliasManager from './aliases.js'
import STOExportManager from './export.js'
import STOModalManager from './modalManager.js'
import STOUIManager from './ui.js'
import STOCommandManager from './commands.js'
import STOFileExplorer from './fileexplorer.js'
import VertigoManager, { VFX_EFFECTS } from './vertigo_data.js'
import STOToolsKeybindManager from './app.js'
import './version.js'

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
const stoProfiles = new STOProfileManager()
const stoKeybinds = new STOKeybindFileManager()
const stoAliases = new STOAliasManager()
const stoExport = new STOExportManager()
const modalManager = new STOModalManager()
const stoUI = new STOUIManager()
const stoCommands = new STOCommandManager()
const stoFileExplorer = new STOFileExplorer()
const vertigoManager = new VertigoManager()
Object.assign(window, {
  stoStorage,
  stoProfiles,
  stoKeybinds,
  stoAliases,
  stoExport,
  modalManager,
  stoUI,
  stoCommands,
  stoFileExplorer,
  vertigoManager,
  VFX_EFFECTS,
  VERTIGO_EFFECTS: VFX_EFFECTS,
})

const app = new STOToolsKeybindManager()
window.app = app

eventBus.on('sto-app-ready', () => {
  stoProfiles.init()
  stoKeybinds.init()
  stoAliases.init()
  stoExport.init()
  stoFileExplorer.init()
})

