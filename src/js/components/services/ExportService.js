import ComponentBase from '../ComponentBase.js'
import { writeFile } from './SyncService.js'
import i18next from 'i18next'
import { formatAliasLine, formatKeybindLine } from '../../lib/STOFormatter.js'
import { normalizeToStringArray, normalizeToOptimizedString } from '../../lib/commandDisplayAdapter.js'

const STO_DATA = globalThis.STO_DATA || {}

/**
 * ExportService – encapsulates all business-logic for exporting / importing
 * profiles, keybind data and project archives.  
 */
export default class ExportService extends ComponentBase {
  constructor ({ eventBus, storage, i18n = i18next } = {}) {
    super(eventBus)
    this.componentName = 'ExportService'
    this.storage = storage
    this.i18n = i18n
  }

  onInit() {
    // Initialize ExportService-specific cache properties
    this.extendCache({
      profiles: {} // ExportService needs to cache multiple profiles
    })

    this.setupRequestHandlers()
    this.setupEventListeners()
  }

  setupRequestHandlers() {
    // Export generation requests
   
    this.respond('export:generate-filename', async ({ profile, extension, environment }) => 
      await this.generateFileName(profile, extension, environment))
    this.respond('export:generate-alias-filename', ({ profile, extension }) => 
      this.generateAliasFileName(profile, extension))
    this.respond('export:import-from-file', async ({ file }) =>
      await this.importFromFile(file))
    this.respond('export:extract-keys', ({ profile, environment }) =>
      this.extractKeys(profile, environment))
    this.respond('export:generate-keybind-file', async ({ profileId, environment = 'space', syncMode = false }) => {
      const prof = this.getProfileFromCache(profileId)
      if (!prof) throw new Error(`Profile ${profileId} not found in ExportService cache`)
      return await this.generateSTOKeybindFile(prof, { environment, syncMode })
    })
    this.respond('export:generate-alias-file', async ({ profileId }) => {
      const prof = this.getProfileFromCache(profileId)
      if (!prof) throw new Error(`Profile ${profileId} not found`)
      return await this.generateAliasFile(prof)
    })
    this.respond('export:sync-to-folder', async ({ dirHandle }) => {
      return await this.syncToFolder(dirHandle)
    })
  }

  setupEventListeners () {
    // Keep cache in sync when DataCoordinator broadcasts changes
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId && profile) {
        this.cache.profiles[profileId] = profile
      }
    })

    this.addEventListener('profile:switched', ({ profileId, environment, profile }) => {
      // ComponentBase handles currentProfile and currentEnvironment automatically
      if (profile) this.cache.profiles[profileId] = profile
    })
  }

  // Check if bind-to-alias mode is enabled from cached preferences (internal method)
  _getBindToAliasMode() {
    console.log('[ExportService] _getBindToAliasMode called')
    console.log('[ExportService] cache:', this.cache)
    console.log('[ExportService] preferences:', this.cache?.preferences)
    console.log('[ExportService] bindToAliasMode:', this.cache?.preferences?.bindToAliasMode)

    // Use cached preferences from ComponentBase instead of making requests
    return this.cache?.preferences?.bindToAliasMode || false
  }
  
  // Check if bindsets feature is enabled from cached preferences (internal method)
  _getBindsetsEnabled() {
    console.log('[ExportService] _getBindsetsEnabled called')
    console.log('[ExportService] cache:', this.cache)
    console.log('[ExportService] preferences:', this.cache?.preferences)
    console.log('[ExportService] bindsetsEnabled:', this.cache?.preferences?.bindsetsEnabled)

    // Use cached preferences from ComponentBase instead of making requests
    return this.cache?.preferences?.bindsetsEnabled || false
  }

  // Sanitize a bindset name into a valid alias component (lower snake)
  sanitizeBindsetName(name = '') {
    if (!name) return ''
    let s = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
    if (/^[0-9]/.test(s)) s = `bs_${s}`
    return s
  }

  // Generate alias name for a key within a specific bindset
  // Primary bindset returns same as generateBindToAliasName()
  async generateBindsetAliasName(environment, bindsetName, keyName) {
    const { generateBindToAliasName } = await import('../../lib/aliasNameValidator.js')
    
    // For primary bindset, use the standard bind-to-alias name (already has sto_kb_ prefix)
    if (!bindsetName || bindsetName === 'Primary Bindset') {
      return generateBindToAliasName(environment, keyName)
    }
    
    // For custom bindsets, use the generateBindToAliasName with bindsetName parameter
    return generateBindToAliasName(environment, keyName, bindsetName)
  }
  
  // Keybind file generation
  async generateSTOKeybindFile (profile, options = {}) {
    const { environment = 'space', syncMode = false } = options
    const keys = this.extractKeys(profile, environment)
    
    const hasKeys = keys && Object.keys(keys).length > 0

    if (!hasKeys) {
      return '; ' + this.i18n?.t('no_keybinds_to_export') + '\n'
    }

    const filename = `${profile.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${environment}.txt`
    let content = await this.generateFileHeader(profile, filename, environment)
    
   
    // Add keybind section
    content += await this.generateKeybindSection(keys, { 
      environment, 
      profile, 
      syncMode 
    })
    
    // Add footer
    //content += this.generateFileFooter()
    
    return content
  }

  async generateFileHeader (profile, syncFilename = null, environment = null) {
    const timestamp = new Date().toLocaleString()
    const env = environment || profile.currentEnvironment || 'space'
    const keyCount = Object.keys(this.extractKeys(profile, env)).length
    const aliasCount = Object.keys(profile.aliases || {}).length

    let header = `; ================================================================
; ${profile.name} - STO Keybind Configuration
; ================================================================
; ${this.i18n?.t('environment') || 'Environment:'} ${env.toUpperCase()}
; ${this.i18n?.t('generated') || 'Generated:'} ${timestamp}
; ${this.i18n?.t('created_by') || 'Created by:'} STO Tools Keybind Manager v${STO_DATA?.settings?.version ?? 'unknown'}
;
; ${this.i18n?.t('statistics')}:
; - ${this.i18n?.t('total_commands')}: ${keyCount}
;
; To use this keybind file in Star Trek Online:
; 1. Save this file in your STO Live folder as a .txt file
; 2. In-game, type: /bind_load_file ${syncFilename}
; 3. Your keybinds will be applied immediately
; ================================================================

`
    return header
  }

  async generateKeybindSection (keys, options = {}) {
    const { environment = 'space', syncMode = false, profile } = options
    
    if (!keys || Object.keys(keys).length === 0) {
      return '; ' + this.i18n?.t('no_keybinds_to_export') + '\n'
    }

    // Check if bind-to-alias mode is enabled
    const bindToAliasMode = this._getBindToAliasMode()
    console.log('[ExportService] this: ', this)

    let content = `; ==============================================================================\n`
    content += `; ${environment.toUpperCase()} KEYBINDS\n`
    content += `; ==============================================================================\n\n`
    
    if (bindToAliasMode) {
      // In bind-to-alias mode, only generate keybind lines that call the aliases
      // The actual alias definitions should be handled in generateAliasFile
      const { generateBindToAliasName } = await import('../../lib/aliasNameValidator.js')
      
      content += `; ${this.i18n?.t('export_generated_aliases_note')}\n`
      content += `; ${this.i18n?.t('export_alias_definitions_note')}\n`
      content += `; ------------------------------------------------------------------------------\n`
      
      // Generate keybind lines that call the aliases
      for (const [key, commands] of Object.entries(keys)) {
        // Always generate a keybind line that calls its alias – even when the
        // command list is empty – so that "defined-but-empty" keybinds are
        // preserved in exported files.
        const aliasName = generateBindToAliasName(environment, key)
        if (!aliasName) continue
        // Encode the key for export (e.g., backtick becomes 0x29)
        const { encodeKeyForExport } = await import('../../lib/keyEncoding.js')
        const encodedKey = encodeKeyForExport(key)
        content += `${encodedKey} "${aliasName}"\n`
      }
    } else {
      // Original behavior - generate keybind commands directly
      for (const [key, commands] of Object.entries(keys)) {
        let cmds = commands || []
        const shouldStabilize = (profile.keybindMetadata && profile.keybindMetadata[environment] &&
          profile.keybindMetadata[environment][key] && profile.keybindMetadata[environment][key].stabilizeExecutionOrder)

        if (shouldStabilize && Array.isArray(cmds) && cmds.length > 1) {
          cmds = this.mirrorCommands(cmds)
        }

        // Optimise each command string
        const optimisedCmds = []
        for (const cmd of cmds) {
          /* eslint-disable no-await-in-loop */
          const opt = await normalizeToOptimizedString(cmd, { eventBus: this.eventBus })
          /* eslint-enable no-await-in-loop */
          optimisedCmds.push(opt)
        }

        content += formatKeybindLine(key, optimisedCmds)
      }
    }
    
    content += '\n'
    return content
  }

  
  
  /* ---------------------------------------------------------- */
  /* Import delegation methods removed - use ImportService directly */
  /* Use: await this.request('import:from-file', { file })          */
  /* Use: await this.request('import:project-file', { content })    */
  /* Use: await this.request('import:profile-file', { content })    */
  /* ---------------------------------------------------------- */


  /* ---------------------------------------------------------- */
  /* Alias file generation                                      */
  /* ---------------------------------------------------------- */
  async generateAliasFile (profile) {
    const aliases = profile.aliases || {}
    
    // Get current virtual VFX aliases from VFXManagerService
    let vfxAliases = {}
    try {
      vfxAliases = await this.request('vfx:get-virtual-aliases') || {}
    } catch (error) {
      // VFXManagerService might not be available - continue without VFX aliases
      console.log('[ExportService] VFXManagerService not available, skipping VFX aliases')
    }
    
    // Check if bind-to-alias mode is enabled and add generated aliases
    const bindToAliasMode = this._getBindToAliasMode()
    const generatedAliases = {}
    
    if (bindToAliasMode) {
      // Generate aliases from keybinds when bind-to-alias mode is enabled
      const { generateBindToAliasName } = await import('../../lib/aliasNameValidator.js')
      
      // Process all environments to generate aliases
      const environments = ['space', 'ground']
      for (const environment of environments) {
        const keys = this.extractKeys(profile, environment)
        if (!keys || Object.keys(keys).length === 0) continue
        
        for (const [key, commands] of Object.entries(keys)) {
          const aliasName = generateBindToAliasName(environment, key)
          if (!aliasName) continue
          
          // Use an empty array when commands is falsy to allow generation of
          // empty alias definitions.
          let cmds = commands || []
          const shouldStabilize = (profile.keybindMetadata && profile.keybindMetadata[environment] &&
            profile.keybindMetadata[environment][key] && profile.keybindMetadata[environment][key].stabilizeExecutionOrder)

          if (shouldStabilize && Array.isArray(commands) && commands.length > 1) {
            cmds = this.mirrorCommands(commands)
          }

          // Store as generated alias
          generatedAliases[aliasName] = {
            name: aliasName,
            commands: cmds,
            description: `Generated alias for ${environment} key: ${key}`,
            isGenerated: true
          }
        }
      }
    }
    
    // --------------------------------------------------------
    // Bindsets support – generate aliases per bindset & loaders
    // --------------------------------------------------------
    const bindsetsEnabled = this._getBindsetsEnabled()
    const bindsetAliases = {}
    const loaderAliases = {}

    if (bindsetsEnabled) {
      const bindsets = profile.bindsets || {}
      const bindsetNames = Object.keys(bindsets)

      const environments = ['space', 'ground']
      for (const environment of environments) {
        // Collect union of all keys across bindsets and primary build
        const primaryKeys = Object.keys(profile.builds?.[environment]?.keys || {})
        const keyUnion = new Set(primaryKeys)

        for (const bsName of bindsetNames) {
          const bsKeys = Object.keys(bindsets[bsName]?.[environment]?.keys || {})
          bsKeys.forEach(k => keyUnion.add(k))
        }

        // Generate per-bindset key aliases (non-primary)
        for (const bsName of bindsetNames) {
          const bsKeys = bindsets[bsName]?.[environment]?.keys || {}
          for (const [key, commands] of Object.entries(bsKeys)) {
            // Ensure array
            let cmds = commands || []
            if (!Array.isArray(cmds)) cmds = [cmds]

            // Mirror when stabilization enabled for this bindset key
            const shouldStabilize = (profile.bindsetMetadata && profile.bindsetMetadata[bsName] &&
              profile.bindsetMetadata[bsName][environment] &&
              profile.bindsetMetadata[bsName][environment][key] &&
              profile.bindsetMetadata[bsName][environment][key].stabilizeExecutionOrder)

            if (shouldStabilize && cmds.length > 1) {
              cmds = this.mirrorCommands(cmds)
            }

            const aliasName = await this.generateBindsetAliasName(environment, bsName, key)
            if (!aliasName) continue

            bindsetAliases[aliasName] = {
              name: aliasName,
              commands: cmds,
              description: `Bindset ${bsName} – ${environment} key ${key}`,
              isGenerated: true
            }
          }
        }

        // Build loader aliases for EACH bindset (including Primary Bindset)
        const allBindsetForLoaders = ['Primary Bindset', ...bindsetNames]
        for (const bsName of allBindsetForLoaders) {
          const loaderAliasName = `sto_kb_bindset_enable_${environment}_${this.sanitizeBindsetName(bsName)}`

          // Build command string for loader alias: series of bind commands separated by $$
          const bindCmds = []
          for (const key of keyUnion) {
            let targetAliasName
            const inBs = bsName !== 'Primary Bindset' && (bindsets[bsName]?.[environment]?.keys?.[key])
            const inPrimary = (profile.builds?.[environment]?.keys?.[key])
            
            // Determine if we need to rebind this key in loader
            if (bsName === 'Primary Bindset') {
              // For Primary Bindset loader: only reset keys that exist in custom bindsets
              // Check if this key exists in any non-primary bindset
              const existsInCustomBindset = bindsetNames.some(customBsName => 
                bindsets[customBsName]?.[environment]?.keys?.[key]
              )
              
              if (existsInCustomBindset) {
                if (inPrimary) {
                  // Key exists in both primary and custom bindsets - reset to primary
                  targetAliasName = await this.generateBindsetAliasName(environment, 'Primary Bindset', key)
                } else {
                  // Key exists only in custom bindsets, not in primary - unbind it
                  bindCmds.push(`unbind ${key}`)
                  continue
                }
              }
              // If key doesn't exist in any custom bindset, skip it (no need to reset)
            } else {
              // For custom bindset loaders: only bind keys that exist in this specific bindset
              if (inBs) {
                targetAliasName = await this.generateBindsetAliasName(environment, bsName, key)
              }
            }
            
            if (targetAliasName) {
              // Encode the key for export (e.g., backtick becomes 0x29)
              const { encodeKeyForExport } = await import('../../lib/keyEncoding.js')
              const encodedKey = encodeKeyForExport(key)
              bindCmds.push(`bind ${encodedKey} \"${targetAliasName}\"`)
            }
          }

          if (bindCmds.length > 0) {
            const cmdStr = bindCmds.join(' $$ ')
            loaderAliases[loaderAliasName] = {
              name: loaderAliasName,
              commands: [ cmdStr ],
              description: `Enable ${bsName} for ${environment}`,
              isLoader: true,
              category: 'Bindsets'
            }
          }
        }
      }
    }

    // Combine all aliases: user aliases, VFX aliases, generated bind-to-alias, bindset key aliases and loader aliases
    const allAliases = { ...aliases, ...vfxAliases, ...generatedAliases, ...bindsetAliases, ...loaderAliases }
    
    if (Object.keys(allAliases).length === 0) {
      return '; ' + this.i18n?.t('no_aliases_to_export') + '\n'
    }

    let content = await this.generateAliasFileHeader(profile)
    
    // Add note about generated aliases if any exist
    if (Object.keys(generatedAliases).length > 0) {
      content += `; ${this.i18n?.t('export_user_and_generated_aliases')}\n`
      content += `; ${this.i18n?.t('export_generated_aliases_count', { count: Object.keys(generatedAliases).length })}\n`
      content += `; ================================================================\n\n`
    }
    
    // Generate alias content directly (sorted)
    const sorted = Object.entries(allAliases).sort(([a], [b]) => a.localeCompare(b))
    
    for (const [name, alias] of sorted) {
      let commandsArray = Array.isArray(alias.commands) ? alias.commands : []

      // Apply mirroring if aliasMetadata says so (but not for generated aliases, they're already processed)
      const shouldStabilize = !alias.isGenerated && !alias.isLoader && (profile.aliasMetadata && profile.aliasMetadata[name] && profile.aliasMetadata[name].stabilizeExecutionOrder)

      if (shouldStabilize && commandsArray.length > 1) {
        const cmdParts = commandsArray.map(c => ({ command: c }))
        const mirroredStr = await this.request('command:generate-mirrored-commands', { commands: cmdParts })
        commandsArray = mirroredStr.split(/\s*\$\$\s*/).filter(Boolean)
      }

      // Optimise each command (e.g., TrayExecByTray / TrayExecByTrayWithBackup)
      const optimisedCommands = []
      for (const cmd of commandsArray) {
        // normalise + optimise each command string
        /* eslint-disable no-await-in-loop */
        const opt = await normalizeToOptimizedString(cmd, { eventBus: this.eventBus })
        /* eslint-enable no-await-in-loop */
        optimisedCommands.push(opt)
      }

      // Join array back to string for STO format
      const commandsStr = optimisedCommands.join(' $$ ')
      content += formatAliasLine(name, { ...alias, commands: commandsStr })
      content += '\n'
    }
    
    return content
  }

  async generateAliasFileHeader (profile) {
    const timestamp = new Date().toLocaleString()
    const aliasCount = Object.keys(profile.aliases || {}).length

    return `; ================================================================
; ${profile.name} - STO Alias Configuration
; ================================================================
; ${this.i18n?.t('environment') || 'Environment:'} Alias
; ${this.i18n?.t('generated') || 'Generated:'} ${timestamp}
; ${this.i18n?.t('created_by') || 'Created by:'} STO Tools Keybind Manager v${STO_DATA?.settings?.version ?? 'unknown'}
;
; Alias Statistics:
; - Total aliases: ${aliasCount}
;
; To use these aliases in Star Trek Online:
; 1. Save this file as "CommandAliases.txt" (exactly, without quotes)
; 2. Place it in your STO directory:
;    [STO Install]\\Star Trek Online\\Live\\localdata\\CommandAliases.txt
; 3. The aliases will be available when you start the game
;
; Alternative: You can append these aliases to an existing CommandAliases.txt
; file if you already have one with other aliases.
;
; Common STO installation paths:
; - Steam: C:\\Program Files (x86)\\Steam\\steamapps\\common\\Star Trek Online
; - Epic: C:\\Program Files\\Epic Games\\Star Trek Online
; - Arc: C:\\Program Files (x86)\\Perfect World Entertainment\\Arc Games\\Star Trek Online
; ================================================================

`
  }

  /* ---------------------------------------------------------- */
  /* Sync to folder                                            */
  /* ---------------------------------------------------------- */
  async syncToFolder (dirHandle) {
    const data = this.storage.getAllData()
    const profiles = data.profiles || {}

    try {
      // Generate files for each profile
      for (const [profileId, profile] of Object.entries(profiles)) {
        if (!profile || !profile.name) continue

        const sanitizedName = profile.name.replace(/[^a-zA-Z0-9_-]/g, '_')
        
        // Create profile directory
        const profileDir = `${sanitizedName}`
        
        // Generate keybind files for each environment
        for (const environment of ['space', 'ground']) {
          if (profile.builds?.[environment]?.keys && Object.keys(profile.builds[environment].keys).length > 0) {
            const keybindContent = await this.generateSTOKeybindFile(profile, {
              environment,
              profile,
              syncMode: true
            })
            const filename = `${profileDir}/${sanitizedName}_${environment}.txt`
            await writeFile(dirHandle, filename, keybindContent)
          }
        }
        
        // Generate alias file (includes user aliases, VFX aliases, bind-to-alias, and bindset aliases)
        const aliasContent = await this.generateAliasFile(profile)
        const filename = `${profileDir}/${sanitizedName}_aliases.txt`
        await writeFile(dirHandle, filename, aliasContent)
      }

      // Generate project.json with complete data
      const projectData = {
        version: STO_DATA?.settings?.version || '1.0.0',
        exported: new Date().toISOString(),
        type: 'project',
        data: {
          profiles,
          settings: data.settings || {},
          currentProfile: data.currentProfile
        }
      }
      await writeFile(dirHandle, 'project.json', JSON.stringify(projectData, null, 2))

      // Toast is handled by SyncService to respect autosync settings
    } catch (error) {
      throw error
    }
  }

  generateFileName (profile, extension, environment = profile.currentEnvironment || 'space') {
    const sanitized = profile.name.replace(/[^a-zA-Z0-9_-]/g, '_')
    const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    return `${sanitized}_${environment}_${timestamp}.${extension}`
  }

  generateAliasFileName (profile, extension) {
    const sanitized = profile.name.replace(/[^a-zA-Z0-9_-]/g, '_')
    return `${sanitized}_aliases.${extension}`
  }

  extractKeys (profile = {}, environment = 'space') {
    // Handle flat structure first (for direct calls with extracted keys)
    if (profile.keys && !profile.builds) {
      return profile.keys
    }
    
    // Handle builds structure
    if (profile.builds && profile.builds[environment] && profile.builds[environment].keys) {
      return profile.builds[environment].keys
    }
    
    // Handle legacy keybinds structure
    if (profile.keybinds && profile.keybinds[environment]) {
      return profile.keybinds[environment]
    }
    
    return {}
  }

  /* helper to mirror command strings array */
  mirrorCommands(commands) {
    if (!Array.isArray(commands) || commands.length <= 1) return commands

    // Commands are now canonical strings, so just mirror the strings directly
    const clean = normalizeToStringArray(commands)
    const mirrored = [...clean, ...clean.slice(0, -1).reverse()]
    return mirrored
  }

  // Late-join state sync
  getCurrentState () {
    return {
      currentProfile: this.cache.currentProfile,
      currentEnvironment: this.cache.currentEnvironment,
      profiles: this.cache.profiles
    }
  }

  handleInitialState (sender, state) {
  }

  // Utility
  getProfileFromCache (profileId) {
    if (profileId && this.cache.profiles[profileId]) {
      return this.cache.profiles[profileId]
    }
    // Fallback to storage if available
    if (this.storage && typeof this.storage.getProfile === 'function') {
      return this.storage.getProfile(profileId)
    }
    return null
  }
} 