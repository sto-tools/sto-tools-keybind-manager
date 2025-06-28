import ComponentBase from '../ComponentBase.js'
// VFX_EFFECTS now available globally from data.js

export default class VFXManagerService extends ComponentBase {
  constructor(eventBus) {
    super(eventBus)
    this.componentName = 'VFXManagerService'
    
    // VFX Manager state (migrated from VertigoManager)
    this.selectedEffects = {
      space: new Set(),
      ground: new Set(),
    }
    this.showPlayerSay = false
    
    // Track current profile like other services
    this.currentProfile = null
    this.storage = null
    
    this.initialState = null
    this.isInitialized = false
  }

  async init() {
    if (this.isInitialized) {
      console.log(`[${this.componentName}] Already initialized`)
      return
    }

    // Call parent init to register with component system
    super.init()
    
    this.setupEventListeners()
    this.isInitialized = true
    console.log(`[${this.componentName}] Initialized`)
  }

  // Handle initial state from other components
  handleInitialState(sender, state) {
    if ((sender === 'DataCoordinator' || sender === 'ProfileService') && state) {
      this.currentProfile = state.currentProfile
      console.log(`[${this.componentName}] Received current profile from ProfileService: ${this.currentProfile}`)
    } else if (sender === 'StorageService' && state) {
      this.storage = state
      console.log(`[${this.componentName}] Received storage service`)
    }
  }

  setupEventListeners() {
    // Simple VFX Manager operations - no request/response overhead
    this.eventBus.on('vfx:show-modal', this.showModal.bind(this))
    this.eventBus.on('vfx:save-effects', this.saveEffects.bind(this))
    this.eventBus.on('vfx:cancel-effects', this.cancelEffects.bind(this))
  }

  // ========================================================================
  // VFX Manager Core Methods (migrated from VertigoManager)
  // ========================================================================

  // Generate the alias command for the given environment
  generateAlias(environment) {
    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }

    const effects = Array.from(this.selectedEffects[environment])
    if (effects.length === 0) return ''

    let aliasName = `dynFxSetFXExlusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
    let command = `alias ${aliasName} <& dynFxSetFXExlusionList ${effects.join(' ')}`

    if (this.showPlayerSay) {
      command += ' $$ PlayerSay VFX Supression Loaded'
    }

    command += ' &>'
    return command
  }

  // Generate just the command part (without alias definition) for storage
  generateAliasCommand(environment) {
    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }

    const effects = Array.from(this.selectedEffects[environment])
    if (effects.length === 0) return ''

    let command = `dynFxSetFXExlusionList ${effects.join(' ')}`

    if (this.showPlayerSay) {
      command += ' $$ PlayerSay VFX Supression Loaded'
    }

    return command
  }

  // Get selected effects for an environment
  getSelectedEffects(environment) {
    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }
    return Array.from(this.selectedEffects[environment])
  }

  // Toggle an effect
  toggleEffect(environment, effectName) {
    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }

    if (!effectName) {
      throw new Error(`Invalid effect: ${effectName} for environment: ${environment}`)
    }

    if (this.selectedEffects[environment].has(effectName)) {
      this.selectedEffects[environment].delete(effectName)
    } else {
      this.selectedEffects[environment].add(effectName)
    }
  }

  // Clear all selected effects
  clearAllEffects() {
    this.selectedEffects.space.clear()
    this.selectedEffects.ground.clear()
  }

  // Set all effects for an environment
  selectAllEffects(environment) {
    if (!VFX_EFFECTS[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }

    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }

    VFX_EFFECTS[environment].forEach((effect) => {
      this.selectedEffects[environment].add(effect.effect)
    })
  }

  // Get effect count for an environment
  getEffectCount(environment) {
    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }
    return this.selectedEffects[environment].size
  }

  // Check if effect is selected
  isEffectSelected(environment, effectName) {
    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }
    return this.selectedEffects[environment].has(effectName)
  }

  // Save state to current profile
  saveState(profile) {
    if (!profile.vertigoSettings) {
      profile.vertigoSettings = {}
    }

    profile.vertigoSettings = {
      selectedEffects: {
        space: Array.from(this.selectedEffects.space),
        ground: Array.from(this.selectedEffects.ground),
      },
      showPlayerSay: this.showPlayerSay,
    }
  }

  // Load state from current profile
  loadState(profile) {
    if (profile && profile.vertigoSettings) {
      const settings = profile.vertigoSettings

      // Restore selected effects
      this.selectedEffects.space = new Set(
        settings.selectedEffects?.space || []
      )
      this.selectedEffects.ground = new Set(
        settings.selectedEffects?.ground || []
      )

      // Restore PlayerSay setting
      this.showPlayerSay = settings.showPlayerSay || false
    } else {
      // Reset to defaults if no saved state
      this.selectedEffects.space.clear()
      this.selectedEffects.ground.clear()
      this.showPlayerSay = false
    }
  }

  showModal() {
    console.log(`[${this.componentName}] Showing VFX modal`)
    
    // Load state from current profile
    const storage = this.storage || window.stoStorage
    if (this.currentProfile && storage) {
      const profile = storage.getProfile(this.currentProfile)
      if (profile) {
        this.loadState(profile)
      }
    }

    // Store initial state for cancel functionality
    this.initialState = {
      selectedEffects: {
        space: new Set(this.selectedEffects.space),
        ground: new Set(this.selectedEffects.ground),
      },
      showPlayerSay: this.showPlayerSay,
    }

    // Emit event to populate and show the modal
    this.eventBus.emit('vfx:modal-populate', {
      vfxManager: this // Pass the service itself as the vfxManager
    })
  }

  saveEffects() {
    console.log(`[${this.componentName}] Saving VFX effects`)
    console.log(`[${this.componentName}] Current selected effects:`, this.selectedEffects)
    console.log(`[${this.componentName}] Show player say:`, this.showPlayerSay)
    console.log(`[${this.componentName}] Current profile:`, this.currentProfile)
    
    // Use window.stoStorage as fallback if this.storage is not available
    const storage = this.storage || window.stoStorage
    console.log(`[${this.componentName}] Storage available:`, !!storage)
    
    // Save to current profile
    if (this.currentProfile && storage) {
      const profile = storage.getProfile(this.currentProfile)
      console.log(`[${this.componentName}] Retrieved profile:`, profile ? 'found' : 'not found')
      
      if (profile) {
        this.saveState(profile)
        
        // Generate and save VFX aliases
        console.log(`[${this.componentName}] About to call generateAndSaveAliases`)
        this.generateAndSaveAliases(profile)
        
        storage.saveProfile(this.currentProfile, profile)
        console.log(`[${this.componentName}] VFX effects and aliases saved to profile: ${this.currentProfile}`)
        
        // Update alias browser to show new aliases
        this.eventBus.emit('aliases-changed', { aliases: profile.aliases })
      } else {
        console.error(`[${this.componentName}] ERROR: Could not retrieve profile: ${this.currentProfile}`)
      }
    } else {
      console.error(`[${this.componentName}] ERROR: Missing required services`)
      console.error(`[${this.componentName}] Current profile:`, this.currentProfile)
      console.error(`[${this.componentName}] Storage:`, !!storage)
    }

    this.eventBus.emit('modal:hide', { modalId: 'vertigoModal' })
  }

  cancelEffects() {
    console.log(`[${this.componentName}] Cancelling VFX effects`)
    
    // Restore initial state
    if (this.initialState) {
      this.selectedEffects.space = new Set(this.initialState.selectedEffects.space)
      this.selectedEffects.ground = new Set(this.initialState.selectedEffects.ground)
      this.showPlayerSay = this.initialState.showPlayerSay
    }

    this.eventBus.emit('modal:hide', { modalId: 'vertigoModal' })
  }

  // Generate and save VFX aliases to the profile
  generateAndSaveAliases(profile) {
    console.log(`[${this.componentName}] generateAndSaveAliases called`)
    
    if (!profile.aliases) {
      profile.aliases = {}
    }

    // Remove existing VFX aliases
    Object.keys(profile.aliases).forEach(aliasName => {
      if (aliasName.startsWith('dynFxSetFXExlusionList_')) {
        delete profile.aliases[aliasName]
      }
    })

    // Generate and save new VFX aliases
    ['space', 'ground'].forEach(environment => {
      console.log(`[${this.componentName}] Processing environment: ${environment}`)
      console.log(`[${this.componentName}] Selected effects for ${environment}:`, Array.from(this.selectedEffects[environment]))
      
      const aliasCommand = this.generateAliasCommand(environment)
      console.log(`[${this.componentName}] Generated command for ${environment}: ${aliasCommand}`)
      
      if (aliasCommand) {
        const aliasName = `dynFxSetFXExlusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
        profile.aliases[aliasName] = {
          command: aliasCommand,
          description: `VFX suppression for ${environment} environment`,
          type: 'vfx'
        }
        console.log(`[${this.componentName}] Generated VFX alias: ${aliasName} = ${aliasCommand}`)
      } else {
        console.log(`[${this.componentName}] No command generated for ${environment} (no effects selected)`)
      }
    })
  }
} 