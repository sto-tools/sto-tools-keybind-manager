import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import { STO_KEY_NAMES } from '../../data/stoKeyNames.js'

/**
 * KeyCaptureUI – visual layer for key capture workflow. It relies on
 * KeyCaptureService for the low-level keyboard logic and focuses solely on
 * updating DOM, toggling buttons, etc.
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

    // Legacy – keep reference but unused after migration
    this.service = service
  }

  /* ------------------------------------------------------------ lifecycle */
  onInit () {
    // Listen for capture lifecycle events emitted by KeyCaptureService
    this.addEventListener('capture-start',  (d) => this.handleCaptureStart(d))
    this.addEventListener('update',         (d) => this.updateCapturedKeysDisplay(d))
    this.addEventListener('chord-captured', (d) => this.addCapturedKeySelectionButton(d))
    this.addEventListener('capture-stop',   (d) => this.handleCaptureStop(d))

    // Populate manual selection UI whenever the modal is shown.
    if (this.eventBus) {
      this.eventBus.on('modal:shown', ({ modalId }) => {
        if (modalId === 'keySelectionModal') {
          this.populateKeySelectionModal()
        }
      })
    }

    // Setup DOM event listeners for key modal buttons
    this.setupEventListeners()

    // Build key grids up-front so they are ready when the modal first opens.
    // If the DOM isn't fully parsed yet the helper will no-op and will run
    // again when the modal is shown.
    this.populateKeySelectionModal()

    // Build modifier buttons from authoritative list
    this.populateModifierButtons()
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return
    }
    this.eventListenersSetup = true

    // Add key confirmation buttons
    this.eventBus.onDom('addKeyConfirmYesBtn', 'click', 'add-key-confirm-yes', () => {
      this.confirmAddKey(true)
    })

    this.eventBus.onDom('addKeyConfirmNoBtn', 'click', 'add-key-confirm-no', () => {
      this.confirmAddKey(false)
    })

    this.eventBus.onDom('confirmAddKeyBtn', 'click', 'confirm-add-key', () => {
      this.addSelectedKey()
    })

    // Key selection modal buttons
    // ---------------------------------
    // Begin capture within key selection modal
    this.eventBus.onDom('keySelectionCaptureBtn', 'click', 'key-selection-capture', () => {
      this.startCapture('keySelectionModal')
    })

    // Confirm the selected / captured key
    this.eventBus.onDom('confirmKeySelection', 'click', 'key-selection-confirm', () => {
      this.addSelectedKey()
    })

    // Delegated listener for modifier buttons (toggle selected state)
    this.eventBus.onDom('.modifier-btn', 'click', 'key-selection-modifier-toggle', (e) => {
      const btn = e.target.closest('.modifier-btn')
      if (!btn) return
      const selected = btn.dataset.selected === 'true'
      btn.dataset.selected = (!selected).toString()
      this.updateKeyPreview()
    })

    // Delegated listener for key grid items
    this.eventBus.onDom('.key-item', 'click', 'key-selection-item', (e) => {
      const item = e.target.closest('.key-item')
      if (!item) return
      // Clear previous selection
      this.document.querySelectorAll('.key-item.selected')?.forEach(el => el.classList.remove('selected'))
      item.classList.add('selected')
      this.updateKeyPreview()
    })

    // Delegated listener for tab switching
    this.eventBus.onDom('.tab-btn', 'click', 'key-selection-tab', (e) => {
      const btn = e.target.closest('.tab-btn')
      if (!btn) return
      const tab = btn.dataset.tab
      if (!tab) return

      // Activate clicked tab button
      this.document.querySelectorAll('.tab-btn')?.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      // Show corresponding tab pane
      this.document.querySelectorAll('.key-tab')?.forEach(pane => pane.classList.remove('active'))
      const pane = this.document.getElementById(`${tab}-tab`)
      if (pane) pane.classList.add('active')
    })
  }

  /* ---------------------------------------------------------- public API */
  /** Begin key capture (called by app/EventHandlerService) */
  startCapture (context = 'keySelectionModal') {
    // Show capture status + disable capture button
    const captureStatusId = (context === 'addKeyModal') ? 'addKeyCaptureStatus'  : 'keyCaptureStatus'
    const capturedKeysId  = (context === 'addKeyModal') ? 'addKeyCapturedKeys'  : 'capturedKeys'
    const captureBtnId    = (context === 'addKeyModal') ? 'addKeyCaptureBtn'    : 'keySelectionCaptureBtn'

    const captureStatus = this.document.getElementById(captureStatusId)
    const capturedKeys  = this.document.getElementById(capturedKeysId)
    const captureBtn    = this.document.getElementById(captureBtnId)

    if (captureStatus) captureStatus.style.display = 'block'
    if (capturedKeys) {
      capturedKeys.textContent = ''
      capturedKeys.setAttribute('data-placeholder', 'Press keys...')
    }
    if (captureBtn) captureBtn.disabled = true

    // Focus modal so that keyboard events flow
    const modal = this.document.getElementById(context)
    if (modal) modal.focus()

    // Ask service to start capture via event bus
    this.emit('keycapture:start', { context })
  }

  /** Stop key capture externally */
  stopCapture () {
    // Instruct service via event bus
    this.emit('keycapture:stop')
  }

  /* -------------------------------------------------------- event hooks */
  handleCaptureStart ({ context }) {
    // Nothing extra – UI already prepared in startCapture()
    // TODO: Why do we have this? if we don't need it, remove this hook
  }

  handleCaptureStop ({ context }) {
    const captureStatusId = (context === 'addKeyModal') ? 'addKeyCaptureStatus'  : 'keyCaptureStatus'
    const captureBtnId    = (context === 'addKeyModal') ? 'addKeyCaptureBtn'    : 'keySelectionCaptureBtn'

    const captureStatus = this.document.getElementById(captureStatusId)
    const captureBtn    = this.document.getElementById(captureBtnId)

    if (captureStatus) captureStatus.style.display = 'none'
    if (captureBtn) captureBtn.disabled = false

    // Hide confirm section in addKey modal
    if (context === 'addKeyModal') {
      const confirmSection = this.document.getElementById('addKeyConfirmSection')
      if (confirmSection) confirmSection.style.display = 'none'
    }
  }

  updateCapturedKeysDisplay ({ chord, context }) {
    const capturedKeysId = (context === 'addKeyModal') ? 'addKeyCapturedKeys' : 'capturedKeys'
    const capturedKeys   = this.document.getElementById(capturedKeysId)
    if (!capturedKeys) return
    capturedKeys.textContent = chord || ''
  }

  /** Create / update UI elements once a chord is captured. */
  addCapturedKeySelectionButton ({ chord, context }) {
    if (!chord) return

    if (context === 'addKeyModal') {
      const capturedKeysId = 'addKeyCapturedKeys'
      const capturedKeysEl = this.document.getElementById(capturedKeysId)
      if (!capturedKeysEl) return

      // Remove previous selection button if present
      const existing = capturedKeysEl.querySelector('.captured-key-select-btn')
      if (existing) existing.remove()

      // New button
      const btn = this.document.createElement('button')
      btn.className = 'btn btn-primary captured-key-select-btn'
      btn.textContent = `Select "${chord}"`
      btn.onclick = () => {
        // Fill name input silently
        const keyNameInput = this.document.getElementById('newKeyName')
        if (keyNameInput) keyNameInput.value = chord

        // Delegate to app-level addKey()
        if (this.app && typeof this.app.addKey === 'function') {
          this.app.addKey(chord)
        }

        // Close modal & stop capture
        this.modalManager?.hide('addKeyModal')
        this.stopCapture()
      }
      capturedKeysEl.appendChild(btn)
    } else {
      // keySelectionModal – update preview + enable confirm button
      const previewDisplay = this.document.getElementById('keyPreviewDisplay')
      const confirmBtn     = this.document.getElementById('confirmKeySelection')

      if (previewDisplay) {
        previewDisplay.innerHTML = `<span class="key-combination">${chord}</span>`
      }
      if (confirmBtn) {
        confirmBtn.disabled = false
      }

      // Save selection for caller to use (service keeps record of last chord)
      this.selectedKey = chord

      // Remove any modifier/key selections in grid
      this.document.querySelectorAll('.modifier-btn')?.forEach(btn => { btn.dataset.selected = 'false' })
      this.document.querySelectorAll('.key-item.selected')?.forEach(item => item.classList.remove('selected'))

      // Auto-stop capture when chord chosen in this modal
      this.stopCapture()
    }
  }

  /**
   * Handle key confirmation in add key modal
   */
  confirmAddKey(confirmed) {
    if (confirmed) {
      // Get the captured key and add it
      const keyNameInput = this.document.getElementById('newKeyName')
      const keyName = keyNameInput ? keyNameInput.value : null
      
      if (keyName && this.app && typeof this.app.addKey === 'function') {
        this.app.addKey(keyName)
      }
    }
    
    // Hide modal and stop capture
    this.modalManager?.hide('addKeyModal')
    this.stopCapture()
  }

  /**
   * Add the selected key from key selection modal
   */
  async addSelectedKey() {
    if (!this.selectedKey) return

    try {
      // Use request/response so KeyService receives it (respond handler).
      await this.request('key:add', { key: this.selectedKey })
      this.modalManager?.hide('keySelectionModal')
      // Success feedback handled by KeyService toast.
    } catch (err) {
      console.error('Failed to add key:', err)
      // Optional UI feedback
      if (this.ui?.showToast) {
        this.ui.showToast('Failed to add key', 'error')
      }
    }
  }

  /* ----------------------------------------------------------- manual key selection helpers */

  /** Build and populate key grids the first time the modal is opened */
  populateKeySelectionModal () {
    if (this._keySelectionPopulated) return
    this._keySelectionPopulated = true

    const MODIFIERS = new Set(['ALT','LALT','RALT','CONTROL','LCTRL','RCTRL','SHIFT'])

    // Category buckets
    const categories = {
      common: new Set(),
      letters: new Set(),
      numbers: new Set(),
      function: new Set(),
      arrows: new Set(),
      symbols: new Set(),
      numpad: new Set(),
      mouse: new Set(),
      gamepad: new Set()
    }

    STO_KEY_NAMES.forEach((key) => {
      // Skip modifiers for grids
      if (MODIFIERS.has(key.toUpperCase())) return

      const upper = key.toUpperCase()

      if (/^[A-Z]$/.test(key)) {
        categories.letters.add(key); return
      }
      if (/^[0-9]$/.test(key)) { categories.numbers.add(key); return }
      if (/^F\d+$/.test(upper)) { categories.function.add(key); return }
      if (["UP","DOWN","LEFT","RIGHT"].includes(upper)) { categories.arrows.add(key); return }
      if (upper.startsWith('NUMPAD') || ['DECIMAL','DIVIDE','MULTIPLY','SUBTRACT','ADD','NUMPADENTER'].includes(upper)) { categories.numpad.add(key); return }
      if (/^(BUTTON\d+|LBUTTON|RBUTTON|MIDDLECLICK|WHEELPLUS|WHEELMINUS)$/i.test(key)) { categories.mouse.add(key); return }
      if (/^(JOY\d+|LSTICK_|RSTICK_|JOYPAD_)/i.test(key)) { categories.gamepad.add(key); return }
      if ((/^[\[\]\\,\.\/'-]$/.test(key)) || key === '`') { categories.symbols.add(key); return }
      categories.common.add(key)
    })

    // Convert sets to arrays for iteration
    Object.keys(categories).forEach(cat => {
      categories[cat] = Array.from(categories[cat])
    })
  }

  /** Update preview display and confirm button based on current selections */
  updateKeyPreview () {
    const modifiers = Array.from(this.document.querySelectorAll('.modifier-btn'))
      .filter(b => b.dataset.selected === 'true')
      .map(b => b.dataset.modifier)

    const selectedItem = this.document.querySelector('.key-item.selected')
    const keyName = selectedItem?.dataset?.key

    if (!keyName) {
      // No key chosen – reset preview
      const previewDisplay = this.document.getElementById('keyPreviewDisplay')
      if (previewDisplay) {
        previewDisplay.innerHTML = '<span class="no-selection" data-i18n="no_key_selected">No key selected</span>'
      }
      const confirmBtn = this.document.getElementById('confirmKeySelection')
      if (confirmBtn) confirmBtn.disabled = true
      this.selectedKey = null
      return
    }

    // Build chord string
    const chord = [...modifiers, keyName].join('+')
    const previewDisplay = this.document.getElementById('keyPreviewDisplay')
    if (previewDisplay) {
      previewDisplay.innerHTML = `<span class="key-combination">${chord}</span>`
    }

    // Enable confirm button
    const confirmBtn = this.document.getElementById('confirmKeySelection')
    if (confirmBtn) confirmBtn.disabled = false

    this.selectedKey = chord
  }

  /** Dynamically build modifier buttons from authoritative list */
  populateModifierButtons () {
    const container = this.document.querySelector('.modifier-buttons')
    if (!container) return

    // Clear any existing static buttons
    container.innerHTML = ''

    const modifiers = STO_KEY_NAMES.filter(k => ['ALT','LALT','RALT','CONTROL','LCTRL','RCTRL','SHIFT'].includes(k.toUpperCase()))

    modifiers.forEach(mod => {
      const btn = this.document.createElement('button')
      btn.className = 'modifier-btn'
      btn.dataset.modifier = mod
      btn.dataset.selected = 'false'
      btn.textContent = mod
      container.appendChild(btn)
    })
  }
} 