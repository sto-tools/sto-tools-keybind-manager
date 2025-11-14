import UIComponentBase from '../UIComponentBase.js'
import {
  getKeyboardLayout,
  getLayoutName,
  KEY_POSITIONS,
  MOUSE_GESTURES
} from '../../lib/keyboardLayouts.js'
import { UNSAFE_KEYBINDS } from '../../core/constants.js'

/**
 * KeyCaptureUI – a UI component for capturing key combinations.
 * Features:
 * - Visual keyboard with international layout support
 * - Real-time sync between physical keys and visual highlighting
 * - Enhanced mouse gesture support (lpress, rpress, ldrag, rdrag)
 * - Smart key suggestions
 * - Capture-first workflow with manual fallback
 */
export default class KeyCaptureUI extends UIComponentBase {

  constructor ({ eventBus, modalManager = null, app = null, document = (typeof window !== 'undefined' ? window.document : undefined), ui = null, i18n } = {}) {
    super(eventBus)
    this.componentName = 'KeyCaptureUI'

    this.modalManager = modalManager
    this.app          = app || (typeof window !== 'undefined' ? window.app : null)
    this.document     = document
    this.ui           = ui || (typeof window !== 'undefined' ? window.stoUI : null)
    this.i18n         = i18n

    this.currentKeyboard = null
    this.highlightedKeys = new Set()
    this.isDuplicationMode = false
    this.sourceKeyForDuplication = null
    this.isCapturing = false

    // When switching modes, we may get an immediate residual chord (e.g. "lclick") – ignore it once.
    this.ignoreNextChord = false

    // Remember the last side (L/R) used for each modifier to restore when toggling distinguish option
    this.lastModifierSide = { ctrl: 'L', alt: 'L', shift: 'L' }

    this.selectedLayout = 'en'
    
    // Pre-compute unsafe keybind set for quick lookup
    this._unsafeSet = new Set(UNSAFE_KEYBINDS.map(k => k.toUpperCase()))
  }

  // Lifecycle
  onInit () {
    // Listen for capture lifecycle events  
    this.addEventListener('capture-start', (d) => this.handleCaptureStart(d))
    this.addEventListener('update', (d) => this.updateCapturedKeysDisplay(d))
    this.addEventListener('chord-captured', (d) => this.handleChordCaptured(d))
    this.addEventListener('capture-stop', (d) => this.handleCaptureStop(d))

    // Listen for key duplication requests
    this.addEventListener('key:duplicate', ({ key } = {}) => {
      this.handleKeyDuplication(key)
    })

    // Setup modal shown event
    if (this.eventBus) {
      this.eventBus.on('modal:shown', ({ modalId }) => {
        if (modalId === 'keySelectionModal') {
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
    this.onDom('toggleCaptureMode', 'click', 'toggle-capture-mode', () => {
      this.toggleCaptureMode()
    })

    // Main action buttons
    this.onDom('confirm-key-selection', 'click', 'confirm-key-selection', () => {
      this.confirmSelection()
    })

    this.onDom('cancel-key-selection', 'click', 'cancel-key-selection', () => {
      this.cancelSelection()
    })

    // Virtual keyboard key clicks (manual mode only)
    this.onDom('.vkey', 'click', 'virtual-key-click', (e) => {
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
    this.onDom('keyboardLayoutSelector', 'change', 'layout-change', (e) => {
      this.changeKeyboardLayout(e.target.value)
    })

    // Location-specific modifier toggle
    this.onDom('distinguishModifierSide', 'change', 'location-specific-toggle', (e) => {
      this.emit('keycapture:set-location-specific', { value: e.target.checked })
      // Update current selection if there is one
      if (this.cache.selectedKey) {
        this.updateChordWithLocationSpecific(e.target.checked)
      }
      // Update modifier highlighting when the setting changes
      this.updateModifierHighlighting()
    })
  }

  // Initialize the modal when shown
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

  // Handle key duplication request
  handleKeyDuplication(sourceKey) {
    this.isDuplicationMode = true
    this.sourceKeyForDuplication = sourceKey
    this.showKeySelectionModal()
  }

  // Show the key selection modal
  showKeySelectionModal() {
    if (this.modalManager) {
      this.modalManager.show('keySelectionModal')
    }
  }

  // Start capture mode
  startCaptureMode() {
    this.updateCaptureState(true)
    this.emit('keycapture:start', { context: 'keySelectionModal' })
  }

  // Stop capture mode
  stopCaptureMode() {
    this.updateCaptureState(false)
    this.emit('keycapture:stop')
  }

  // Toggle between capture and manual mode
  toggleCaptureMode() {
    const captureIndicator = this.document.getElementById('captureIndicator')
    const isCapturing = captureIndicator?.classList.contains('active')
    
    if (isCapturing) {
      // We are about to leave capture mode → ignore the click that triggered it
      this.ignoreNextChord = true
      this.stopCaptureMode()

      // Clear any accidental selection made by the toggle click
      this.cache.selectedKey = null
      this.clearVirtualModifiers()
      this.updatePreviewDisplay('')
      this.disableConfirmButton()
    } else {
      this.startCaptureMode()
    }
  }

  // Update UI to reflect capture state
  updateCaptureState(isCapturing) {
    const captureIndicator = this.document.getElementById('captureIndicator')
    const captureToggle = this.document.getElementById('toggleCaptureMode')
    
    // Persist capture state
    this.isCapturing = isCapturing

    if (captureIndicator) {
      captureIndicator.classList.toggle('active', isCapturing)
    }
    
    if (captureToggle) {
      captureToggle.textContent = isCapturing
        ? this.i18n.t('switch_to_manual')
        : this.i18n.t('start_capture')
    }

  // Disable/enable interactions with the virtual keyboard UI while capturing
    const vkb = this.document.getElementById('virtualKeyboard')
    if (vkb) {
      vkb.classList.toggle('disabled', isCapturing)
    }
  }

  // Event handlers
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

  // Key selection
  selectKey(keyChord) {
    // Reject unsafe key combinations chosen via virtual keyboard or suggestions
    if (this.isUnsafeChord(keyChord)) {
      this.handleUnsafeChord(keyChord)
      return
    }

    this.cache.selectedKey = keyChord
    this.updateLastModifierSideFromChord(keyChord)
    this.updatePreviewDisplay(keyChord)
    this.enableConfirmButton()
    
    // Highlight the key on virtual keyboard if it's a simple key
    this.highlightSelectedKeyOnKeyboard(keyChord)
  }

  // Select key from virtual keyboard click
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

  // Toggle virtual modifier state (using virtual keyboard keys)
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
    const hasNonModifierKey = this.cache.selectedKey && this.cache.selectedKey.split('+').some(p => p && !modNames.includes(p))
    if (!hasNonModifierKey) {
      this.updatePreviewWithCurrentModifiers()
    }

    // Record side selection
    if (modifierType) {
      this.lastModifierSide[modifierType] = keyCode.endsWith('Right') ? 'R' : 'L'
    }
  }

  // Get modifier type from key code
  getModifierType(keyCode) {
    if (keyCode.includes('Control')) return 'ctrl'
    if (keyCode.includes('Alt')) return 'alt'
    if (keyCode.includes('Shift')) return 'shift'
    return null
  }

  // Get currently active virtual modifiers of a specific type
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

  // Get currently active virtual modifiers
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
          if (type === 'ctrl') modifiers.push(this.i18n.t('ctrl'))
          else if (type === 'alt') modifiers.push(this.i18n.t('alt'))
          else if (type === 'shift') modifiers.push(this.i18n.t('shift'))
        }
      }
    })
    
    return modifiers
  }

  // Clear all virtual modifiers
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

  // Update preview with current modifiers (for partial chord display)
  updatePreviewWithCurrentModifiers() {
    const activeModifiers = this.getActiveVirtualModifiers()
    if (activeModifiers.length > 0) {
      // If a non-modifier key was already selected, include it in the preview so users
      // get immediate feedback such as "Ctrl+G". Otherwise show the partial chord
      // (e.g. "Ctrl+") so they know a main key is still required.
      let chordPreview = activeModifiers.join('+')
      if (this.cache.selectedKey) {
        // Avoid duplicating modifiers if selectedKey already contains them.
        // Only append when selectedKey represents a non-modifier portion.
        const modPattern = /^(Ctrl|Alt|Shift|LCTRL|RCTRL|LALT|RALT|LSHIFT|RSHIFT)(\+|$)/i
        const isOnlyModifiers = this.cache.selectedKey.split('+').every(p => modPattern.test(p))
        if (!isOnlyModifiers) {
          chordPreview += '+' + this.cache.selectedKey
        }
      } else {
        chordPreview += '+'
      }
      this.updatePreviewDisplay(chordPreview)
    } else {
      // No active modifiers – keep any already selected key visible instead of
      // reverting to "No key selected" which caused an inconsistent UI state
      if (this.cache.selectedKey) {
        this.updatePreviewDisplay(this.cache.selectedKey)
      } else {
        this.updatePreviewDisplay('')
      }
    }
  }

  
  // Confirm the current selection
  async confirmSelection() {
    if (!this.cache.selectedKey) return

    try {
      let result
      if (this.isDuplicationMode) {
        // Handle key duplication with new name
        const sourceKey = this.sourceKeyForDuplication
        const targetKey = this.cache.selectedKey
        result = await this.request('key:duplicate-with-name', {
          sourceKey,
          newKey: targetKey
        })
        if (result?.success) {
          const from = result.sourceKey || result?.data?.from || sourceKey
          const to = result.newKey || result?.data?.to || targetKey
          const successMessage = this.i18n.t('key_duplicated', { from, to })
          this.showToast(successMessage, 'success')
          this.isDuplicationMode = false
          this.sourceKeyForDuplication = null
        } else {
          const errorMessage = this.i18n.t(result?.error, result?.params)
          this.showToast(errorMessage, 'error')
          return
        }
      } else {
        // Handle regular key addition - service will do validation internally
        result = await this.request('key:add', { key: this.cache.selectedKey })
        if (result?.success) {
          const message = this.i18n.t('key_added', { keyName: this.cache.selectedKey })
          this.showToast(message, 'success')
        } else {
          const message = this.i18n.t(result?.error, result?.params)
          this.showToast(message, 'error')
          return
        }
      }

      this.modalManager?.hide('keySelectionModal')
      this.resetState()
    } catch (err) {
      console.error('Failed to confirm key selection:', err)
      const message = this.i18n.t('key_selection_failed')
      this.showToast(message, 'error')
    }
  }

  // Cancel the selection
  cancelSelection() {
    this.modalManager?.hide('keySelectionModal')
    this.resetState()
  }

  // Reset internal state
  resetState() {
    this.cache.selectedKey = null
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

  // UI rendering
  buildModalContent() {
    const modal = this.document.getElementById('keySelectionModal')
    if (!modal) return

    const modalBody = modal.querySelector('.modal-body')
    if (!modalBody) return

    modalBody.innerHTML = this.generateModalHTML()
  }

  // Generate the complete modal HTML
  generateModalHTML() {
    const currentLang = this.i18n.language || 'en'
    const layoutName = getLayoutName(currentLang)

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
              <h3 data-i18n="press_any_key_combination">${this.i18n.t('press_any_key_combination')}</h3>
              <p data-i18n="capture_instructions">${this.i18n.t('capture_instructions')}</p>
            </div>
          </div>
          <button class="btn btn-secondary toggle-mode" id="toggleCaptureMode" data-i18n="switch_to_manual">
            ${this.i18n.t('switch_to_manual')}
          </button>
        </div>

        <!-- Preview Section -->
        <div class="selection-preview">
          <div class="preview-display">
            <label data-i18n="selected_key">${this.i18n.t('selected_key')}:</label>
            <div class="key-preview-display" id="keyPreviewDisplay">
              <span class="no-selection" data-i18n="no_key_selected">${this.i18n.t('no_key_selected')}</span>
            </div>
          </div>
          <div class="preview-controls">
            <label class="location-specific-toggle">
              <input type="checkbox" id="distinguishModifierSide" />
              <span data-i18n="distinguish_left_right_modifiers">${this.i18n.t('distinguish_left_right_modifiers')}</span>
            </label>
          </div>
        </div>

        <!-- Main Content -->
        <div class="capture-content">
          <!-- Virtual Keyboard Section -->
          <div class="virtual-keyboard-section">
            <div class="section-header">
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
              ${this.i18n.t('confirm_selection')}
            </button>
            <button class="btn btn-secondary" id="cancel-key-selection" data-i18n="cancel">
              ${this.i18n.t('cancel')}
            </button>
          </div>
        </div>
      </div>
    `
  }

  // Update keyboard layout based on language
  updateKeyboardLayout() {
    // Use the user-selected layout rather than UI language
    this.currentKeyboard = JSON.parse(JSON.stringify(getKeyboardLayout(this.selectedLayout)))
    this.renderVirtualKeyboard()
  }

  // Change keyboard layout
  changeKeyboardLayout(language) {
    this.selectedLayout = language || 'en'
    this.currentKeyboard = JSON.parse(JSON.stringify(getKeyboardLayout(this.selectedLayout)))
    this.renderVirtualKeyboard()
  }

  // Render the visual keyboard
  renderVirtualKeyboard() {
    const container = this.document.getElementById('virtualKeyboard')
    if (!container || !this.currentKeyboard) return

    const mainRows = {}
    const navRows  = {}
    const numRows  = {}
    const mouseRows= {}

    const pushRow = (dict, row, keyData) => {
      if (!dict[row]) dict[row] = []
      dict[row].push(keyData)
    }

    // Distribute keys into row dictionaries
    Object.entries(KEY_POSITIONS).forEach(([keyCode, pos]) => {
      const target = pos.col >= 22 ? mouseRows : (pos.col >= 17 ? numRows : (pos.col >= 14 ? navRows : mainRows))
      pushRow(target, pos.row, { keyCode, ...pos })
    })

    const renderKey = (key) => {
      // Determine primary label based on keyboard layout or mouse gestures
      let keyInfo = this.currentKeyboard.keys[key.keyCode]
      if (!keyInfo && MOUSE_GESTURES[key.keyCode]) {
        keyInfo = { primary: MOUSE_GESTURES[key.keyCode].name, secondary: '' }
      }
      if (!keyInfo) keyInfo = { primary: key.keyCode, secondary: '' }
      return `
        <button class="vkey" data-key-code="${key.keyCode}" data-row="${key.row}" data-col="${key.col}">
          <span class="key-primary">${keyInfo.primary}</span>
          ${keyInfo.secondary ? `<span class="key-secondary">${keyInfo.secondary}</span>` : ''}
        </button>
      `
    }

    const maxRow = Math.max(...Object.values(KEY_POSITIONS).map(p => p.row))

    const renderColumn = (rowsDict, type = 'main') => {
      const expectedNumCols = [17, 18, 19, 20]
      const expectedMouseCols = [22, 23, 24]
      const keyUnit = 2.5 // rem, base key width
      let html = ''
      for (let rowIdx = 0; rowIdx <= maxRow; rowIdx++) {
        const keys = (rowsDict[rowIdx] || []).sort((a, b) => a.col - b.col)
        let rowHtml = ''

        if (type === 'numpad') {
          // Handle numpad with variable width keys and special alignment
          if (rowIdx === 1) {
            // Special handling for row 0: add gap before divide to align it over 8 key
            rowHtml += '<div class="vkey placeholder" style="flex:0 0 2.5rem; height:2.5rem;"></div>'
            // Then render the actual keys in order
            keys.forEach(k => {
              rowHtml += renderKey(k)
            })
          } else {
            // Normal handling for other rows
            const minCol = 17
            const maxCol = 20
            
            for (let currentCol = minCol; currentCol <= maxCol; currentCol++) {
              const k = keys.find(k => k.col === currentCol)
              if (k) {
                rowHtml += renderKey(k)
                // Skip ahead if this is a wide key
                if (k.width && k.width > 1) {
                  currentCol += (k.width - 1)
                }
              } else {
                // Add placeholder for missing key positions
                rowHtml += '<div class="vkey placeholder"></div>'
              }
            }
          }
        } else if (type === 'mouse') {
          rowHtml = expectedMouseCols.map(col => {
            const k = keys.find(k => k.col === col)
            return k ? renderKey(k) : '<div class="vkey placeholder"></div>'
          }).join('')
        } else if (type === 'nav') {
          if (rowIdx === 4) {
            rowHtml += '<div class="vkey placeholder" style="flex:0 0 2.5rem; height:2.5rem;"></div>'
          }
          keys.forEach(k => {
            rowHtml += renderKey(k)
          })
        }
        else {
          if (keys.length) {
            // Special handling for specific alignment cases
            let startCol = keys[0].col
            
            // Navigation section: ArrowUp should align with ArrowDown (both at col 15)
            if (type === 'nav' && rowIdx === 4 && keys.some(k => k.col === 15)) {
              rowHtml += '<div class="vkey placeholder" style="flex:0 0 2.5rem; height:2.5rem;"></div>'

              startCol = 14.5 // Start from Insert column to create gap before ArrowUp
            }
            
            let current = startCol
            keys.forEach(k => {
              if (k.col > current) {
                const gap = k.col - current
                const gapWidthRem = gap * keyUnit
                rowHtml += `<div class="vkey placeholder" style="flex:0 0 ${gapWidthRem}rem; height:2.5rem;"></div>`
              }
              rowHtml += renderKey(k)
              current = k.col + (k.width || 1)
            })
          }
        }

        html += `<div class="keyboard-row">${rowHtml}</div>`
      }
      return html
    }

    const mainColHtml  = renderColumn(mainRows)
    const navColHtml   = renderColumn(navRows, 'nav')
    const numColHtml   = renderColumn(numRows, 'numpad')
    const mouseColHtml = renderColumn(mouseRows, 'mouse')

    const html = `
      <div class="keyboard-columns">
        <div class="keyboard-column main">${mainColHtml}</div>
        <div class="keyboard-column nav">${navColHtml}</div>
        <div class="keyboard-column numpad">${numColHtml}</div>
        <div class="keyboard-column mouse">${mouseColHtml}</div>
      </div>`

    container.innerHTML = html
  }

  // UI helpers
  updatePreviewDisplay(chord) {
    const preview = this.document.getElementById('keyPreviewDisplay')
    if (!preview) return

    if (chord) {
      const formatted = this.formatKeyForDisplay(chord)
      preview.innerHTML = `<span class="key-combination">${formatted}</span>`
    } else {
      preview.innerHTML = `<span class="no-selection" data-i18n="no_key_selected">${this.i18n.t('no_key_selected')}</span>`
    }
  }

  // Format key chord for display
  formatKeyForDisplay(chord) {
    if (!chord) return ''
    
    // Split on + and format each part
    return chord.split('+')
                .filter(part => part.length > 0)
                .map(part => `<kbd>${part}</kbd>`)
                .join('<span class="plus">+</span>')
  }

  // Convert key code to display name
  keyCodeToDisplayName(keyCode) {
    // Treat numeric keypad specially so we can distinguish them from top-row digits
    if (keyCode.startsWith('Numpad')) {
      // Handle digits
      const digitMatch = keyCode.match(/^Numpad(\d)$/)
      if (digitMatch) {
        return `numpad${digitMatch[1]}`
      }
      // Handle operation / misc keys
      const npMap = {
        'Add'     : 'Add',
        'Subtract': 'Subtract',
        'Multiply': 'Multiply',
        'Divide'  : 'Divide',
        'Decimal' : 'Decimal',
        'Enter'   : 'numpadenter'
      }
      const suffix = keyCode.replace('Numpad', '')
      return npMap[suffix] || keyCode
    }

    const keyInfo = this.currentKeyboard?.keys[keyCode]
    if (keyInfo) {
      return keyInfo.primary
    }

    // Fallback to simplified name
    return keyCode.replace(/^Key|^Digit/, '')
  }

  // Highlight keys on virtual keyboard
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

  // Update modifier highlighting when the distinguish setting changes
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
    const hasNonModifierKey = this.cache.selectedKey && this.cache.selectedKey.split('+').some(p => p && !modNames.includes(p))
    if (!hasNonModifierKey) {
      this.updatePreviewWithCurrentModifiers()
    }
  }

  // Highlight selected key on keyboard
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
        const commonMappings = {
          '1': 'Digit1', '2': 'Digit2', '3': 'Digit3', '4': 'Digit4', '5': 'Digit5',
          '6': 'Digit6', '7': 'Digit7', '8': 'Digit8', '9': 'Digit9', '0': 'Digit0',
          // Numpad digits / operations
          'numpad0': 'Numpad0', 'numpad1': 'Numpad1', 'numpad2': 'Numpad2', 'numpad3': 'Numpad3', 'numpad4': 'Numpad4',
          'numpad5': 'Numpad5', 'numpad6': 'Numpad6', 'numpad7': 'Numpad7', 'numpad8': 'Numpad8', 'numpad9': 'Numpad9',
          'Add': 'NumpadAdd', 'Subtract': 'NumpadSubtract', 'Multiply': 'NumpadMultiply', 'Divide': 'NumpadDivide',
          'Decimal': 'NumpadDecimal', 'numpadenter': 'NumpadEnter',
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
        for (const [code, keyInfo] of Object.entries(this.currentKeyboard.keys)) {
          if (keyInfo.primary === key || keyInfo.secondary === key) {
            targetCode = code
            break
          }
        }
        
        // If not found in keyboard layout, try common mappings
        if (!targetCode) {
          targetCode = commonMappings[key]
        }
      }
      
      // Highlight the key if found
      if (targetCode) {
        this.highlightKey(targetCode)
      }
    })
  }

  // Helper method to highlight a single key
  highlightKey(keyCode) {
    const keyElement = this.document.querySelector(`[data-key-code="${keyCode}"]`)
    if (keyElement) {
      keyElement.classList.add('selected')
      this.highlightedKeys.add(keyCode)
    }
  }

  // Clear keyboard highlights
  clearKeyboardHighlights() {
    this.highlightedKeys.forEach(keyCode => {
      const keyElement = this.document.querySelector(`[data-key-code="${keyCode}"]`)
      if (keyElement) {
        keyElement.classList.remove('pressed', 'selected')
      }
    })
    this.highlightedKeys.clear()
  }

  // Enable confirm button
  enableConfirmButton() {
    const btn = this.document.getElementById('confirm-key-selection')
    if (btn) {
      btn.disabled = false
    }
  }

  // Disable confirm button
  disableConfirmButton() {
    const btn = this.document.getElementById('confirm-key-selection')
    if (btn) {
      btn.disabled = true
    }
  }

  // Update current chord with location-specific modifiers
  updateChordWithLocationSpecific(useLocationSpecific) {
    if (!this.cache.selectedKey) return
    
    let updatedChord = this.cache.selectedKey
    
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
    if (updatedChord !== this.cache.selectedKey) {
      this.selectKey(updatedChord)
    }
  }

  // Update cached modifier side information from a chord string.
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

  
  // Determine if chord is in UNSAFE list (case-insensitive)
  isUnsafeChord (chord) {
    if (!chord) return false
    return this._unsafeSet.has(chord.toUpperCase())
  }

  // Show toast error and reset preview/selection when unsafe chord selected
  async handleUnsafeChord (chord) {
    // Build message via i18n
    const message = this.i18n.t('unsafe_keybind', { key: chord })

    this.emit('toast:show', { message, type: 'error' })

    // Clear any preview and disable confirm
    this.cache.selectedKey = null
    this.updatePreviewDisplay('')
    this.disableConfirmButton()
  }
} 
