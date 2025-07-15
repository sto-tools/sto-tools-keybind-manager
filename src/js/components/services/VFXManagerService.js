import ComponentBase from '../ComponentBase.js'
import { request } from '../../core/requestResponse.js'
import { formatAliasLine } from '../../lib/STOFormatter.js'
// VFX_EFFECTS now available globally from data.js

export default class VFXManagerService extends ComponentBase {
  constructor(eventBus) {
    super(eventBus)
    this.componentName = 'VFXManagerService'
    
    // Initialize VFX state
    this.selectedEffects = {
      space: new Set(),
      ground: new Set(),
    }
    this.showPlayerSay = false
    this.currentProfile = null
    
    this.initialState = null
    this.isInitialized = false

    // Register request/response handlers for virtual VFX aliases
    if (this.eventBus) {
      this.respond('vfx:get-virtual-aliases', () => this.getVirtualVFXAliases())
    }
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
    
    // Load VFX settings from DataCoordinator profile data
    if (sender === 'DataCoordinator' && state.currentProfileData) {
      this.currentProfile = state.currentProfileData.id
      this.loadState(state.currentProfileData)
      console.log(`[${this.componentName}] Loaded initial VFX state from DataCoordinator via late-join`)
    }
  }

  setupEventListeners() {
    // Simple VFX Manager operations - no request/response overhead
    this.eventBus.on('vfx:show-modal', this.showModal.bind(this))
    this.eventBus.on('vfx:save-effects', this.saveEffects.bind(this))
    this.eventBus.on('vfx:cancel-effects', this.cancelEffects.bind(this))
    
    // Listen for profile changes to update current profile and reload VFX state
    this.addEventListener('profile:switched', ({ profileId, profile, updateSource }) => {
      // Don't respond to profile updates we caused ourselves
      if (updateSource === 'VFXManagerService') {
        console.log(`[${this.componentName}] Ignoring profile:switched event from our own update`)
        return
      }
      
      this.currentProfile = profileId
      if (profile) {
        this.loadState(profile)
        console.log(`[${this.componentName}] Loaded VFX state for switched profile: ${profileId}`)
      }
    })
    
    // Listen for profile updates to refresh VFX state if current profile was updated
    this.addEventListener('profile:updated', ({ profileId, profile, updateSource }) => {
      // Don't respond to profile updates we caused ourselves
      if (updateSource === 'VFXManagerService') {
        console.log(`[${this.componentName}] Ignoring profile:updated event from our own update`)
        return
      }
      
      if (profileId === this.currentProfile && profile) {
        this.loadState(profile)
        console.log(`[${this.componentName}] Refreshed VFX state for updated profile: ${profileId}`)
      }
    })
  }

  // ========================================================================
  // VFX Manager Core Methods (migrated from VertigoManager)
  // ========================================================================

  // Generate alias line for display (formatted for STO export only)
  generateAlias(environment) {
    const effects = Array.from(this.selectedEffects[environment])
    if (effects.length === 0) return 'No effects selected'

    const aliasName = `dynFxSetFXExclusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
    const commands = this.generateAliasCommand(environment)
    // Only join with $$ for STO file export format
    const commandString = commands.join(' $$ ')

    return formatAliasLine(aliasName, { commands: commandString }).trim()
  }

  // Generate just the command part (without alias definition) for storage
  generateAliasCommand(environment) {
    // Defensive check to ensure selectedEffects is properly initialized
    if (!this.selectedEffects || !this.selectedEffects[environment]) {
      console.warn(`[${this.componentName}] generateAliasCommand: selectedEffects not properly initialized for ${environment}`)
      console.warn(`[${this.componentName}] selectedEffects state:`, this.selectedEffects)
      return []
    }

    const effects = Array.from(this.selectedEffects[environment])
    console.log(`[${this.componentName}] generateAliasCommand(${environment}): found ${effects.length} effects:`, effects)
    
    if (effects.length === 0) {
      console.log(`[${this.componentName}] generateAliasCommand(${environment}): No effects selected, returning empty command`)
      return []
    }

    const commands = [`dynFxSetFXExclusionList ${effects.join(',')}`]

    if (this.showPlayerSay) {
      commands.push('PlayerSay VFX Suppression Loaded')
    }

    console.log(`[${this.componentName}] generateAliasCommand(${environment}): generated commands:`, commands)
    return commands
  }

  // Generate just the command part (without alias definition) for storage
  generateCombinedAliasCommand(environments) {
    // Ensure environments is an array
    const envArray = Array.isArray(environments) ? environments : [environments]
    
    // Defensive check to ensure selectedEffects is properly initialized
    if (!this.selectedEffects) {
      console.warn(`[${this.componentName}] generateCombinedAliasCommand: selectedEffects not properly initialized, returning empty command`)
      return []
    }

    const allEffects = []
    
    for (const environment of envArray) {
      if (!this.selectedEffects[environment]) {
        console.warn(`[${this.componentName}] generateCombinedAliasCommand: selectedEffects not properly initialized for ${environment}, skipping`)
        continue
      }

      const environmentEffects = Array.from(this.selectedEffects[environment])
      if (environmentEffects.length === 0) continue

      allEffects.push(...environmentEffects)
    }

    if (allEffects.length === 0) return []

    const commands = [`dynFxSetFXExclusionList ${allEffects.join(',')}`]

    if (this.showPlayerSay) {
      commands.push('PlayerSay VFX Suppression Loaded')
    }

    return commands
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
    // Ensure selectedEffects is properly initialized
    if (!this.selectedEffects) {
      this.selectedEffects = {
        space: new Set(),
        ground: new Set(),
      }
      console.log(`[${this.componentName}] loadState: Initialized selectedEffects object`)
    }
    
    if (profile && profile.vertigoSettings) {
      const settings = profile.vertigoSettings
      console.log(`[${this.componentName}] loadState: Found vertigoSettings in profile:`, settings)

      // Restore selected effects
      this.selectedEffects.space = new Set(
        settings.selectedEffects?.space || []
      )
      this.selectedEffects.ground = new Set(
        settings.selectedEffects?.ground || []
      )

      console.log(`[${this.componentName}] loadState: Loaded space effects:`, Array.from(this.selectedEffects.space))
      console.log(`[${this.componentName}] loadState: Loaded ground effects:`, Array.from(this.selectedEffects.ground))

      // Restore PlayerSay setting
      this.showPlayerSay = settings.showPlayerSay || false
    } else {
      console.log(`[${this.componentName}] loadState: No vertigoSettings found in profile, resetting to defaults`)
      console.log(`[${this.componentName}] loadState: Profile structure:`, profile)
      // Reset to defaults if no saved state
      this.selectedEffects.space.clear()
      this.selectedEffects.ground.clear()
      this.showPlayerSay = false
    }
    
    // VFX state loaded - emit event so CommandLibrary can update virtual aliases
    this.emit('vfx:settings-changed', {
      selectedEffects: {
        space: Array.from(this.selectedEffects.space),
        ground: Array.from(this.selectedEffects.ground)
      },
      showPlayerSay: this.showPlayerSay
    })
  }

  /**
   * Get virtual VFX aliases for CommandLibrary display
   * These are NOT stored in profile - only generated dynamically
   */
  getVirtualVFXAliases() {
    const virtualAliases = {}
    
    // Generate environment-specific aliases
    const environments = ['space', 'ground']
    environments.forEach(environment => {
      const commands = this.generateAliasCommand(environment)
      // Always create virtual aliases, even when empty (for export consistency)
      const aliasName = `dynFxSetFXExclusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
      virtualAliases[aliasName] = {
        commands: commands,
        description: `VFX suppression for ${environment} environment`,
        type: 'vfx-alias',
        virtual: true // Mark as virtual
      }
    })
    
    // Generate combined alias if any effects are selected
    const allEffectsCount = this.selectedEffects.space.size + this.selectedEffects.ground.size
    if (allEffectsCount > 0) {
      const combinedCommands = this.generateCombinedAliasCommand(environments)
      if (combinedCommands.length > 0) {
        virtualAliases['dynFxSetFXExclusionList_Combined'] = {
          commands: combinedCommands,
          description: 'VFX suppression for all environments',
          type: 'vfx-alias',
          virtual: true // Mark as virtual
        }
      }
    }
    
    return virtualAliases
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
    
    // Save to current profile via DataCoordinator
    if (this.currentProfile) {
      try {
        // Get current profile to update
        const profiles = await this.request('data:get-all-profiles')
        const profile = profiles[this.currentProfile]
        
        if (profile) {
          console.log(`[${this.componentName}] Retrieved profile via DataCoordinator`)
          
          // Save VFX state
          const vertigoSettings = {
            selectedEffects: {
              space: Array.from(this.selectedEffects.space),
              ground: Array.from(this.selectedEffects.ground),
            },
            showPlayerSay: this.showPlayerSay,
          }
          
          // VFX aliases are now virtual - no longer saved to profile
          
          // Update profile via DataCoordinator - only save VFX settings
          try {
            await this.request('data:update-profile', {
              profileId: this.currentProfile,
              properties: {
                vertigoSettings: vertigoSettings
              },
              updateSource: 'VFXManagerService'
            })
            
            console.log(`[${this.componentName}] VFX settings saved to profile: ${this.currentProfile}`)
            
            // Emit VFX state change for CommandLibrary to regenerate virtual aliases
            this.emit('vfx:settings-changed', {
              selectedEffects: vertigoSettings.selectedEffects,
              showPlayerSay: this.showPlayerSay
            })
          } catch (error) {
            console.error(`[${this.componentName}] ERROR: Failed to update profile:`, error)
          }
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
      selectedEffects: {
        space: Array.from(this.selectedEffects.space),
        ground: Array.from(this.selectedEffects.ground)
      },
      showPlayerSay: this.showPlayerSay
      // REMOVED: currentProfile - not owned by VFXManagerService
      // This will be managed by DataCoordinator
    }
  }

} 