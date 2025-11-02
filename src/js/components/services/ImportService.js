// ImportService.js - Service for importing keybind files, alias files, and projects
// Uses STOCommandParser for parsing, handles application logic
import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'
import STOFileHandler from '../../lib/fileHandler.js'
import { normalizeToStringArray, normalizeToOptimizedString } from '../../lib/commandDisplayAdapter.js'
import { decodeKeyFromImport } from '../../lib/keyEncoding.js'

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
    
        
    this.respond('import:project-file', ({ content, options = {} }) => 
      this.importProjectFile(content, options))
    
    this.respond('import:from-file', ({ file }) => 
      this.importFromFile(file))
    
    // Validation operations
    this.respond('import:validate-keybind-file', ({ content }) =>
      this.validateKeybindFile(content))
  }

  // Parse keybind file content using STOFileHandler and STOCommandParser
  async parseKeybindFile(content) {
    const keybinds = {}
    const errors = []
    
    if (!content || typeof content !== 'string') {
      return { keybinds, errors: ['Invalid file content'] }
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
          const [, rawKey, commandString] = keybindMatch
          // Decode the key from import format (e.g., 0x29 becomes `)
          const key = decodeKeyFromImport(rawKey)
          const parseResult = await this.request('parser:parse-command-string', { 
            commandString 
          })
          
          keybinds[key] = {
            raw: commandString,
            commands: parseResult.commands
          }
          continue
        }
        
        // Skip alias lines - they should be imported via Import Aliases, not Import Keybinds
        if (line.startsWith('alias ')) {
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
    
    return { keybinds, errors }
  }

  // Parse alias file content
  async parseAliasFile(content) {
    const aliases = {}
    const errors = []

    if (!content || typeof content !== 'string') {
      return { aliases, errors: ['Invalid file content'] }
    }

    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      // Skip empty lines and comments
      if (!line || line.startsWith(';') || line.startsWith('#')) continue

      try {
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

        // Skip keybind lines - they should be imported via Import Keybinds, not Import Aliases
        if (line.match(/^[A-Z]\d+\s+"[^"]+"/)) {
          continue
        }

        // If line doesn't match any pattern, it might be an error
        if (line.length > 0) {
          errors.push(`Line ${i + 1}: Unrecognized alias format: ${line}`)
        }
      } catch (error) {
        errors.push(`Line ${i + 1}: Parse error: ${error.message}`)
      }
    }

    return { aliases, errors }
  }

  // Import keybind file content
  async importKeybindFile(content, profileId, environment, options = {}) {
    try {
      const parsed = await this.parseKeybindFile(content)
      const keyCount = Object.keys(parsed.keybinds).length
      
      if (keyCount === 0) {
        this.emit('toast:show', {
          message: this.i18n?.t?.('no_keybinds_found_in_file'),
          type: 'warning'
        })
        return { success: false, error: 'No keybinds found' }
      }

      if (!this.storage) {
        return { success: false, error: 'Storage not available' }
      }

      if (!profileId) {
        this.emit('toast:show', {
          message: this.i18n?.t?.('no_profile_selected_for_import'),
          type: 'warning'
        })
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
      const msg = this.i18n?.t?.('import_completed_keybinds', { count: keyCount })
      
      this.emit('toast:show', { message: msg, type: 'success' })

      return { 
        success: true, 
        imported: { keys: keyCount }, 
        errors: parsed.errors 
      }

    } catch (error) {
      this.emit('toast:show', {
        message: this.i18n?.t?.('failed_to_import_keybind_file', { error: error.message }),
        type: 'error'
      })
      return { success: false, error: error.message }
    }
  }

  // Import alias file content
  async importAliasFile(content, profileId, options = {}) {
    try {
      const parsed = await this.parseAliasFile(content)
      // Count only non-generated aliases (exclude sto_kb_ prefix)
      const importableAliases = Object.keys(parsed.aliases).filter(name => !name.startsWith('sto_kb_'))
      const aliasCount = importableAliases.length
      
      if (aliasCount === 0) {
        this.emit('toast:show', {
          message: this.i18n?.t?.('no_aliases_found_in_file'),
          type: 'warning'
        })
        return { success: false, error: 'No aliases found' }
      }

      if (!this.storage || !profileId) {
        this.emit('toast:show', {
          message: this.i18n?.t?.('no_profile_selected_for_import'),
          type: 'warning'
        })
        return { success: false, error: 'No active profile' }
      }

      // Get or create profile
      const profile = this.storage.getProfile(profileId) || { aliases: {} }
      if (!profile.aliases) profile.aliases = {}

      // Apply aliases using parsed data - convert to canonical string array format
      // Skip generated keybind/bindset aliases (those with sto_kb_ prefix)
      for (const [name, data] of Object.entries(parsed.aliases)) {
        if (name.startsWith('sto_kb_')) {
          console.log(`[ImportService] Skipping generated alias: ${name}`)
          continue
        }
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
      this.emit('toast:show', {
        message: this.i18n?.t?.('import_completed_aliases', { count: aliasCount }),
        type: 'success'
      })

      return { 
        success: true, 
        imported: { aliases: aliasCount }, 
        errors: parsed.errors 
      }

    } catch (error) {
      this.emit('toast:show', {
        message: this.i18n?.t?.('failed_to_import_aliases', { error: error.message }),
        type: 'error'
      })
      return { success: false, error: error.message }
    }
  }

  // Import complete project file
  async importProjectFile(content, options = {}) {
    try {
      const projectData = JSON.parse(content)
      
      if (!projectData.data || projectData.type !== 'project') {
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

      this.emit('toast:show', {
        message: this.i18n?.t?.('project_imported_successfully', { profileCount: importedProfiles }),
        type: 'success'
      })

      return { 
        success: true, 
        imported: { 
          profiles: importedProfiles, 
          settings: importedSettings 
        }
      }

    } catch (error) {
      this.emit('toast:show', {
        message: this.i18n?.t?.('failed_to_import_project', { error: error.message }),
        type: 'error'
      })
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
        throw new Error(this.i18n?.t?.('import_failed_invalid_json'))
      }
    } else if (filename.endsWith('.txt')) {
      // Determine the current profile for import
      const profileId = this.getCurrentProfileId()
      if (!profileId) {
        throw new Error(this.i18n?.t?.('no_profile_selected_for_import'))
      }
      
      return this.importKeybindFile(content, profileId)
    } else {
      throw new Error(this.i18n?.t?.('import_failed_unsupported_format'))
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

  
  onInit() {
    this.setupRequestHandlers()
    this.emit('import-service-ready')
  }
} 