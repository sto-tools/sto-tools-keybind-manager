import ComponentBase from '../ComponentBase.js'
import i18next from 'i18next'
// Note: We intentionally import writeFile directly here instead of via index.js to avoid circular deps
import { writeFile } from './SyncService.js'

/**
 * ExportService – encapsulates all business-logic for exporting / importing
 * profiles, keybind data and project archives.  It is intentionally free of
 * DOM manipulation so that it can be re-used from unit tests, other services
 * and even a CLI context.
 */
export default class ExportService extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)

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
  }

  /* ---------------------------------------------------------- */
  /* Keybind file generation                                    */
  /* ---------------------------------------------------------- */
  generateSTOKeybindFile (profile, options = {}) {
    let content = ''

    // Header
    content += this.generateFileHeader(profile, options.syncFilename)

    // Keybind section
    const keysForEnv = this.extractKeys(
      profile,
      options.environment || profile.currentEnvironment || 'space'
    )

    content += this.generateKeybindSection(keysForEnv, {
      ...options,
      profile,
      environment: options.environment || profile.currentEnvironment || 'space',
    })

    // Footer
    content += this.generateFileFooter()
    return content
  }

  generateFileHeader (profile, syncFilename = null) {
    const timestamp = new Date().toLocaleString()

    // Stats – either via stoKeybinds helper or local fallback
    let stats
    const env = profile.currentEnvironment || 'space'
    const keysForEnv = this.extractKeys(profile, env)

    if (typeof stoKeybinds !== 'undefined' && stoKeybinds.getProfileStats) {
      stats = stoKeybinds.getProfileStats({ ...profile, keys: keysForEnv })
    } else {
      stats = {
        totalKeys: Object.keys(keysForEnv).length,
        totalCommands: Object.values(keysForEnv).reduce((a, v) => a + v.length, 0),
      }
    }

    const bindLoadFilename = syncFilename || this.generateFileName(profile, 'txt')

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

  generateKeybindSection (keys, options = {}) {
    if (!keys || Object.keys(keys).length === 0) return '; No keybinds defined\n\n'

    let content = `; Keybind Commands
; ================================================================
; Each line binds a key to one or more commands.
; Multiple commands are separated by $$`

    if (options.stabilizeExecutionOrder) {
      content += `
; EXECUTION ORDER STABILIZATION: ON
; Commands are mirrored to ensure consistent execution order
; Phase 1: left-to-right, Phase 2: right-to-left`
    }

    content += `
; ================================================================

`

    const sortedKeys = this._sortKeys(keys)
    const keyGroups = this.groupKeysByType(sortedKeys, keys)

    Object.entries(keyGroups).forEach(([groupName, groupKeys]) => {
      if (groupKeys.length === 0) return
      content += `; ${groupName}\n; ${'-'.repeat(groupName.length)}\n`

      groupKeys.forEach((key) => {
        const commands = keys[key]
        // Remove null/undefined placeholders that may remain after incomplete edits
        const cleanCommands = Array.isArray(commands)
          ? commands.filter((c) => c && typeof c.command === 'string')
          : []

        if (cleanCommands.length === 0) return

        const shouldStabilize = this._shouldStabilizeKey({ key, commands: cleanCommands, options })
        let commandString
        if (shouldStabilize && cleanCommands.length > 1) {
          commandString = stoKeybinds
            ? stoKeybinds.generateMirroredCommandString(cleanCommands)
            : cleanCommands.map((c) => c.command).join(' $$ ')
        } else {
          commandString = cleanCommands.map((c) => c.command).join(' $$ ')
        }
        content += `${key} "${commandString}"\n`
      })

      content += '\n'
    })
    return content
  }

  _sortKeys (keys) {
    if (typeof stoKeybinds !== 'undefined' && stoKeybinds.compareKeys) {
      return Object.keys(keys).sort(stoKeybinds.compareKeys.bind(stoKeybinds))
    }
    return Object.keys(keys).sort(this.compareKeys.bind(this))
  }

  _shouldStabilizeKey ({ key, commands, options }) {
    const globalStabilize = options.stabilizeExecutionOrder
    let perKeyStabilize = false

    if (options.profile?.keybindMetadata) {
      const envMeta = options.profile.keybindMetadata[options.environment]
      perKeyStabilize = !!(envMeta && envMeta[key] && envMeta[key].stabilizeExecutionOrder)
    }
    return globalStabilize || perKeyStabilize
  }

  /* ---------------------------------------------------------- */
  /* Key sorting + grouping helpers                             */
  /* ---------------------------------------------------------- */
  compareKeys (a, b) {
    const aIsF = a.match(/^F(\d+)$/)
    const bIsF = b.match(/^F(\d+)$/)
    if (aIsF && bIsF) return parseInt(aIsF[1]) - parseInt(bIsF[1])
    if (aIsF && !bIsF) return -1
    if (!aIsF && bIsF) return 1

    const aIsNum = /^\d+$/.test(a)
    const bIsNum = /^\d+$/.test(b)
    if (aIsNum && bIsNum) return parseInt(a) - parseInt(b)
    if (aIsNum && !bIsNum) return -1
    if (!aIsNum && bIsNum) return 1

    const aIsLetter = /^[A-Z]$/.test(a)
    const bIsLetter = /^[A-Z]$/.test(b)
    if (aIsLetter && bIsLetter) return a.localeCompare(b)
    if (aIsLetter && !bIsLetter) return -1
    if (!aIsLetter && bIsLetter) return 1

    const specialOrder = ['Space', 'Tab', 'Enter', 'Escape']
    const aSpecial = specialOrder.indexOf(a)
    const bSpecial = specialOrder.indexOf(b)
    if (aSpecial !== -1 && bSpecial !== -1) return aSpecial - bSpecial
    if (aSpecial !== -1 && bSpecial === -1) return -1
    if (aSpecial === -1 && bSpecial !== -1) return 1

    return a.localeCompare(b)
  }

  groupKeysByType (sortedKeys, keys) {
    const groups = {
      'Function Keys': [],
      'Number Keys': [],
      'Letter Keys': [],
      'Special Keys': [],
      'Modifier Combinations': [],
    }

    sortedKeys.forEach((key) => {
      if (/^F\d+$/.test(key)) groups['Function Keys'].push(key)
      else if (/^\d+$/.test(key)) groups['Number Keys'].push(key)
      else if (/^[A-Z]$/.test(key)) groups['Letter Keys'].push(key)
      else if (key.includes('+')) groups['Modifier Combinations'].push(key)
      else groups['Special Keys'].push(key)
    })
    return groups
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

  <p style="margin-top:40px;font-size:12px;color:#888;">
    Generated by STO Tools Keybind Manager v${STO_DATA?.settings?.version ?? 'unknown'}
  </p>
</body>
</html>`
  }

  generateHTMLKeybindSection (keys) {
    if (!keys || Object.keys(keys).length === 0) {
      return `<p>${i18next.t('no_keybinds_defined')}</p>`
    }
    const sortedKeys = this._sortKeys(keys)
    let html = `<div class="keybind-group"><h2>Keybinds</h2>`
    sortedKeys.forEach((key) => {
      const commands = keys[key]
      if (!commands || commands.length === 0) return
      const cmdSpans = commands
        .map((c) => {
          const label = c.text || c.command
          const cls = c.type ? ` ${c.type}` : ''
          return `<span class="command${cls}">${label}</span>`
        })
        .join('<span class="separator"> $$ </span>')
      html += `<div class="keybind"><div class="key">${key}</div><div class="commands">${cmdSpans}</div></div>`
    })
    html += '</div>'
    return html
  }

  generateHTMLAliasSection (aliases) {
    if (!aliases || Object.keys(aliases).length === 0) {
      return `<p>${i18next.t('no_aliases_defined')}</p>`
    }
    let html = `<div class="aliases"><h2>Command Aliases</h2>`
    Object.values(aliases).forEach((alias) => {
      html += `<div class="alias"><div class="alias-name">${alias.name}</div>${alias.description ? `<div>${alias.description}</div>` : ''}<div class="alias-commands">${alias.commands}</div></div>`
    })
    html += '</div>'
    return html
  }

  /* ---------------------------------------------------------- */
  /* Misc helpers                                               */
  /* ---------------------------------------------------------- */
  generateFileName (profile, extension, environment = profile.currentEnvironment || 'space') {
    const safe = profile.name.replace(/[^a-zA-Z0-9\-_]/g, '_')
    const env = environment && environment.length > 0 ? environment : 'space'
    const ts = new Date().toISOString().split('T')[0]
    return `${safe}_${env}_${ts}.${extension}`
  }

  generateAliasFileName (profile, extension) {
    const safe = profile.name.replace(/[^a-zA-Z0-9\-_]/g, '_')
    const ts = new Date().toISOString().split('T')[0]
    return `${safe}_aliases_${ts}.${extension}`
  }

  sanitizeProfileForExport (profile) {
    const clone = JSON.parse(JSON.stringify(profile))

    // Remove metadata fields commonly internal
    delete clone.id
    delete clone.created
    delete clone.modified

    const stripIds = (commands=[]) => {
      commands.forEach(cmd => { delete cmd.id })
    }

    // Legacy flat keys
    if (clone.keys) {
      Object.values(clone.keys).forEach(stripIds)
    }

    // Newer builds structure
    if (clone.builds) {
      Object.values(clone.builds).forEach(build => {
        if (build.keys) Object.values(build.keys).forEach(stripIds)
      })
    }

    return clone
  }

  /* ---------------------------------------------------------- */
  /* Import / Sync helpers                                      */
  /* ---------------------------------------------------------- */
  async importFromFile (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const content = e.target.result
          const ext = file.name.split('.').pop().toLowerCase()
          switch (ext) {
            case 'txt':
              resolve(stoKeybinds.importKeybindFile(content))
              break
            case 'json':
              resolve(this.importJSONFile(content))
              break
            default:
              reject(new Error('Unsupported file format'))
          }
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  importJSONFile (content) {
    try {
      const data = JSON.parse(content)
      if (data.type === 'profile' && data.profile) {
        if (window.app?.profileService) {
          return window.app.profileService.createProfile(
            data.profile.name || 'Imported Profile',
            data.profile.description || 'Imported profile',
            data.profile.currentEnvironment || 'space'
          )
        }
        throw new Error('Profile service not available')
      }
      if (data.type === 'project' && data.data) {
        return storageService.importData(JSON.stringify(data.data))
      }
      throw new Error('Unknown JSON file format')
    } catch (err) {
      throw new Error('Invalid JSON file: ' + err.message)
    }
  }

  generateAliasFile (profile) {
    let content = ''
    const ts = new Date().toLocaleString()
    const stats = { totalAliases: Object.keys(profile.aliases || {}).length }
    content += `; ================================================================
; ${profile.name} - STO Alias Configuration
; ================================================================
; Mode: ${(profile.currentEnvironment || 'space').toUpperCase()}
; Generated: ${ts}
; Created by: STO Tools Keybind Manager v${STO_DATA?.settings?.version ?? 'unknown'}
;
; Alias Statistics:
; - Total aliases: ${stats.totalAliases}
;
; To use these aliases in Star Trek Online:
; 1. Save this file as "CommandAliases.txt" (exactly, without quotes)
; 2. Place it in your STO directory:
;    [STO Install]\\Star Trek Online\\Live\\localdata\\CommandAliases.txt
; 3. The aliases will be available when you start the game
;
; ================================================================

`
    if (profile.aliases && Object.keys(profile.aliases).length > 0) {
      content += this.generateAliasSection(profile.aliases)
    } else {
      content += `; ${i18next.t('no_aliases_defined')}\n\n`
    }
    return content
  }

  async syncToFolder (dirHandle) {
    const data = storageService.getAllData()
    const exportData = {
      version: STO_DATA?.settings?.version ?? 'unknown',
      exported: new Date().toISOString(),
      type: 'project',
      data,
    }
    await writeFile(dirHandle, 'project.json', JSON.stringify(exportData, null, 2))

    const profiles = data.profiles || {}
    for (const profile of Object.values(profiles)) {
      const base = profile.name.replace(/[^a-zA-Z0-9\-_]/g, '_')

      const writeEnv = async (env) => {
        if (!profile.builds?.[env]) return
        const temp = {
          name: profile.name,
          currentEnvironment: env,
          keys: profile.builds[env].keys || {},
          keybindMetadata: profile.keybindMetadata || {},
        }
        const fname = `${base}_${env}.txt`
        const content = this.generateSTOKeybindFile(temp, {
          environment: env,
          syncFilename: fname,
          profile: temp,
        })
        await writeFile(dirHandle, `${base}/${fname}`, content)
      }

      await writeEnv('space')
      await writeEnv('ground')

      const aliasProfile = {
        name: profile.name,
        currentEnvironment: profile.currentEnvironment || 'space',
        aliases: profile.aliases || {},
      }
      const aliasContent = this.generateAliasFile(aliasProfile)
      await writeFile(dirHandle, `${base}/${base}_aliases.txt`, aliasContent)
    }
  }

  /* ---------------------------------------------------------- */
  /* Data retrieval                                             */
  /* ---------------------------------------------------------- */
  extractKeys (profile = {}, environment = 'space') {
    if (profile.keys && typeof profile.keys === 'object') return profile.keys
    if (profile.builds?.[environment]?.keys) return profile.builds[environment].keys
    return {}
  }
} 