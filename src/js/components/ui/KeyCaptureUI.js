import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'

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
   */
  constructor ({ eventBus: bus = eventBus, modalManager = null, app = null, document = (typeof window !== 'undefined' ? window.document : undefined), service = null } = {}) {
    // Phase-2: UI components require only an eventBus reference. Accept optional
    // `service` for backward-compatibility but do NOT rely on it.
    super(bus)
    this.componentName = 'KeyCaptureUI'

    this.eventBus     = bus
    this.modalManager = modalManager || (typeof window !== 'undefined' ? window.modalManager : null)
    this.app          = app || (typeof window !== 'undefined' ? window.app : null)
    this.document     = document

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
} 