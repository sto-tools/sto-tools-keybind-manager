import UIComponentBase from '../UIComponentBase.js'
import {
  getKeyboardLayout,
  getLayoutName,
  getLayoutByName,
  isControllerLayout,
  getLayoutOptions,
  KEY_POSITIONS,
  MOUSE_GESTURES
} from '../../lib/keyboardLayouts.js'
import {
  CONTROLLER_POSITIONS,
  getControllerPosition,
  getControllerLayout,
  getAllControllerPositions
} from '../../lib/controllerLayouts.js'
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

    // Capture destination bindset (when bindsets are enabled)
    this.captureTargetBindset = 'Primary Bindset'

    // Remember the last side (L/R) used for each modifier to restore when toggling distinguish option
    this.lastModifierSide = { ctrl: 'L', alt: 'L', shift: 'L' }

    this.selectedLayout = 'QWERTY'

    // Pre-compute unsafe keybind set for quick lookup
    this._unsafeSet = new Set(UNSAFE_KEYBINDS.map(k => k.toUpperCase()))

    // Virtual controller interaction tracking
    this.activeAnalogControl = null
    this.activeStickInteraction = null

    // Bind event handler methods for proper cleanup
    this.boundEndAnalogInteraction = this.endAnalogInteraction.bind(this)
    this.boundUpdateAnalogInteraction = this.updateAnalogInteraction.bind(this)
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

    // Listen for real-time gamepad input events
    this.addEventListener('gamepad:button-pressed', (d) => this.handleGamepadButtonPressed(d))
    this.addEventListener('gamepad:button-released', (d) => this.handleGamepadButtonReleased(d))
    this.addEventListener('gamepad:axis-moved', (d) => this.handleGamepadAxisMoved(d))
    this.addEventListener('gamepad:axis-centered', (d) => this.handleGamepadAxisCentered(d))
    this.addEventListener('gamepad:state-update', (d) => this.handleGamepadStateUpdate(d))

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

  // Cleanup method for proper resource management
  onDestroy() {
    // End any active analog interactions
    this.endAnalogInteraction()

    // Remove global event listeners for controller interactions
    if (this.document) {
      this.document.removeEventListener('mouseup', this.boundEndAnalogInteraction)
      this.document.removeEventListener('touchend', this.boundEndAnalogInteraction)
      this.document.removeEventListener('mousemove', this.boundUpdateAnalogInteraction)
      this.document.removeEventListener('touchmove', this.boundUpdateAnalogInteraction)
    }

    // Remove DOM elements created for interaction feedback
    const directionIndicator = this.document.querySelector('.stick-direction-indicator')
    if (directionIndicator) {
      directionIndicator.remove()
    }

    // Clear interaction tracking
    this.activeAnalogControl = null
    this.activeStickInteraction = null
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

    // Bindset target selector (only rendered when bindsets are enabled)
    this.onDom('bindsetTargetSelector', 'change', 'bindset-target-change', (e) => {
      this.captureTargetBindset = e.target.value || 'Primary Bindset'
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
    // Resolve bindset target before rendering so the selector reflects it
    this.captureTargetBindset = this.resolveDefaultBindset()
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

    // Sync bindset selector (when rendered) with resolved default
    this.syncBindsetSelector()
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

  // Real-time gamepad input event handlers
  handleGamepadButtonPressed({ gamepadIndex, input, timestamp }) {
    if (!this.currentKeyboard?.isController) return

    // Only highlight if we're on a controller layout
    const controlId = input.chordName || input.name
    if (controlId) {
      this.highlightControllerButtonRealtime(controlId, true)
      this.showRealtimeFeedback(controlId, 'pressed')
    }
  }

  handleGamepadButtonReleased({ gamepadIndex, input, timestamp }) {
    if (!this.currentKeyboard?.isController) return

    const controlId = input.chordName || input.name
    if (controlId) {
      this.highlightControllerButtonRealtime(controlId, false)
      this.hideRealtimeFeedback(controlId)
    }
  }

  handleGamepadAxisMoved({ gamepadIndex, input, timestamp }) {
    if (!this.currentKeyboard?.isController) return

    const controlId = input.chordName || input.name
    const magnitude = Math.abs(input.value)

    if (controlId && magnitude > 0.1) { // Above threshold
      this.highlightControllerButtonRealtime(controlId, true)
      this.showAnalogMagnitude(controlId, input.value, magnitude)
    }
  }

  handleGamepadAxisCentered({ gamepadIndex, input, timestamp }) {
    if (!this.currentKeyboard?.isController) return

    const controlId = input.chordName || input.name
    if (controlId) {
      this.highlightControllerButtonRealtime(controlId, false)
      this.hideAnalogMagnitude(controlId)
    }
  }

  handleGamepadStateUpdate({ gamepadIndex, activeInputs, timestamp }) {
    if (!this.currentKeyboard?.isController) return

    // Clear all real-time highlights first
    this.clearRealtimeHighlights()

    // Apply highlights for currently active inputs
    activeInputs.forEach(input => {
      const controlId = input.chordName || input.name
      if (controlId) {
        this.highlightControllerButtonRealtime(controlId, true)

        if (input.type === 'axis') {
          const magnitude = Math.abs(input.value)
          if (magnitude > 0.1) {
            this.showAnalogMagnitude(controlId, input.value, magnitude)
          }
        } else {
          this.showRealtimeFeedback(controlId, 'pressed')
        }
      }
    })
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
        result = await this.request('key:add', { 
          key: this.cache.selectedKey,
          bindset: this.captureTargetBindset
        })
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
    this.captureTargetBindset = 'Primary Bindset'
    this.clearKeyboardHighlights()
    this.clearVirtualModifiers()
    this.clearRealtimeHighlights() // Clear real-time highlights on reset
    this.updatePreviewDisplay('')
    this.disableConfirmButton()

    // Reset virtual controller interaction state
    this.endAnalogInteraction()

    // Reset service location-specific flag to false so next modal starts clean
    this.emit('keycapture:set-location-specific', { value: false })
  }

  // Bindset targeting helpers
  shouldShowBindsetPicker() {
    const prefs = this.cache?.preferences || {}
    return prefs.bindsetsEnabled && prefs.bindToAliasMode && this.cache.currentEnvironment !== 'alias'
  }

  resolveDefaultBindset() {
    if (!this.shouldShowBindsetPicker()) return 'Primary Bindset'
    const active = this.cache?.activeBindset || 'Primary Bindset'
    return active || 'Primary Bindset'
  }

  syncBindsetSelector() {
    const selector = this.document.getElementById('bindsetTargetSelector')
    if (selector) {
      selector.value = this.captureTargetBindset
    }
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
    const layoutOptions = getLayoutOptions()

    const bindsetPicker = this.generateBindsetPickerHTML()

    // Generate layout selector options
    const layoutSelectorOptions = layoutOptions.map(option => {
      const selected = option.value === this.selectedLayout ? 'selected' : ''
      return `<option value="${option.value}" ${selected}>${option.label}</option>`
    }).join('')

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
            ${bindsetPicker}
          </div>
        </div>

        <!-- Main Content -->
        <div class="capture-content">
          <!-- Virtual Keyboard Section -->
          <div class="virtual-keyboard-section">
            <div class="section-header">
              <select id="keyboardLayoutSelector" class="form-select">
                ${layoutSelectorOptions}
              </select>
            </div>
            <div class="virtual-keyboard" id="virtualKeyboard">
              <!-- Virtual keyboard or controller will be rendered here -->
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

  generateBindsetPickerHTML() {
    if (!this.shouldShowBindsetPicker()) return ''

    const bindsets = (this.cache?.bindsetNames && this.cache.bindsetNames.length)
      ? this.cache.bindsetNames
      : ['Primary Bindset']

    const options = bindsets.map((name) => {
      const selected = name === this.captureTargetBindset ? 'selected' : ''
      return `<option value="${this.escapeHtml(name)}" ${selected}>${this.escapeHtml(name)}</option>`
    }).join('')

    return `
      <div class="bindset-target">
        <label for="bindsetTargetSelector">${this.i18n.t('select_bindset')}</label>
        <select id="bindsetTargetSelector" class="form-select">
          ${options}
        </select>
      </div>
    `
  }

  // Update keyboard layout based on language or layout name
  updateKeyboardLayout() {
    // Clear real-time highlights when switching layouts
    this.clearRealtimeHighlights()

    // Use the user-selected layout rather than UI language
    if (isControllerLayout(this.selectedLayout)) {
      // Handle controller layouts
      this.currentKeyboard = JSON.parse(JSON.stringify(getLayoutByName(this.selectedLayout)))
    } else {
      // Handle keyboard layouts
      this.currentKeyboard = JSON.parse(JSON.stringify(getKeyboardLayout(this.selectedLayout)))
    }
    this.renderVirtualKeyboard()
  }

  // Change keyboard layout
  changeKeyboardLayout(layoutName) {
    this.selectedLayout = layoutName || 'en'

    // Clear real-time highlights when switching layouts
    this.clearRealtimeHighlights()

    if (isControllerLayout(this.selectedLayout)) {
      // Handle controller layouts
      this.currentKeyboard = JSON.parse(JSON.stringify(getLayoutByName(this.selectedLayout)))
    } else {
      // Handle keyboard layouts
      this.currentKeyboard = JSON.parse(JSON.stringify(getKeyboardLayout(this.selectedLayout)))
    }
    this.renderVirtualKeyboard()
  }

  // Render the visual keyboard
  renderVirtualKeyboard() {
    const container = this.document.getElementById('virtualKeyboard')
    if (!container || !this.currentKeyboard) return

    // Check if current layout is a controller layout
    if (this.currentKeyboard.isController) {
      this.renderVirtualController()
      return
    }

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
      const expectedMouseCols = [22, 23, 24, 25, 26, 27]
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

  // Render virtual controller layout
  renderVirtualController() {
    const container = this.document.getElementById('virtualKeyboard')
    if (!container || !this.currentKeyboard) return

    const layout = this.currentKeyboard
    const positions = CONTROLLER_POSITIONS
    const controls = layout.controls || {}

    // Group controls by type for organized rendering
    const faceButtons = []
    const bumpersTriggers = []
    const dpad = []
    const centerButtons = []
    const analogSticks = []
    const additionalButtons = []

    Object.entries(controls).forEach(([controlId, controlInfo]) => {
      const position = getControllerPosition(controlId)
      if (!position) return

      const controlData = {
        id: controlId,
        ...controlInfo,
        ...position
      }

      // Categorize controls for organized layout
      if (controlId.startsWith('Joy') && parseInt(controlId.replace('Joy', '')) <= 4) {
        faceButtons.push(controlData)
      } else if (controlId.startsWith('Joy') && parseInt(controlId.replace('Joy', '')) <= 8) {
        bumpersTriggers.push(controlData)
      } else if (controlId.startsWith('Joypad')) {
        dpad.push(controlData)
      } else if (controlId.startsWith('Joy') && parseInt(controlId.replace('Joy', '')) <= 12) {
        centerButtons.push(controlData)
      } else if (controlId.includes('stick')) {
        analogSticks.push(controlData)
      } else {
        additionalButtons.push(controlData)
      }
    })

    const renderControllerButton = (control) => {
      const baseStyle = `
        position: absolute;
        left: ${control.col * 2.5}rem;
        top: ${control.row * 2.5}rem;
        width: ${(control.width || 1) * 2.5}rem;
        height: 2.5rem;
        background: linear-gradient(135deg, ${control.color || '#9e9e9e'}, ${this.adjustColor(control.color || '#9e9e9e', -20)});
        border: 2px solid #333;
        border-radius: ${control.type === 'trigger' ? '0.5rem' : '0.25rem'};
        color: white;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 0.8rem;
        box-shadow: 0 3px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3);
        transition: all 0.15s ease;
        z-index: 10;
      `

      return `
        <button class="vkey controller-button ${control.type || 'button'}"
                data-key-code="${control.id}"
                data-control-type="${control.type || 'button'}"
                data-stick="${control.stick || ''}"
                data-direction="${control.direction || ''}"
                style="${baseStyle}"
                title="${control.description || control.primary}">
          <div class="button-content">
            <span class="key-primary">${control.primary}</span>
            ${control.secondary ? `<span class="key-secondary">${control.secondary}</span>` : ''}
          </div>
        </button>
      `
    }

    const renderDpadButton = (control) => {
      // Special styling for D-pad buttons to create a unified D-pad appearance
      let additionalStyle = ''

      if (control.id.includes('up')) {
        additionalStyle = `
          border-radius: 0.5rem 0.5rem 0.25rem 0.25rem;
          width: 2rem;
        `
      } else if (control.id.includes('down')) {
        additionalStyle = `
          border-radius: 0.25rem 0.25rem 0.5rem 0.5rem;
          width: 2rem;
        `
      } else if (control.id.includes('left')) {
        additionalStyle = `
          border-radius: 0.5rem 0.25rem 0.25rem 0.5rem;
          width: 2rem;
        `
      } else if (control.id.includes('right')) {
        additionalStyle = `
          border-radius: 0.25rem 0.5rem 0.5rem 0.25rem;
          width: 2rem;
        `
      }

      const baseStyle = `
        position: absolute;
        left: ${control.col * 2.5}rem;
        top: ${control.row * 2.5}rem;
        width: ${(control.width || 1) * 2.5}rem;
        height: 2.5rem;
        background: linear-gradient(135deg, ${control.color || '#607D8B'}, ${this.adjustColor(control.color || '#607D8B', -20)});
        border: 2px solid #333;
        border-radius: ${control.type === 'trigger' ? '0.5rem' : '0.25rem'};
        color: white;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 0.8rem;
        box-shadow: 0 3px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3);
        transition: all 0.15s ease;
        z-index: 10;
        ${additionalStyle}
      `

      return `
        <button class="vkey controller-button dpad-button"
                data-key-code="${control.id}"
                data-control-type="dpad"
                style="${baseStyle}"
                title="${control.description || control.primary}">
          <span class="key-primary">${control.primary}</span>
        </button>
      `
    }

    const renderAnalogStick = (control) => {
      // Group stick directions by stick
      const stickControls = analogSticks.filter(s => s.stick === control.stick)
      if (stickControls.length > 0 && stickControls[0] !== control) return '' // Only render once per stick

      const stickBase = stickControls[0]
      const style = `
        position: absolute;
        left: ${stickBase.col * 2.5}rem;
        top: ${stickBase.row * 2.5}rem;
        width: ${(stickBase.width || 2) * 2.5}rem;
        height: ${(stickBase.width || 2) * 2.5}rem;
        background: radial-gradient(circle, #f5f5f5 0%, #e0e0e0 40%, #9e9e9e 100%);
        border: 3px solid #333;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 8px rgba(0,0,0,0.4), inset 0 2px 4px rgba(0,0,0,0.2);
        z-index: 5;
      `

      const stickLabel = stickBase.stick === 'left' ? 'L' : 'R'

      return `
        <div class="analog-stick"
             data-stick="${stickBase.stick}"
             style="${style}"
             title="${stickBase.description || `${stickLabel} Stick`}">
          <div class="stick-base" style="
            width: 1.2rem;
            height: 1.2rem;
            background: radial-gradient(circle, ${stickBase.color || '#333'}, ${this.adjustColor(stickBase.color || '#333', -30)});
            border-radius: 50%;
            border: 2px solid #222;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.3);
          "></div>
          <div class="stick-label" style="
            position: absolute;
            bottom: -1.5rem;
            font-size: 0.7rem;
            font-weight: bold;
            color: #666;
          ">${stickLabel}</div>
        </div>
      `
    }

    // Render controller background and sections
    let html = `
      <div class="controller-layout" style="
        position: relative;
        min-height: 28rem;
        width: 100%;
        background: linear-gradient(145deg, #f8f9fa, #e9ecef);
        border-radius: 1rem;
        border: 2px solid #dee2e6;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 1rem;
      ">
        <div class="controller-body" style="
          position: relative;
          width: 100%;
          height: 20rem;
          background: linear-gradient(135deg, #495057, #343a40);
          border-radius: 0.75rem;
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.3);
        ">
    `

    // Render D-pad (left side)
    if (dpad.length > 0) {
      dpad.forEach(control => {
        html += renderDpadButton(control)
      })
    }

    // Render analog sticks
    const renderedSticks = new Set()
    analogSticks.forEach(control => {
      if (!renderedSticks.has(control.stick)) {
        html += renderAnalogStick(control)
        renderedSticks.add(control.stick)
      }

      // Also render directional buttons for stick controls
      html += renderControllerButton({
        ...control,
        color: control.color || (control.stick === 'left' ? '#FF5722' : '#E91E63')
      })
    })

    // Face buttons (right side, diamond pattern)
    if (faceButtons.length > 0) {
      faceButtons.forEach(control => {
        html += renderControllerButton(control)
      })
    }

    // Bumpers and triggers (top)
    if (bumpersTriggers.length > 0) {
      bumpersTriggers.forEach(control => {
        const triggerStyle = control.type === 'trigger' ? `
          height: 1.8rem;
          top: ${control.row * 2.5}rem;
          background: linear-gradient(180deg, ${control.color || '#757575'}, ${this.adjustColor(control.color || '#757575', -30)});
          border-radius: 0.75rem 0.75rem 0.5rem 0.5rem;
        ` : ''

        html += renderControllerButton({
          ...control,
          style: triggerStyle
        })
      })
    }

    // Center buttons
    if (centerButtons.length > 0) {
      centerButtons.forEach(control => {
        html += renderControllerButton(control)
      })
    }

    // Additional buttons (for joystick layouts)
    if (additionalButtons.length > 0) {
      additionalButtons.forEach(control => {
        html += renderControllerButton(control)
      })
    }

    html += `
        </div>
        <div class="controller-info" style="
          margin-top: 1rem;
          text-align: center;
          color: #666;
          font-size: 0.9rem;
        ">
          ${this.i18n.t('controller_layout_instructions', {
            layout: layout.name,
            description: layout.description
          })}
        </div>
      </div>
    `

    container.innerHTML = html

    // Add controller-specific click handlers for manual selection
    this.setupControllerInteraction()

    // Add hover effects and visual feedback
    this.setupControllerVisualFeedback()
  }

  // Utility function to adjust color brightness
  adjustColor(color, amount) {
    const num = parseInt(color.replace('#', ''), 16)
    const r = Math.max(0, Math.min(255, (num >> 16) + amount))
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount))
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount))
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }

  // Setup controller interaction for manual selection
  setupControllerInteraction() {
    const controllerButtons = this.document.querySelectorAll('.controller-button')
    controllerButtons.forEach(button => {
      // Enhanced click interaction with drag support for analog controls
      button.addEventListener('mousedown', (e) => {
        if (this.isCapturing) return

        const keyCode = button.dataset.keyCode
        const controlType = button.dataset.controlType

        if (keyCode) {
          // Provide visual feedback when button is pressed
          this.showButtonFeedback(button)

          // Handle analog controls with drag interaction
          if (controlType === 'axis' || controlType === 'trigger') {
            this.startAnalogInteraction(button, e)
          } else {
            this.selectKeyFromVirtualKeyboard(keyCode)
          }
        }
      })

      // Add hover effect with magnitude preview for analog controls
      button.addEventListener('mouseenter', (e) => {
        if (this.isCapturing) return
        const controlType = button.dataset.controlType
        const direction = button.dataset.direction

        if (controlType === 'axis' && direction) {
          // Show magnitude indicator for analog axes
          this.showMagnitudePreview(button, direction, 0.5)
        } else {
          button.style.transform = 'scale(1.05)'
          button.style.boxShadow = '0 5px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)'
        }
      })

      button.addEventListener('mouseleave', (e) => {
        if (this.isCapturing) return
        this.hideMagnitudePreview(button)
        button.style.transform = 'scale(1.0)'
        button.style.boxShadow = '0 3px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)'
      })

      // Add touch support for mobile devices
      button.addEventListener('touchstart', (e) => {
        if (this.isCapturing) return
        e.preventDefault()

        const keyCode = button.dataset.keyCode
        const controlType = button.dataset.controlType

        if (keyCode) {
          this.showButtonFeedback(button)

          if (controlType === 'axis' || controlType === 'trigger') {
            this.startAnalogInteraction(button, e.touches[0])
          } else {
            this.selectKeyFromVirtualKeyboard(keyCode)
          }
        }
      })
    })

    // Setup enhanced analog stick interaction with drag support
    const analogSticks = this.document.querySelectorAll('.analog-stick')
    analogSticks.forEach(stick => {
      stick.addEventListener('mousedown', (e) => {
        if (this.isCapturing) return
        this.startStickDragInteraction(stick, e)
      })

      stick.addEventListener('touchstart', (e) => {
        if (this.isCapturing) return
        e.preventDefault()
        this.startStickDragInteraction(stick, e.touches[0])
      })
    })

    // Global mouse/touch release handlers
    this.document.addEventListener('mouseup', this.boundEndAnalogInteraction)

    this.document.addEventListener('touchend', this.boundEndAnalogInteraction)

    this.document.addEventListener('mousemove', this.boundUpdateAnalogInteraction)

    this.document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this.updateAnalogInteraction(e.touches[0])
      }
    })
  }

  // Setup visual feedback for controller interactions
  setupControllerVisualFeedback() {
    // Add CSS animation for button press feedback and enhanced interactions
    const style = this.document.createElement('style')
    style.textContent = `
      @keyframes buttonPress {
        0% { transform: scale(1.0); box-shadow: 0 3px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3); }
        50% { transform: scale(0.95); box-shadow: 0 1px 3px rgba(0,0,0,0.4), inset 0 1px 2px rgba(0,0,0,0.3); }
        100% { transform: scale(1.0); box-shadow: 0 3px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3); }
      }

      @keyframes highlightPulse {
        0% { background-color: rgba(255, 255, 255, 0.1); }
        50% { background-color: rgba(255, 255, 255, 0.3); }
        100% { background-color: rgba(255, 255, 255, 0.1); }
      }

      @keyframes magnitudeGlow {
        0% { box-shadow: 0 0 5px rgba(0, 123, 255, 0.3); }
        50% { box-shadow: 0 0 15px rgba(0, 123, 255, 0.6), 0 0 25px rgba(0, 123, 255, 0.3); }
        100% { box-shadow: 0 0 5px rgba(0, 123, 255, 0.3); }
      }

      @keyframes directionHighlight {
        0% { background: linear-gradient(135deg, var(--button-color), var(--button-color-dark)); }
        50% { background: linear-gradient(135deg, rgba(0, 123, 255, 0.8), rgba(0, 123, 255, 0.6)); }
        100% { background: linear-gradient(135deg, var(--button-color), var(--button-color-dark)); }
      }

      @keyframes realtimeButtonPress {
        0% { transform: scale(1.0); box-shadow: 0 0 15px rgba(255, 193, 7, 0.7); }
        100% { transform: scale(1.05); box-shadow: 0 0 25px rgba(255, 193, 7, 0.9), inset 0 0 10px rgba(255, 255, 255, 0.4); }
      }

      @keyframes realtimeAxisGlow {
        0% { box-shadow: 0 0 15px rgba(255, 87, 34, 0.6), inset 0 0 8px rgba(255, 87, 34, 0.3); }
        100% { box-shadow: 0 0 25px rgba(255, 87, 34, 0.8), inset 0 0 12px rgba(255, 87, 34, 0.5); }
      }

      @keyframes realtimeDpadGlow {
        0% { box-shadow: 0 0 15px rgba(76, 175, 80, 0.6), inset 0 0 8px rgba(76, 175, 80, 0.3); }
        100% { box-shadow: 0 0 25px rgba(76, 175, 80, 0.8), inset 0 0 12px rgba(76, 175, 80, 0.5); }
      }

      @keyframes realtimeHighlightPulse {
        0% { background-color: rgba(255, 193, 7, 0.1); }
        50% { background-color: rgba(255, 193, 7, 0.3); }
        100% { background-color: rgba(255, 193, 7, 0.1); }
      }

      @keyframes realtimePress {
        0% { transform: scale(1.0); filter: brightness(1.0); }
        50% { transform: scale(0.95); filter: brightness(1.3); }
        100% { transform: scale(1.0); filter: brightness(1.0); }
      }

      .controller-button {
        position: relative;
        cursor: pointer;
        user-select: none;
        transition: all 0.15s ease;
        --button-color: #9e9e9e;
        --button-color-dark: #757575;
      }

      .controller-button:hover:not(.disabled) {
        transform: scale(1.05);
        box-shadow: 0 5px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4);
      }

      .controller-button.active {
        animation: buttonPress 0.2s ease, magnitudeGlow 1s ease infinite;
        border-color: #007bff !important;
        box-shadow: 0 0 12px rgba(0, 123, 255, 0.8) !important;
      }

      .controller-button.selected {
        border-color: #28a745 !important;
        box-shadow: 0 0 8px rgba(40, 167, 69, 0.6) !important;
        background: linear-gradient(135deg, #28a745, #1e7e34) !important;
      }

      .controller-button[data-control-type="axis"].active {
        animation: directionHighlight 0.5s ease infinite alternate;
      }

      .controller-button.realtime-active {
        animation: realtimeButtonPress 0.3s ease infinite alternate;
        border-color: #ffc107 !important;
        z-index: 15;
      }

      .controller-button.realtime-button {
        background: linear-gradient(135deg, rgba(255, 193, 7, 0.8), rgba(255, 152, 0, 0.9)) !important;
        box-shadow: 0 0 15px rgba(255, 193, 7, 0.7), inset 0 2px 4px rgba(255, 255, 255, 0.4) !important;
      }

      .controller-button.realtime-axis {
        background: linear-gradient(135deg, rgba(255, 87, 34, 0.8), rgba(255, 152, 0, 0.9)) !important;
        box-shadow: 0 0 15px rgba(255, 87, 34, 0.7), inset 0 2px 4px rgba(255, 255, 255, 0.4) !important;
        animation: realtimeAxisGlow 0.4s ease infinite alternate;
      }

      .controller-button.realtime-dpad {
        background: linear-gradient(135deg, rgba(76, 175, 80, 0.8), rgba(139, 195, 74, 0.9)) !important;
        box-shadow: 0 0 15px rgba(76, 175, 80, 0.7), inset 0 2px 4px rgba(255, 255, 255, 0.4) !important;
        animation: realtimeDpadGlow 0.3s ease infinite alternate;
      }

      .controller-button.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      .analog-stick {
        position: relative;
        cursor: pointer;
        user-select: none;
        transition: all 0.2s ease;
      }

      .analog-stick:hover:not(.disabled) {
        transform: scale(1.02);
      }

      .analog-stick.active {
        animation: highlightPulse 1s ease infinite;
        box-shadow: 0 0 20px rgba(0, 123, 255, 0.4), inset 0 0 10px rgba(0, 123, 255, 0.2);
      }

      .analog-stick.realtime-active {
        animation: realtimeHighlightPulse 0.5s ease infinite alternate;
        box-shadow: 0 0 25px rgba(255, 193, 7, 0.6), inset 0 0 15px rgba(255, 193, 7, 0.3);
        border-color: #ffc107 !important;
      }

      .controller-layout {
        transition: all 0.3s ease;
        user-select: none;
      }

      .button-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.2rem;
        pointer-events: none;
        position: relative;
        z-index: 10;
      }

      .key-primary {
        font-weight: bold;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      }

      .key-secondary {
        font-size: 0.6rem;
        opacity: 0.8;
      }

      /* Magnitude indicator styles */
      .magnitude-indicator {
        border-radius: inherit;
        pointer-events: none;
      }

      .direction-preview {
        animation: fadeIn 0.2s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateX(-50%) translateY(-0.5rem); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }

      /* Stick direction indicator styles */
      .stick-direction-indicator {
        animation: fadeIn 0.2s ease, pulse 1s ease infinite;
      }

      @keyframes pulse {
        0% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.1); }
        100% { transform: translate(-50%, -50%) scale(1); }
      }

      /* Touch-friendly interaction hints */
      .controller-button:active {
        transform: scale(0.98);
      }

      .analog-stick:active {
        transform: scale(0.98);
      }

      /* Enhanced visual feedback for drag interactions */
      .drag-active {
        cursor: grabbing !important;
      }

      .controller-button.drag-active {
        z-index: 100;
      }

      .analog-stick.drag-active {
        z-index: 100;
        cursor: grabbing;
      }

      /* Accessibility improvements */
      .controller-button:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 2px;
      }

      .analog-stick:focus-visible {
        outline: 2px solid #007bff;
        outline-offset: 2px;
      }

      /* High contrast mode support */
      @media (prefers-contrast: high) {
        .controller-button {
          border-width: 3px;
        }

        .magnitude-indicator {
          background: linear-gradient(90deg, #000080, #0000ff) !important;
        }

        .stick-direction-indicator {
          background: #0000ff !important;
          border: 3px solid #fff;
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .controller-button,
        .analog-stick,
        .magnitude-indicator,
        .stick-direction-indicator,
        .direction-preview {
          animation: none;
          transition: none;
        }

        .controller-button:hover,
        .analog-stick:hover {
          transform: none;
        }
      }
    `
    this.document.head.appendChild(style)
  }

  // Show visual feedback when button is pressed
  showButtonFeedback(button) {
    button.classList.add('active')
    setTimeout(() => {
      button.classList.remove('active')
    }, 200)
  }

  // Show direction selector for analog sticks
  showStickDirectionSelector(stickElement, stickName) {
    const directions = ['up', 'down', 'left', 'right']
    const stickButtons = this.document.querySelectorAll(
      `.controller-button[data-stick="${stickName}"]`
    )

    // Highlight all stick directions temporarily
    stickButtons.forEach(button => {
      button.classList.add('active')
    })

    setTimeout(() => {
      stickButtons.forEach(button => {
        button.classList.remove('active')
      })
    }, 500)

    // Show a toast message explaining the stick interaction
    this.showToast(
      this.i18n.t('stick_direction_hint', { stick: stickName.toUpperCase() }),
      'info'
    )
  }

  // Start analog interaction for triggers and axes
  startAnalogInteraction(button, event) {
    const keyCode = button.dataset.keyCode
    const controlType = button.dataset.controlType
    const direction = button.dataset.direction

    this.activeAnalogControl = {
      button,
      keyCode,
      controlType,
      direction,
      startX: event.clientX || event.pageX,
      startY: event.clientY || event.pageY,
      initialValue: 0
    }

    button.classList.add('active')
    this.showMagnitudeIndicator(button, 0)
  }

  // Start stick drag interaction for full directional control
  startStickDragInteraction(stick, event) {
    const stickName = stick.dataset.stick
    const rect = stick.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    this.activeStickInteraction = {
      stick,
      stickName,
      centerX,
      centerY,
      maxRadius: rect.width / 3,
      currentX: 0,
      currentY: 0
    }

    stick.classList.add('active')
    this.createStickDirectionIndicator(stick, centerX, centerY)
  }

  // Update analog interaction during drag
  updateAnalogInteraction(event) {
    if (this.activeAnalogControl) {
      const { button, startX, controlType } = this.activeAnalogControl
      const currentX = event.clientX || event.pageX
      const deltaX = currentX - startX

      // Calculate magnitude based on drag distance
      let magnitude = 0
      if (controlType === 'trigger') {
        // Triggers: horizontal drag magnitude
        magnitude = Math.max(0, Math.min(1, deltaX / 100))
      } else {
        // Axes: calculate distance from start
        const distance = Math.abs(deltaX)
        magnitude = Math.max(0, Math.min(1, distance / 50))
      }

      this.showMagnitudeIndicator(button, magnitude)
      this.activeAnalogControl.currentValue = magnitude
    }

    if (this.activeStickInteraction) {
      const { centerX, centerY, maxRadius, stick, stickName } = this.activeStickInteraction
      const currentX = event.clientX || event.pageX
      const currentY = event.clientY || event.pageY

      // Calculate position relative to stick center
      const deltaX = currentX - centerX
      const deltaY = currentY - centerY
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

      // Clamp to max radius
      const clampedDistance = Math.min(distance, maxRadius)
      const normalizedDistance = clampedDistance / maxRadius

      // Calculate normalized X/Y values
      const normalizedX = distance > 0 ? (deltaX / distance) * normalizedDistance : 0
      const normalizedY = distance > 0 ? (deltaY / distance) * normalizedDistance : 0

      this.activeStickInteraction.currentX = normalizedX
      this.activeStickInteraction.currentY = normalizedY

      this.updateStickDirectionIndicator(stick, normalizedX, normalizedY)
      this.highlightDirectionButtons(stickName, normalizedX, normalizedY)
    }
  }

  // End analog interaction
  endAnalogInteraction() {
    if (this.activeAnalogControl) {
      const { button, keyCode, currentValue, threshold = 0.5 } = this.activeAnalogControl

      button.classList.remove('active')
      this.hideMagnitudeIndicator(button)

      // Select key if magnitude exceeded threshold
      if (currentValue >= threshold) {
        this.selectKeyFromVirtualKeyboard(keyCode)
        // Visual feedback for selection
        this.showButtonFeedback(button)
      }

      this.activeAnalogControl = null
    }

    if (this.activeStickInteraction) {
      const { stick, stickName, currentX, currentY } = this.activeStickInteraction

      stick.classList.remove('active')
      this.removeStickDirectionIndicator(stick)
      this.clearDirectionHighlights(stickName)

      // Determine primary direction based on stick position
      const threshold = 0.7
      let direction = null

      if (Math.abs(currentX) > Math.abs(currentY)) {
        direction = currentX > threshold ? 'right' : (currentX < -threshold ? 'left' : null)
      } else {
        direction = currentY > threshold ? 'down' : (currentY < -threshold ? 'up' : null)
      }

      if (direction) {
        const keyCode = `${stickName === 'left' ? 'L' : 'R'}stick_${direction}`
        this.selectKeyFromVirtualKeyboard(keyCode)

        // Find and highlight the selected direction button
        const directionButton = this.document.querySelector(
          `.controller-button[data-stick="${stickName}"][data-direction="${direction}"]`
        )
        if (directionButton) {
          this.showButtonFeedback(directionButton)
        }
      }

      this.activeStickInteraction = null
    }
  }

  // Show magnitude indicator for analog controls
  showMagnitudeIndicator(button, magnitude) {
    // Remove existing indicator
    this.hideMagnitudeIndicator(button)

    const indicator = this.document.createElement('div')
    indicator.className = 'magnitude-indicator'
    indicator.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${magnitude * 100}%;
      height: 100%;
      background: linear-gradient(90deg, rgba(0,123,255,0.3), rgba(0,123,255,0.6));
      border-radius: inherit;
      pointer-events: none;
      z-index: 15;
      transition: width 0.1s ease;
    `

    button.appendChild(indicator)
  }

  // Hide magnitude indicator
  hideMagnitudeIndicator(button) {
    const indicator = button.querySelector('.magnitude-indicator')
    if (indicator) {
      indicator.remove()
    }
  }

  // Show magnitude preview on hover
  showMagnitudePreview(button, direction, magnitude) {
    this.showMagnitudeIndicator(button, magnitude)

    // Show direction text if specified
    if (direction) {
      const directionText = this.document.createElement('div')
      directionText.className = 'direction-preview'
      directionText.textContent = direction.toUpperCase()
      directionText.style.cssText = `
        position: absolute;
        top: -1.5rem;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.7rem;
        white-space: nowrap;
        z-index: 20;
      `
      button.appendChild(directionText)
    }
  }

  // Hide magnitude preview
  hideMagnitudePreview(button) {
    this.hideMagnitudeIndicator(button)
    const directionText = button.querySelector('.direction-preview')
    if (directionText) {
      directionText.remove()
    }
  }

  // Create stick direction indicator
  createStickDirectionIndicator(stick, centerX, centerY) {
    const indicator = this.document.createElement('div')
    indicator.className = 'stick-direction-indicator'
    indicator.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      background: radial-gradient(circle, rgba(0,123,255,0.8), rgba(0,123,255,0.4));
      border: 2px solid #fff;
      border-radius: 50%;
      pointer-events: none;
      z-index: 1000;
      transform: translate(-50%, -50%);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `
    this.document.body.appendChild(indicator)
  }

  // Update stick direction indicator position
  updateStickDirectionIndicator(stick, x, y) {
    const indicator = this.document.querySelector('.stick-direction-indicator')
    if (!indicator) return

    const rect = stick.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    const indicatorX = centerX + (x * rect.width / 4)
    const indicatorY = centerY + (y * rect.height / 4)

    indicator.style.left = `${indicatorX}px`
    indicator.style.top = `${indicatorY}px`

    // Update size based on magnitude
    const magnitude = Math.sqrt(x * x + y * y)
    const size = 16 + (magnitude * 12)
    indicator.style.width = `${size}px`
    indicator.style.height = `${size}px`

    // Update color intensity based on magnitude
    const intensity = 0.4 + (magnitude * 0.4)
    indicator.style.background = `radial-gradient(circle, rgba(0,123,255,${intensity}), rgba(0,123,255,${intensity * 0.5}))`
  }

  // Remove stick direction indicator
  removeStickDirectionIndicator(stick) {
    const indicator = this.document.querySelector('.stick-direction-indicator')
    if (indicator) {
      indicator.remove()
    }
  }

  // Highlight direction buttons based on stick position
  highlightDirectionButtons(stickName, x, y) {
    const threshold = 0.5
    this.clearDirectionHighlights(stickName)

    // Highlight directions based on stick position
    if (Math.abs(x) > threshold) {
      const direction = x > 0 ? 'right' : 'left'
      const button = this.document.querySelector(
        `.controller-button[data-stick="${stickName}"][data-direction="${direction}"]`
      )
      if (button) {
        button.classList.add('active')
      }
    }

    if (Math.abs(y) > threshold) {
      const direction = y > 0 ? 'down' : 'up'
      const button = this.document.querySelector(
        `.controller-button[data-stick="${stickName}"][data-direction="${direction}"]`
      )
      if (button) {
        button.classList.add('active')
      }
    }
  }

  // Clear direction button highlights
  clearDirectionHighlights(stickName) {
    const stickButtons = this.document.querySelectorAll(
      `.controller-button[data-stick="${stickName}"]`
    )
    stickButtons.forEach(button => {
      button.classList.remove('active')
    })
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

    // Handle controller layouts which use 'controls' instead of 'keys'
    if (this.currentKeyboard?.isController) {
      const keyInfo = this.currentKeyboard?.controls[keyCode]
      if (keyInfo) {
        return keyInfo.primary
      }
    } else {
      const keyInfo = this.currentKeyboard?.keys[keyCode]
      if (keyInfo) {
        return keyInfo.primary
      }
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

  // Highlight selected key on keyboard or controller
  highlightSelectedKeyOnKeyboard(chord) {
    this.clearKeyboardHighlights()

    if (!chord) return

    // Split the chord into individual keys
    const keys = chord.split('+')

    // Update side cache
    this.updateLastModifierSideFromChord(chord)

    keys.forEach(key => {
      // Check if this is a controller layout and handle controller keys
      if (this.currentKeyboard?.isController) {
        this.highlightControllerKey(key)
        return
      }

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

  // Highlight controller keys for controller layouts
  highlightControllerKey(key) {
    if (!this.currentKeyboard?.isController) return

    // Check if the key matches any controller control
    const controls = this.currentKeyboard.controls || {}

    // First try exact match on key names
    for (const [controlId, controlInfo] of Object.entries(controls)) {
      if (controlInfo.primary === key ||
          controlInfo.secondary === key ||
          controlId === key) {
        this.highlightControllerButton(controlId)
        return
      }
    }

    // Handle special controller key mappings
    const controllerMappings = {
      'A': 'Joy1', 'B': 'Joy2', 'X': 'Joy3', 'Y': 'Joy4',
      'LB': 'Joy5', 'RB': 'Joy6', 'LT': 'Joy7', 'RT': 'Joy8',
      'Select': 'Joy9', 'Start': 'Joy10', 'LS': 'Joy11', 'RS': 'Joy12'
    }

    const mappedControl = controllerMappings[key]
    if (mappedControl && controls[mappedControl]) {
      this.highlightControllerButton(mappedControl)
      return
    }

    // Handle stick directions
    if (key.includes('LS') || key.includes('Lstick')) {
      const direction = key.replace('LS', '').replace('Lstick_', '').toLowerCase()
      const controlId = `Lstick_${direction}`
      if (controls[controlId]) {
        this.highlightControllerButton(controlId)
        // Also highlight the stick base
        this.highlightAnalogStick('left')
      }
    } else if (key.includes('RS') || key.includes('Rstick')) {
      const direction = key.replace('RS', '').replace('Rstick_', '').toLowerCase()
      const controlId = `Rstick_${direction}`
      if (controls[controlId]) {
        this.highlightControllerButton(controlId)
        // Also highlight the stick base
        this.highlightAnalogStick('right')
      }
    } else if (key.includes('D-') || key.includes('Joypad_')) {
      const direction = key.replace('D-', '').replace('Joypad_', '').toLowerCase()
      const controlId = `Joypad_${direction}`
      if (controls[controlId]) {
        this.highlightControllerButton(controlId)
      }
    }
  }

  // Highlight a specific controller button
  highlightControllerButton(controlId) {
    const button = this.document.querySelector(`[data-key-code="${controlId}"]`)
    if (button) {
      button.classList.add('selected')
      this.highlightedKeys.add(controlId)

      // Add a pulse animation for better visibility
      button.style.animation = 'buttonPress 0.3s ease, highlightPulse 1s ease 2'
      setTimeout(() => {
        button.style.animation = ''
      }, 2300)
    }
  }

  // Highlight analog stick base
  highlightAnalogStick(stickName) {
    const stick = this.document.querySelector(`[data-stick="${stickName}"]`)
    if (stick) {
      stick.classList.add('active')
      setTimeout(() => {
        stick.classList.remove('active')
      }, 2000)
    }
  }

  // Real-time controller highlighting methods
  highlightControllerButtonRealtime(controlId, isPressed) {
    const button = this.document.querySelector(`[data-key-code="${controlId}"]`)
    if (button) {
      if (isPressed) {
        button.classList.add('realtime-active')
        // Add visual feedback for different control types
        const controlType = button.dataset.controlType
        if (controlType === 'axis') {
          button.classList.add('realtime-axis')
        } else if (controlType === 'dpad') {
          button.classList.add('realtime-dpad')
        } else {
          button.classList.add('realtime-button')
        }
      } else {
        button.classList.remove('realtime-active', 'realtime-axis', 'realtime-dpad', 'realtime-button')
        this.hideAnalogMagnitude(controlId)
      }
    }

    // Also highlight associated stick base for stick directions
    if (controlId.includes('Lstick')) {
      this.highlightAnalogStickRealtime('left', isPressed)
    } else if (controlId.includes('Rstick')) {
      this.highlightAnalogStickRealtime('right', isPressed)
    }
  }

  highlightAnalogStickRealtime(stickName, isActive) {
    const stick = this.document.querySelector(`[data-stick="${stickName}"]`)
    if (stick) {
      if (isActive) {
        stick.classList.add('realtime-active')
      } else {
        stick.classList.remove('realtime-active')
      }
    }
  }

  showRealtimeFeedback(controlId, action) {
    const button = this.document.querySelector(`[data-key-code="${controlId}"]`)
    if (button) {
      // Add a brief pulse animation
      button.style.animation = 'none'
      setTimeout(() => {
        button.style.animation = 'realtimePress 0.2s ease'
      }, 10)
    }
  }

  showAnalogMagnitude(controlId, value, magnitude) {
    const button = this.document.querySelector(`[data-key-code="${controlId}"]`)
    if (!button) return

    // Remove existing magnitude indicator
    this.hideAnalogMagnitude(controlId)

    // Create magnitude indicator overlay
    const indicator = this.document.createElement('div')
    indicator.className = 'realtime-magnitude-indicator'
    indicator.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${magnitude * 100}%;
      height: 100%;
      background: linear-gradient(90deg, rgba(255,193,7,0.4), rgba(255,152,0,0.7));
      border-radius: inherit;
      pointer-events: none;
      z-index: 20;
      transition: width 0.05s ease;
    `

    // For directional axes, adjust the indicator position and style
    const controlType = button.dataset.controlType
    const direction = button.dataset.direction

    if (controlType === 'axis' && direction) {
      if (direction.includes('up') || direction.includes('left')) {
        indicator.style.left = 'auto'
        indicator.style.right = '0'
        indicator.style.background = `linear-gradient(180deg, rgba(255,193,7,0.4), rgba(255,152,0,0.7))`
      }
      if (direction.includes('vertical')) {
        indicator.style.width = '100%'
        indicator.style.height = `${magnitude * 100}%`
        indicator.style.background = `linear-gradient(180deg, rgba(255,193,7,0.4), rgba(255,152,0,0.7))`
      }
    }

    button.appendChild(indicator)

    // Add magnitude value display for debugging/feedback
    const magnitudeText = this.document.createElement('div')
    magnitudeText.className = 'realtime-magnitude-text'
    magnitudeText.textContent = magnitude.toFixed(2)
    magnitudeText.style.cssText = `
      position: absolute;
      top: -1.2rem;
      right: 0;
      background: rgba(0,0,0,0.8);
      color: #ffc107;
      padding: 0.1rem 0.3rem;
      border-radius: 0.2rem;
      font-size: 0.6rem;
      font-weight: bold;
      z-index: 25;
      pointer-events: none;
    `
    button.appendChild(magnitudeText)
  }

  hideAnalogMagnitude(controlId) {
    const button = this.document.querySelector(`[data-key-code="${controlId}"]`)
    if (button) {
      const indicator = button.querySelector('.realtime-magnitude-indicator')
      const magnitudeText = button.querySelector('.realtime-magnitude-text')
      if (indicator) indicator.remove()
      if (magnitudeText) magnitudeText.remove()
    }
  }

  clearRealtimeHighlights() {
    // Clear all real-time highlighting
    const realtimeElements = this.document.querySelectorAll('.realtime-active, .realtime-axis, .realtime-dpad, .realtime-button')
    realtimeElements.forEach(element => {
      element.classList.remove('realtime-active', 'realtime-axis', 'realtime-dpad', 'realtime-button')
    })

    // Clear all magnitude indicators
    const magnitudeIndicators = this.document.querySelectorAll('.realtime-magnitude-indicator')
    magnitudeIndicators.forEach(indicator => indicator.remove())

    // Clear all magnitude text
    const magnitudeTexts = this.document.querySelectorAll('.realtime-magnitude-text')
    magnitudeTexts.forEach(text => text.remove())
  }

  // Helper method to highlight a single key
  highlightKey(keyCode) {
    const keyElement = this.document.querySelector(`[data-key-code="${keyCode}"]`)
    if (keyElement) {
      keyElement.classList.add('selected')
      this.highlightedKeys.add(keyCode)
    }
  }

  // Basic HTML escape for bindset option labels
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return String(text).replace(/[&<>"']/g, (m) => map[m] || m)
  }

  // Clear keyboard and controller highlights
  clearKeyboardHighlights() {
    this.highlightedKeys.forEach(keyCode => {
      const keyElement = this.document.querySelector(`[data-key-code="${keyCode}"]`)
      if (keyElement) {
        keyElement.classList.remove('pressed', 'selected', 'active')
        keyElement.style.animation = ''
      }
    })

    // Also clear any active analog sticks
    const activeSticks = this.document.querySelectorAll('.analog-stick.active')
    activeSticks.forEach(stick => {
      stick.classList.remove('active')
    })

    // Clear any active controller buttons
    const activeButtons = this.document.querySelectorAll('.controller-button.active, .controller-button.selected')
    activeButtons.forEach(button => {
      button.classList.remove('active', 'selected')
      button.style.animation = ''
    })

    // Clear real-time highlights and magnitude indicators
    this.clearRealtimeHighlights()

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
