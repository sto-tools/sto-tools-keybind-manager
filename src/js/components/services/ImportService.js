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
      ({ content, profileId, environment, options = {}, strategy }) => {
        // Validate strategy input with fallback to default
        const validStrategies = ['merge_keep', 'merge_overwrite', 'overwrite_all']
        const validatedStrategy = validStrategies.includes(strategy) ? strategy : 'merge_keep'
        return this.importKeybindFile(content, profileId, environment, { ...options, strategy: validatedStrategy })
      }
    )

    this.respond('import:alias-file', ({ content, profileId, options = {}, strategy }) => {
      // Validate strategy input with fallback to default
      const validStrategies = ['merge_keep', 'merge_overwrite', 'overwrite_all']
      const validatedStrategy = validStrategies.includes(strategy) ? strategy : 'merge_keep'
      return this.importAliasFile(content, profileId, { ...options, strategy: validatedStrategy })
    })

    this.respond(
      'import:kbf-file',
      ({ content, profileId, environment, options = {}, strategy, configuration }) => {
        // Validate strategy input with fallback to default
        const validStrategies = ['merge_keep', 'merge_overwrite', 'overwrite_all']
        const validatedStrategy = validStrategies.includes(strategy) ? strategy : (options.strategy || 'merge_keep')
        return this.importKBFFile(content, profileId, environment, { ...options, strategy: validatedStrategy }, configuration)
      }
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
  async importKeybindFile(content, profileId, environment, { strategy = 'merge_keep' } = {}) {
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

      // Initialize tracking variables for strategy results
      let imported = 0
      let skipped = 0
      let overwritten = 0
      let cleared = 0

      // Apply strategy logic
      if (strategy === 'overwrite_all') {
        // Clear all existing keys for this environment
        const existingKeys = Object.keys(dest)
        cleared = existingKeys.length
        Object.keys(dest).forEach(key => delete dest[key])

        // Clear corresponding metadata for consistent state
        if (profile.keybindMetadata && profile.keybindMetadata[environment]) {
          existingKeys.forEach(key => {
            delete profile.keybindMetadata[environment][key]
          })
        }
      }

      // Apply keybinds with mirroring detection using STOCommandParser
      for (const [key, data] of Object.entries(parsed.keybinds)) {
        const commandString = data.raw

        // Check for conflicts based on strategy
        if (strategy === 'merge_keep' && dest.hasOwnProperty(key)) {
          skipped++
          continue // Skip existing key
        }

        // Track overwritten for merge_overwrite strategy
        if (strategy === 'merge_overwrite' && dest.hasOwnProperty(key)) {
          overwritten++
        }

        // Check for mirroring pattern using STOCommandParser
        const parseResult = await this.request('parser:parse-command-string', {
          commandString,
        })

        let processedCommands = []
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
          processedCommands = optimised

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
          processedCommands = optimised
        }

        dest[key] = processedCommands
        imported++
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
        imported: { keys: imported },
        skipped,
        overwritten,
        cleared,
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
  async importAliasFile(content, profileId, { strategy = 'merge_keep' } = {}) {
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

      // Initialize tracking variables for strategy results
      let imported = 0
      let skipped = 0
      let overwritten = 0
      let cleared = 0

      // Apply strategy logic
      if (strategy === 'overwrite_all') {
        // Clear all existing aliases
        const existingAliases = Object.keys(profile.aliases)
        cleared = existingAliases.length
        Object.keys(profile.aliases).forEach(alias => delete profile.aliases[alias])

        // Clear corresponding metadata for consistent state
        if (profile.aliasMetadata) {
          existingAliases.forEach(alias => {
            delete profile.aliasMetadata[alias]
          })
        }
      }

      // Apply aliases using parsed data - convert to canonical string array format
      // Skip generated keybind/bindset aliases (those with sto_kb_ prefix)
      for (const [name, data] of Object.entries(parsed.aliases)) {
        if (name.startsWith('sto_kb_')) {
          continue
        }

        // Check for conflicts based on strategy
        if (strategy === 'merge_keep' && profile.aliases.hasOwnProperty(name)) {
          skipped++
          continue // Skip existing alias
        }

        // Track overwritten for merge_overwrite strategy
        if (strategy === 'merge_overwrite' && profile.aliases.hasOwnProperty(name)) {
          overwritten++
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
        imported++
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
        imported: { aliases: imported },
        skipped,
        overwritten,
        cleared,
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
  async importKBFFile(content, profileId, environment, { strategy = 'merge_keep' } = {}, configuration = null) {
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
      let totalKeysSkipped = 0
      let totalKeysOverwritten = 0
      let totalKeysCleared = 0
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
      } else if (onlyBindsetIsMaster) {
        // Default behavior: map single Master bindset to primary
        bindsetMappings[bindsetNames[0]] = 'primary'
      } // Note: Legacy options support removed since strategy parameter changed - use configuration instead

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

      // Apply KBF strategy logic - determine which targets need clearing
      if (strategy === 'overwrite_all') {
        // For each selected bindset, clear the target destination based on mapping type
        for (const [bindsetName, bindsetData] of Object.entries(parseResult.bindsets)) {
          if (!bindsetsToProcess.includes(bindsetName)) continue

          const mappingType = bindsetMappings[bindsetName] || 'custom'
          const finalName = bindsetRenames[bindsetName] || bindsetName

          if (mappingType === 'primary') {
            // Clear primary environment keys
            const existingKeys = Object.keys(profile.builds[environment].keys || {})
            totalKeysCleared += existingKeys.length
            Object.keys(profile.builds[environment].keys || {}).forEach(key => delete profile.builds[environment].keys[key])

            // Clear corresponding primary keybind metadata for consistent state
            if (profile.keybindMetadata && profile.keybindMetadata[environment]) {
              existingKeys.forEach(key => {
                delete profile.keybindMetadata[environment][key]
              })
            }
          } else {
            // Clear named bindset keys
            const finalBindsetName = finalName
            if (!profile.bindsets) profile.bindsets = {}
            if (!profile.bindsets[finalBindsetName]) profile.bindsets[finalBindsetName] = { space: { keys: {} }, ground: { keys: {} } }

            const existingKeys = Object.keys(profile.bindsets[finalBindsetName][environment].keys || {})
            totalKeysCleared += existingKeys.length
            Object.keys(profile.bindsets[finalBindsetName][environment].keys || {}).forEach(key => delete profile.bindsets[finalBindsetName][environment].keys[key])

            // Clear corresponding bindset metadata for consistent state
            if (profile.bindsetMetadata && profile.bindsetMetadata[finalBindsetName] && profile.bindsetMetadata[finalBindsetName][environment]) {
              existingKeys.forEach(key => {
                delete profile.bindsetMetadata[finalBindsetName][environment][key]
              })
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

                // Check for conflicts based on strategy
                if (strategy === 'merge_keep' && profile.builds[environment].keys.hasOwnProperty(key)) {
                  totalKeysSkipped++
                  continue // Skip existing key
                }

                // Track overwritten for merge_overwrite strategy
                if (strategy === 'merge_overwrite' && profile.builds[environment].keys.hasOwnProperty(key)) {
                  totalKeysOverwritten++
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

                // Check for conflicts based on strategy
                const targetKeys = profile.bindsets[finalBindsetName][environment].keys || {}
                if (strategy === 'merge_keep' && targetKeys.hasOwnProperty(key)) {
                  totalKeysSkipped++
                  continue // Skip existing key
                }

                // Track overwritten for merge_overwrite strategy
                if (strategy === 'merge_overwrite' && targetKeys.hasOwnProperty(key)) {
                  totalKeysOverwritten++
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
        skipped: totalKeysSkipped,
        overwritten: totalKeysOverwritten,
        cleared: totalKeysCleared,
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
          hasMasterBindset: Object.keys(parseResult.bindsets).some(name => name.toLowerCase() === 'master'),
          masterBindsetName: Object.keys(parseResult.bindsets).find(name => name.toLowerCase() === 'master'),
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
