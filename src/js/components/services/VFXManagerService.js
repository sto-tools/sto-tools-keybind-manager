import ComponentBase from '../ComponentBase.js'
import VertigoManager from '../../features/vertigo_data.js'

export default class VFXManagerService extends ComponentBase {
  constructor(eventBus) {
    super(eventBus)
    this.componentName = 'VFXManagerService'
    
    this.vfxManager = new VertigoManager()
    this.initialState = null
    this.isInitialized = false
  }

  async init() {
    if (this.isInitialized) {
      console.log(`[${this.componentName}] Already initialized`)
      return
    }

    this.setupEventListeners()
    this.isInitialized = true
    console.log(`[${this.componentName}] Initialized`)
  }

  setupEventListeners() {
    // Simple VFX Manager operations - no request/response overhead
    this.eventBus.on('vfx:show-modal', this.showModal.bind(this))
    this.eventBus.on('vfx:save-effects', this.saveEffects.bind(this))
    this.eventBus.on('vfx:cancel-effects', this.cancelEffects.bind(this))
  }

  showModal() {
    console.log(`[${this.componentName}] Showing VFX modal`)
    
    // Load state from current profile
    const currentProfile = window.stoStorage?.currentProfile
    if (currentProfile) {
      const profile = window.stoStorage.getProfile(currentProfile)
      if (profile) {
        this.vfxManager.loadState(profile)
      }
    }

    // Store initial state for cancel functionality
    this.initialState = {
      selectedEffects: {
        space: new Set(this.vfxManager.selectedEffects.space),
        ground: new Set(this.vfxManager.selectedEffects.ground),
      },
      showPlayerSay: this.vfxManager.showPlayerSay,
    }

    // Emit event to populate and show the modal
    this.eventBus.emit('vfx:modal-populate', {
      vfxManager: this.vfxManager
    })
  }

  saveEffects() {
    console.log(`[${this.componentName}] Saving VFX effects`)
    
    // Save to current profile
    const currentProfile = window.stoStorage?.currentProfile
    if (currentProfile && this.vfxManager) {
      this.vfxManager.saveToProfile(currentProfile)
      console.log(`[${this.componentName}] VFX effects saved to profile: ${currentProfile}`)
    }

    this.eventBus.emit('modal:hide', 'vertigoModal')
  }

  cancelEffects() {
    console.log(`[${this.componentName}] Cancelling VFX effects`)
    
    // Restore initial state
    if (this.initialState && this.vfxManager) {
      this.vfxManager.selectedEffects.space = new Set(this.initialState.selectedEffects.space)
      this.vfxManager.selectedEffects.ground = new Set(this.initialState.selectedEffects.ground)
      this.vfxManager.showPlayerSay = this.initialState.showPlayerSay
    }

    this.eventBus.emit('modal:hide', 'vertigoModal')
  }
} 