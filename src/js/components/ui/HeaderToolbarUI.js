import ComponentBase from '../ComponentBase.js'

/**
 * HeaderToolbarUI - Manages toolbar button visibility based on preferences
 * Handles dynamic showing/hiding of toolbar buttons like bindset manager
 */
export default class HeaderToolbarUI extends ComponentBase {
  constructor({ eventBus, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'HeaderToolbarUI'
    this.document = document

  }

  init() {
    // Call ComponentBase.init() to set up event listeners for preferences:saved
    super.init()
    this.setupEventListeners()
    // Initial update
    this.updateBindsetButtonVisibility()
  }

  setupEventListeners() {
    // Listen for preference changes to update button visibility
    this.addEventListener('preferences:changed', (data) => {
      if (data.changes && (data.changes.bindsetsEnabled !== undefined || data.changes.bindToAliasMode !== undefined)) {
        this.updateBindsetButtonVisibility()
      }
    })
  }

  updateBindsetButtonVisibility() {
    try {
      // Use cached preference values from ComponentBase
      const aliasMode = this.getPreference('bindToAliasMode', false)
      const bindsets = this.getPreference('bindsetsEnabled', false)
      const btn = this.document.getElementById('bindsetManagerBtn')
      
      console.log('[HeaderToolbarUI] updateBindsetButtonVisibility:', {
        aliasMode,
        bindsets,
        buttonFound: !!btn,
        cacheExists: !!this.cache,
        preferencesCache: this.cache?.preferences,
        fullCache: this.cache
      })
      
      if (btn) {
        const show = aliasMode && bindsets
        btn.style.display = show ? '' : 'none'
        
        // Hide parent toolbar-group if empty
        const group = btn.closest('.toolbar-group')
        if (group) {
          group.style.display = show ? '' : 'none'
        }
        
        console.log('[HeaderToolbarUI] Button visibility updated:', { show })
      } else {
        console.log('[HeaderToolbarUI] bindsetManagerBtn element not found in DOM')
      }
    } catch (e) {
      console.warn('[HeaderToolbarUI] Failed to update bindset button visibility:', e)
    }
  }

  /**
   * Handle late-join state from other components
   * ComponentBase now handles PreferencesService automatically
   */
  handleInitialState(sender, state) {
    // ComponentBase automatically handles PreferencesService late-join
    if (sender === 'PreferencesService' && this.cache.preferences) {
      console.log('[HeaderToolbarUI] Received preferences via ComponentBase, updating UI')
      // Update button visibility with the new preferences
      this.updateBindsetButtonVisibility()
    }
  }

  /**
   * Helper to get preference values with fallback
   */
  getPreference(key, defaultValue = false) {
    // Use cached preference values from ComponentBase
    return this.cache?.preferences?.[key] ?? defaultValue
  }
}