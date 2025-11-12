import ComponentBase from '../ComponentBase.js'
import { formatAliasLine } from '../../lib/STOFormatter.js'

export default class VFXManagerService extends ComponentBase {
  constructor(eventBus, i18n) {
    super(eventBus)
    this.componentName = 'VFXManagerService'
    this.i18n = i18n

    this.selectedEffects = {
      space: new Set(),
      ground: new Set(),
    }
    this.showPlayerSay = false

    this.isInitialized = false

    // Register request/response handlers for virtual VFX aliases
    if (this.eventBus) {
      this.respond('vfx:get-virtual-aliases', () => this.getVirtualVFXAliases())
    }
  }

  onInit() {
    if (this.isInitialized) {
      console.log(`[${this.componentName}] Already initialized`)
      return
    }

    this.setupEventListeners()
    this.isInitialized = true
    console.log(`[${this.componentName}] Initialized`)
  }

  // Handle initial state from other components
  handleInitialState(sender, state) {
    if (!state) return

    // Load VFX settings from DataCoordinator profile data
    if (sender === 'DataCoordinator' && state.currentProfileData) {
      this.cache.currentProfile = state.currentProfileData.id
      this.loadState(state.currentProfileData)
      console.log(
        `[${this.componentName}] Loaded initial VFX state from DataCoordinator via late-join`
      )
    }
  }

  setupEventListeners() {
    // Simple VFX Manager operations - no request/response overhead
    this.eventBus.on('vfx:show-modal', this.showModal.bind(this))
    this.eventBus.on('vfx:save-effects', this.saveEffects.bind(this))

    // Listen for profile changes to update current profile and reload VFX state
    this.addEventListener(
      'profile:switched',
      ({ profileId, profile, updateSource }) => {
        // Don't respond to profile updates we caused ourselves
        if (updateSource === 'VFXManagerService') {
          console.log(
            `[${this.componentName}] Ignoring profile:switched event from our own update`
          )
          return
        }

        this.cache.currentProfile = profileId
        if (profile) {
          this.loadState(profile)
          console.log(
            `[${this.componentName}] Loaded VFX state for switched profile: ${profileId}`
          )
        }
      }
    )

    // Listen for profile updates to refresh VFX state if current profile was updated
    this.addEventListener(
      'profile:updated',
      ({ profileId, profile, updateSource }) => {
        // Don't respond to profile updates we caused ourselves
        if (updateSource === 'VFXManagerService') {
          console.log(
            `[${this.componentName}] Ignoring profile:updated event from our own update`
          )
          return
        }

        if (profileId === this.cache.currentProfile && profile) {
          this.loadState(profile)
          console.log(
            `[${this.componentName}] Refreshed VFX state for updated profile: ${profileId}`
          )
        }
      }
    )
  }

  // Generate alias line for display (formatted for STO export only)
  generateAlias(environment) {
    const effects = Array.from(this.selectedEffects[environment])
    if (effects.length === 0)
      return this.i18n.t('no_effects_selected')

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
      console.warn(
        `[${this.componentName}] generateAliasCommand: selectedEffects not properly initialized for ${environment}`
      )
      console.warn(
        `[${this.componentName}] selectedEffects state:`,
        this.selectedEffects
      )
      return []
    }

    const effects = Array.from(this.selectedEffects[environment])
    console.log(
      `[${this.componentName}] generateAliasCommand(${environment}): found ${effects.length} effects:`,
      effects
    )

    if (effects.length === 0) {
      console.log(
        `[${this.componentName}] generateAliasCommand(${environment}): No effects selected, returning empty command`
      )
      return []
    }

    const commands = [`dynFxSetFXExlusionList ${effects.join(',')}`]

    if (this.showPlayerSay) {
      // Check translateGeneratedMessages preference - only translate if enabled
      const shouldTranslate = this.cache.preferences.translateGeneratedMessages
      const message = shouldTranslate
        ? this.i18n.t('vfx_suppression_loaded')
        : 'VFX Suppression Loaded'
      commands.push(`PlayerSay ${message}`)
    }

    console.log(
      `[${this.componentName}] generateAliasCommand(${environment}): generated commands:`,
      commands
    )
    return commands
  }

  // Generate just the command part (without alias definition) for storage
  generateCombinedAliasCommand(environments) {
    // Ensure environments is an array
    const envArray = Array.isArray(environments) ? environments : [environments]

    // Defensive check to ensure selectedEffects is properly initialized
    if (!this.selectedEffects) {
      console.warn(
        `[${this.componentName}] generateCombinedAliasCommand: selectedEffects not properly initialized, returning empty command`
      )
      return []
    }

    const allEffects = []

    for (const environment of envArray) {
      if (!this.selectedEffects[environment]) {
        console.warn(
          `[${this.componentName}] generateCombinedAliasCommand: selectedEffects not properly initialized for ${environment}, skipping`
        )
        continue
      }

      const environmentEffects = Array.from(this.selectedEffects[environment])
      if (environmentEffects.length === 0) continue

      allEffects.push(...environmentEffects)
    }

    if (allEffects.length === 0) return []

    const commands = [`dynFxSetFXExlusionList ${allEffects.join(',')}`]

    if (this.showPlayerSay) {
      // Check translateGeneratedMessages preference - only translate if enabled
      const shouldTranslate = this.cache.preferences.translateGeneratedMessages
      const message = shouldTranslate
        ? this.i18n.t('vfx_suppression_loaded')
        : 'VFX Suppression Loaded'
      commands.push(`PlayerSay ${message}`)
    }

    return commands
  }

  // Toggle an effect
  toggleEffect(environment, effectName) {
    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }

    if (!effectName) {
      throw new Error(
        `Invalid effect: ${effectName} for environment: ${environment}`
      )
    }

    if (this.selectedEffects[environment].has(effectName)) {
      this.selectedEffects[environment].delete(effectName)
    } else {
      this.selectedEffects[environment].add(effectName)
    }
  }

  // Set all effects for an environment
  selectAllEffects(environment) {
    // Explicitly access VFX_EFFECTS from window object for clarity
    if (!window.VFX_EFFECTS[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }

    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`)
    }

    window.VFX_EFFECTS[environment].forEach((effect) => {
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

  // Load state from current profile
  loadState(profile) {
    // Ensure selectedEffects is properly initialized
    if (!this.selectedEffects) {
      this.selectedEffects = {
        space: new Set(),
        ground: new Set(),
      }
      console.log(
        `[${this.componentName}] loadState: Initialized selectedEffects object`
      )
    }

    if (profile && profile.vertigoSettings) {
      const settings = profile.vertigoSettings
      console.log(
        `[${this.componentName}] loadState: Found vertigoSettings in profile:`,
        settings
      )

      // Restore selected effects
      this.selectedEffects.space = new Set(
        settings.selectedEffects?.space || []
      )
      this.selectedEffects.ground = new Set(
        settings.selectedEffects?.ground || []
      )

      console.log(
        `[${this.componentName}] loadState: Loaded space effects:`,
        Array.from(this.selectedEffects.space)
      )
      console.log(
        `[${this.componentName}] loadState: Loaded ground effects:`,
        Array.from(this.selectedEffects.ground)
      )

      // Restore PlayerSay setting
      this.showPlayerSay = settings.showPlayerSay || false
    } else {
      console.log(
        `[${this.componentName}] loadState: No vertigoSettings found in profile, resetting to defaults`
      )
      console.log(
        `[${this.componentName}] loadState: Profile structure:`,
        profile
      )
      // Reset to defaults if no saved state
      this.selectedEffects.space.clear()
      this.selectedEffects.ground.clear()
      this.showPlayerSay = false
    }

    // VFX state loaded - emit event so CommandLibrary can update virtual aliases
    this.emit('vfx:settings-changed', {
      selectedEffects: {
        space: Array.from(this.selectedEffects.space),
        ground: Array.from(this.selectedEffects.ground),
      },
      showPlayerSay: this.showPlayerSay,
    })
  }

  // Get virtual VFX aliases for CommandLibrary display
  // These are NOT stored in profile - only generated dynamically
  getVirtualVFXAliases() {
    const virtualAliases = {}

    // Generate environment-specific aliases
    const environments = ['space', 'ground']
    environments.forEach((environment) => {
      const commands = this.generateAliasCommand(environment)
      // Always create virtual aliases, even when empty (for export consistency)
      const aliasName = `dynFxSetFXExclusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
      virtualAliases[aliasName] = {
        commands,
        description: this.i18n.t('vfx_suppression_for_environment', { environment }),
        type: 'vfx-alias',
        virtual: true, // Mark as virtual
      }
    })

    // Generate combined alias (always create, even when empty)
    const combinedCommands = this.generateCombinedAliasCommand(environments)
    virtualAliases.dynFxSetFXExclusionList_Combined = {
      commands: combinedCommands,
      description: this.i18n.t('vfx_suppression_for_all_environments'),
      type: 'vfx-alias',
      virtual: true, // Mark as virtual
    }

    return virtualAliases
  }

  async showModal() {
    console.log(`[${this.componentName}] Showing VFX modal`)

    // Load state from current profile via DataCoordinator
    if (this.cache.currentProfile) {
      try {
        const profiles = await this.request('data:get-all-profiles')
        const profile = profiles[this.cache.currentProfile]
        if (profile) {
          this.loadState(profile)
          console.log(
            `[${this.componentName}] Loaded VFX state from profile via DataCoordinator`
          )
        }
      } catch (error) {
        console.error(
          `[${this.componentName}] Failed to load profile state:`,
          error
        )
      }
    }

    // Emit event to populate and show the modal
    this.emit('vfx:modal-populate', {
      vfxManager: this, // Pass the service itself as the vfxManager
    })
  }

  async saveEffects() {
    console.log(`[${this.componentName}] Saving VFX effects`)

    // Defensive check to ensure selectedEffects is properly initialized
    if (
      !this.selectedEffects ||
      !this.selectedEffects.space ||
      !this.selectedEffects.ground
    ) {
      console.error(
        `[${this.componentName}] ERROR: selectedEffects not properly initialized:`,
        this.selectedEffects
      )
      return
    }

    console.log(
      `[${this.componentName}] Current selected effects:`,
      this.selectedEffects
    )
    console.log(`[${this.componentName}] Show player say:`, this.showPlayerSay)
    console.log(
      `[${this.componentName}] Current profile:`,
      this.cache.currentProfile
    )

    // Save to current profile via DataCoordinator
    if (this.cache.currentProfile) {
      try {
        // Get current profile to update
        const profiles = await this.request('data:get-all-profiles')
        const profile = profiles[this.cache.currentProfile]

        if (profile) {
          console.log(
            `[${this.componentName}] Retrieved profile via DataCoordinator`
          )

          // Save VFX state
          const vertigoSettings = {
            selectedEffects: {
              space: Array.from(this.selectedEffects.space),
              ground: Array.from(this.selectedEffects.ground),
            },
            showPlayerSay: this.showPlayerSay,
          }

          // Update profile via DataCoordinator - save VFX settings
          try {
            await this.request('data:update-profile', {
              profileId: this.cache.currentProfile,
              properties: {
                vertigoSettings,
              },
              updateSource: 'VFXManagerService',
            })

            console.log(
              `[${this.componentName}] VFX settings saved to profile: ${this.cache.currentProfile}`
            )

            // Emit VFX state change for CommandLibrary to regenerate virtual aliases
            this.emit('vfx:settings-changed', {
              selectedEffects: vertigoSettings.selectedEffects,
              showPlayerSay: this.showPlayerSay,
            })
          } catch (error) {
            console.error(
              `[${this.componentName}] ERROR: Failed to update profile:`,
              error
            )
          }
        } else {
          console.error(
            `[${this.componentName}] ERROR: Could not retrieve profile: ${this.cache.currentProfile}`
          )
        }
      } catch (error) {
        console.error(
          `[${this.componentName}] ERROR: Failed to save VFX effects:`,
          error
        )
      }
    } else {
      console.error(`[${this.componentName}] ERROR: No current profile set`)
    }

    this.emit('modal:hide', { modalId: 'vertigoModal' })
  }

  // Get current state for late-join support
  getCurrentState() {
    return {
      selectedEffects: {
        space: Array.from(this.selectedEffects.space),
        ground: Array.from(this.selectedEffects.ground),
      },
      showPlayerSay: this.showPlayerSay,
    }
  }
}
