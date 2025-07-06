import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import { 
  getKeyboardLayout, 
  getLayoutName, 
  KEY_POSITIONS, 
  MOUSE_GESTURES, 
  SMART_SUGGESTIONS 
} from '../../lib/keyboardLayouts.js'

/**
 * Enhanced KeyCaptureUI with hybrid capture-first interface.
 * Features:
 * - Visual keyboard with international layout support
 * - Real-time sync between physical keys and visual highlighting
 * - Enhanced mouse gesture support (lpress, rpress, ldrag, rdrag)
 * - Smart key suggestions
 * - Capture-first workflow with manual fallback
 */
export default class KeyCaptureUI extends ComponentBase {
  /**
   * @param {Object}                   opts
   * @param {import('../services/KeyCaptureService.js').default} opts.service
   * @param {Object}                   [opts.modalManager] – instance of ModalManagerService
   * @param {STOToolsKeybindManager}   [opts.app]          – main application reference (for addKey())
   * @param {Document}                 [opts.document]
   * @param {Object}                   [opts.ui]           – instance of stoUI
   */
  constructor ({ eventBus: bus = eventBus, modalManager = null, app = null, document = (typeof window !== 'undefined' ? window.document : undefined), ui = null, service = null } = {}) {
    // Phase-2: UI components require only an eventBus reference. Accept optional
    // `service` for backward-compatibility but do NOT rely on it.
    super(bus)
    this.componentName = 'KeyCaptureUI'

    this.eventBus     = bus
    this.modalManager = modalManager || (typeof window !== 'undefined' ? window.modalManager : null)
    this.app          = app || (typeof window !== 'undefined' ? window.app : null)
    this.document     = document
    this.ui           = ui || (typeof window !== 'undefined' ? window.stoUI : null)

    // State management
    this.currentKeyboard = null
    this.selectedKey = null
    this.highlightedKeys = new Set()
    this.isDuplicationMode = false
    this.sourceKeyForDuplication = null
    this.isCapturing = false
    // When switching modes, we may get an immediate residual chord (e.g. "lclick") – ignore it once.
    this.ignoreNextChord = false
    // Remember the last side (L/R) used for each modifier to restore when toggling distinguish option
    this.lastModifierSide = { ctrl: 'L', alt: 'L', shift: 'L' }
    this.selectedLayout = 'en'
    
    // Legacy compatibility
    this.service = service
  }

  /* ------------------------------------------------------------ lifecycle */
  onInit () {
    console.log('[KeyCaptureUI] onInit called')
    console.log('[KeyCaptureUI] eventBus:', !!this.eventBus)
    console.log('[KeyCaptureUI] modalManager:', !!this.modalManager)
    
    // Listen for capture lifecycle events
    this.addEventListener('capture-start', (d) => this.handleCaptureStart(d))
    this.addEventListener('update', (d) => this.updateCapturedKeysDisplay(d))
    this.addEventListener('chord-captured', (d) => this.handleChordCaptured(d))
    this.addEventListener('capture-stop', (d) => this.handleCaptureStop(d))

    // Listen for key duplication requests
    console.log('[KeyCaptureUI] Setting up key:duplicate event listener')
    this.addEventListener('key:duplicate', ({ key } = {}) => {
      console.log('[KeyCaptureUI] key:duplicate event listener called with:', { key })
      this.handleKeyDuplication(key)
    })

    // Setup modal shown event
    if (this.eventBus) {
      console.log('[KeyCaptureUI] Setting up modal:shown event listener')
      this.eventBus.on('modal:shown', ({ modalId }) => {
        console.log('[KeyCaptureUI] modal:shown event received:', modalId)
        if (modalId === 'keySelectionModal') {
          console.log('[KeyCaptureUI] Initializing key selection modal')
          this.initializeModal()
        }
      })
    }

    this.setupEventListeners()
  }

  setupEventListeners() {
    if (this.eventListenersSetup) return
    this.eventListenersSetup = true

    // Capture mode toggle
    this.eventBus.onDom('toggleCaptureMode', 'click', 'toggle-capture-mode', () => {
      this.toggleCaptureMode()
    })

    // Main action buttons
    this.eventBus.onDom('confirm-key-selection', 'click', 'confirm-key-selection', () => {
      this.confirmSelection()
    })

    this.eventBus.onDom('cancel-key-selection', 'click', 'cancel-key-selection', () => {
      this.cancelSelection()
    })

    // Virtual keyboard key clicks (manual mode only)
    this.eventBus.onDom('.vkey', 'click', 'virtual-key-click', (e) => {
      // Ignore clicks while we are in live capture mode
      if (this.isCapturing) return

      // Support clicks on inner span elements by finding the nearest .vkey ancestor
      const keyButton = e.target.closest('.vkey')
      if (!keyButton) return

      const keyCode = keyButton.dataset.keyCode
      if (keyCode) {
        this.selectKeyFromVirtualKeyboard(keyCode)
      }
    })

    // Keyboard layout selector
    this.eventBus.onDom('keyboardLayoutSelector', 'change', 'layout-change', (e) => {
      this.changeKeyboardLayout(e.target.value)
    })

    // Location-specific modifier toggle
    this.eventBus.onDom('distinguishModifierSide', 'change', 'location-specific-toggle', (e) => {
      this.emit('keycapture:set-location-specific', { value: e.target.checked })
      // Update current selection if there is one
      if (this.selectedKey) {
        this.updateChordWithLocationSpecific(e.target.checked)
      }
      // Update modifier highlighting when the setting changes
      this.updateModifierHighlighting()
    })
  }

  /* -------------------------------------------------------- modal management */
  
  /**
   * Initialize the modal when shown
   */
  initializeModal() {
    console.log('[KeyCaptureUI] initializeModal called')
    this.buildModalContent()
    // Ensure dropdown reflects current layout
    const selector = this.document.getElementById('keyboardLayoutSelector')
    if (selector) selector.value = this.selectedLayout
    this.updateKeyboardLayout()
    
    // Ensure location-specific flag in service matches initial checkbox (default false)
    const distinguishCheckbox = this.document.getElementById('distinguishModifierSide')
    const initialDistinguish = !!distinguishCheckbox?.checked
    this.emit('keycapture:set-location-specific', { value: initialDistinguish })
    
    // Start capture mode immediately
    this.startCaptureMode()
  }

  /**
   * Handle key duplication request
   */
  handleKeyDuplication(sourceKey) {
    console.log('[KeyCaptureUI] handleKeyDuplication called with key:', sourceKey)
    this.isDuplicationMode = true
    this.sourceKeyForDuplication = sourceKey
    console.log('[KeyCaptureUI] Duplication mode set, calling showKeySelectionModal')
    this.showKeySelectionModal()
  }

  /**
   * Show the key selection modal
   */
  showKeySelectionModal() {
    console.log('[KeyCaptureUI] showKeySelectionModal called')
    console.log('[KeyCaptureUI] modalManager:', !!this.modalManager)
    if (this.modalManager) {
      console.log('[KeyCaptureUI] Calling modalManager.show')
      this.modalManager.show('keySelectionModal')
    } else {
      console.error('[KeyCaptureUI] modalManager is null/undefined')
    }
  }

  /* -------------------------------------------------------- capture management */
  
  /**
   * Start capture mode
   */
  startCaptureMode() {
    this.updateCaptureState(true)
    this.emit('keycapture:start', { context: 'keySelectionModal' })
  }

  /**
   * Stop capture mode
   */
  stopCaptureMode() {
    this.updateCaptureState(false)
    this.emit('keycapture:stop')
  }

  /**
   * Toggle between capture and manual mode
   */
  toggleCaptureMode() {
    const captureIndicator = this.document.getElementById('captureIndicator')
    const isCapturing = captureIndicator?.classList.contains('active')
    
    if (isCapturing) {
      // We are about to leave capture mode → ignore the click that triggered it
      this.ignoreNextChord = true
      this.stopCaptureMode()

      // Clear any accidental selection made by the toggle click
      this.selectedKey = null
      this.clearVirtualModifiers()
      this.updatePreviewDisplay('')
      this.disableConfirmButton()
    } else {
      this.startCaptureMode()
    }
  }

  /**
   * Update UI to reflect capture state
   */
  updateCaptureState(isCapturing) {
    const captureIndicator = this.document.getElementById('captureIndicator')
    const captureToggle = this.document.getElementById('toggleCaptureMode')
    const manualMode = this.document.getElementById('manualSelectionMode')

    // Persist capture state
    this.isCapturing = isCapturing

    if (captureIndicator) {
      captureIndicator.classList.toggle('active', isCapturing)
    }
    
    if (captureToggle) {
      captureToggle.textContent = isCapturing 
        ? (i18next?.t('switch_to_manual') || 'Switch to Manual')
        : (i18next?.t('start_capture') || 'Start Capture')
    }

    if (manualMode) {
      manualMode.style.opacity = isCapturing ? '0.7' : '1'
    }

    // Disable/enable interactions with the virtual keyboard UI while capturing
    const vkb = this.document.getElementById('virtualKeyboard')
    if (vkb) {
      vkb.classList.toggle('disabled', isCapturing)
    }
  }

  /* -------------------------------------------------------- event handlers */

  handleCaptureStart({ context }) {
    this.updateCaptureState(true)
  }

  handleCaptureStop({ context }) {
    this.updateCaptureState(false)
  }

  updateCapturedKeysDisplay({ chord, codes, context }) {
    this.highlightKeysOnVirtualKeyboard(codes)
    this.updatePreviewDisplay(chord)
  }

  handleChordCaptured({ chord, context }) {
    // Skip a single chord if flagged (e.g. we just toggled mode and a mouse click slipped through)
    if (this.ignoreNextChord) {
      this.ignoreNextChord = false
      return
    }

    this.selectKey(chord)
    // Auto-stop capture after successful capture
    setTimeout(() => {
      this.stopCaptureMode()
    }, 100)
  }

  /* -------------------------------------------------------- key selection */

  /**
   * Select a key (from any source: capture, virtual keyboard, suggestions)
   */
  selectKey(keyChord) {
    this.selectedKey = keyChord
    this.updateLastModifierSideFromChord(keyChord)
    this.updatePreviewDisplay(keyChord)
    this.enableConfirmButton()
    
    // Highlight the key on virtual keyboard if it's a simple key
    this.highlightSelectedKeyOnKeyboard(keyChord)
  }

  /**
   * Select key from virtual keyboard click
   */
  selectKeyFromVirtualKeyboard(keyCode) {
    // Check if this is a modifier key
    const isModifier = ['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight'].includes(keyCode)
    
    if (isModifier) {
      // For modifier keys, toggle the modifier state
      this.toggleVirtualModifier(keyCode)
      return // Don't complete the chord for modifier-only selection
    }
    
    // For non-modifier keys, build chord with current modifiers
    const activeModifiers = this.getActiveVirtualModifiers()
    let chord = keyCode

    if (activeModifiers.length > 0) {
      // Convert key code to display name for chord
      const keyName = this.keyCodeToDisplayName(keyCode)
      chord = `${activeModifiers.join('+')}+${keyName}`
    } else {
      chord = this.keyCodeToDisplayName(keyCode)
    }

    this.selectKey(chord)
    
    // Clear modifiers after chord completion
    if (activeModifiers.length > 0) {
      this.clearVirtualModifiers(true)
    }
  }

  /**
   * Toggle virtual modifier state (using virtual keyboard keys)
   */
  toggleVirtualModifier(keyCode) {
    const distinguishSides = this.document.getElementById('distinguishModifierSide')?.checked || false
    
    // Determine modifier type and current state
    const modifierType = this.getModifierType(keyCode)
    const leftKey = modifierType === 'ctrl' ? 'ControlLeft' : 
                   modifierType === 'alt' ? 'AltLeft' : 'ShiftLeft'
    const rightKey = modifierType === 'ctrl' ? 'ControlRight' : 
                    modifierType === 'alt' ? 'AltRight' : 'ShiftRight'

    // Helper to set active class on a key element
    const setActive = (el, active) => {
      if (!el) return
      el.classList.toggle('modifier-active', active)
    }

    // Determine if this key (or its type) is already active
    const leftElement = this.document.querySelector(`[data-key-code="${leftKey}"]`)
    const rightElement = this.document.querySelector(`[data-key-code="${rightKey}"]`)

    const keyElement = this.document.querySelector(`[data-key-code="${keyCode}"]`)
    const isActive = keyElement?.classList.contains('modifier-active')

    // Clear ALL modifiers before activating new one to guarantee only one modifier type at once
    this.clearVirtualModifiers(true)

    if (isActive) {
      // It was active → we just cleared, leave all modifiers off
      this.updatePreviewWithCurrentModifiers()
      return
    }

    if (distinguishSides) {
      // Activate the chosen side only
      setActive(keyElement, true)
    } else {
      // Activate both sides for that modifier type
      setActive(leftElement, true)
      setActive(rightElement, true)
    }

    // Only refresh preview if we don't already have a chord that includes a non-modifier key
    const modNames = ['Ctrl','Alt','Shift','LCTRL','RCTRL','LALT','RALT','LSHIFT','RSHIFT']
    const hasNonModifierKey = this.selectedKey && this.selectedKey.split('+').some(p => p && !modNames.includes(p))
    if (!hasNonModifierKey) {
      this.updatePreviewWithCurrentModifiers()
    }

    // Record side selection
    if (modifierType) {
      this.lastModifierSide[modifierType] = keyCode.endsWith('Right') ? 'R' : 'L'
    }
  }

  /**
   * Get modifier type from key code
   */
  getModifierType(keyCode) {
    if (keyCode.includes('Control')) return 'ctrl'
    if (keyCode.includes('Alt')) return 'alt'
    if (keyCode.includes('Shift')) return 'shift'
    return null
  }

  /**
   * Get currently active virtual modifiers of a specific type
   */
  getActiveVirtualModifiersOfType(modifierType, distinguishSides) {
    const leftKey = modifierType === 'ctrl' ? 'ControlLeft' : 
                   modifierType === 'alt' ? 'AltLeft' : 'ShiftLeft'
    const rightKey = modifierType === 'ctrl' ? 'ControlRight' : 
                    modifierType === 'alt' ? 'AltRight' : 'ShiftRight'
    
    const leftElement = this.document.querySelector(`[data-key-code="${leftKey}"]`)
    const rightElement = this.document.querySelector(`[data-key-code="${rightKey}"]`)
    
    const active = []
    if (leftElement?.classList.contains('modifier-active')) {
      active.push(distinguishSides ? leftKey : modifierType)
    }
    if (rightElement?.classList.contains('modifier-active')) {
      active.push(distinguishSides ? rightKey : modifierType)
    }
    
    // Remove duplicates when not distinguishing sides
    return [...new Set(active)]
  }

  /**
   * Get currently active virtual modifiers
   */
  getActiveVirtualModifiers() {
    const distinguishSides = this.document.getElementById('distinguishModifierSide')?.checked || false
    const modifiers = []
    
    // Check each modifier type (use explicit array variable to avoid minifier issues)
    const modifierTypes = ['ctrl', 'alt', 'shift']
    modifierTypes.forEach(type => {
      const active = this.getActiveVirtualModifiersOfType(type, distinguishSides)
      if (distinguishSides) {
        // Add specific sides
        active.forEach(mod => {
          if (mod === 'ControlLeft') modifiers.push('LCTRL')
          else if (mod === 'ControlRight') modifiers.push('RCTRL')
          else if (mod === 'AltLeft') modifiers.push('LALT')
          else if (mod === 'AltRight') modifiers.push('RALT')
          else if (mod === 'ShiftLeft') modifiers.push('LSHIFT')
          else if (mod === 'ShiftRight') modifiers.push('RSHIFT')
        })
      } else {
        // Add generic modifiers
        if (active.length > 0) {
          if (type === 'ctrl') modifiers.push('Ctrl')
          else if (type === 'alt') modifiers.push('Alt')
          else if (type === 'shift') modifiers.push('Shift')
        }
      }
    })
    
    return modifiers
  }

  /**
   * Clear all virtual modifiers
   */
  clearVirtualModifiers(skipPreviewUpdate = false) {
    const modifierKeys = ['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight']
    modifierKeys.forEach(keyCode => {
      const element = this.document.querySelector(`[data-key-code="${keyCode}"]`)
      if (element) {
        element.classList.remove('modifier-active')
      }
    })
    if (!skipPreviewUpdate) {
      this.updatePreviewWithCurrentModifiers()
    }
  }

  /**
   * Update preview with current modifiers (for partial chord display)
   */
  updatePreviewWithCurrentModifiers() {
    const activeModifiers = this.getActiveVirtualModifiers()
    if (activeModifiers.length > 0) {
      const chordPreview = activeModifiers.join('+') + '+'
      this.updatePreviewDisplay(chordPreview)
    } else {
      this.updatePreviewDisplay('')
    }
  }

  /**
   * Get currently active modifiers (legacy method for compatibility)
   */
  getActiveModifiers() {
    return this.getActiveVirtualModifiers()
  }

  /**
   * Toggle modifier state (legacy method for compatibility)
   */
  toggleModifier(modifier) {
    // This method is now handled by toggleVirtualModifier
    // Keep for compatibility but redirect to virtual keyboard handling
    const keyCode = modifier === 'ctrl' ? 'ControlLeft' :
                   modifier === 'alt' ? 'AltLeft' : 'ShiftLeft'
    this.toggleVirtualModifier(keyCode)
  }

  /**
   * Confirm the current selection
   */
  async confirmSelection() {
    if (!this.selectedKey) return

    try {
      if (this.isDuplicationMode) {
        // Handle key duplication with new name
        await this.request('key:duplicate-with-name', { 
          sourceKey: this.sourceKeyForDuplication,
          newKey: this.selectedKey
        })
        this.isDuplicationMode = false
        this.sourceKeyForDuplication = null
      } else {
        // Handle regular key addition
      await this.request('key:add', { key: this.selectedKey })
      }
      
      this.modalManager?.hide('keySelectionModal')
      this.resetState()
    } catch (err) {
      console.error('Failed to confirm key selection:', err)
      if (this.ui?.showToast) {
        this.ui.showToast(i18next?.t('key_selection_failed') || 'Failed to select key', 'error')
      }
    }
  }

  /**
   * Cancel the selection
   */
  cancelSelection() {
    this.modalManager?.hide('keySelectionModal')
    this.resetState()
  }

  /**
   * Reset internal state
   */
  resetState() {
    this.selectedKey = null
    this.highlightedKeys.clear()
    this.isDuplicationMode = false
    this.sourceKeyForDuplication = null
    this.isCapturing = false
    this.ignoreNextChord = false
    this.lastModifierSide = { ctrl: 'L', alt: 'L', shift: 'L' }
    this.clearKeyboardHighlights()
    this.clearVirtualModifiers()
    this.updatePreviewDisplay('')
    this.disableConfirmButton()

    // Reset service location-specific flag to false so next modal starts clean
    this.emit('keycapture:set-location-specific', { value: false })
  }

  /* -------------------------------------------------------- UI rendering */

  /**
   * Build the complete modal content
   */
  buildModalContent() {
    console.log('[KeyCaptureUI] buildModalContent called')
    const modal = this.document.getElementById('keySelectionModal')
    console.log('[KeyCaptureUI] Modal element found:', !!modal)
    if (!modal) return

    const modalBody = modal.querySelector('.modal-body')
    console.log('[KeyCaptureUI] Modal body found:', !!modalBody)
    if (!modalBody) return

    console.log('[KeyCaptureUI] Setting modal body innerHTML')
    modalBody.innerHTML = this.generateModalHTML()
    console.log('[KeyCaptureUI] Modal content set, innerHTML length:', modalBody.innerHTML.length)
  }

  /**
   * Generate the complete modal HTML
   */
  generateModalHTML() {
    console.log('[KeyCaptureUI] generateModalHTML called')
    const currentLang = i18next?.language || 'en'
    const layoutName = getLayoutName(currentLang)
    console.log('[KeyCaptureUI] Current language:', currentLang, 'Layout name:', layoutName)

    return `
      <div class="hybrid-key-capture">
        <!-- Header Section -->
        <div class="capture-header">
          <div class="capture-zone" id="captureZone">
            <div class="capture-indicator" id="captureIndicator">
              <div class="pulse-ring"></div>
              <i class="fas fa-keyboard"></i>
            </div>
            <div class="capture-instructions">
              <h3 data-i18n="press_any_key_combination">${i18next?.t('press_any_key_combination') || 'Press any key combination...'}</h3>
              <p data-i18n="capture_instructions">${i18next?.t('capture_instructions') || 'Use your keyboard, mouse, or click keys below'}</p>
            </div>
          </div>
          <button class="btn btn-secondary toggle-mode" id="toggleCaptureMode" data-i18n="switch_to_manual">
            ${i18next?.t('switch_to_manual') || 'Switch to Manual'}
          </button>
        </div>

        <!-- Preview Section -->
        <div class="selection-preview">
          <div class="preview-display">
            <label data-i18n="selected_key">${i18next?.t('selected_key') || 'Selected Key'}:</label>
            <div class="key-preview-display" id="keyPreviewDisplay">
              <span class="no-selection" data-i18n="no_key_selected">${i18next?.t('no_key_selected') || 'No key selected'}</span>
            </div>
          </div>
          <div class="preview-controls">
            <label class="location-specific-toggle">
              <input type="checkbox" id="distinguishModifierSide" />
              <span data-i18n="distinguish_left_right_modifiers">${i18next?.t('distinguish_left_right_modifiers') || 'Distinguish left/right modifiers'}</span>
            </label>
          </div>
        </div>

        <!-- Main Content -->
        <div class="capture-content">
          <!-- Virtual Keyboard Section -->
          <div class="virtual-keyboard-section">
            <div class="section-header">
              <h4><i class="fas fa-keyboard"></i> <span data-i18n="keyboard_layout">${i18next?.t('keyboard_layout') || 'Keyboard Layout'}</span></h4>
              <select id="keyboardLayoutSelector" class="form-select">
                <option value="en">QWERTY (English)</option>
                <option value="de">QWERTZ (German)</option>
                <option value="fr">AZERTY (French)</option>
                <option value="es">QWERTY (Spanish)</option>
              </select>
            </div>
            <div class="virtual-keyboard" id="virtualKeyboard">
              <!-- Virtual keyboard will be rendered here -->
            </div>
          </div>
        </div>

        <!-- Footer Section -->
        <div class="capture-footer">
          <div class="action-buttons">
            <button class="btn btn-primary" id="confirm-key-selection" disabled data-i18n="confirm_selection">
              ${i18next?.t('confirm_selection') || 'Confirm Selection'}
            </button>
            <button class="btn btn-secondary" id="cancel-key-selection" data-i18n="cancel">
              ${i18next?.t('cancel') || 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    `
  }

  /**
   * Update keyboard layout based on language
   */
  updateKeyboardLayout() {
    // Use the user-selected layout rather than UI language
    this.currentKeyboard = JSON.parse(JSON.stringify(getKeyboardLayout(this.selectedLayout)))
    this.renderVirtualKeyboard()
  }

  /**
   * Change keyboard layout
   */
  changeKeyboardLayout(language) {
    this.selectedLayout = language || 'en'
    this.currentKeyboard = JSON.parse(JSON.stringify(getKeyboardLayout(this.selectedLayout)))
    this.renderVirtualKeyboard()
    
    // Update layout indicator
    const layoutIndicator = this.document.querySelector('.current-layout')
    if (layoutIndicator) {
      layoutIndicator.textContent = getLayoutName(language)
    }
  }

  /**
   * Render the visual keyboard
   */
  renderVirtualKeyboard() {
    const container = this.document.getElementById('virtualKeyboard')
    if (!container || !this.currentKeyboard) return

    let html = ''
    const rows = {}
    
    // Group keys by row
    Object.entries(KEY_POSITIONS).forEach(([keyCode, position]) => {
      if (!rows[position.row]) {
        rows[position.row] = []
      }
      rows[position.row].push({ keyCode, ...position })
    })

    // Render each row
    Object.entries(rows)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([rowNum, keys]) => {
        html += `<div class="keyboard-row" data-row="${rowNum}">`
        
        keys.sort((a, b) => a.col - b.col).forEach(key => {
          const keyInfo = this.currentKeyboard.keys[key.keyCode] || 
                         { primary: key.keyCode, secondary: '' }
          
          html += `
            <button class="vkey" 
                    data-key-code="${key.keyCode}" 
                    data-row="${key.row}" 
                    data-col="${key.col}"
                    style="grid-column: span ${key.width}">
              <span class="key-primary">${keyInfo.primary}</span>
              ${keyInfo.secondary ? `<span class="key-secondary">${keyInfo.secondary}</span>` : ''}
            </button>
          `
        })
        
        html += '</div>'
      })

    container.innerHTML = html
  }

  /* -------------------------------------------------------- UI helpers */

  /**
   * Update the preview display
   */
  updatePreviewDisplay(chord) {
    const preview = this.document.getElementById('keyPreviewDisplay')
    if (!preview) return

    if (chord) {
      const formatted = this.formatKeyForDisplay(chord)
      preview.innerHTML = `<span class="key-combination">${formatted}</span>`
    } else {
      preview.innerHTML = `<span class="no-selection" data-i18n="no_key_selected">${i18next?.t('no_key_selected') || 'No key selected'}</span>`
    }
  }

  /**
   * Format key chord for display
   */
  formatKeyForDisplay(chord) {
    if (!chord) return ''
    
    // Split on + and format each part
    return chord.split('+')
                .filter(part => part.length > 0)
                .map(part => `<kbd>${part}</kbd>`)
                .join('<span class="plus">+</span>')
  }

  /**
   * Convert key code to display name
   */
  keyCodeToDisplayName(keyCode) {
    const keyInfo = this.currentKeyboard?.keys[keyCode]
    if (keyInfo) {
      return keyInfo.primary
    }
    
    // Fallback to simplified name
    return keyCode.replace(/^Key|^Digit/, '')
  }

  /**
   * Highlight keys on virtual keyboard
   */
  highlightKeysOnVirtualKeyboard(codes) {
    // Clear previous highlights
    this.clearKeyboardHighlights()
    
    if (!codes || codes.length === 0) return

    codes.forEach(code => {
      const keyElement = this.document.querySelector(`[data-key-code="${code}"]`)
      if (keyElement) {
        keyElement.classList.add('pressed')
        this.highlightedKeys.add(code)
      }
    })
  }

  /**
   * Update modifier highlighting when the distinguish setting changes
   */
  updateModifierHighlighting() {
    const distinguishSides = this.document.getElementById('distinguishModifierSide')?.checked || false
    
    // Get currently active modifiers before the change
    const currentlyActive = []
    const modifierKeys = ['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight']
    
    modifierKeys.forEach(keyCode => {
      const element = this.document.querySelector(`[data-key-code="${keyCode}"]`)
      if (element?.classList.contains('modifier-active')) {
        currentlyActive.push(keyCode)
      }
    })
    
    // Clear all modifier highlighting
    this.clearVirtualModifiers(true)
    
    // Re-apply highlighting based on new setting
    if (currentlyActive.length > 0) {
      if (distinguishSides) {
        const handledTypes = new Set()
        const sidePref = { L: 'Left', R: 'Right' }
        currentlyActive.forEach(keyCode => {
          const type = this.getModifierType(keyCode)
          if (!type || handledTypes.has(type)) return

          const preferredSide = this.lastModifierSide[type] || 'L'
          const preferredKey = type === 'ctrl' ? `Control${sidePref[preferredSide]}` :
                               type === 'alt'  ? `Alt${sidePref[preferredSide]}`     :
                               `Shift${sidePref[preferredSide]}`

          let chosenKey = preferredKey
          if (!currentlyActive.includes(chosenKey)) {
            const altKey = preferredSide === 'L' ? preferredKey.replace('Left','Right') : preferredKey.replace('Right','Left')
            if (currentlyActive.includes(altKey)) chosenKey = altKey
          }

          // Ensure other side's selected highlight removed
          const leftKey = type === 'ctrl' ? 'ControlLeft' : type === 'alt' ? 'AltLeft' : 'ShiftLeft'
          const rightKey = type === 'ctrl' ? 'ControlRight' : type === 'alt' ? 'AltRight' : 'ShiftRight'
          if (chosenKey === leftKey) {
            const rightEl = this.document.querySelector(`[data-key-code="${rightKey}"]`)
            rightEl?.classList.remove('selected')
          } else {
            const leftEl = this.document.querySelector(`[data-key-code="${leftKey}"]`)
            leftEl?.classList.remove('selected')
          }

          // Highlight chosen side (blue selected)
          this.highlightKey(chosenKey)
          handledTypes.add(type)
        })
      } else {
        // Group by modifier type and activate both sides
        const activeTypes = new Set()
        currentlyActive.forEach(keyCode => {
          const type = this.getModifierType(keyCode)
          if (type) activeTypes.add(type)
        })
        
        activeTypes.forEach(type => {
          const leftKey = type === 'ctrl' ? 'ControlLeft' : 
                         type === 'alt' ? 'AltLeft' : 'ShiftLeft'
          const rightKey = type === 'ctrl' ? 'ControlRight' : 
                          type === 'alt' ? 'AltRight' : 'ShiftRight'
          
          const leftElement = this.document.querySelector(`[data-key-code="${leftKey}"]`)
          const rightElement = this.document.querySelector(`[data-key-code="${rightKey}"]`)
          
          leftElement?.classList.add('modifier-active')
          rightElement?.classList.add('modifier-active')
        })
      }
    }
    
    // Only refresh preview if we don't already have a chord that includes a non-modifier key
    const modNames = ['Ctrl','Alt','Shift','LCTRL','RCTRL','LALT','RALT','LSHIFT','RSHIFT']
    const hasNonModifierKey = this.selectedKey && this.selectedKey.split('+').some(p => p && !modNames.includes(p))
    if (!hasNonModifierKey) {
      this.updatePreviewWithCurrentModifiers()
    }
  }

  /**
   * Highlight selected key on keyboard
   */
  highlightSelectedKeyOnKeyboard(chord) {
    this.clearKeyboardHighlights()
    
    if (!chord) return
    
    // Split the chord into individual keys
    const keys = chord.split('+')
    
    // Update side cache
    this.updateLastModifierSideFromChord(chord)
    
    keys.forEach(key => {
      // Find the corresponding key code for each key in the chord
      let targetCode = null
      
      // Handle modifiers with location-specific awareness
      const distinguishSides = this.document.getElementById('distinguishModifierSide')?.checked || false
      
      if (key === 'Ctrl' && !distinguishSides) {
        // Highlight both Ctrl keys
        this.highlightKey('ControlLeft')
        this.highlightKey('ControlRight')
        return
      } else if (key === 'Alt' && !distinguishSides) {
        // Highlight both Alt keys
        this.highlightKey('AltLeft')
        this.highlightKey('AltRight')
        return
      } else if (key === 'Shift' && !distinguishSides) {
        // Highlight both Shift keys
        this.highlightKey('ShiftLeft')
        this.highlightKey('ShiftRight')
        return
      } else if (key === 'LCTRL') {
        targetCode = 'ControlLeft'
      } else if (key === 'RCTRL') {
        targetCode = 'ControlRight'
      } else if (key === 'LALT') {
        targetCode = 'AltLeft'
      } else if (key === 'RALT') {
        targetCode = 'AltRight'
      } else if (key === 'LSHIFT') {
        targetCode = 'ShiftLeft'
      } else if (key === 'RSHIFT') {
        targetCode = 'ShiftRight'
      } else if (key === 'Ctrl') {
        targetCode = 'ControlLeft' // Default to left when distinguishing
      } else if (key === 'Alt') {
        targetCode = 'AltLeft'
      } else if (key === 'Shift') {
        targetCode = 'ShiftLeft'
      } else if (this.currentKeyboard) {
        // Handle regular keys by searching through the keyboard layout
        for (const [code, keyInfo] of Object.entries(this.currentKeyboard.keys)) {
          if (keyInfo.primary === key || keyInfo.secondary === key) {
            targetCode = code
            break
          }
        }
        
        // If not found in keyboard layout, try common mappings
        if (!targetCode) {
          const commonMappings = {
            '1': 'Digit1', '2': 'Digit2', '3': 'Digit3', '4': 'Digit4', '5': 'Digit5',
            '6': 'Digit6', '7': 'Digit7', '8': 'Digit8', '9': 'Digit9', '0': 'Digit0',
            'A': 'KeyA', 'B': 'KeyB', 'C': 'KeyC', 'D': 'KeyD', 'E': 'KeyE',
            'F': 'KeyF', 'G': 'KeyG', 'H': 'KeyH', 'I': 'KeyI', 'J': 'KeyJ',
            'K': 'KeyK', 'L': 'KeyL', 'M': 'KeyM', 'N': 'KeyN', 'O': 'KeyO',
            'P': 'KeyP', 'Q': 'KeyQ', 'R': 'KeyR', 'S': 'KeyS', 'T': 'KeyT',
            'U': 'KeyU', 'V': 'KeyV', 'W': 'KeyW', 'X': 'KeyX', 'Y': 'KeyY',
            'Z': 'KeyZ', 'Space': 'Space', 'Tab': 'Tab',
            'Escape': 'Escape', 'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4',
            'F5': 'F5', 'F6': 'F6', 'F7': 'F7', 'F8': 'F8', 'F9': 'F9',
            'F10': 'F10', 'F11': 'F11', 'F12': 'F12'
          }
          targetCode = commonMappings[key]
        }
      }
      
      // Highlight the key if found
      if (targetCode) {
        this.highlightKey(targetCode)
      }
    })
  }

  /**
   * Helper method to highlight a single key
   */
  highlightKey(keyCode) {
    const keyElement = this.document.querySelector(`[data-key-code="${keyCode}"]`)
    if (keyElement) {
      keyElement.classList.add('selected')
      this.highlightedKeys.add(keyCode)
    }
  }

  /**
   * Clear keyboard highlights
   */
  clearKeyboardHighlights() {
    this.highlightedKeys.forEach(keyCode => {
      const keyElement = this.document.querySelector(`[data-key-code="${keyCode}"]`)
      if (keyElement) {
        keyElement.classList.remove('pressed', 'selected')
      }
    })
    this.highlightedKeys.clear()
  }

  /**
   * Enable confirm button
   */
  enableConfirmButton() {
    const btn = this.document.getElementById('confirm-key-selection')
    if (btn) {
      btn.disabled = false
    }
  }

  /**
   * Disable confirm button
   */
  disableConfirmButton() {
    const btn = this.document.getElementById('confirm-key-selection')
    if (btn) {
      btn.disabled = true
    }
  }

  /**
   * Update current chord with location-specific modifiers
   */
  updateChordWithLocationSpecific(useLocationSpecific) {
    if (!this.selectedKey) return
    
    let updatedChord = this.selectedKey
    
    if (useLocationSpecific) {
      // Convert generic modifiers to location-specific
      updatedChord = updatedChord
        .replace(/\bCtrl\b/g, this.lastModifierSide.ctrl === 'R' ? 'RCTRL' : 'LCTRL')
        .replace(/\bAlt\b/g, this.lastModifierSide.alt === 'R' ? 'RALT' : 'LALT')
        .replace(/\bShift\b/g, this.lastModifierSide.shift === 'R' ? 'RSHIFT' : 'LSHIFT')
    } else {
      // Convert location-specific modifiers to generic
      updatedChord = updatedChord
        .replace(/\bLCTRL\b/g, 'Ctrl')
        .replace(/\bRCTRL\b/g, 'Ctrl')
        .replace(/\bLALT\b/g, 'Alt')
        .replace(/\bRALT\b/g, 'Alt')
        .replace(/\bLSHIFT\b/g, 'Shift')
        .replace(/\bRSHIFT\b/g, 'Shift')
    }
    
    // Update the selection if it changed
    if (updatedChord !== this.selectedKey) {
      this.selectKey(updatedChord)
    }
  }

  /**
   * Update cached modifier side information from a chord string.
   */
  updateLastModifierSideFromChord(chord) {
    if (!chord) return
    const parts = chord.split('+')
    parts.forEach(p => {
      if (p === 'LCTRL') this.lastModifierSide.ctrl = 'L'
      else if (p === 'RCTRL') this.lastModifierSide.ctrl = 'R'
      else if (p === 'LALT') this.lastModifierSide.alt = 'L'
      else if (p === 'RALT') this.lastModifierSide.alt = 'R'
      else if (p === 'LSHIFT') this.lastModifierSide.shift = 'L'
      else if (p === 'RSHIFT') this.lastModifierSide.shift = 'R'
    })
  }

  /* -------------------------------------------------------- legacy compatibility */

  // Keep these methods for backward compatibility
  startCapture(context = 'keySelectionModal') {
    this.startCaptureMode()
  }

  stopCapture() {
    this.stopCaptureMode()
  }

  addSelectedKey() {
    this.confirmSelection()
  }

  populateKeySelectionModal() {
    // Legacy method - now handled by initializeModal
    this.initializeModal()
  }
} 