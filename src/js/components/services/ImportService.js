// ImportService.js - Service for importing keybind files, alias files, profiles, and backups
// Uses STOCommandParser for parsing, handles application logic
import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'
import STOFileHandler from '../../lib/fileHandler.js'
import { normalizeToStringArray, normalizeToOptimizedString } from '../../lib/commandDisplayAdapter.js'

export default class ImportService extends ComponentBase {
  constructor({ eventBus, storage, i18n, ui } = {}) {
    super(eventBus)
    this.componentName = 'ImportService'
    this.storage = storage
    this.i18n = i18n
    this.ui = ui
    this.fileHandler = new STOFileHandler()
  }

  setupRequestHandlers() {
    if (!this.eventBus) return

    // Import operations
    this.respond('import:keybind-file', ({ content, profileId, environment, options = {} }) => 
      this.importKeybindFile(content, profileId, environment, options))
    
    this.respond('import:alias-file', ({ content, profileId, options = {} }) => 
      this.importAliasFile(content, profileId, options))
    
    this.respond('import:profile-file', ({ content, options = {} }) => 
      this.importProfileFile(content, options))
    
    this.respond('import:project-file', ({ content, options = {} }) => 
      this.importProjectFile(content, options))
    
    this.respond('import:from-file', ({ file }) => 
      this.importFromFile(file))
    
    // Validation operations
    this.respond('import:validate-keybind-file', ({ content }) => 
      this.validateKeybindFile(content))
    
    this.respond('import:validate-profile-file', ({ content }) => 
      this.validateProfileFile(content))
  }

  // Parse keybind file content using STOFileHandler and STOCommandParser
  async parseKeybindFile(content) {
    const keybinds = {}
    const aliases = {}
    const errors = []
    
    if (!content || typeof content !== 'string') {
      return { keybinds, aliases, errors: ['Invalid file content'] }
    }

    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // Skip empty lines and comments
      if (!line || line.startsWith(';') || line.startsWith('#')) continue
      
      try {
        // Match keybind pattern: Key "command1 $$ command2"
        const keybindMatch = line.match(/^(\S+)\s+"([^"]+)"/)
        if (keybindMatch) {
          const [, key, commandString] = keybindMatch
          const parseResult = await this.request('parser:parse-command-string', { 
            commandString 
          })
          
          keybinds[key] = {
            raw: commandString,
            commands: parseResult.commands
          }
          continue
        }
        
        // Match alias pattern: alias aliasName "command sequence"
        const aliasMatch = line.match(/^alias\s+(\w+)\s+"([^"]+)"/)
        if (aliasMatch) {
          const [, aliasName, commandString] = aliasMatch
          aliases[aliasName] = {
            commands: commandString
          }
          continue
        }
        
        // Match alias pattern with bracket syntax: alias aliasName <& command sequence &>
        const bracketAliasMatch = line.match(/^alias\s+(\w+)\s+<&\s*(.+?)\s*&>/)
        if (bracketAliasMatch) {
          const [, aliasName, commandString] = bracketAliasMatch
          aliases[aliasName] = {
            commands: commandString
          }
          continue
        }
        
        // If line doesn't match any pattern, it might be an error
        if (line.length > 0) {
          errors.push(`Line ${i + 1}: Unrecognized format: ${line}`)
        }
      } catch (error) {
        errors.push(`Line ${i + 1}: Parse error: ${error.message}`)
      }
    }
    
    return { keybinds, aliases, errors }
  }

  // Import keybind file content
  async importKeybindFile(content, profileId, environment, options = {}) {
    try {
      const parsed = await this.parseKeybindFile(content)
      const keyCount = Object.keys(parsed.keybinds).length
      
      if (keyCount === 0) {
        this.showToast(this.i18n?.t?.('no_keybinds_found_in_file') || 'No keybinds found', 'warning')
        return { success: false, error: 'No keybinds found' }
      }

      if (!this.storage) {
        return { success: false, error: 'Storage not available' }
      }

      if (!profileId) {
        this.showToast(this.i18n?.t?.('no_profile_selected_for_import') || 'No profile selected', 'warning')
        return { success: false, error: 'No active profile' }
      }

      // Get or create profile
      let profile = this.storage.getProfile(profileId) || { 
        builds: { space: { keys: {} }, ground: { keys: {} } } 
      }

      // Ensure profile structure
      if (!profile.builds) profile.builds = { space: { keys: {} }, ground: { keys: {} } }
      const env = environment || 'space'
      if (!profile.builds[env]) profile.builds[env] = { keys: {} }
      
      const dest = profile.builds[env].keys

      // Apply keybinds with mirroring detection using STOCommandParser
      for (const [key, data] of Object.entries(parsed.keybinds)) {
        const commandString = data.raw
        
        // Check for mirroring pattern using STOCommandParser
        const parseResult = await this.request('parser:parse-command-string', { 
          commandString 
        })
        
        if (parseResult.isMirrored) {
          // Extract original commands from mirrored sequence
          const originalCommands = this.extractOriginalFromMirrored(commandString)
          const unmirroredParseResult = await this.request('parser:parse-command-string', { 
            commandString: originalCommands.join(' $$ ')
          })
          
          // Convert rich objects to canonical string array and optimise each command
          const rawArray = normalizeToStringArray(unmirroredParseResult.commands)
          const optimised = []
          for (const cmd of rawArray) {
            /* eslint-disable no-await-in-loop */
            const opt = await normalizeToOptimizedString(cmd, { eventBus: this.eventBus })
            /* eslint-enable no-await-in-loop */
            optimised.push(opt)
          }
          dest[key] = optimised
          
          // Set stabilization metadata
          if (!profile.keybindMetadata) profile.keybindMetadata = {}
          if (!profile.keybindMetadata[env]) profile.keybindMetadata[env] = {}
          if (!profile.keybindMetadata[env][key]) profile.keybindMetadata[env][key] = {}
          profile.keybindMetadata[env][key].stabilizeExecutionOrder = true
        } else {
          // Convert rich objects to canonical string array and optimise each command
          const rawArray = normalizeToStringArray(data.commands)
          const optimised = []
          for (const cmd of rawArray) {
            /* eslint-disable no-await-in-loop */
            const opt = await normalizeToOptimizedString(cmd, { eventBus: this.eventBus })
            /* eslint-enable no-await-in-loop */
            optimised.push(opt)
          }
          dest[key] = optimised
        }
      }

      // Save profile
      this.storage.saveProfile(profileId, profile)

      // Emit profile updated event (standard eventBus topic)
      this.emit('profile:updated', { profileId, profile, environment: env })

      // Set app modified state if available
      if (typeof globalThis !== 'undefined' && globalThis.app?.setModified) {
        globalThis.app.setModified(true)
      }

      // Show success notification
      const ignoredAliases = Object.keys(parsed.aliases).length
      const msg = ignoredAliases > 0
        ? this.i18n?.t?.('import_completed_with_ignored_aliases', { keyCount, ignoredAliases }) || 
          `Import completed: ${keyCount} keybinds (${ignoredAliases} aliases ignored - use Import Aliases)`
        : this.i18n?.t?.('import_completed', { keyCount }) || 
          `Import completed: ${keyCount} keybinds`
      
      this.showToast(msg, 'success')

      return { 
        success: true, 
        imported: { keys: keyCount }, 
        errors: parsed.errors 
      }

    } catch (error) {
      this.showToast(
        this.i18n?.t?.('failed_to_import_keybind_file', { error: error.message }) || 
        `Failed to import keybind file: ${error.message}`, 
        'error'
      )
      return { success: false, error: error.message }
    }
  }

  // Import alias file content
  async importAliasFile(content, profileId, options = {}) {
    try {
      const parsed = await this.parseKeybindFile(content)
      const aliasCount = Object.keys(parsed.aliases).length
      
      if (aliasCount === 0) {
        this.showToast(this.i18n?.t?.('no_aliases_found_in_file') || 'No aliases found', 'warning')
        return { success: false, error: 'No aliases found' }
      }

      if (!this.storage || !profileId) {
        this.showToast(this.i18n?.t?.('no_profile_selected_for_import') || 'No profile selected', 'warning')
        return { success: false, error: 'No active profile' }
      }

      // Get or create profile
      const profile = this.storage.getProfile(profileId) || { aliases: {} }
      if (!profile.aliases) profile.aliases = {}

      // Apply aliases using parsed data - convert to canonical string array format
      for (const [name, data] of Object.entries(parsed.aliases)) {
        // Split command string by $$ and convert to canonical string array
        const commandString = data.commands || ''
        const commandArray = commandString.trim() 
          ? commandString.trim().split(/\s*\$\$\s*/).filter(cmd => cmd.trim())
          : []
        
        // Optimise each command string
        const optimisedArray = []
        for (const cmd of commandArray) {
          /* eslint-disable no-await-in-loop */
          const opt = await normalizeToOptimizedString(cmd, { eventBus: this.eventBus })
          /* eslint-enable no-await-in-loop */
          optimisedArray.push(opt)
        }

        profile.aliases[name] = { 
          commands: optimisedArray, // Store as canonical string array (optimised)
          description: data.description || '' 
        }
      }

      // Save profile
      this.storage.saveProfile(profileId, profile)

      // Emit profile updated event so UIs refresh
      this.emit('profile:updated', { profileId, profile })

      // Set app modified state if available
      if (typeof globalThis !== 'undefined' && globalThis.app?.setModified) {
        globalThis.app.setModified(true)
      }

      // Show success notification
      this.showToast(
        this.i18n?.t?.('aliases_imported_successfully', { aliasCount }) || 
        `Successfully imported ${aliasCount} aliases`, 
        'success'
      )

      return { 
        success: true, 
        imported: { aliases: aliasCount }, 
        errors: parsed.errors 
      }

    } catch (error) {
      this.showToast(
        this.i18n?.t?.('failed_to_import_aliases', { error: error.message }) || 
        `Failed to import aliases: ${error.message}`, 
        'error'
      )
      return { success: false, error: error.message }
    }
  }

  // Import JSON profile file
  async importProfileFile(content, options = {}) {
    try {
      const profileData = JSON.parse(content)
      
      if (!profileData.name) {
        throw new Error('Invalid profile file: missing profile name')
      }

      // Create new profile or update existing one
      const profileId = options.profileId || this.generateProfileId(profileData.name)
      
      // Sanitize and validate profile data
      const sanitizedProfile = this.sanitizeProfileData(profileData)
      
      // Save profile
      this.storage.saveProfile(profileId, sanitizedProfile)
      
      // Set app modified state
      if (typeof globalThis !== 'undefined' && globalThis.app?.setModified) {
        globalThis.app.setModified(true)
      }

      this.showToast(
        this.i18n?.t?.('profile_imported_successfully', { profileName: sanitizedProfile.name }) || 
        `Profile "${sanitizedProfile.name}" imported successfully`, 
        'success'
      )

      return { 
        success: true, 
        profileId,
        profile: sanitizedProfile
      }

    } catch (error) {
      this.showToast(
        this.i18n?.t?.('failed_to_import_profile', { error: error.message }) || 
        `Failed to import profile: ${error.message}`, 
        'error'
      )
      return { success: false, error: error.message }
    }
  }

  // Import complete project file
  async importProjectFile(content, options = {}) {
    try {
      const projectData = JSON.parse(content)
      
      if (!projectData.data || !projectData.type === 'project') {
        throw new Error('Invalid project file format')
      }

      const importedData = projectData.data
      let importedProfiles = 0
      let importedSettings = false

      // Import profiles
      if (importedData.profiles) {
        for (const [profileId, profileData] of Object.entries(importedData.profiles)) {
          const sanitizedProfile = this.sanitizeProfileData(profileData)
          this.storage.saveProfile(profileId, sanitizedProfile)
          importedProfiles++
        }
      }

      // Import settings
      if (importedData.settings && options.importSettings !== false) {
        // Merge settings carefully to avoid overwriting critical app state
        const currentSettings = this.storage.getSettings() || {}
        const mergedSettings = {
          ...currentSettings,
          ...importedData.settings,
          // Preserve critical app state
          version: currentSettings.version || importedData.settings.version,
          firstRun: currentSettings.firstRun
        }
        this.storage.saveSettings(mergedSettings)
        importedSettings = true
      }

      // Set app modified state
      if (typeof globalThis !== 'undefined' && globalThis.app?.setModified) {
        globalThis.app.setModified(true)
      }

      this.showToast(
        this.i18n?.t?.('project_imported_successfully', { profileCount: importedProfiles }) || 
        `Project imported: ${importedProfiles} profiles${importedSettings ? ' and settings' : ''}`, 
        'success'
      )

      return { 
        success: true, 
        imported: { 
          profiles: importedProfiles, 
          settings: importedSettings 
        }
      }

    } catch (error) {
      this.showToast(
        this.i18n?.t?.('failed_to_import_project', { error: error.message }) || 
        `Failed to import project: ${error.message}`, 
        'error'
      )
      return { success: false, error: error.message }
    }
  }

  // Import from file (auto-detect format)
  async importFromFile(file) {
    const content = await file.text()
    const filename = file.name.toLowerCase()

    if (filename.endsWith('.json')) {
      // Try to determine if it's a profile or project file
      try {
        const data = JSON.parse(content)
        if (data.type === 'project') {
          return this.importProjectFile(content)
        } else if (data.name) {
          return this.importProfileFile(content)
        } else {
          throw new Error('Unknown JSON file format')
        }
      } catch (error) {
        throw new Error(this.i18n?.t?.('import_failed_invalid_json') || 'Invalid JSON file format')
      }
    } else if (filename.endsWith('.txt')) {
      // Determine the current profile for import
      const profileId = this.getCurrentProfileId()
      if (!profileId) {
        throw new Error(this.i18n?.t?.('no_profile_selected_for_import') || 'No profile selected for import')
      }
      
      return this.importKeybindFile(content, profileId)
    } else {
      throw new Error(this.i18n?.t?.('import_failed_unsupported_format') || 'Unsupported file format')
    }
  }

  // Validation methods
  async validateKeybindFile(content) {
    try {
      const parsed = await this.parseKeybindFile(content)
      return {
        valid: true,
        stats: {
          keybinds: Object.keys(parsed.keybinds).length,
          aliases: Object.keys(parsed.aliases).length,
          errors: parsed.errors.length
        },
        errors: parsed.errors
      }
    } catch (error) {
      return {
        valid: false,
        error: error.message
      }
    }
  }

  async validateProfileFile(content) {
    try {
      const profileData = JSON.parse(content)
      
      if (!profileData.name) {
        return { valid: false, error: 'Missing profile name' }
      }
      
      return {
        valid: true,
        profile: {
          name: profileData.name,
          mode: profileData.mode || profileData.currentEnvironment || 'space',
          hasKeybinds: !!(profileData.builds || profileData.keys || profileData.keybinds),
          hasAliases: !!(profileData.aliases && Object.keys(profileData.aliases).length > 0)
        }
      }
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid JSON format'
      }
    }
  }

  // Utility methods
  sanitizeProfileData(profileData) {
    // Create a clean profile structure
    const sanitized = {
      name: profileData.name,
      currentEnvironment: profileData.currentEnvironment || profileData.mode || 'space',
      builds: {
        space: { keys: {}, aliases: {} },
        ground: { keys: {}, aliases: {} }
      },
      aliases: {},
      keybindMetadata: {}
    }

    // Handle different profile formats
    if (profileData.builds) {
      // New format with builds
      if (profileData.builds.space) {
        sanitized.builds.space = {
          keys: profileData.builds.space.keys || {},
          aliases: profileData.builds.space.aliases || {}
        }
      }
      if (profileData.builds.ground) {
        sanitized.builds.ground = {
          keys: profileData.builds.ground.keys || {},
          aliases: profileData.builds.ground.aliases || {}
        }
      }
    } else if (profileData.keys || profileData.keybinds) {
      // Legacy format - put keys in space environment
      const keys = profileData.keys || profileData.keybinds || {}
      sanitized.builds.space.keys = keys
    }

    // Handle aliases
    if (profileData.aliases) {
      sanitized.aliases = profileData.aliases
    }

    // Handle metadata
    if (profileData.keybindMetadata) {
      sanitized.keybindMetadata = profileData.keybindMetadata
    }

    return sanitized
  }

  generateProfileId(name) {
    // Generate a unique profile ID based on name
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const timestamp = Date.now()
    return `${base}_${timestamp}`
  }

  getCurrentProfileId() {
    // Get current profile ID from storage or app state
    if (typeof globalThis !== 'undefined' && globalThis.app?.getCurrentProfileId) {
      return globalThis.app.getCurrentProfileId()
    }
    
    // Fallback: try to get from storage settings
    const settings = this.storage?.getSettings?.()
    return settings?.currentProfile
  }

  extractOriginalFromMirrored(commandString) {
    const commands = commandString.split(/\s*\$\$\s*/)
    if (commands.length < 3 || commands.length % 2 === 0) return commands
    
    const mid = Math.floor(commands.length / 2)
    return commands.slice(0, mid + 1)
  }

  showToast(message, type = 'info') {
    if (this.ui?.showToast) {
      this.ui.showToast(message, type)
    } else if (typeof window !== 'undefined' && window.stoUI?.showToast) {
      window.stoUI.showToast(message, type)
    }
  }

  onInit() {
    this.setupRequestHandlers()
    this.emit('import-service-ready')
  }
} 