// STO Tools Keybind Manager – Export Facade (post-refactor)
// This file now acts as a compatibility shim between legacy callers that
// import `src/js/features/export.js` and the new split implementation that
// lives in:
//   – src/js/components/services/ExportService.js
//   – src/js/components/ui/ExportUI.js
//
// The facade lazily instantiates one ExportService + one ExportUI instance and
// proxies public methods so that existing imports (including a large test
// suite) continue to work unchanged.

import ComponentBase from '../components/ComponentBase.js'
import ExportService from '../components/services/ExportService.js'
import ExportUI from '../components/ui/ExportUI.js'
import eventBus from '../core/eventBus.js'

export { ExportService, ExportUI }

export default class STOExportManager extends ComponentBase {
  constructor (opts = {}) {
    const eb = opts.eventBus || (typeof window !== 'undefined' ? window.eventBus : null) || eventBus
    super(eb)
    // Ensure globally accessible (unit-tests rely on window.eventBus sometimes)
    if (typeof window !== 'undefined' && !window.eventBus) {
      window.eventBus = eb
    }

    // Get storage service from options or fallback to global
    const storage = opts.storage || (typeof window !== 'undefined' ? window.storageService : null)
    
    this.service = opts.exportService || new ExportService({ eventBus: eb, storage })
    this.ui = opts.exportUI || new ExportUI({ eventBus: eb, exportService: this.service, manager: this })
  }

  /* ---------------------------------------------------------- */
  /* Lifecycle                                                  */
  /* ---------------------------------------------------------- */
  onInit () {
    this.service.init?.()
    this.ui.init?.()
  }

  init () {
    // Keep old `init()` API for tests / legacy code
    super.init?.()
    this.onInit()
  }

  /* ---------------------------------------------------------- */
  /* UI-layer proxies                                           */
  /* ---------------------------------------------------------- */
  populateExportModal (...a) { return this.ui.populateExportModal(...a) }
  showExportOptions (...a) { return this.ui.showExportOptions(...a) }
  performExport (...a) { return this.ui.performExport(...a) }
  exportSTOKeybindFile (...a) { return this.ui.exportSTOKeybindFile(...a) }
  exportJSONProfile (...a) { return this.ui.exportJSONProfile(...a) }
  exportCompleteProject (...a) { return this.ui.exportCompleteProject(...a) }
  exportCSVData (...a) { return this.ui.exportCSVData(...a) }
  exportHTMLReport (...a) { return this.ui.exportHTMLReport(...a) }
  exportAliases (...a) { return this.ui.exportAliases(...a) }
  copyCommandPreview (...a) { return this.ui.copyCommandPreview(...a) }
  setupEventListeners (...a) { return this.ui.setupEventListeners(...a) }
  downloadFile (...a) { return this.ui.downloadFile(...a) }
  exportAllProfiles (...a) { return this.ui.exportAllProfiles ? this.ui.exportAllProfiles(...a) : undefined }

  /* ---------------------------------------------------------- */
  /* Service-layer proxies                                       */
  /* ---------------------------------------------------------- */
  generateSTOKeybindFile (...a) { return this.service.generateSTOKeybindFile(...a) }
  generateFileHeader (...a) { return this.service.generateFileHeader(...a) }
  generateAliasSection (...a) { return this.service.generateAliasSection(...a) }
  generateKeybindSection (...a) { return this.service.generateKeybindSection(...a) }
  generateFileFooter (...a) { return this.service.generateFileFooter(...a) }
  generateCSVData (...a) { return this.service.generateCSVData(...a) }
  escapeCSV (...a) { return this.service.escapeCSV(...a) }
  generateHTMLReport (...a) { return this.service.generateHTMLReport(...a) }
  generateHTMLKeybindSection (...a) { return this.service.generateHTMLKeybindSection(...a) }
  generateHTMLAliasSection (...a) { return this.service.generateHTMLAliasSection(...a) }
  generateFileName (...a) { return this.service.generateFileName(...a) }
  generateAliasFileName (...a) { return this.service.generateAliasFileName(...a) }
  sanitizeProfileForExport (...a) { return this.service.sanitizeProfileForExport(...a) }
  extractKeys (...a) { return this.service.extractKeys(...a) }
  generateAliasFile (...a) { return this.service.generateAliasFile(...a) }
  importFromFile (...a) { return this.service.importFromFile(...a) }
  importJSONFile (...a) { return this.service.importJSONFile(...a) }
  syncToFolder (...a) { return this.service.syncToFolder(...a) }

  get exportFormats () { return this.service.exportFormats }
}
