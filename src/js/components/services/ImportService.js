// ImportService.js - Service for importing keybind files, alias files, and projects
// Uses STOCommandParser for parsing, handles application logic
import ComponentBase from '../ComponentBase.js'
import {
  normalizeToStringArray,
  normalizeToOptimizedString,
} from '../../lib/commandDisplayAdapter.js'
import { decodeKeyFromImport } from '../../lib/keyEncoding.js'
import KBFParser from '../../lib/KBFParser.js'

export default class ImportService extends ComponentBase {
  constructor({ eventBus, storage, i18n, ui } = {}) {
    super(eventBus)
    this.componentName = 'ImportService'
    this.storage = storage
    this.i18n = i18n
    this.ui = ui
    this.kbfParser = new KBFParser({ eventBus })
  }

  setupRequestHandlers() {
    if (!this.eventBus) return

    // Import operations
    this.respond(
      'import:keybind-file',
      ({ content, profileId, environment, options = {} }) =>
        this.importKeybindFile(content, profileId, environment, options)
    )

    this.respond('import:alias-file', ({ content, profileId, options = {} }) =>
      this.importAliasFile(content, profileId, options)
    )

    this.respond(
      'import:kbf-file',
      ({ content, profileId, environment, options = {}, configuration }) =>
        this.importKBFFile(content, profileId, environment, options, configuration)
    )

    this.respond('import:project-file', ({ content, options = {} }) =>
      this.importProjectFile(content, options)
    )

    this.respond('import:from-file', ({ file }) => this.importFromFile(file))

    // Validation operations
    this.respond('import:validate-keybind-file', ({ content }) =>
      this.validateKeybindFile(content)
    )

    this.respond('import:validate-kbf-file', ({ content }) =>
      this.validateKBFFile(content)
    )

    this.respond('parse-kbf-file', ({ content, environment }) =>
      this.parseKBFFile(content, environment)
    )
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
          const parseResult = await this.request(
            'parser:parse-command-string',
            {
              commandString,
            }
          )

          keybinds[key] = {
            raw: commandString,
            commands: parseResult.commands,
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
            commands: commandString,
          }
          continue
        }

        // Match alias pattern with bracket syntax: alias aliasName <& command sequence &>
        const bracketAliasMatch = line.match(/^alias\s+(\w+)\s+<&\s*(.+?)\s*&>/)
        if (bracketAliasMatch) {
          const [, aliasName, commandString] = bracketAliasMatch
          aliases[aliasName] = {
            commands: commandString,
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
        return { success: false, error: 'no_keybinds_found_in_file' }
      }

      if (!this.storage) {
        return { success: false, error: 'storage_not_available' }
      }

      if (!profileId) {
        return { success: false, error: 'no_active_profile' }
      }

      // Validate environment parameter using established patterns (for consistency with KBF import)
      const validEnvironments = ['space', 'ground']
      if (!environment) {
        // Default to space if not provided, but log for awareness
        console.warn(
          '[ImportService] No environment specified for keybind import, defaulting to space'
        )
        environment = 'space'
      } else if (!validEnvironments.includes(environment)) {
        return {
          success: false,
          error: 'invalid_environment',
          params: {
            environment,
            validEnvironments,
          },
        }
      }

      // Get or create profile
      const profile = this.storage.getProfile(profileId) || {
        builds: { space: { keys: {} }, ground: { keys: {} } },
      }

      // Ensure profile structure
      if (!profile.builds)
        profile.builds = { space: { keys: {} }, ground: { keys: {} } }
      const env = environment // Environment is already validated above
      if (!profile.builds[env]) profile.builds[env] = { keys: {} }

      const dest = profile.builds[env].keys

      // Apply keybinds with mirroring detection using STOCommandParser
      for (const [key, data] of Object.entries(parsed.keybinds)) {
        const commandString = data.raw

        // Check for mirroring pattern using STOCommandParser
        const parseResult = await this.request('parser:parse-command-string', {
          commandString,
        })

        if (parseResult.isMirrored) {
          // Extract original commands from mirrored sequence
          const originalCommands =
            this.extractOriginalFromMirrored(commandString)
          const unmirroredParseResult = await this.request(
            'parser:parse-command-string',
            {
              commandString: originalCommands.join(' $$ '),
            }
          )

          // Convert rich objects to canonical string array and optimise each command
          const rawArray = normalizeToStringArray(
            unmirroredParseResult.commands
          )
          const optimised = []
          for (const cmd of rawArray) {
            /* eslint-disable no-await-in-loop */
            const opt = await normalizeToOptimizedString(cmd, {
              eventBus: this.eventBus,
            })
            /* eslint-enable no-await-in-loop */
            optimised.push(opt)
          }
          dest[key] = optimised

          // Set stabilization metadata for primary bindset
          if (!profile.keybindMetadata) profile.keybindMetadata = {}
          if (!profile.keybindMetadata[environment]) profile.keybindMetadata[environment] = {}
          if (!profile.keybindMetadata[environment][key])
            profile.keybindMetadata[environment][key] = {}
          profile.keybindMetadata[environment][key].stabilizeExecutionOrder = true
        } else {
          // Convert rich objects to canonical string array and optimise each command
          const rawArray = normalizeToStringArray(data.commands)
          const optimised = []
          for (const cmd of rawArray) {
            /* eslint-disable no-await-in-loop */
            const opt = await normalizeToOptimizedString(cmd, {
              eventBus: this.eventBus,
            })
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

      return {
        success: true,
        imported: { keys: keyCount },
        errors: parsed.errors,
        message: 'import_completed_keybinds',
      }
    } catch (error) {
      return {
        success: false,
        error: 'import_failed',
        params: { reason: error.message },
      }
    }
  }

  // Import alias file content
  async importAliasFile(content, profileId, options = {}) {
    try {
      const parsed = await this.parseAliasFile(content)
      // Count only non-generated aliases (exclude sto_kb_ prefix)
      const importableAliases = Object.keys(parsed.aliases).filter(
        (name) => !name.startsWith('sto_kb_')
      )
      const aliasCount = importableAliases.length

      if (aliasCount === 0) {
        return { success: false, error: 'no_aliases_found_in_file' }
      }

      if (!this.storage || !profileId) {
        return { success: false, error: 'no_active_profile' }
      }

      // Get or create profile
      const profile = this.storage.getProfile(profileId) || { aliases: {} }
      if (!profile.aliases) profile.aliases = {}

      // Apply aliases using parsed data - convert to canonical string array format
      // Skip generated keybind/bindset aliases (those with sto_kb_ prefix)
      for (const [name, data] of Object.entries(parsed.aliases)) {
        if (name.startsWith('sto_kb_')) {
                    continue
        }
        // Split command string by $$ and convert to canonical string array
        const commandString = data.commands || ''
        const commandArray = commandString.trim()
          ? commandString
              .trim()
              .split(/\s*\$\$\s*/)
              .filter((cmd) => cmd.trim())
          : []

        // Optimise each command string
        const optimisedArray = []
        for (const cmd of commandArray) {
          /* eslint-disable no-await-in-loop */
          const opt = await normalizeToOptimizedString(cmd, {
            eventBus: this.eventBus,
          })
          /* eslint-enable no-await-in-loop */
          optimisedArray.push(opt)
        }

        profile.aliases[name] = {
          commands: optimisedArray, // Store as canonical string array (optimised)
          description: data.description || '',
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

      return {
        success: true,
        imported: { aliases: aliasCount },
        errors: parsed.errors,
        message: 'import_completed_aliases',
      }
    } catch (error) {
      return {
        success: false,
        error: 'import_failed',
        params: { reason: error.message },
      }
    }
  }

  // Import KBF file content
  async importKBFFile(content, profileId, environment, options = {}, configuration = null) {
    const errors = []
    const warnings = []

    // Basic validation
    if (!content || typeof content !== 'string') {
      return {
        success: false,
        error: 'invalid_kbf_file_content',
        message: 'Invalid KBF file content: expected string data',
        errors: ['File content validation failed']
      }
    }

    if (!this.storage) {
      return {
        success: false,
        error: 'storage_not_available',
        message: 'Storage service not available for KBF import'
      }
    }

    if (!profileId) {
      return {
        success: false,
        error: 'no_active_profile',
        message: 'No active profile specified for KBF import'
      }
    }

    // Validate environment
    const validEnvironments = ['space', 'ground']
    if (!environment) {
      environment = 'space'
      warnings.push('No environment specified, defaulting to space')
    } else if (!validEnvironments.includes(environment)) {
      return {
        success: false,
        error: 'invalid_environment',
        message: `Invalid environment "${environment}" specified for KBF import`,
        params: { environment, validEnvironments }
      }
    }

    try {
      // Basic format validation
      const validationResult = this.kbfParser.decoder.validateFormat(content)
      if (!validationResult.isValid || !validationResult.isKBF) {
        return {
          success: false,
          error: 'invalid_kbf_file_format',
          message: 'Invalid KBF file format',
          errors: validationResult.errors || [],
          warnings: validationResult.warnings || []
        }
      }

      // Collect validation warnings
      if (validationResult.warnings) {
        warnings.push(...validationResult.warnings)
      }

      // Parse KBF file synchronously like other imports
      const parseResult = await this.kbfParser.parseFile(content, {
        targetEnvironment: environment,
        includeMetadata: true,
      })

      // Check for parsing errors and collect warnings
      if (parseResult.errors) {
        errors.push(...parseResult.errors.map(err => err.message || err))
      }
      if (parseResult.warnings) {
        warnings.push(...parseResult.warnings.map(warn => warn.message || warn))
      }

      // Drop per-bindset alias structures from parsed data (app does not support bindset-scoped aliases)
      Object.values(parseResult.bindsets || {}).forEach((bindset) => {
        if (bindset.space?.aliases) delete bindset.space.aliases
        if (bindset.ground?.aliases) delete bindset.ground.aliases
      })

      // Fail fast on fundamental structural corruption
      if (parseResult.stats.totalBindsets === 0) {
        return {
          success: false,
          error: 'no_valid_bindsets_found',
          message: 'KBF file contains no valid bindsets that could be imported',
          errors,
          warnings
        }
      }

      // Get existing profile
      let profile = this.storage.getProfile(profileId)
      if (!profile) {
        return {
          success: false,
          error: 'profile_not_found',
          message: `Profile with ID "${profileId}" not found`,
          errors,
          warnings
        }
      }

      // Ensure minimal structures for migration import without verbose scaffolding
      if (!profile.builds) profile.builds = {}
      if (!profile.builds[environment]) {
        profile.builds[environment] = { keys: {}, aliases: {} }
      } else {
        if (!profile.builds[environment].keys) profile.builds[environment].keys = {}
        if (!profile.builds[environment].aliases) profile.builds[environment].aliases = {}
      }
      if (!profile.bindsets) profile.bindsets = {}
      if (!profile.aliases) profile.aliases = {}
      if (!profile.keybindMetadata) profile.keybindMetadata = {}
      if (!profile.aliasMetadata) profile.aliasMetadata = {}
      if (!profile.bindsetMetadata) profile.bindsetMetadata = {}

      // Initialize tracking variables (previously from processKBFBindsets)
      let totalKeysImported = 0
      let totalAliasesImported = 0
      let hasPrimaryBindset = false
      let masterBindsetName = null

      // Check if there's only one bindset and if it's a Master bindset
      const bindsetNames = Object.keys(parseResult.bindsets)
      const isSingleBindsetFile = bindsetNames.length === 1
      const onlyBindsetIsMaster = isSingleBindsetFile && bindsetNames[0].toLowerCase() === 'master'

      // Get bindsetsEnabled preference for validation
      let bindsetsEnabled = true // Default to enabled
      try {
        const preferences = await this.request('preferences:get-settings')
        bindsetsEnabled = preferences?.bindsetsEnabled ?? true
      } catch (error) {
        warnings.push('Could not retrieve bindsets preference, defaulting to enabled')
      }

      // Handle bindset selection - configuration takes priority over legacy options
      let bindsetsToProcess = bindsetNames
      let bindsetRenames = {}
      let bindsetMappings = {}

      if (configuration) {
        // Enhanced configuration provided
        bindsetsToProcess = configuration.selectedBindsets || bindsetNames
        bindsetRenames = configuration.bindsetRenames || {}
        bindsetMappings = configuration.bindsetMappings || {}

        // Validate against bindsetsEnabled preference
        if (!bindsetsEnabled && bindsetsToProcess.length > 1) {
          return {
            success: false,
            error: 'multiple_bindsets_not_allowed',
            message: 'Multiple bindset import is not allowed when bindsets are disabled',
            errors: [`Configuration specifies ${bindsetsToProcess.length} bindsets but bindsetsEnabled = false`],
            warnings
          }
        }
      } else if (options.selectedBindsets) {
        // Legacy selection support
        bindsetsToProcess = bindsetNames.filter((name) => options.selectedBindsets.includes(name))

        // Validate against bindsetsEnabled preference for legacy options
        if (!bindsetsEnabled && bindsetsToProcess.length > 1) {
          return {
            success: false,
            error: 'multiple_bindsets_not_allowed',
            message: 'Multiple bindset import is not allowed when bindsets are disabled',
            errors: [`Legacy options specify ${bindsetsToProcess.length} bindsets but bindsetsEnabled = false`],
            warnings
          }
        }
      }

      // Additional validation: ensure all selected bindsets map to primary when bindsets disabled
      if (!bindsetsEnabled && bindsetsToProcess.length > 0) {
        for (const bindsetName of bindsetsToProcess) {
          const mappingType = bindsetMappings[bindsetName] || 'primary'
          if (mappingType !== 'primary') {
            return {
              success: false,
              error: 'non_primary_mapping_not_allowed',
              message: 'Bindsets can only be mapped to primary bindset when bindsets are disabled',
              errors: [`Bindset "${bindsetName}" is mapped to "${mappingType}" but only "primary" is allowed when bindsetsEnabled = false`],
              warnings
            }
          }
        }
      }

      // Process bindsets using unified mapping-based logic
      for (const [bindsetName, bindsetData] of Object.entries(parseResult.bindsets)) {
        // Skip if this bindset is not in the selection list
        if (!bindsetsToProcess.includes(bindsetName)) {
          continue
        }

        try {
          // Get mapping type and final name from configuration
          const mappingType = bindsetMappings[bindsetName] || 'custom'
          const finalName = bindsetRenames[bindsetName] || bindsetName

          if (mappingType === 'primary') {
            // Import into primary build
            hasPrimaryBindset = true
            masterBindsetName = bindsetName

            // Import keys into primary environment build
            for (const [key, keyData] of Object.entries(bindsetData.keys || {})) {
              try {
                let commands = keyData
                let keyMetadata = {}

                if (keyData && typeof keyData === 'object' && keyData.commands) {
                  commands = keyData.commands
                  keyMetadata = keyData.metadata || {}
                }

                // Convert rich objects to canonical string array
                const commandArray = normalizeToStringArray(commands)
                profile.builds[environment].keys[key] = commandArray
                totalKeysImported++

                // Handle PriorityOrder metadata for primary bindset
                if (keyMetadata.stabilizeExecutionOrder) {
                  if (!profile.keybindMetadata) profile.keybindMetadata = {}
                  if (!profile.keybindMetadata[environment]) profile.keybindMetadata[environment] = {}
                  if (!profile.keybindMetadata[environment][key])
                    profile.keybindMetadata[environment][key] = {}
                  profile.keybindMetadata[environment][key].stabilizeExecutionOrder = true
                }
              } catch (keyError) {
                console.warn(`Failed to process key "${key}" in primary bindset "${bindsetName}": ${keyError.message}`)
              }
            }
          } else {
            // Import into named bindset
            const finalBindsetName = finalName

            // Create bindset structure if it doesn't exist
            if (!profile.bindsets) profile.bindsets = {}
            if (!profile.bindsets[finalBindsetName]) {
              profile.bindsets[finalBindsetName] = {
                space: { keys: {} },
                ground: { keys: {} },
              }
            }

            // Import keys into named bindset
            for (const [key, keyData] of Object.entries(bindsetData.keys || {})) {
              try {
                let commands = keyData
                let keyMetadata = {}

                if (keyData && typeof keyData === 'object' && keyData.commands) {
                  commands = keyData.commands
                  keyMetadata = keyData.metadata || {}
                }

                const commandArray = normalizeToStringArray(commands)
                profile.bindsets[finalBindsetName][environment].keys[key] = commandArray
                totalKeysImported++

                // Handle PriorityOrder metadata for user-defined bindsets
                if (keyMetadata.stabilizeExecutionOrder) {
                  if (!profile.bindsetMetadata) profile.bindsetMetadata = {}
                  if (!profile.bindsetMetadata[finalBindsetName]) profile.bindsetMetadata[finalBindsetName] = {}
                  if (!profile.bindsetMetadata[finalBindsetName][environment]) profile.bindsetMetadata[finalBindsetName][environment] = {}
                  if (!profile.bindsetMetadata[finalBindsetName][environment][key])
                    profile.bindsetMetadata[finalBindsetName][environment][key] = {}
                  profile.bindsetMetadata[finalBindsetName][environment][key].stabilizeExecutionOrder = true
                }
              } catch (keyError) {
                console.warn(`Failed to process key "${key}" in bindset "${finalBindsetName}": ${keyError.message}`)
              }
            }
          }
        } catch (bindsetError) {
          errors.push(`Critical error processing bindset "${bindsetName}": ${bindsetError.message}`)
        }
      }

      // Process global aliases inline
      if (parseResult.aliases && Object.keys(parseResult.aliases).length > 0) {
        for (const [aliasName, aliasData] of Object.entries(parseResult.aliases)) {
          try {
            const optimizedCommands = normalizeToStringArray(aliasData.commands || [])

            profile.aliases[aliasName] = {
              commands: optimizedCommands,
              description: aliasData.description || '',
              metadata: aliasData.metadata || {},
            }
            totalAliasesImported++
          } catch (aliasError) {
            console.warn(`Failed to process global alias "${aliasName}": ${aliasError.message}`)
          }
        }
      }

      // Save profile
      this.storage.saveProfile(profileId, profile)

      // Emit profile updated event
      this.emit('profile:updated', { profileId, profile, environment })

      // Set app modified state if available
      if (typeof globalThis !== 'undefined' && globalThis.app?.setModified) {
        globalThis.app.setModified(true)
      }

      // Return success result
      return {
        success: true,
        message: 'kbf_import_completed',
        imported: {
          bindsets: bindsetsToProcess.length,
          keys: totalKeysImported,
          aliases: totalAliasesImported,
        },
        stats: {
          processedLayers: parseResult.stats.processedLayers,
          skippedActivities: parseResult.stats.skippedActivities,
          totalActivities: parseResult.stats.totalActivities || 0,
          totalErrors: errors.length,
          totalWarnings: warnings.length,
        },
        errors,
        warnings,
        bindsetNames: Object.keys(parseResult.bindsets),
        masterBindset: {
          hasMasterBindset: hasPrimaryBindset,
          masterBindsetName,
          mappedToPrimary: hasPrimaryBindset,
          displayName: hasPrimaryBindset ? 'Primary Bindset' : null,
        },
        singleBindsetFile: {
          isSingleBindset: isSingleBindsetFile,
          onlyBindsetIsMaster,
          requiresBindsetSelection: isSingleBindsetFile ? false : parseResult.stats.totalBindsets > 1,
          totalBindsetsAvailable: parseResult.stats.totalBindsets,
          selectedBindsetsCount: bindsetsToProcess.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: 'kbf_import_critical_error',
        message: `Critical error during KBF import: ${error.message}`,
        errors: [...errors, error.message],
        warnings
      }
    }
  }

  // Import complete project file
  async importProjectFile(content, options = {}) {
    try {
      const projectData = JSON.parse(content)

      if (!projectData.data || projectData.type !== 'project') {
        return { success: false, error: 'invalid_project_file' }
      }

      const importedData = projectData.data
      let importedProfiles = 0
      let importedSettings = false

      // Import profiles
      if (importedData.profiles) {
        for (const [profileId, profileData] of Object.entries(
          importedData.profiles
        )) {
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
          firstRun: currentSettings.firstRun,
        }
        this.storage.saveSettings(mergedSettings)
        importedSettings = true
      }

      // Set app modified state
      if (typeof globalThis !== 'undefined' && globalThis.app?.setModified) {
        globalThis.app.setModified(true)
      }

      return {
        success: true,
        message: 'project_imported_successfully',
        imported: {
          profiles: importedProfiles,
          settings: importedSettings,
        },
        currentProfile: importedData.settings?.currentProfile || null,
      }
    } catch (error) {
      return {
        success: false,
        error: 'import_failed_invalid_json',
        params: { reason: error.message },
      }
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
        throw new Error(this.i18n.t('import_failed_invalid_json'))
      }
    } else if (filename.endsWith('.txt')) {
      // Determine the current profile for import
      const profileId = this.getCurrentProfileId()
      if (!profileId) {
        throw new Error(this.i18n.t('no_profile_selected_for_import'))
      }

      return this.importKeybindFile(content, profileId)
    } else {
      throw new Error(this.i18n.t('import_failed_unsupported_format'))
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
          errors: parsed.errors.length,
        },
        errors: parsed.errors,
      }
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      }
    }
  }

  /**
   * Validate KBF file format using KBFParser
   * @param {string} content - File content to validate
   * @returns {Object} Validation result with validity status and details
   */
  validateKBFFile(content) {
    try {
      // Validate input parameters
      if (!content || typeof content !== 'string') {
        return {
          valid: false,
          error: 'Invalid file content: expected string',
          errors: ['No content provided for validation'],
        }
      }

      // Use KBF parser for format validation
      const validationResult = this.kbfParser.decoder.validateFormat(content)

      // Return standardized validation result
      return {
        valid: validationResult.isValid,
        format: validationResult.format,
        isKBF: validationResult.isKBF,
        stats: {
          estimatedSize: validationResult.estimatedSize,
          estimatedKeysets: validationResult.estimatedKeysets,
          processingTime: validationResult.processingTime,
          errors: validationResult.errors.length,
          warnings: validationResult.warnings.length,
        },
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        // Additional context for UI
        supportedFormat: validationResult.isKBF,
        rejectionReason: validationResult.isKBF ? null : 'Invalid KBF file format',
      }
    } catch (error) {
      return {
        valid: false,
        error: `KBF validation error: ${error.message}`,
        errors: [error.message],
      }
    }
  }

  /**
   * Parse KBF file for bindset information without importing data
   * @param {string} content - KBF file content to parse
   * @param {string} environment - Target environment (space/ground)
   * @returns {Object} Parse result with bindset information
   */
  async parseKBFFile(content, environment) {
    const errors = []
    const warnings = []

    // Basic validation
    if (!content || typeof content !== 'string') {
      return {
        valid: false,
        error: 'invalid_kbf_file_content',
        message: 'Invalid KBF file content: expected string data',
        errors: ['File content validation failed']
      }
    }

    // Validate environment
    const validEnvironments = ['space', 'ground']
    if (!environment) {
      environment = 'space'
      warnings.push('No environment specified, defaulting to space')
    } else if (!validEnvironments.includes(environment)) {
      return {
        valid: false,
        error: 'invalid_environment',
        message: `Invalid environment "${environment}" specified for KBF parsing`,
        params: { environment, validEnvironments }
      }
    }

    try {
      // Basic format validation
      const validationResult = this.kbfParser.decoder.validateFormat(content)
      if (!validationResult.isValid || !validationResult.isKBF) {
        return {
          valid: false,
          error: 'invalid_kbf_file_format',
          message: 'Invalid KBF file format',
          errors: validationResult.errors || [],
          warnings: validationResult.warnings || []
        }
      }

      // Collect validation warnings
      if (validationResult.warnings) {
        warnings.push(...validationResult.warnings)
      }

      // Parse KBF file to extract bindset information without importing
      const parseResult = await this.kbfParser.parseFile(content, {
        targetEnvironment: environment,
        includeMetadata: true,
      })

      // Check for parsing errors and collect warnings
      if (parseResult.errors) {
        errors.push(...parseResult.errors.map(err => err.message || err))
      }
      if (parseResult.warnings) {
        warnings.push(...parseResult.warnings.map(warn => warn.message || warn))
      }

      // Drop per-bindset alias structures from parsed data (app does not support bindset-scoped aliases)
      Object.values(parseResult.bindsets || {}).forEach((bindset) => {
        if (bindset.space?.aliases) delete bindset.space.aliases
        if (bindset.ground?.aliases) delete bindset.ground.aliases
      })

      // Fail fast on fundamental structural corruption
      if (parseResult.stats.totalBindsets === 0) {
        return {
          valid: false,
          error: 'no_valid_bindsets_found',
          message: 'KBF file contains no valid bindsets that could be imported',
          errors,
          warnings
        }
      }

      // Extract bindset information for selection modal
      const bindsetNames = Object.keys(parseResult.bindsets)
      const hasMasterBindset = bindsetNames.some(name => name.toLowerCase() === 'master')
      const isSingleBindsetFile = bindsetNames.length === 1
      const onlyBindsetIsMaster = isSingleBindsetFile && bindsetNames[0].toLowerCase() === 'master'

      // Calculate key counts for each bindset
      const bindsetKeyCounts = {}
      bindsetNames.forEach(name => {
        const bindset = parseResult.bindsets[name]
        let keyCount = 0

        // Keys are stored in bindset.keys (this is the correct structure based on import logic)
        if (bindset.keys && typeof bindset.keys === 'object') {
          keyCount = Object.keys(bindset.keys).length
        }

        bindsetKeyCounts[name] = keyCount
      })

      
      // Determine master bindset display name
      let masterDisplayName = 'Primary Bindset'
      if (hasMasterBindset) {
        const masterBindset = parseResult.bindsets[bindsetNames.find(name => name.toLowerCase() === 'master')]
        if (masterBindset?.metadata?.displayName) {
          masterDisplayName = masterBindset.metadata.displayName
        }
      }

      return {
        valid: true,
        bindsets: parseResult.bindsets,
        bindsetNames,
        bindsetKeyCounts,
        hasMasterBindset,
        masterDisplayName,
        metadata: {
          totalBindsets: parseResult.stats.totalBindsets,
          estimatedSize: validationResult.estimatedSize,
          hasAliases: parseResult.aliases && Object.keys(parseResult.aliases).length > 0,
        },
        validation: {
          valid: true,
          errors,
          warnings
        },
        singleBindsetFile: {
          isSingleBindset: isSingleBindsetFile,
          onlyBindsetIsMaster,
          requiresBindsetSelection: parseResult.stats.totalBindsets > 1,
        },
        requiresBindsetSelection: parseResult.stats.totalBindsets > 1
      }
    } catch (error) {
      return {
        valid: false,
        error: 'kbf_parse_critical_error',
        message: `Critical error during KBF parsing: ${error.message}`,
        errors: [...errors, error.message],
        warnings
      }
    }
  }


  getCurrentProfileId() {
    // Get current profile ID from storage or app state
    if (
      typeof globalThis !== 'undefined' &&
      globalThis.app?.getCurrentProfileId
    ) {
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

  sanitizeProfileData(profileData) {
    // Create a clean profile structure
    const sanitized = {
      name: profileData.name,
      currentEnvironment:
        profileData.currentEnvironment || profileData.mode || 'space',
      builds: {
        space: { keys: {}, aliases: {} },
        ground: { keys: {}, aliases: {} },
      },
      aliases: {},
      keybindMetadata: {},
      aliasMetadata: {},
      bindsetMetadata: {},
    }

    // Handle different profile formats
    if (profileData.builds) {
      // New format with builds
      if (profileData.builds.space) {
        sanitized.builds.space = {
          keys: profileData.builds.space.keys || {},
          aliases: profileData.builds.space.aliases || {},
        }
      }
      if (profileData.builds.ground) {
        sanitized.builds.ground = {
          keys: profileData.builds.ground.keys || {},
          aliases: profileData.builds.ground.aliases || {},
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
    if (profileData.aliasMetadata) {
      sanitized.aliasMetadata = profileData.aliasMetadata
    }
    if (profileData.bindsetMetadata) {
      sanitized.bindsetMetadata = profileData.bindsetMetadata
    }

    return sanitized
  }

  
  onInit() {
    this.setupRequestHandlers()
    this.emit('import-service-ready')
  }
}
