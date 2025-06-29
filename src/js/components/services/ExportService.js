import ComponentBase from '../ComponentBase.js'
import i18next from 'i18next'
import { respond, request } from '../../core/requestResponse.js'
// Note: We intentionally import writeFile directly here instead of via index.js to avoid circular deps
import { writeFile } from './SyncService.js'

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

    // Map of export formats (filled in once i18next has been initialised)
    this.exportFormats = null

    // Bind commonly passed-around helper so that callers can use it as a
    // callback without losing context.
    this.extractKeys = this.extractKeys.bind(this)
  }

  /* ---------------------------------------------------------- */
  /* Lifecycle                                                  */
  /* ---------------------------------------------------------- */
  onInit () {
    this.exportFormats = {
      sto_keybind: i18next.t('sto_keybind_file_txt'),
      json_profile: i18next.t('json_profile_json'),
      json_project: i18next.t('complete_project_json'),
      csv_data: i18next.t('csv_data_csv'),
      html_report: i18next.t('html_report_html'),
      alias_file: i18next.t('alias_file_txt'),
    }
    
    this.setupRequestHandlers()
  }

  setupRequestHandlers() {
    
    // Export generation requests
    this.respond('export:generate-keybind-file', async ({ profile, options = {} }) => 
      await this.generateSTOKeybindFile(profile, options))
    
    this.respond('export:generate-alias-file', async ({ profile }) => 
      await this.generateAliasFile(profile))
    
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
  }

  /* ---------------------------------------------------------- */
  /* Keybind file generation                                    */
  /* ---------------------------------------------------------- */
  async generateSTOKeybindFile (profile, options = {}) {
    let content = ''

    // Header
    content += await this.generateFileHeader(profile, options.syncFilename)

    // Keybind section
    const keysForEnv = this.extractKeys(
      profile,
      options.environment || profile.currentEnvironment || 'space'
    )

    content += await this.generateKeybindSection(keysForEnv, {
      ...options,
      profile,
      environment: options.environment || profile.currentEnvironment || 'space',
    })

    // Footer
    content += this.generateFileFooter()
    return content
  }

  async generateFileHeader (profile, syncFilename = null) {
    const timestamp = new Date().toLocaleString()

    // Stats – get via FileOperationsService
    const env = profile.currentEnvironment || 'space'
    const keysForEnv = this.extractKeys(profile, env)

    const stats = await this.request('fileops:get-profile-stats', {
      profile: { ...profile, keys: keysForEnv }
    }).catch(() => ({
      totalKeys: Object.keys(keysForEnv).length,
      totalCommands: Object.values(keysForEnv).reduce((a, v) => a + v.length, 0),
    }))

    const bindLoadFilename = syncFilename || await this.generateFileName(profile, 'txt')

    return `; ================================================================
; ${profile.name} - STO Keybind Configuration
; ================================================================
; Mode: ${(profile.currentEnvironment || 'space').toUpperCase()}
; Generated: ${timestamp}
; Created by: STO Tools Keybind Manager v${STO_DATA?.settings?.version ?? 'unknown'}
;
; Keybind Statistics:
; - Keys bound: ${stats.totalKeys}
; - Total commands: ${stats.totalCommands}
;
; Note: Aliases are exported separately
; To use this file in Star Trek Online:
; 1. Save this file to your STO Live folder
; 2. In game, type: /bind_load_file ${bindLoadFilename}
; ================================================================

`
  }

  generateAliasSection (aliases) {
    if (!aliases || Object.keys(aliases).length === 0) return ''

    let content = `; Command Aliases
; ================================================================
; Aliases allow you to create custom commands that execute
; multiple commands in sequence. Use them in keybinds like any
; other command.
; ================================================================

`

    const sorted = Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))
    sorted.forEach(([name, alias]) => {
      if (alias.description) content += `; ${alias.description}\n`
      content += `alias ${name} <& ${alias.commands} &>\n\n`
    })
    return content
  }

  async generateKeybindSection (keys, options = {}) {
    if (!keys || Object.keys(keys).length === 0) return '; No keybinds defined\n\n'

    // Use FileOperationsService to generate the keybind section
    return await this.request('fileops:generate-keybind-section', {
      keys,
      options: {
        stabilizeExecutionOrder: options.stabilizeExecutionOrder,
        profile: options.profile,
        environment: options.environment,
        grouped: true // Always use grouped output for export
      }
    })
  }



  generateFileFooter () {
    return `; ================================================================
; End of keybind file
; ================================================================
; 
; Additional STO Commands Reference:
; 
; Targeting:
;   target_nearest_enemy    - Target closest hostile
;   target_nearest_friend   - Target closest friendly
;   target_self             - Target your own ship
; 
; Combat:
;   FireAll                 - Fire all weapons
;   FirePhasers             - Fire beam weapons only
;   FireTorps               - Fire torpedo weapons only
; 
; Shield Management:
;   +power_exec <ability> - Execute bridge officer ability
;   Examples: +power_exec Distribute_Shields 
; 
; Tray Execution:
;   +STOTrayExecByTray <tray> <slot> - Execute ability from tray
;   Example: +STOTrayExecByTray 0 0  (Tray 1, Slot 1)
; 
; For more commands and help, visit the STO Wiki or community forums.
; ================================================================
`
  }

  /* ---------------------------------------------------------- */
  /* CSV helpers                                                */
  /* ---------------------------------------------------------- */
  generateCSVData (profile) {
    const rows = []
    const env = profile.currentEnvironment || 'space'
    const keys = this.extractKeys(profile, env)

    Object.entries(keys).forEach(([key, commands]) => {
      commands.forEach((cmdObj, idx) => {
        rows.push({
          key,
          order: idx + 1,
          command: cmdObj.command,
          type: cmdObj.type || '',
          description: cmdObj.text || '',
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

    let html = '<table><thead><tr><th>Key</th><th>Commands</th></tr></thead><tbody>'
    Object.entries(keys).forEach(([key, commands]) => {
      const commandList = commands
        .filter((c) => c && c.command)
        .map((c) => `<span class="command">${c.command}</span>`)
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
      html += `<tr>
        <td><code>${alias.name}</code></td>
        <td><code>${alias.commands}</code></td>
        <td>${alias.description || ''}</td>
      </tr>`
    })
    html += '</tbody></table>'
    return html
  }

  async generateFileName (profile, extension, environment = profile.currentEnvironment || 'space') {
    return await this.request('fileops:generate-filename', {
      profile,
      ext: extension,
      environment
    })
  }

  generateAliasFileName (profile, extension) {
    const sanitized = profile.name.replace(/[^a-zA-Z0-9_-]/g, '_')
    return `${sanitized}_aliases.${extension}`
  }

  sanitizeProfileForExport (profile) {
    // Deep clone to avoid mutating original
    const sanitized = JSON.parse(JSON.stringify(profile))

    // Strip internal IDs from commands to prevent bloat in exported files
    const stripIds = (commands=[]) => {
      return commands.map(cmd => {
        if (!cmd || typeof cmd !== 'object') return cmd
        const { id, ...rest } = cmd
        return rest
      })
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

    return sanitized
  }

  async importFromFile (file) {
    const content = await file.text()
    const filename = file.name.toLowerCase()

    if (filename.endsWith('.json')) {
      return this.importJSONFile(content)
    } else if (filename.endsWith('.txt')) {
      // Use FileOperationsService for keybind file import
      return await this.request('fileops:import-keybind-file', {
        content,
        filename: file.name
      }).catch((error) => {
        console.error('Failed to import keybind file via FileOperationsService:', error)
        throw new Error(i18next.t('import_failed_invalid_format'))
      })
    } else {
      throw new Error(i18next.t('import_failed_unsupported_format'))
    }
  }

  importJSONFile (content) {
    try {
      const data = JSON.parse(content)
      
      // Validate basic structure
      if (!data || typeof data !== 'object') {
        throw new Error(i18next.t('import_failed_invalid_json'))
      }

      // If it looks like a profile, return it
      if (data.name || data.keybinds || data.aliases) {
        return { type: 'profile', data }
      }

      // If it looks like a project (array of profiles or has profiles property)
      if (Array.isArray(data) || data.profiles) {
        return { type: 'project', data }
      }

      throw new Error(i18next.t('import_failed_unrecognized_format'))
    } catch (error) {
      if (error.name === 'SyntaxError') {
        throw new Error(i18next.t('import_failed_invalid_json'))
      }
      throw error
    }
  }

  async generateAliasFile (profile) {
    let content = ''

    // Generate alias file header
    content += await this.generateAliasFileHeader(profile)

    // Generate alias content via FileOperationsService
    const aliasContent = await this.request('fileops:generate-alias-file', {
      aliases: profile.aliases || {}
    })

    content += aliasContent

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

  async syncToFolder (dirHandle) {
    const profiles = this.storage.getAllProfiles()
    const results = []

    for (const profile of profiles) {
      const writeEnv = async (env) => {
        try {
          const keys = this.extractKeys(profile, env)
          if (Object.keys(keys).length === 0) return null

          const content = await this.generateSTOKeybindFile(profile, { environment: env })
          const filename = await this.generateFileName(profile, 'txt', env)
          await writeFile(dirHandle, filename, content)
          return { environment: env, filename, success: true }
        } catch (error) {
          return { environment: env, success: false, error: error.message }
        }
      }

      const envResults = await Promise.all([
        writeEnv('space'),
        writeEnv('ground')
      ])

      results.push({
        profile: profile.name,
        environments: envResults.filter(r => r !== null)
      })
    }

    return results
  }

  extractKeys (profile = {}, environment = 'space') {
    return profile.keybinds?.[environment] || {}
  }
} 