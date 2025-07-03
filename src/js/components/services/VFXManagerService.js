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
        // Note: autoGenerateAliases is called from loadState()
      }
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
        // Note: autoGenerateAliases is called from loadState()
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
        // Note: autoGenerateAliases is called from loadState()
      }
    })
  }

  // ========================================================================
  // VFX Manager Core Methods (migrated from VertigoManager)
  // ========================================================================

  // Generate alias line for display (formatted for STO)
  generateAlias(environment) {
    const effects = Array.from(this.selectedEffects[environment])
    if (effects.length === 0) return 'No effects selected'

    const aliasName = `dynFxSetFXExclusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
    let command = `dynFxExcludeFX ${effects.join(',')}`
    if (this.showPlayerSay) {
      command += ' $$ PlayerSay VFX Suppression Loaded'
    }

    return formatAliasLine(aliasName, { commands: command }).trim()
  }

  // Generate just the command part (without alias definition) for storage
  generateAliasCommand(environment) {
    // Defensive check to ensure selectedEffects is properly initialized
    if (!this.selectedEffects || !this.selectedEffects[environment]) {
      console.warn(`[${this.componentName}] generateAliasCommand: selectedEffects not properly initialized for ${environment}, returning empty command`)
      return ''
    }

    const effects = Array.from(this.selectedEffects[environment])
    if (effects.length === 0) return ''

    let command = `dynFxExcludeFX ${effects.join(',')}`

    if (this.showPlayerSay) {
      command += ' $$ PlayerSay VFX Suppression Loaded'
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
    
    // Auto-generate VFX aliases if there are selected effects
    this.autoGenerateAliases()
  }

  /**
   * Automatically generate VFX aliases if there are selected effects
   * This ensures VFX aliases appear in Command Library and Alias Browser at startup
   */
  async autoGenerateAliases() {
    // Only auto-generate if we have selected effects and a current profile
    if (!this.currentProfile) {
      console.log(`[${this.componentName}] autoGenerateAliases: No current profile, skipping`)
      return
    }
    
    // Defensive check to ensure selectedEffects is properly initialized
    if (!this.selectedEffects) {
      console.error(`[${this.componentName}] autoGenerateAliases: selectedEffects not initialized, skipping`)
      return
    }
    
    // Check each environment individually and only process those that are properly initialized
    const environments = []
    if (this.selectedEffects.space && this.selectedEffects.space.size > 0) {
      environments.push('space')
    }
    if (this.selectedEffects.ground && this.selectedEffects.ground.size > 0) {
      environments.push('ground')
    }
    
    if (environments.length === 0) {
      console.log(`[${this.componentName}] autoGenerateAliases: No effects selected in any environment, skipping`)
      return
    }
    
    console.log(`[${this.componentName}] autoGenerateAliases: Generating VFX aliases automatically for environments: ${environments.join(', ')}`)
    
    try {
      // Get current profile to update
      const profiles = await this.request('data:get-all-profiles')
      const profile = profiles[this.currentProfile]
      
      if (profile) {
        console.log(`[${this.componentName}] autoGenerateAliases: Retrieved profile via DataCoordinator`)
        
        // Generate and save VFX aliases
        console.log(`[${this.componentName}] Generating VFX aliases`)
        
        // Collect existing VFX aliases to delete
        const existingVfxAliases = []
        const currentAliases = profile.aliases || {}
        Object.keys(currentAliases).forEach(aliasName => {
          if (aliasName.startsWith('dynFxSetFXExclusionList_') || aliasName === 'dynFxSetFXExclusionList') {
            existingVfxAliases.push(aliasName)
          }
        })
        
        // Generate new VFX aliases
        const newVfxAliases = {}
        const generatedAliases = []
        environments.forEach(environment => {
          const aliasCommand = this.generateAliasCommand(environment)
          
          if (aliasCommand) {
            const aliasName = `dynFxSetFXExclusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
            newVfxAliases[aliasName] = {
              commands: aliasCommand,
              description: `VFX suppression for ${environment} environment`,
              type: 'vfx-alias'
            }
            generatedAliases.push(aliasName)
            console.log(`[${this.componentName}] autoGenerateAliases: Generated VFX alias: ${aliasName}`)
          }
        })
        
        // Create master alias that executes both space and ground aliases if any were generated
        if (generatedAliases.length > 0) {
          const masterAliasCommand = generatedAliases.join(' $$ ')
          newVfxAliases['dynFxSetFXExclusionList'] = {
            commands: masterAliasCommand,
            description: 'VFX suppression for all environments',
            type: 'vfx-alias'
          }
          console.log(`[${this.componentName}] autoGenerateAliases: Generated master VFX alias: dynFxSetFXExclusionList = ${masterAliasCommand}`)
        }
        
        // Update profile via DataCoordinator using explicit operations API
        try {
          const updateOperations = {
            profileId: this.currentProfile,
            updateSource: 'VFXManagerService'
          }
          
          // Add delete operation if there are existing VFX aliases to remove
          if (existingVfxAliases.length > 0) {
            updateOperations.delete = {
              aliases: existingVfxAliases
            }
          }
          
          // Add new VFX aliases if any were generated
          if (Object.keys(newVfxAliases).length > 0) {
            updateOperations.add = {
              aliases: newVfxAliases
            }
          }
          
          await this.request('data:update-profile', updateOperations)
          
          console.log(`[${this.componentName}] autoGenerateAliases: VFX aliases saved to profile: ${this.currentProfile}`)
          
          // Emit aliases-changed event so Command Library and Alias Browser update
          this.emit('aliases-changed', { aliases: { ...currentAliases, ...newVfxAliases } })
        } catch (error) {
          console.error(`[${this.componentName}] autoGenerateAliases: Failed to update profile:`, error)
        }
      } else {
        console.error(`[${this.componentName}] autoGenerateAliases: Could not retrieve profile: ${this.currentProfile}`)
      }
    } catch (error) {
      console.error(`[${this.componentName}] autoGenerateAliases: Failed to auto-generate VFX aliases:`, error)
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
          
          // Generate and save VFX aliases
          console.log(`[${this.componentName}] Generating VFX aliases`)
          
          // Collect existing VFX aliases to delete
          const existingVfxAliases = []
          const currentAliases = profile.aliases || {}
          Object.keys(currentAliases).forEach(aliasName => {
            if (aliasName.startsWith('dynFxSetFXExclusionList_') || aliasName === 'dynFxSetFXExclusionList') {
              existingVfxAliases.push(aliasName)
            }
          })
          
          // Generate new VFX aliases
          const newVfxAliases = {}
          const generatedAliases = []
          const environments = ['space', 'ground']
          for (let i = 0; i < environments.length; i++) {
            const environment = environments[i]
            console.log(`[${this.componentName}] Processing environment: ${environment}`)
            console.log(`[${this.componentName}] Selected effects for ${environment}:`, this.selectedEffects[environment] ? Array.from(this.selectedEffects[environment]) : [])
            
            const aliasCommand = this.generateAliasCommand(environment)
            console.log(`[${this.componentName}] Generated command for ${environment}: ${aliasCommand}`)
            
            if (aliasCommand) {
              const aliasName = `dynFxSetFXExclusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
              newVfxAliases[aliasName] = {
                commands: aliasCommand,
                description: `VFX suppression for ${environment} environment`,
                type: 'vfx-alias'
              }
              generatedAliases.push(aliasName)
              console.log(`[${this.componentName}] Generated VFX alias: ${aliasName} = ${aliasCommand}`)
            } else {
              console.log(`[${this.componentName}] No command generated for ${environment} (no effects selected)`)
            }
          }
          
          // Create master alias that executes both space and ground aliases if any were generated
          if (generatedAliases.length > 0) {
            const masterAliasCommand = generatedAliases.join(' $$ ')
            newVfxAliases['dynFxSetFXExclusionList'] = {
              commands: masterAliasCommand,
              description: 'VFX suppression for all environments',
              type: 'vfx-alias'
            }
            console.log(`[${this.componentName}] Generated master VFX alias: dynFxSetFXExclusionList = ${masterAliasCommand}`)
          }
          
          // Update profile via DataCoordinator using explicit operations API
          try {
            const updateOperations = {
              profileId: this.currentProfile,
              properties: {
                vertigoSettings: vertigoSettings
              },
              updateSource: 'VFXManagerService'
            }
            
            // Add delete operation if there are existing VFX aliases to remove
            if (existingVfxAliases.length > 0) {
              updateOperations.delete = {
                aliases: existingVfxAliases
              }
            }
            
            // Add new VFX aliases if any were generated
            if (Object.keys(newVfxAliases).length > 0) {
              updateOperations.add = {
                aliases: newVfxAliases
              }
            }
            
            await this.request('data:update-profile', updateOperations)
            
            console.log(`[${this.componentName}] VFX effects and aliases saved to profile: ${this.currentProfile}`)
            
            // Update alias browser to show new aliases
            this.emit('aliases-changed', { aliases: { ...currentAliases, ...newVfxAliases } })
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
      currentProfile: this.currentProfile,
      selectedEffects: {
        space: Array.from(this.selectedEffects.space),
        ground: Array.from(this.selectedEffects.ground)
      },
      showPlayerSay: this.showPlayerSay
    }
  }

} 