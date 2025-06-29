import ComponentBase from '../ComponentBase.js'
import { request } from '../../core/requestResponse.js'
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
    if (!state) return
    
    // Handle state from DataCoordinator via ComponentBase late-join
    if (sender === 'DataCoordinator') {
      if (state.currentProfile) {
        this.currentProfile = state.currentProfile
        console.log(`[${this.componentName}] Received current profile from DataCoordinator: ${this.currentProfile}`)
      }
      
      // Load VFX state from current profile data if available
      if (state.currentProfileData) {
        this.loadState(state.currentProfileData)
        console.log(`[${this.componentName}] Loaded VFX state from current profile`)
      }
    }
  }

  setupEventListeners() {
    // Simple VFX Manager operations - no request/response overhead
    this.eventBus.on('vfx:show-modal', this.showModal.bind(this))
    this.eventBus.on('vfx:save-effects', this.saveEffects.bind(this))
    this.eventBus.on('vfx:cancel-effects', this.cancelEffects.bind(this))
    
    // Listen for profile changes to update current profile and reload VFX state
    this.addEventListener('profile:switched', ({ profileId, profile }) => {
      this.currentProfile = profileId
      if (profile) {
        this.loadState(profile)
        console.log(`[${this.componentName}] Loaded VFX state for switched profile: ${profileId}`)
      }
    })
    
    // Listen for profile updates to refresh VFX state if current profile was updated
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId === this.currentProfile && profile) {
        this.loadState(profile)
        console.log(`[${this.componentName}] Refreshed VFX state for updated profile: ${profileId}`)
      }
    })
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
    let command = `alias ${aliasName} <& dynFxSetFXExlusionList ${effects.join(',')}`

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

    let command = `dynFxSetFXExlusionList ${effects.join(',')}`

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

  async showModal() {
    console.log(`[${this.componentName}] Showing VFX modal`)
    
    // Load state from current profile via DataCoordinator
    if (this.currentProfile) {
      try {
        const profiles = await this.request('data:get-all-profiles')
        const profile = profiles[this.currentProfile]
        if (profile) {
          this.loadState(profile)
          console.log(`[${this.componentName}] Loaded VFX state from profile via DataCoordinator`)
        }
      } catch (error) {
        console.error(`[${this.componentName}] Failed to load profile state:`, error)
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
    this.emit('vfx:modal-populate', {
      vfxManager: this // Pass the service itself as the vfxManager
    })
  }

  async saveEffects() {
    console.log(`[${this.componentName}] Saving VFX effects`)
    
    // Defensive check to ensure selectedEffects is properly initialized
    if (!this.selectedEffects || !this.selectedEffects.space || !this.selectedEffects.ground) {
      console.error(`[${this.componentName}] ERROR: selectedEffects not properly initialized:`, this.selectedEffects)
      return
    }
    
    console.log(`[${this.componentName}] Current selected effects:`, this.selectedEffects)
    console.log(`[${this.componentName}] Show player say:`, this.showPlayerSay)
    console.log(`[${this.componentName}] Current profile:`, this.currentProfile)
    
    // Ensure service is initialized
    if (!this.isInitialized) {
      console.error(`[${this.componentName}] ERROR: Service not initialized`)
      return
    }
    
    // Save to current profile via DataCoordinator
    if (this.currentProfile) {
      try {
        // Get current profile to update
        const profiles = await this.request('data:get-all-profiles')
        const profile = profiles[this.currentProfile]
        
        if (profile) {
          console.log(`[${this.componentName}] Retrieved profile via DataCoordinator`)
          
          // Prepare updates object
          const updates = {}
          
          // Save VFX state
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
          updates.vertigoSettings = profile.vertigoSettings
          
          // Generate and save VFX aliases
          console.log(`[${this.componentName}] Generating VFX aliases`)
          const aliases = { ...(profile.aliases || {}) }
          
          // Remove existing VFX aliases - ensure aliases is valid
          if (aliases && typeof aliases === 'object') {
            Object.keys(aliases).forEach(aliasName => {
              if (aliasName.startsWith('dynFxSetFXExlusionList_')) {
                delete aliases[aliasName]
              }
            })
          } else {
            console.error(`[${this.componentName}] ERROR: aliases is not a valid object:`, aliases)
          }
          
          // Generate and save new VFX aliases
          ['space', 'ground'].forEach(environment => {
            console.log(`[${this.componentName}] Processing environment: ${environment}`)
            console.log(`[${this.componentName}] Selected effects for ${environment}:`, Array.from(this.selectedEffects[environment]))
            
            const aliasCommand = this.generateAliasCommand(environment)
            console.log(`[${this.componentName}] Generated command for ${environment}: ${aliasCommand}`)
            
            if (aliasCommand) {
              const aliasName = `dynFxSetFXExlusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
              aliases[aliasName] = {
                command: aliasCommand,
                description: `VFX suppression for ${environment} environment`,
                type: 'vfx-alias'
              }
              console.log(`[${this.componentName}] Generated VFX alias: ${aliasName} = ${aliasCommand}`)
            } else {
              console.log(`[${this.componentName}] No command generated for ${environment} (no effects selected)`)
            }
          })
          
          updates.aliases = aliases
          
          // Update profile via DataCoordinator using explicit operations API
          await this.request('data:update-profile', {
            profileId: this.currentProfile,
            modify: updates
          })
          
          console.log(`[${this.componentName}] VFX effects and aliases saved to profile: ${this.currentProfile}`)
          
          // Update alias browser to show new aliases
          this.emit('aliases-changed', { aliases })
        } else {
          console.error(`[${this.componentName}] ERROR: Could not retrieve profile: ${this.currentProfile}`)
        }
      } catch (error) {
        console.error(`[${this.componentName}] ERROR: Failed to save VFX effects:`, error)
      }
    } else {
      console.error(`[${this.componentName}] ERROR: No current profile set`)
    }

    this.emit('modal:hide', { modalId: 'vertigoModal' })
  }

  cancelEffects() {
    console.log(`[${this.componentName}] Cancelling VFX effects`)
    
    // Restore initial state
    if (this.initialState) {
      this.selectedEffects.space = new Set(this.initialState.selectedEffects.space)
      this.selectedEffects.ground = new Set(this.initialState.selectedEffects.ground)
      this.showPlayerSay = this.initialState.showPlayerSay
    }

    this.emit('modal:hide', { modalId: 'vertigoModal' })
  }

  /**
   * Get current state for late-join support
   */
  getCurrentState() {
    return {
      currentProfile: this.currentProfile,
      selectedEffects: {
        space: Array.from(this.selectedEffects.space),
        ground: Array.from(this.selectedEffects.ground)
      },
      showPlayerSay: this.showPlayerSay
    }
  }

} 