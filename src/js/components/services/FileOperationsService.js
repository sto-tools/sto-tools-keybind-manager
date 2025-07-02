// FileOperationsService.js - Service for STO file format operations
// Uses STOCommandParser for all command parsing, handles file I/O and application logic
import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'

export default class FileOperationsService extends ComponentBase {
  constructor({ eventBus, storage, i18n, ui } = {}) {
    super(eventBus)
    this.componentName = 'FileOperationsService'
    this.storage = storage
    this.i18n = i18n
    this.ui = ui
  }

  setupRequestHandlers() {
    if (!this.eventBus) return

    // Core parsing operations - Use STOCommandParser directly
    this.respond('fileops:parse-keybind-file', ({ content }) => 
      this.parseKeybindFile(content))
    
    // Application-specific import operations
    this.respond('fileops:import-keybind-file', ({ content, profileId, environment, options = {} }) => 
      this.importKeybindFile(content, profileId, environment, options))
    
    this.respond('fileops:import-alias-file', ({ content, profileId, options = {} }) => 
      this.importAliasFile(content, profileId, options))
    
    // Validation operations
    this.respond('fileops:validate-keybind-file', ({ content }) => 
      this.validateKeybindFile(content))
    
    this.respond('fileops:generate-command-preview', ({ key, commands, stabilize = false }) => 
      this.generateCommandPreview(key, commands, stabilize))

    // Utility: generate mirrored command string for execution order stabilization
    this.respond('fileops:generate-mirrored-commands', async ({ commands = [] }) => {
      // Accept either an array of command objects or plain strings.
      if (!Array.isArray(commands) || commands.length === 0) return ''

      // Normalise to command objects first
      const cmdObjects = commands.map((c) => {
        if (typeof c === 'string') return { command: c }
        if (c && typeof c.command === 'string') return c
        return null
      }).filter(Boolean)

      if (cmdObjects.length <= 1) {
        const normalized = await this.normalizeCommandsForDisplay(cmdObjects)
        return normalized.join(' $$ ')
      }

      // Apply normalization before mirroring
      const normalizedStrings = await this.normalizeCommandsForDisplay(cmdObjects)
      const mirrored = [...normalizedStrings, ...normalizedStrings.slice(0, -1).reverse()]
      return mirrored.join(' $$ ')
    })
  }

  // Parse keybind file content into structured data
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
      if (!line || line.startsWith('//')) continue
      
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

  // Application-specific import operations that handle storage and UI concerns
  async importKeybindFile(content, profileId, environment, options = {}) {
    try {
      // Use new parseKeybindFile method with STOCommandParser
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
          
          dest[key] = unmirroredParseResult.commands
          
          // Set stabilization metadata
          if (!profile.keybindMetadata) profile.keybindMetadata = {}
          if (!profile.keybindMetadata[env]) profile.keybindMetadata[env] = {}
          if (!profile.keybindMetadata[env][key]) profile.keybindMetadata[env][key] = {}
          profile.keybindMetadata[env][key].stabilizeExecutionOrder = true
        } else {
          // Use original commands as-is
          dest[key] = data.commands
        }
      }

      // Save profile
      this.storage.saveProfile(profileId, profile)

      // Emit profile updated event
      this.emit('profile-updated', { profileId, environment: env })

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

  // Extract original commands from a mirrored command sequence
  extractOriginalFromMirrored(commandString) {
    const commands = commandString.split(/\s*\$\$\s*/)
    if (commands.length < 3 || commands.length % 2 === 0) return commands
    
    const mid = Math.floor(commands.length / 2)
    return commands.slice(0, mid + 1)
  }

  /**
   * Normalize commands for display by applying tray execution normalization
   */
  async normalizeCommandsForDisplay(commands) {
    const normalizedCommands = []

    for (const cmd of commands) {
      try {
        // Parse the command to check if it's a tray execution command
        const parseResult = await this.request('parser:parse-command-string', {
          commandString: cmd.command,
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
              if (active === 1) {
                // Use + form
                const baseCommand = params.baseCommand || 'TrayExecByTrayWithBackup'
                const commandType = baseCommand.replace(/^\+/, '') // Remove + if present
                normalizedCommands.push(`+${commandType} ${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`)
              } else {
                // Use explicit form
                const baseCommand = params.baseCommand || 'TrayExecByTrayWithBackup'
                const commandType = baseCommand.replace(/^\+/, '') // Remove + if present
                normalizedCommands.push(`${commandType} ${active} ${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`)
              }
            } else {
              // Handle regular TrayExecByTray normalization
              if (active === 1) {
                // Use + form
                const baseCommand = params.baseCommand || 'TrayExecByTray'
                const commandType = baseCommand.replace(/^\+/, '') // Remove + if present
                normalizedCommands.push(`+${commandType} ${params.tray} ${params.slot}`)
              } else {
                // Use explicit form
                const baseCommand = params.baseCommand || 'TrayExecByTray'
                const commandType = baseCommand.replace(/^\+/, '') // Remove + if present
                normalizedCommands.push(`${commandType} ${active} ${params.tray} ${params.slot}`)
              }
            }
          } else {
            // Not a tray execution command, use original
            normalizedCommands.push(cmd.command)
          }
        } else {
          // Failed to parse, use original
          normalizedCommands.push(cmd.command)
        }
      } catch (error) {
        console.warn('[FileOperationsService] Failed to normalize command for display:', cmd.command, error)
        // Fallback to original command on error
        normalizedCommands.push(cmd.command)
      }
    }

    return normalizedCommands
  }

  async importAliasFile(content, profileId, options = {}) {
    try {
      // Use new parseKeybindFile method
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

      // Apply aliases using parsed data
      Object.entries(parsed.aliases).forEach(([name, data]) => {
        profile.aliases[name] = { 
          commands: data.commands, 
          description: data.description || '' 
        }
      })

      // Save profile
      this.storage.saveProfile(profileId, profile)

      // Emit profile updated event
      this.emit('profile-updated', { profileId })

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

  // Utility methods for application layer
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

  // Command preview generation
  generateCommandPreview(key, commands, stabilize = false) {
    if (!Array.isArray(commands) || commands.length === 0) {
      return `${key} ""`
    }

    let commandString
    if (stabilize && commands.length > 1) {
      commandString = this.legacyHandler.generateMirroredCommandString(commands)
    } else {
      commandString = commands.map(c => c.command || c).join(' $$ ')
    }
    
    return `${key} "${commandString}"`
  }

  // Helper method for toast notifications
  showToast(message, type = 'info') {
    if (this.ui?.showToast) {
      this.ui.showToast(message, type)
    } else if (typeof window !== 'undefined' && window.stoUI?.showToast) {
      window.stoUI.showToast(message, type)
    }
  }

  onInit() {
    // Set up request handlers now that eventBus is properly initialized
    this.setupRequestHandlers()
    
    // Service is ready - emit initialization complete
    this.emit('fileops-ready')
  }
} 