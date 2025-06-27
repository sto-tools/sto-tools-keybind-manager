// FileOperationsService.js - Bridge service for STO file format operations
// The single component that interfaces with the external STOFileHandler library
import ComponentBase from '../ComponentBase.js'
import { respond } from '../../core/requestResponse.js'
import STOFileHandler from '../../lib/fileHandler.js'

export default class FileOperationsService extends ComponentBase {
  constructor({ eventBus, storage, i18n, ui } = {}) {
    super(eventBus)
    this.componentName = 'FileOperationsService'
    this.storage = storage
    this.i18n = i18n
    this.ui = ui
    
    // Single instance of the external STOFileHandler library
    this.handler = new STOFileHandler()
  }

  setupRequestHandlers() {
    if (!this.eventBus) return

    // Core parsing operations
    respond(this.eventBus, 'fileops:parse-keybind-file', ({ content }) => 
      this.handler.parseKeybindFile(content))
    
    respond(this.eventBus, 'fileops:parse-command-string', ({ commandString }) => 
      this.handler.parseCommandString(commandString))
    
    // Command mirroring operations
    respond(this.eventBus, 'fileops:generate-mirrored-commands', ({ commands }) => 
      this.handler.generateMirroredCommandString(commands))
    
    respond(this.eventBus, 'fileops:detect-unmirror-commands', ({ commandString }) => 
      this.handler.detectAndUnmirrorCommands(commandString))
    
    // File generation operations
    respond(this.eventBus, 'fileops:generate-keybind-file', ({ profile, options = {} }) => 
      this.handler.generateKeybindFile(profile, options))
    
    respond(this.eventBus, 'fileops:generate-keybind-section', ({ keys, options = {} }) => 
      this.handler.generateKeybindSection(keys, options))
    
    respond(this.eventBus, 'fileops:generate-alias-file', ({ aliases }) => 
      this.handler.generateAliasFile(aliases))
    
    // Utility operations
    respond(this.eventBus, 'fileops:compare-keys', ({ keyA, keyB }) => 
      this.handler.compareKeys(keyA, keyB))
    
    respond(this.eventBus, 'fileops:group-keys-by-type', ({ sortedKeys, keys }) => 
      this.handler.groupKeysByType(sortedKeys, keys))
    
    respond(this.eventBus, 'fileops:get-profile-stats', ({ profile }) => 
      this.handler.getProfileStats(profile))
    
    respond(this.eventBus, 'fileops:generate-filename', ({ profile, ext, environment }) => 
      this.handler.generateFileName(profile, ext, environment))
    
    // Application-specific import operations
    respond(this.eventBus, 'fileops:import-keybind-file', ({ content, profileId, environment, options = {} }) => 
      this.importKeybindFile(content, profileId, environment, options))
    
    respond(this.eventBus, 'fileops:import-alias-file', ({ content, profileId, options = {} }) => 
      this.importAliasFile(content, profileId, options))
    
    // Validation operations
    respond(this.eventBus, 'fileops:validate-keybind-file', ({ content }) => 
      this.validateKeybindFile(content))
    
    respond(this.eventBus, 'fileops:generate-command-preview', ({ key, commands, stabilize = false }) => 
      this.generateCommandPreview(key, commands, stabilize))
  }

  // Application-specific import operations that handle storage and UI concerns
  importKeybindFile(content, profileId, environment, options = {}) {
    try {
      // Use STOFileHandler for parsing
      const parsed = this.handler.parseKeybindFile(content)
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

      // Apply keybinds using parsed data
      Object.entries(parsed.keybinds).forEach(([key, data]) => {
        dest[key] = data.commands

        // Handle mirroring metadata
        if (data.isMirrored) {
          if (!profile.keybindMetadata) profile.keybindMetadata = {}
          if (!profile.keybindMetadata[env]) profile.keybindMetadata[env] = {}
          if (!profile.keybindMetadata[env][key]) profile.keybindMetadata[env][key] = {}
          profile.keybindMetadata[env][key].stabilizeExecutionOrder = true
        }
      })

      // Save profile
      this.storage.saveProfile(profileId, profile)

      // Emit profile updated event
      this.emit('profile-updated', { profileId, environment: env })

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

  importAliasFile(content, profileId, options = {}) {
    try {
      // Use STOFileHandler for parsing
      const parsed = this.handler.parseKeybindFile(content)
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
  validateKeybindFile(content) {
    try {
      const parsed = this.handler.parseKeybindFile(content)
      return {
        valid: true,
        stats: {
          keybinds: Object.keys(parsed.keybinds).length,
          aliases: Object.keys(parsed.aliases).length,
          errors: parsed.errors.length,
          comments: parsed.comments.length
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
      commandString = this.handler.generateMirroredCommandString(commands)
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