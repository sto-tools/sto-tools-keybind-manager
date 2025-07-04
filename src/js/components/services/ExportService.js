import ComponentBase from '../ComponentBase.js'
import { respond } from '../../core/requestResponse.js'
import STOFileHandler from '../../lib/fileHandler.js'
import { writeFile } from './SyncService.js'
import i18next from 'i18next'
import { formatAliasLine, formatKeybindLine } from '../../lib/STOFormatter.js'
import { normalizeToStringArray, normalizeToOptimizedString } from '../../lib/commandDisplayAdapter.js'

const STO_DATA = globalThis.STO_DATA || {}

/**
 * ExportService – encapsulates all business-logic for exporting / importing
 * profiles, keybind data and project archives.  It is intentionally free of
 * DOM manipulation so that it can be re-used from unit tests, other services
 * and even a CLI context.
 */
export default class ExportService extends ComponentBase {
  constructor ({ eventBus, storage } = {}) {
    super(eventBus)
    this.componentName = 'ExportService'
    this.storage = storage
    this.fileHandler = new STOFileHandler()
    this.cache = {
      profiles: {},
      currentProfile: null,
      currentEnvironment: 'space'
    }
  }

  /* ---------------------------------------------------------- */
  /* Lifecycle                                                  */
  /* ---------------------------------------------------------- */
  onInit () {
    this.setupRequestHandlers()
    this.setupEventListeners()
  }

  setupRequestHandlers() {
    
    // Export generation requests
   
    this.respond('export:generate-filename', async ({ profile, extension, environment }) => 
      await this.generateFileName(profile, extension, environment))
    
    this.respond('export:generate-alias-filename', ({ profile, extension }) => 
      this.generateAliasFileName(profile, extension))
    
    this.respond('export:generate-csv-data', ({ profile }) => 
      this.generateCSVData(profile))
    
    this.respond('export:generate-html-report', ({ profile }) => 
      this.generateHTMLReport(profile))
    
    this.respond('export:import-from-file', async ({ file }) => 
      await this.importFromFile(file))
    
    this.respond('export:sanitize-profile', ({ profile }) => 
      this.sanitizeProfileForExport(profile))
    
    this.respond('export:extract-keys', ({ profile, environment }) => 
      this.extractKeys(profile, environment))

    // New: by profileId to leverage internal cache
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
  }

  setupEventListeners () {
    // Keep cache in sync when DataCoordinator broadcasts changes
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId && profile) {
        this.cache.profiles[profileId] = profile
      }
    })

    this.addEventListener('profile:switched', ({ profileId, environment, profile }) => {
      if (profileId) this.cache.currentProfile = profileId
      if (environment) this.cache.currentEnvironment = environment
      if (profile) this.cache.profiles[profileId] = profile
    })
  }

  /* ---------------------------------------------------------- */
  /* Core generators - single source of truth                  */
  /* ---------------------------------------------------------- */
  
  /* ---------------------------------------------------------- */
  /* Keybind file generation                                    */
  /* ---------------------------------------------------------- */
  async generateSTOKeybindFile (profile, options = {}) {
    const { environment = 'space', syncMode = false } = options
    const keys = this.extractKeys(profile, environment)
    
    const hasKeys = keys && Object.keys(keys).length > 0

    if (!hasKeys) {
      
      return `; No keybinds defined for this environment
; Profile: ${JSON.stringify(profile, null, 2)}
; Options: ${JSON.stringify(options, null, 2)}
`
    }

    const filename = `${profile.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${environment}.txt`
    let content = await this.generateFileHeader(profile, filename)
    
   
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

  async generateFileHeader (profile, syncFilename = null) {
    const timestamp = new Date().toLocaleString()
    const env = profile.currentEnvironment || 'space'
    const keyCount = Object.keys(this.extractKeys(profile, env)).length
    const aliasCount = Object.keys(profile.aliases || {}).length

    let header = `; ================================================================
; ${profile.name} - STO Keybind Configuration
; ================================================================
; Environment: ${env.toUpperCase()}
; Generated: ${timestamp}
; Created by: STO Tools Keybind Manager v${STO_DATA?.settings?.version ?? 'unknown'}
;
; Keybind Statistics:
; - Total keybinds: ${keyCount}
;
; To use this keybind file in Star Trek Online:
; 1. Save this file in your STO Live folder as a .txt file
; 2. In-game, type: /bind_load_file ${syncFilename}
; 3. Your keybinds will be applied immediately
;
; File Structure:
; - Aliases (if any) are defined first
; - Keybinds follow, organized by key
; ================================================================

`
    return header
  }

  async generateAliasSection (aliases, profile = {}) {
    if (!aliases || Object.keys(aliases).length === 0) return ''

    let content = `; Command Aliases
; ================================================================
; Aliases allow you to create custom commands that execute
; multiple commands in sequence. Use them in keybinds like any
; other command.
; ================================================================

`

    const sorted = Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))
    for (const [name, alias] of sorted) {
      let commandsArray = Array.isArray(alias.commands) ? alias.commands : []

      // Apply mirroring if aliasMetadata says so
      const shouldStabilize = (profile.aliasMetadata && profile.aliasMetadata[name] && profile.aliasMetadata[name].stabilizeExecutionOrder)

      if (shouldStabilize && commandsArray.length > 1) {
        const cmdParts = commandsArray.map(c => ({ command: c }))
        const mirroredStr = await this.request('fileops:generate-mirrored-commands', { commands: cmdParts })
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

  async generateKeybindSection (keys, options = {}) {
    const { environment = 'space', syncMode = false, profile } = options
    
    if (!keys || Object.keys(keys).length === 0) {
      return '; No keybinds defined\n'
    }

    let content = `; ==============================================================================\n`
    content += `; ${environment.toUpperCase()} KEYBINDS\n`
    content += `; ==============================================================================\n\n`
    
    // Generate keybind commands – apply mirroring when profile metadata says so
    for (const [key, commands] of Object.entries(keys)) {
      let cmds = commands
      const shouldStabilize = (profile.keybindMetadata && profile.keybindMetadata[environment] &&
        profile.keybindMetadata[environment][key] && profile.keybindMetadata[environment][key].stabilizeExecutionOrder)

      if (shouldStabilize && Array.isArray(commands) && commands.length > 1) {
        cmds = this.mirrorCommands(commands)
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
    
    content += '\n'
    return content
  }

  /* ---------------------------------------------------------- */
  /* CSV helpers                                                */
  /* ---------------------------------------------------------- */
  generateCSVData (profile) {
    const rows = []
    const env = profile.currentEnvironment || 'space'
    const keys = this.extractKeys(profile, env)

    const getCmdStr = (c) => typeof c === 'string' ? c : c.command

    Object.entries(keys).forEach(([key, commands]) => {
      commands.forEach((cmdObj, idx) => {
        const cmdStr = getCmdStr(cmdObj)
        rows.push({
          key,
          order: idx + 1,
          command: cmdStr,
          type: (cmdObj && cmdObj.type) || '',
          description: (cmdObj && cmdObj.text) || '',
        })
      })
    })

    // Aliases
    if (profile.aliases) {
      Object.values(profile.aliases).forEach((alias) => {
        rows.push({
          key: 'ALIAS',
          order: '',
          command: alias.name,
          type: 'alias',
          description: alias.description || '',
        })
      })
    }

    // Legacy header uses Title-case – keep for backward compatibility / tests
    const csvHeader = ['Key', 'Command', 'Type', 'Description', 'Position']
    const csvLines = [csvHeader.join(',')]
    rows.forEach((row) => {
      csvLines.push([
        this.escapeCSV(row.key),
        this.escapeCSV(row.command),
        this.escapeCSV(row.type),
        this.escapeCSV(row.description),
        this.escapeCSV(row.order),
      ].join(','))
    })
    return csvLines.join('\n')
  }

  escapeCSV (value) {
    if (value === null || value === undefined) return ''
    const str = value.toString()
    if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"'
    return str
  }

  /* ---------------------------------------------------------- */
  /* HTML helpers                                               */
  /* ---------------------------------------------------------- */
  generateHTMLReport (profile) {
    const env = profile.currentEnvironment || 'space'
    const keys = this.extractKeys(profile, env)
    const title = `${profile.name} – ${i18next.t('html_report_title')}`

    return `<!DOCTYPE html>
<html lang="${i18next.language}">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { font-size: 24px; margin-bottom: 10px; }
    h2 { font-size: 20px; margin-top: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    code { background-color: #eee; padding: 2px 4px; }
    .keybind { margin-bottom: 10px; }
    .command { background-color:#e0e0e0; padding:2px 4px; margin:1px; display:inline-block; }
  </style>
</head>
<body>
  <h1>${title}</h1>

  <h2>${i18next.t('keybinds')}</h2>
  ${this.generateHTMLKeybindSection(keys)}

  <h2>${i18next.t('aliases')}</h2>
  ${this.generateHTMLAliasSection(profile.aliases)}
</body>
</html>`
  }

  generateHTMLKeybindSection (keys) {
    if (!keys || Object.keys(keys).length === 0) return '<p>No keybinds defined</p>'

    const getCmdStr = (c) => typeof c === 'string' ? c : c.command

    let html = '<table><thead><tr><th>Key</th><th>Commands</th></tr></thead><tbody>'
    Object.entries(keys).forEach(([key, commands]) => {
      const commandList = commands
        .map(getCmdStr)
        .filter(Boolean)
        .map((c) => `<span class="command">${c}</span>`)
        .join(' ')
      html += `<tr><td><code>${key}</code></td><td>${commandList}</td></tr>`
    })
    html += '</tbody></table>'
    return html
  }

  generateHTMLAliasSection (aliases) {
    if (!aliases || Object.keys(aliases).length === 0) return '<p>No aliases defined</p>'

    let html = '<table><thead><tr><th>Alias</th><th>Commands</th><th>Description</th></tr></thead><tbody>'
    Object.values(aliases).forEach((alias) => {
      let commandsArray = Array.isArray(alias.commands) ? alias.commands : []
      const commandsDisplay = commandsArray.join(' $$ ')
      
      html += `<tr>
        <td><code>${alias.name}</code></td>
        <td><code>${commandsDisplay}</code></td>
        <td>${alias.description || ''}</td>
      </tr>`
    })
    html += '</tbody></table>'
    return html
  }

  /* ---------------------------------------------------------- */
  /* Import delegation to ImportService                         */
  /* ---------------------------------------------------------- */
  async importFromFile (file) {
    // Delegate to ImportService
    return await this.request('import:from-file', { file })
  }

  importJSONFile (content) {
    try {
      const data = JSON.parse(content)
      
      if (data.type === 'project') {
        // Delegate to ImportService
        return this.request('import:project-file', { content })
      } else if (data.name) {
        // Delegate to ImportService  
        return this.request('import:profile-file', { content })
      } else {
        throw new Error(i18next.t('import_failed_invalid_format'))
      }
    } catch (error) {
      throw new Error(i18next.t('import_failed_invalid_json'))
    }
  }

  /* ---------------------------------------------------------- */
  /* Alias file generation                                      */
  /* ---------------------------------------------------------- */
  async generateAliasFile (profile) {
    const aliases = profile.aliases || {}
    
    if (Object.keys(aliases).length === 0) {
      return '; No aliases defined\n'
    }

    let content = await this.generateAliasFileHeader(profile)
    
    // Generate alias content directly
    const sorted = Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))
    for (const [name, alias] of sorted) {
      let commandsArray = Array.isArray(alias.commands) ? alias.commands : []

      // Apply mirroring if aliasMetadata says so
      const shouldStabilize = (profile.aliasMetadata && profile.aliasMetadata[name] && profile.aliasMetadata[name].stabilizeExecutionOrder)

      if (shouldStabilize && commandsArray.length > 1) {
        const cmdParts = commandsArray.map(c => ({ command: c }))
        const mirroredStr = await this.request('fileops:generate-mirrored-commands', { commands: cmdParts })
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
    const env = profile.currentEnvironment || 'space'

    return `; ================================================================
; ${profile.name} - STO Alias Configuration
; ================================================================
; Mode: ${env.toUpperCase()}
; Generated: ${timestamp}
; Created by: STO Tools Keybind Manager v${STO_DATA?.settings?.version ?? 'unknown'}
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
        
        // Generate alias file if aliases exist
        if (profile.aliases && Object.keys(profile.aliases).length > 0) {
          const aliasContent = await this.generateAliasFile(profile)
          const filename = `${profileDir}/${sanitizedName}_aliases.txt`
          await writeFile(dirHandle, filename, aliasContent)
        }
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

      this.emit('toast:show', { 
        message: i18next.t('sync_completed'), 
        type: 'success' 
      })
    } catch (error) {
      this.emit('toast:show', { 
        message: i18next.t('sync_failed', { error: error.message }), 
        type: 'error' 
      })
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

  sanitizeProfileForExport (profile) {
    // Deep clone to avoid mutating original
    const sanitized = JSON.parse(JSON.stringify(profile))

    // Commands are now canonical strings, so no need to strip IDs
    // This function is kept for backward compatibility but is essentially a no-op
    const stripIds = (commands=[]) => {
      return normalizeToStringArray(commands)
    }

    // Strip IDs from all environments
    if (sanitized.keybinds) {
      Object.keys(sanitized.keybinds).forEach(env => {
        if (sanitized.keybinds[env]) {
          Object.keys(sanitized.keybinds[env]).forEach(key => {
            sanitized.keybinds[env][key] = stripIds(sanitized.keybinds[env][key])
          })
        }
      })
    }

    // Strip IDs from builds structure
    if (sanitized.builds) {
      Object.keys(sanitized.builds).forEach(env => {
        if (sanitized.builds[env] && sanitized.builds[env].keys) {
          Object.keys(sanitized.builds[env].keys).forEach(key => {
            sanitized.builds[env].keys[key] = stripIds(sanitized.builds[env].keys[key])
          })
        }
      })
    }

    return sanitized
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

  /* ---------------------------------------------------------- */
  /* Late-join state sync                                       */
  /* ---------------------------------------------------------- */
  getCurrentState () {
    return {
      currentProfile: this.cache.currentProfile,
      currentEnvironment: this.cache.currentEnvironment,
      profiles: this.cache.profiles
    }
  }

  handleInitialState (sender, state) {
    if (sender === 'DataCoordinator' && state?.profiles) {
      this.cache.profiles = state.profiles
      this.cache.currentProfile = state.currentProfile
      this.cache.currentEnvironment = state.currentEnvironment || 'space'
    }
  }

  /* ---------------------------------------------------------- */
  /* Utility                                                    */
  /* ---------------------------------------------------------- */
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