import ComponentBase from '../ComponentBase.js'
import { normalizeToString, normalizeToStringArray } from '../../lib/commandDisplayAdapter.js'
import { formatAliasLine } from '../../lib/STOFormatter.js'

/**
 * CommandService – the authoritative service for creating, deleting and
 * rearranging commands in a profile.  It owns no UI concerns whatsoever.  A
 * higher-level feature (CommandLibraryService / future templates) can call
 * this service to persist changes and broadcast events.
 */
export default class CommandService extends ComponentBase {
  constructor({ storage, eventBus, i18n, profileService = null, modalManager = null }) {
    super(eventBus)
    this.componentName = 'CommandService'
    this.i18n = i18n

    // Initialize cache for DataCoordinator integration
    this.initializeCache()

    // Track active bindset (default to primary)
    this.activeBindset = 'Primary Bindset'

    // Store detach functions for cleanup
    this._responseDetachFunctions = []

    // Register Request/Response endpoints for editing commands
    if (this.eventBus) {
      this._responseDetachFunctions.push(
        this.respond('command:add', async ({ command, key, position, bindset }) => 
          this.addCommand(key, command, bindset || position)),
        this.respond('command:edit', async ({ key, index, updatedCommand, bindset }) => 
          this.editCommand(key, index, updatedCommand, bindset)),
        this.respond('command:validate', ({ command }) => 
          this.validateCommand(command)),
        this.respond('command:delete', async ({ key, index, bindset }) =>
          this.deleteCommand(key, index, bindset)),
        this.respond('command:move', async ({ key, fromIndex, toIndex, bindset }) =>
          this.moveCommand(key, fromIndex, toIndex, bindset)),
        this.respond('command:get-for-selected-key', this.getCommandsForSelectedKey.bind(this)),
        this.respond('command:get-empty-state-info', async () => await this.getEmptyStateInfo()),
        this.respond('command:check-environment-compatibility', ({ command, environment }) => 
          this.isCommandCompatible(command, environment)
        ),
        this.respond('command:get-import-sources', ({ environment, currentKey }) => 
          this.getImportSources(environment, currentKey)
        ),
        this.respond('command:import-from-source', ({ sourceValue, targetKey, clearDestination, currentEnvironment }) => 
          this.importFromSource(sourceValue, targetKey, clearDestination, currentEnvironment)
        )
      )
    }
  }

  // Lifecycle
  async init() {
    super.init() // ComponentBase handles late-join automatically
    this.setupEventListeners()
  }

  onInit () {
    // Legacy method - now handled by init()
  }

  // Convenience getter
  getCurrentProfileId () {
    return this.cache.currentProfile
  }

  // Profile helpers now use cached data
  getCurrentProfile () {
    if (!this.cache.currentProfile) return null
    return this.getCurrentBuild(this.cache.profile)
  }

  getCurrentBuild (profile) {
    if (!profile) return null

    // Use cached builds data
    const builds = this.cache.builds || {
      space: { keys: {} },
      ground: { keys: {} }
    }

    if (!builds[this.cache.currentEnvironment]) {
      builds[this.cache.currentEnvironment] = { keys: {} }
    }

    if (!builds[this.cache.currentEnvironment].keys) {
      builds[this.cache.currentEnvironment].keys = {}
    }

    return {
      ...profile,
      keys: builds[this.cache.currentEnvironment].keys,
      aliases: this.cache.aliases || {},
    }
  }

  // Core command operations now use DataCoordinator
  async addCommand (key, command, bindset = null) {
    const profile = this.getCurrentProfile()
    if (!profile) {
      this.ui?.showToast?.(this.i18n.t('no_valid_profile'), 'error')
      return false
    }

    // Determine if we should use a bindset (when bindset is specified and not in alias mode)
    const useBindset = (bindset && bindset !== 'Primary Bindset' && this.cache.currentEnvironment !== 'alias')

    // Get current alias commands (handle both legacy string and new array format)
    const currentAlias = this.cache.aliases && this.cache.aliases[key]
    let currentCommands = []
    if (currentAlias && Array.isArray(currentAlias.commands)) {
      currentCommands = [...currentAlias.commands]
    }
    
    // Normalize commands to canonical strings
    const commandsToAdd = Array.isArray(command) 
      ? normalizeToStringArray(command)
      : [normalizeToString(command)]
    
    // Filter out empty commands
    const validCommands = commandsToAdd.filter(cmd => cmd.length > 0)
    if (validCommands.length === 0) {
      console.warn('CommandService: No valid commands to add')
      return false
    }
    
    // Add normalized commands to current list  
    currentCommands.push(...validCommands)

    // ----- Key-bind -----
    let currentKeys = []
    if (useBindset) {
      currentKeys = (profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]?.keys?.[key]) || []
    } else {
      currentKeys = this.cache.keys[key] || []
    }
    
    // Use the same normalized commands for keybinds
    const newKeys = [...currentKeys, ...validCommands]
    
    try {
      // Build explicit operations object
      const ops = {}
      if (this.cache.currentEnvironment === 'alias') {
        console.log('[CommandService] addCommand: alias')
        const aliasExists = !!profile.aliases?.[key]
        if (aliasExists) {
          ops.modify = {
            aliases: {
              [key]: {
                ...(profile.aliases[key] || {}),
                commands: currentCommands // Use array format
              }
            }
          }
        } else {
          ops.add = {
            aliases: {
              [key]: {
                commands: currentCommands,
                description: '',
                type: 'alias'
              }
            }
          }
        }
      } else if (!useBindset) {
        const keyExists = !!profile.builds?.[this.cache.currentEnvironment]?.keys?.[key]
        if (keyExists) {
          ops.modify = {
            builds: {
              [this.cache.currentEnvironment]: {
                keys: { [key]: newKeys }
              }
            }
          }
        } else {
          ops.add = {
            builds: {
              [this.cache.currentEnvironment]: {
                keys: { [key]: newKeys }
              }
            }
          }
        }
      } else {
        // Bindset path
        const bindsetExists = !!profile.bindsets?.[bindset]
        const envExists = !!profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]
        const bsSection = profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]?.keys || {}
        // If bindset or environment does not exist, use add; otherwise always use modify
        if (!bindsetExists || !envExists) {
          ops.add = {
            bindsets: {
              [bindset]: {
                [this.cache.currentEnvironment]: {
                  keys: { [key]: newKeys }
                }
              }
            }
          }
        } else {
          ops.modify = {
            bindsets: {
              [bindset]: {
                [this.cache.currentEnvironment]: {
                  keys: { [key]: newKeys }
                }
              }
            }
          }
        }
        console.log('[CommandService] addCommand: bindset update', {
          bindset,
          environment: this.cache.currentEnvironment,
          key,
          bindsetExists,
          envExists,
          ops,
          currentKeys: bsSection,
          profileBindsets: profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]?.keys
        })
      }

      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        ...ops
      })
      
      this.emit('command-added', { key, command })
      return true
    } catch (error) {
      console.error('Failed to add command:', error)
      this.ui?.showToast?.('Failed to add command', 'error')
      return false
    }
  }

  // Delete command
  async deleteCommand (key, index, bindset = null) {
    // Determine if we should use a bindset (when bindset is specified and not in alias mode)
    const useBindset = (bindset && bindset !== 'Primary Bindset' && this.cache.currentEnvironment !== 'alias')

    const profile = this.getCurrentProfile()
    if (!profile) return false

    if (!key || index === undefined) return false

    const isAliasContext = this.cache.currentEnvironment === 'alias' ||
      (this.cache.aliases && Object.prototype.hasOwnProperty.call(this.cache.aliases, key))

    let payload = null
    let updatedCommands = null // capture latest commands for event emission

    if (isAliasContext) {
      const aliasObj = this.cache.aliases[key]
      if (!aliasObj || !Array.isArray(aliasObj.commands)) return false

      const commandsArr = [...aliasObj.commands]

      if (index < 0 || index >= commandsArr.length) return false

      commandsArr.splice(index, 1)

      // Store for later emission
      updatedCommands = [...commandsArr]

      // Always use modify to preserve empty aliases - don't auto-delete when commands become empty
      payload = {
        modify: {
          aliases: {
            [key]: {
              ...aliasObj,
              commands: commandsArr // Preserve empty array instead of deleting alias
            }
          }
        }
      }
    } else {
      // Fetch commands from appropriate location depending on active bindset
      const keyCommands = useBindset
        ? (profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]?.keys?.[key] || [])
        : (this.cache.keys[key] || [])

      if (!keyCommands[index]) return false

      const newKeyCommands = [...keyCommands]
      newKeyCommands.splice(index, 1)

      // Store for later emission
      updatedCommands = [...newKeyCommands]

      // Build explicit operations
      if (useBindset) {
        payload = {
          modify: {
            bindsets: {
              [bindset]: {
                [this.cache.currentEnvironment]: {
                  keys: { [key]: newKeyCommands }
                }
              }
            }
          }
        }
      } else {
        // Always use modify to preserve empty keys - don't auto-delete when commands become empty
        payload = {
          modify: {
            builds: {
              [this.cache.currentEnvironment]: {
                keys: { [key]: newKeyCommands } // Preserve empty array instead of deleting key
              }
            }
          }
        }
      }
    }

    if (!payload) return false

    try {
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        ...payload
      })
      
      // Emit event with the commands we just computed
      this.emit('command-deleted', { key, index, commands: updatedCommands })
      return true
    } catch (error) {
      console.error('Failed to delete command:', error)
      this.ui?.showToast?.('Failed to delete command', 'error')
      return false
    }
  }

  // Move command
  async moveCommand (key, fromIndex, toIndex, bindset = null) {
    const useBindset = (bindset && bindset !== 'Primary Bindset' && this.cache.currentEnvironment !== 'alias')

    const profile = this.getCurrentProfile()
    if (!profile) return false

    let payload = null

    if (this.cache.currentEnvironment === 'alias') {
      const aliasObj = this.cache.aliases && this.cache.aliases[key]
      if (!aliasObj || !Array.isArray(aliasObj.commands)) return false

      const commandsArr = [...aliasObj.commands]

      if (
        fromIndex < 0 || fromIndex >= commandsArr.length ||
        toIndex < 0 || toIndex >= commandsArr.length
      ) return false

      const [moved] = commandsArr.splice(fromIndex, 1)
      commandsArr.splice(toIndex, 0, moved)

      payload = {
        modify: {
          aliases: {
            [key]: {
              ...aliasObj,
              commands: commandsArr // Keep as array in new format
            }
          }
        }
      }
    } else {
      const keyCmds = useBindset
        ? (profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]?.keys?.[key] || [])
        : (this.cache.keys[key] || [])

      if (
        fromIndex < 0 || fromIndex >= keyCmds.length ||
        toIndex < 0 || toIndex >= keyCmds.length
      ) return false

      const newCmds = [...keyCmds]
      const [moved] = newCmds.splice(fromIndex, 1)
      newCmds.splice(toIndex, 0, moved)

      if (useBindset) {
        payload = {
          modify: {
            bindsets: {
              [bindset]: {
                [this.cache.currentEnvironment]: {
                  keys: { [key]: newCmds }
                }
              }
            }
          }
        }
      } else {
        payload = {
          modify: {
            builds: {
              [this.cache.currentEnvironment]: {
                keys: { [key]: newCmds }
              }
            }
          }
        }
      }
    }

    try {
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        ...payload
      })
      
      const updatedCmds = await this.fetchCommandsForKey(key, bindset)
      this.emit('command-moved', { key, fromIndex, toIndex, commands: updatedCmds })
      return true
    } catch (error) {
      console.error('Failed to move command:', error)
      return false
    }
  }

  // Edit/Update a command at a specific index
  async editCommand (key, index, updatedCommand, bindset = null) {
    console.log('[CommandService] editCommand called with:', { key, index, updatedCommand })
    
    if (!key || index === undefined || !updatedCommand) {
      console.warn('CommandService: Cannot edit command - missing key, index, or updated command')
      return false
    }

    const useBindset = (bindset && bindset !== 'Primary Bindset' && this.cache.currentEnvironment !== 'alias')

    const profile = this.getCurrentProfile()
    if (!profile) {
      this.ui?.showToast?.('No valid profile', 'error')
      return false
    }

    let payload = null

    if (this.cache.currentEnvironment === 'alias') {
      const aliasObj = this.cache.aliases[key]
      if (!aliasObj || !Array.isArray(aliasObj.commands)) return false

      const commandsArr = [...aliasObj.commands]

      if (index < 0 || index >= commandsArr.length) return false

      // Normalize updated command to string
      const commandString = normalizeToString(updatedCommand)
      commandsArr[index] = commandString

      payload = {
        modify: {
          aliases: {
            [key]: {
              ...aliasObj,
              commands: commandsArr // Keep as array in new format
            }
          }
        }
      }
    } else {
      const keyCmds = useBindset
        ? (profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]?.keys?.[key] || [])
        : (this.cache.keys[key] || [])

      if (index < 0 || index >= keyCmds.length) return false

      const newCmds = [...keyCmds]
      // Normalize updated command to string for keybinds too
      newCmds[index] = normalizeToString(updatedCommand)

      if (useBindset) {
        payload = {
          modify: {
            bindsets: {
              [bindset]: {
                [this.cache.currentEnvironment]: {
                  keys: { [key]: newCmds }
                }
              }
            }
          }
        }
      } else {
        payload = {
          modify: {
            builds: {
              [this.cache.currentEnvironment]: {
                keys: { [key]: newCmds }
              }
            }
          }
        }
      }
    }

    console.log('[CommandService] editCommand updates:', payload)
    
    try {
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        ...payload
      })
      
      console.log('[CommandService] editCommand completed successfully')
      const updatedCmds = await this.fetchCommandsForKey(key, bindset)
      this.emit('command-edited', { key, index, updatedCommand, commands: updatedCmds })
      return true
    } catch (error) {
      console.error('Failed to edit command:', error)
      this.ui?.showToast?.('Failed to update command', 'error')
      return false
    }
  }

  generateCommandId () {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Set up event listeners for DataCoordinator integration
  setupEventListeners() {
    // Listen for command addition events from UI components (broadcast pattern)
    this.addEventListener('command:add', async (data) => {
      console.log('[CommandService] command:add received:', data)
      const { command, key, bindset } = data
      console.log('[CommandService] extracted:', { command, key, bindset })
      const result = await this.addCommand(key, command, bindset)
      console.log('[CommandService] addCommand result:', result)
    })

    // Listen for command edit events from UI components (broadcast pattern)
    this.addEventListener('command:edit', async (data) => {
      console.log('[CommandService] command:edit received:', data)
      const { key, index, updatedCommand, bindset = null } = data
      console.log('[CommandService] extracted:', { key, index, updatedCommand, bindset })
      const result = await this.editCommand(key, index, updatedCommand, bindset)
      console.log('[CommandService] editCommand result:', result)
    })

    // Listen for active bindset changes from BindsetSelectorService
    this.addEventListener('bindset-selector:active-changed', ({ bindset }) => {
      console.log('[CommandService] bindset-selector:active-changed received:', bindset)
      this.activeBindset = bindset || 'Primary Bindset'
    })

    // Listen for key selection changes - reset to Primary Bindset when new key selected
    this.addEventListener('key-selected', ({ key, name }) => {
      const selectedKey = key || name
      console.log('[CommandService] key-selected received:', selectedKey)
      if (selectedKey && this.activeBindset !== 'Primary Bindset') {
        console.log('[CommandService] Resetting active bindset to Primary Bindset for new key selection')
        this.activeBindset = 'Primary Bindset'
      }
    })
  }

  // Update local cache from profile data
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    this.cache.profile = profile
    
    // Update builds structure
    this.cache.builds = profile.builds || {
      space: { keys: {} },
      ground: { keys: {} }
    }
    
    // Update aliases
    this.cache.aliases = profile.aliases || {}
    
    // Update keys for current environment – prefer flattened profile.keys if present
    if (profile.keys) {
      this.cache.keys = profile.keys
    } else {
      this.cache.keys = this.cache.builds[this.cache.currentEnvironment]?.keys || {}
    }
  }

  // Return all commands associated with a key for the current environment.
  // Alias environment returns the command array (now normalized to string[]).
  getCommandsForKey (key) {
    if (this.cache.currentEnvironment === 'alias') {
      const alias = this.cache.aliases && this.cache.aliases[key]
      if (!alias || !Array.isArray(alias.commands)) return []
      
      return Array.isArray(alias.commands) ? alias.commands : []
    }
    return this.cache.keys[key] || []
  }

  // Placeholder command validator – always returns true.
  // Can be expanded later with proper validation logic.
  validateCommand (command) {
    if (!command) return { valid: false, reason: 'empty' }
    return { valid: true }
  }

  // Cleanup method to detach all request/response handlers
  destroy() {
    
    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach(detach => {
        if (typeof detach === 'function') {
          detach()
        }
      })
      this._responseDetachFunctions = []
    }
    
    // Call parent destroy if it exists
    if (super.destroy && typeof super.destroy === 'function') {
      super.destroy()
    }
  }

  // Helper: fetch latest commands for a key taking bindset into account
  async fetchCommandsForKey (key, bindset = null) {
    try {
      if (this.cache.currentEnvironment === 'alias') {
        return this.getCommandsForSelectedKey({ key })
      }
      const useBindset = (bindset && bindset !== 'Primary Bindset')
      if (useBindset) {
        const cmds = await this.request('bindset:get-key-commands', {
          bindset,
          environment: this.cache.currentEnvironment,
          key
        })
        return Array.isArray(cmds) ? cmds : []
      }
      return await this.request('data:get-key-commands', {
        environment: this.cache.currentEnvironment,
        key
      })
    } catch {
      return []
    }
  }

  // Get empty state information
  async getEmptyStateInfo() {
    // Use cached selection state from ComponentBase (SelectionService broadcasts)
    const selectedKey = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
    
    console.log('[CommandService] getEmptyStateInfo DEBUG:', {
      currentEnvironment: this.cache.currentEnvironment,
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
      resolvedSelectedKey: selectedKey
    })

    if (!selectedKey) {
      const selectText = this.cache.currentEnvironment === 'alias' ? 
        this.i18n?.t?.('select_an_alias_to_edit') || 'Select an alias to edit' : 
        this.i18n?.t?.('select_a_key_to_edit') || 'Select a key to edit'
      const previewText = this.cache.currentEnvironment === 'alias' ? 
        this.i18n?.t?.('select_an_alias_to_see_the_generated_command') || 'Select an alias to see the generated command' : 
        this.i18n?.t?.('select_a_key_to_see_the_generated_command') || 'Select a key to see the generated command'
      
      const emptyIcon = this.cache.currentEnvironment === 'alias' ? 'fas fa-mask' : 'fas fa-keyboard'
      const emptyTitle = this.cache.currentEnvironment === 'alias' ? 
        this.i18n?.t?.('no_alias_selected') || 'No Alias Selected' : 
        this.i18n?.t?.('no_key_selected') || 'No Key Selected'
      const emptyDesc = this.cache.currentEnvironment === 'alias' ? 
        this.i18n?.t?.('select_alias_from_left_panel') || 'Select an alias from the left panel to view and edit its command chain.' : 
        this.i18n?.t?.('select_key_from_left_panel') || 'Select a key from the left panel to view and edit its command chain.'
      
        return {
        title: selectText,
        preview: previewText,
        icon: emptyIcon,
        emptyTitle,
        emptyDesc,
        commandCount: '0'
      }
    }

    const commands = await this.getCommandsForSelectedKey()
    const chainType = this.cache.currentEnvironment === 'alias' ? 'Alias Chain' : 'Command Chain'

    if (commands.length === 0) {
      const emptyMessage = this.cache.currentEnvironment === 'alias' ? 
        `${this.i18n?.t?.('click_add_command_to_start_building_your_alias_chain') || 'Click "Add Command" to start building your alias chain for'} ${selectedKey}.` :
        `${this.i18n?.t?.('click_add_command_to_start_building_your_command_chain') || 'Click "Add Command" to start building your command chain for'} ${selectedKey}.`
      
      return {
        title: `${chainType} for ${selectedKey}`,
        preview: await this.getCommandChainPreview(),
        icon: 'fas fa-plus-circle',
        emptyTitle: this.i18n?.t?.('no_commands') || 'No Commands',
        emptyDesc: emptyMessage,
        commandCount: '0'
      }
    }

    return {
      title: `${chainType} for ${selectedKey}`,
      preview: await this.getCommandChainPreview(),
      commandCount: commands.length.toString()
    }
  }

  // Get commands for the currently selected key/alias using cached data
  getCommandsForSelectedKey(params = {}) {
    console.log('[CommandService] getCommandsForSelectedKey called with params:', params)
    console.log('[CommandService] Current state:', {
      currentEnvironment: this.cache.currentEnvironment,
      selectedKey: this.cache.selectedKey,  // From ComponentBase
      selectedAlias: this.cache.selectedAlias,  // From ComponentBase
      cache: this.cache
    })
    
    // Initialize cache if it doesn't exist (fallback safety)
    if (!this.cache) {
      console.warn('[CommandService] Cache not initialized, initializing empty cache')
      this.cache = {}
    }
    
    // Use explicit parameters if provided, otherwise use cached selection state
    const environment = params.environment || this.cache.currentEnvironment || 'space'
    let selectedKey = params.key
    
    if (!selectedKey) {
      // Use cached selection state from ComponentBase (SelectionService broadcasts)
      selectedKey = environment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
      if (!selectedKey) {
        console.warn('[CommandService] No key/alias selected for environment:', environment)
        return []
      }
    }
    
    if (!selectedKey) return []

    const profile = this.cache.profile
    if (!profile) {
      console.warn('[CommandService] No profile in cache')
      return []
    }

    if (environment === 'alias') {
      const alias = profile.aliases && profile.aliases[selectedKey]
      if (!alias || !Array.isArray(alias.commands)) return []
      // Return shallow copy to avoid external mutation
      return [...alias.commands]
    }

    // Keybinds path – check if we're using a non-primary bindset
    if (this.activeBindset && this.activeBindset !== 'Primary Bindset') {
      // Get commands from the active bindset
      const bindsetCommands = profile.bindsets?.[this.activeBindset]?.[environment]?.keys?.[selectedKey]
      console.log('[CommandService] Using active bindset:', this.activeBindset, 'commands:', bindsetCommands)
      return Array.isArray(bindsetCommands) ? [...bindsetCommands] : []
    }
    
    // Primary bindset path – keys arrays are already canonical string[]
    const keyCommands = this.cache.keys && this.cache.keys[selectedKey] ? this.cache.keys[selectedKey] : []
    return Array.isArray(keyCommands) ? [...keyCommands] : []
  }

  // Get command chain preview text
  async getCommandChainPreview() {
    // Use cached selection state from ComponentBase (SelectionService broadcasts)
    const selectedKey = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
    
    console.log('[CommandService] getCommandChainPreview DEBUG:', {
      currentEnvironment: this.cache.currentEnvironment,
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
      resolvedSelectedKey: selectedKey
    })

    if (!selectedKey) {
      const selectText = this.cache.currentEnvironment === 'alias' ? 
        this.i18n.t('select_an_alias_to_see_the_generated_command') : 
        this.i18n.t('select_a_key_to_see_the_generated_command')
      return selectText
    }

    const commands = await this.getCommandsForSelectedKey()
    
    if (commands.length === 0) {
      if (this.cache.currentEnvironment === 'alias') {
        return formatAliasLine(selectedKey, { commands: '' }).trim()
      } else {
        return `${selectedKey} ""`
      }
    }

    if (this.cache.currentEnvironment === 'alias') {
      // For aliases, mirror when metadata requests it
      const profile = this.getCurrentProfile()
      console.log('[CommandLibraryService] alias : getCommandChainPreview: profile', profile)
      let shouldStabilize = false
      if (profile && profile.aliasMetadata && profile.aliasMetadata[selectedKey] && profile.aliasMetadata[selectedKey].stabilizeExecutionOrder) {
        shouldStabilize = true
      }

      let commandString
      if (shouldStabilize && commands.length > 1) {
        commandString = await this.generateMirroredCommandString(commands)
      } else {
        // Normalize commands before joining
        const normalizedCommands = await this.normalizeCommandsForDisplay(commands)
        commandString = normalizedCommands.join(' $$ ')
      }

      return formatAliasLine(selectedKey, { commands: commandString }).trim()
    } else {
      // For keybinds, determine mirroring based on per-key metadata
      const profile = this.getCurrentProfile()
      console.log('[CommandLibraryService] keybind : getCommandChainPreview: profile', profile)
      let shouldStabilize = false
      if (profile && profile.keybindMetadata && profile.keybindMetadata[this.cache.currentEnvironment] &&
          profile.keybindMetadata[this.cache.currentEnvironment][selectedKey] &&
          profile.keybindMetadata[this.cache.currentEnvironment][selectedKey].stabilizeExecutionOrder) {
        shouldStabilize = true
      }

      let commandString
      if (shouldStabilize && commands.length > 1) {
        commandString = await this.generateMirroredCommandString(commands)
      } else {
        // Normalize commands before joining
        const normalizedCommands = await this.normalizeCommandsForDisplay(commands)
        commandString = normalizedCommands.join(' $$ ')
      }

      return `${selectedKey} "${commandString}"`
    }
  }

  // Normalize commands for display by applying tray execution normalization
  async normalizeCommandsForDisplay(commands) {
    const normalizedCommands = []

    for (const cmd of commands) {
      // Support both canonical string and rich object formats
      const cmdStr = typeof cmd === 'string' ? cmd : (cmd && cmd.command) || ''
      if (!cmdStr) {
        continue
      }
      try {
        // Parse the command to check if it's a tray execution command
        const parseResult = await this.request('parser:parse-command-string', {
          commandString: cmdStr,
          options: { generateDisplayText: false }
        })

        if (parseResult.commands && parseResult.commands[0]) {
          const parsedCmd = parseResult.commands[0]
          // Check if it's a tray execution command that needs normalization
          if (parsedCmd.signature &&
              (parsedCmd.signature.includes('TrayExecByTray') ||
                parsedCmd.signature.includes('TrayExecByTrayWithBackup')) &&
              parsedCmd.parameters) {
            const params = parsedCmd.parameters
            const active = params.active !== undefined ? params.active : 1
            if (parsedCmd.signature.includes('TrayExecByTrayWithBackup')) {
              // Handle TrayExecByTrayWithBackup normalization
              const baseCommand = params.baseCommand || 'TrayExecByTrayWithBackup'
              const commandType = baseCommand.replace(/^\+/, '')
              if (active === 1) {
                normalizedCommands.push(`+${commandType} ${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`)
              } else {
                normalizedCommands.push(`${commandType} ${active} ${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`)
              }
            } else {
              // Regular TrayExecByTray normalization
              const baseCommand = params.baseCommand || 'TrayExecByTray'
              const commandType = baseCommand.replace(/^\+/, '')
              if (active === 1) {
                normalizedCommands.push(`+${commandType} ${params.tray} ${params.slot}`)
              } else {
                normalizedCommands.push(`${commandType} ${active} ${params.tray} ${params.slot}`)
              }
            }
          } else {
            normalizedCommands.push(cmdStr)
          }
        } else {
          normalizedCommands.push(cmdStr)
        }
      } catch (error) {
        console.warn('[CommandLibraryService] Failed to normalize command for display:', cmdStr, error)
        normalizedCommands.push(cmdStr)
      }
    }

    return normalizedCommands
  }

  // Generate mirrored command string for stabilization
  async generateMirroredCommandString(commands) {
    return await this.request('fileops:generate-mirrored-commands', { commands })
  }

  // Check if a command is compatible with the target environment
  async isCommandCompatible(commandName, targetEnvironment) {
    if (!commandName) {
      console.warn('isCommandCompatible called with undefined commandName')
      return true // treat as universal so we don't block import pipeline
    }

    try {
      const commandData = await this.request('data:find-command-by-name', { command: commandName })
      
      // Check command environment compatibility
      
      if (!commandData || !commandData.environment) {
        // Command has no environment restriction, so it's universal
        // Command has no environment restriction (universal)
        return true
      }
      
      // Command has environment restriction - check compatibility
      const compatible = commandData.environment === targetEnvironment
      // Check environment compatibility
      return compatible
    } catch (error) {
      // If we can't determine compatibility, assume it's universal
      console.warn(`CommandService: Could not check compatibility for command "${commandName}":`, error)
      return true
    }
  }

  // Get available import sources for command import
  async getImportSources(currentEnvironment, currentKey) {
    const sources = []
    
    try {
      if (currentEnvironment === 'alias') {
        // In alias mode, show keys from all environments and other aliases
        
        // Add space keys
        const spaceKeys = await this.request('data:get-keys', { environment: 'space' }) || {}
        Object.keys(spaceKeys).forEach(key => {
          if (Object.keys(spaceKeys[key] || {}).length > 0) { // Only show keys with commands
            sources.push({
              value: `space:${key}`,
              label: `Space: ${key}`,
              type: 'key'
            })
          }
        })
        
        // Add ground keys
        const groundKeys = await this.request('data:get-keys', { environment: 'ground' }) || {}
        Object.keys(groundKeys).forEach(key => {
          if (Object.keys(groundKeys[key] || {}).length > 0) { // Only show keys with commands
            sources.push({
              value: `ground:${key}`,
              label: `Ground: ${key}`,
              type: 'key'
            })
          }
        })
        
        // Add other aliases
        const aliases = await this.request('alias:get-all') || {}
        Object.keys(aliases).forEach(aliasName => {
          if (aliasName !== currentKey && aliases[aliasName]?.commands) { // Exclude current alias and empty aliases
            sources.push({
              value: `alias:${aliasName}`,
              label: `Alias: ${aliasName}`,
              type: 'alias'
            })
          }
        })
      } else {
        // In key mode, show keys from both environments and aliases
        
        // Add space keys  
        const spaceKeys = await this.request('data:get-keys', { environment: 'space' }) || {}
        Object.keys(spaceKeys).forEach(key => {
          const isCurrentKey = (currentEnvironment === 'space' && key === currentKey)
          if (!isCurrentKey && Object.keys(spaceKeys[key] || {}).length > 0) { // Exclude current key and empty keys
            sources.push({
              value: `space:${key}`,
              label: `Space: ${key}`,
              type: 'key'
            })
          }
        })
        
        // Add ground keys
        const groundKeys = await this.request('data:get-keys', { environment: 'ground' }) || {}
        Object.keys(groundKeys).forEach(key => {
          const isCurrentKey = (currentEnvironment === 'ground' && key === currentKey)
          if (!isCurrentKey && Object.keys(groundKeys[key] || {}).length > 0) { // Exclude current key and empty keys
            sources.push({
              value: `ground:${key}`,
              label: `Ground: ${key}`,
              type: 'key'
            })
          }
        })
        
        // Add aliases
        const aliases = await this.request('alias:get-all') || {}
        Object.keys(aliases).forEach(aliasName => {
          if (aliases[aliasName]?.commands) { // Only show aliases with commands
            sources.push({
              value: `alias:${aliasName}`,
              label: `Alias: ${aliasName}`,
              type: 'alias'
            })
          }
        })
      }
      
      return sources
    } catch (error) {
      console.error('CommandService: Failed to get import sources:', error)
      return []
    }
  }

  // Import commands from a source to a target key
  async importFromSource(sourceValue, targetKey, clearDestination, currentEnvironment) {
    if (!sourceValue || !targetKey) {
      throw new Error('Source and target are required for import')
    }
    
    try {
      // Parse source value (format: "environment:key" or "alias:aliasName")
      const [sourceType, sourceName] = sourceValue.split(':')
      
      let sourceCommands = []
      
      if (sourceType === 'alias') {
        // Get commands from alias
        const aliases = await this.request('alias:get-all') || {}
        const alias = aliases[sourceName]
        if (alias && alias.commands) {
          // Handle both legacy string format and new canonical array format
          let commandString
          if (Array.isArray(alias.commands)) {
            // New canonical array format - join with $$
            commandString = alias.commands.join(' $$ ')
          } else {
            // Legacy string format
            commandString = alias.commands
          }

          if (commandString && commandString.trim()) {
            const result = await this.request('parser:parse-command-string', { 
              commandString 
            })
            sourceCommands = result.commands || []
          }
        }
      } else {
        // Get commands from key
        sourceCommands = await this.request('data:get-key-commands', { 
          environment: sourceType, 
          key: sourceName 
        }) || []
      }
      
      if (sourceCommands.length === 0) {
        throw new Error('Source has no commands to import')
      }
      
      // Check for cross-environment import and filter commands
      let filteredCommands = sourceCommands
      let droppedCount = 0
      
      if (currentEnvironment !== 'alias' && sourceType !== 'alias') {
        // Key-to-key import: check for cross-environment issues
        if (sourceType !== currentEnvironment) {
          // Cross-environment import: filter out environment-specific commands
          // Cross-environment import detected, filtering commands
          
          const originalCount = sourceCommands.length
          const compatibilityPromises = sourceCommands.map(async (cmdString) => {
            const isCompatible = await this.isCommandCompatible(cmdString, currentEnvironment)
            return { command: cmdString, isCompatible }
          })
          
          const compatibilityResults = await Promise.all(compatibilityPromises)
          // Compatibility check completed

          // Drop incompatible commands
          filteredCommands = compatibilityResults
            .filter(result => result.isCompatible)
            .map(result => result.command)

          droppedCount = originalCount - filteredCommands.length
          // Command filtering completed
        }
      }
      
      if (filteredCommands.length === 0) {
        throw new Error('No compatible commands found for import')
      }
      
      // Perform the import
      if (clearDestination) {
        // Clear existing commands first
        await this.request('data:clear-key-commands', { 
          environment: currentEnvironment, 
          key: targetKey 
        })
      }
      
      // Add the filtered commands
      for (const command of filteredCommands) {
        await this.addCommand(targetKey, command)
      }
      
      return {
        success: true,
        importedCount: filteredCommands.length,
        droppedCount: droppedCount,
        sourceType: sourceType,
        sourceName: sourceName
      }
      
    } catch (error) {
      console.error('CommandService: Failed to import from source:', error)
      throw error
    }
  }
} 