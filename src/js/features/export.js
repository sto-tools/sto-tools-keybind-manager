// STO Tools Keybind Manager - Export Functionality
// Handles exporting keybinds and profiles in various formats
import eventBus from '../core/eventBus.js'
import i18next from 'i18next'
import { writeFile } from '../services/sync.js'

export default class STOExportManager {
  constructor() {
    // Initialize as null - will be set up in init() after i18next is ready
    this.exportFormats = null
  }

  init() {
    // Initialize export formats after i18next is ready
    this.exportFormats = {
      sto_keybind: i18next.t('sto_keybind_file_txt'),
      json_profile: i18next.t('json_profile_json'),
      json_project: i18next.t('complete_project_json'),
      csv_data: i18next.t('csv_data_csv'),
      html_report: i18next.t('html_report_html'),
      alias_file: i18next.t('alias_file_txt'),
    }
    
    this.setupEventListeners()
  }

  setupEventListeners() {
    // Main export button
    eventBus.onDom('exportKeybindsBtn', 'click', 'exportKeybinds', () => {
      this.showExportOptions()
    })

    // Confirm export
    eventBus.onDom('confirmExportBtn', 'click', 'export-confirm', () => {
      this.performExport()
    })

    // Copy command preview
    eventBus.onDom('copyPreviewBtn', 'click', 'copyPreview', () => {
      this.copyCommandPreview()
    })
  }

  // Export Options Dialog
  async showExportOptions() {
    const profile = app.getCurrentProfile()
    if (!profile) {
      stoUI.showToast(i18next.t('no_profile_selected_to_export'), 'warning')
      return
    }

    stoUI.showModal('exportModal')
  }

  // Regenerate export modal content for language changes
  populateExportModal() {
    // Re-apply translations to the modal
    const modal = document.getElementById('exportModal')
    if (modal && typeof window.applyTranslations === 'function') {
      window.applyTranslations(modal)
    }
  }

  performExport() {
    const profile = app.getCurrentProfile()
    if (!profile) {
      stoUI.showToast(i18next.t('no_profile_selected_to_export'), 'warning')
      return
    }

    const select = document.getElementById('exportFormat')
    const format = select ? select.value : 'sto_keybind'
    const envSelect = document.getElementById('exportEnvironment')
    const environment = envSelect && envSelect.value
      ? envSelect.value
      : profile.currentEnvironment || 'space'

    switch (format) {
      case 'sto_keybind':
        this.exportSTOKeybindFile(profile, environment)
        break
      case 'json_profile':
        this.exportJSONProfile(profile, environment)
        break
      case 'json_project':
        this.exportCompleteProject()
        break
      case 'csv_data':
        this.exportCSVData(profile, environment)
        break
      case 'html_report':
        this.exportHTMLReport(profile, environment)
        break
      case 'alias_file':
        this.exportAliases(profile)
        break
      default:
        break
    }

    stoUI.hideModal('exportModal')
  }

  // STO Keybind File Export
  exportSTOKeybindFile(profile, environment = profile.currentEnvironment || 'space') {
    try {
      const content = this.generateSTOKeybindFile(profile, { environment })
      this.downloadFile(
        content,
        this.generateFileName(profile, 'txt', environment),
        'text/plain'
      )

      stoUI.showToast(i18next.t('keybind_file_exported'), 'success')
    } catch (error) {
      stoUI.showToast(
        i18next.t('failed_to_export_keybind_file', { error: error.message }),
        'error'
      )
    }
  }

  generateSTOKeybindFile(profile, options = {}) {
    let content = ''

    // Header with metadata
    content += this.generateFileHeader(profile, options.syncFilename)

    // Export keybinds only (aliases are exported separately)
    // Pass the profile and environment (if available) to the keybind section for per-key metadata access
    content += this.generateKeybindSection(profile.keys, {
      ...options,
      profile,
      // Support explicit environment option
      environment: options.environment || profile.currentEnvironment || 'space',
    })

    // Footer with usage instructions
    content += this.generateFileFooter()

    return content
  }

  generateFileHeader(profile, syncFilename = null) {
    const timestamp = new Date().toLocaleString()

    // Calculate stats locally if stoKeybinds is not available
    let stats
    if (typeof stoKeybinds !== 'undefined' && stoKeybinds.getProfileStats) {
      stats = stoKeybinds.getProfileStats(profile)
    } else {
      // Calculate stats locally
      stats = {
        totalKeys: Object.keys(profile.keys || {}).length,
        totalCommands: 0,
      }

      Object.values(profile.keys || {}).forEach((commands) => {
        stats.totalCommands += commands.length
      })
    }

    // Use syncFilename if provided (for syncToFolder), otherwise generate timestamped filename
    const bindLoadFilename = syncFilename || this.generateFileName(profile, 'txt')

    return `; ================================================================
; ${profile.name} - STO Keybind Configuration
; ================================================================
; Mode: ${(profile.currentEnvironment || 'space').toUpperCase()}
; Generated: ${timestamp}
; Created by: STO Tools Keybind Manager v${STO_DATA.settings.version}
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

  generateAliasSection(aliases) {
    if (!aliases || Object.keys(aliases).length === 0) {
      return ''
    }

    let content = `; Command Aliases
; ================================================================
; Aliases allow you to create custom commands that execute
; multiple commands in sequence. Use them in keybinds like any
; other command.
; ================================================================

`

    // Sort aliases alphabetically
    const sortedAliases = Object.entries(aliases).sort(([a], [b]) =>
      a.localeCompare(b)
    )

    sortedAliases.forEach(([name, alias]) => {
      if (alias.description) {
        content += `; ${alias.description}\n`
      }
      content += `alias ${name} <& ${alias.commands} &>\n\n`
    })

    return content
  }

  generateKeybindSection(keys, options = {}) {
    if (!keys || Object.keys(keys).length === 0) {
      return '; No keybinds defined\n\n'
    }

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

    // Sort keys using the keybind manager's sorting logic if available, otherwise use local sorting
    let sortedKeys
    if (typeof stoKeybinds !== 'undefined' && stoKeybinds.compareKeys) {
      sortedKeys = Object.keys(keys).sort(
        stoKeybinds.compareKeys.bind(stoKeybinds)
      )
    } else {
      // Local key sorting implementation
      sortedKeys = Object.keys(keys).sort(this.compareKeys.bind(this))
    }

    // Group keys by type for better organization
    const keyGroups = this.groupKeysByType(sortedKeys, keys)

    Object.entries(keyGroups).forEach(([groupName, groupKeys]) => {
      if (groupKeys.length === 0) return

      content += `; ${groupName}\n`
      content += `; ${'-'.repeat(groupName.length)}\n`

      groupKeys.forEach((key) => {
        const commands = keys[key]
        if (commands && commands.length > 0) {
          let commandString

          // Global stabilization
          const globalStabilize = options.stabilizeExecutionOrder

          // Environment-scoped per-key stabilization
          let perKeyStabilize = false

          if (options.profile && options.profile.keybindMetadata) {
            if (
              options.environment &&
              options.profile.keybindMetadata[options.environment]
            ) {
              // Environment-scoped structure: keybindMetadata -> environment -> key
              const envMeta =
                options.profile.keybindMetadata[options.environment]
              perKeyStabilize = !!(
                envMeta &&
                envMeta[key] &&
                envMeta[key].stabilizeExecutionOrder
              )
            }
          }

          const shouldStabilize = globalStabilize || perKeyStabilize

          if (shouldStabilize && commands.length > 1) {
            // Use mirroring for stabilized execution order
            commandString = stoKeybinds
              ? stoKeybinds.generateMirroredCommandString(commands)
              : commands.map((cmd) => cmd.command).join(' $$ ')
          } else {
            commandString = commands.map((cmd) => cmd.command).join(' $$ ')
          }
          content += `${key} "${commandString}"\n`
        }
      })

      content += '\n'
    })

    return content
  }

  // Local key comparison for sorting
  compareKeys(a, b) {
    // Function keys first
    const aIsF = a.match(/^F(\d+)$/)
    const bIsF = b.match(/^F(\d+)$/)

    if (aIsF && bIsF) {
      return parseInt(aIsF[1]) - parseInt(bIsF[1])
    }
    if (aIsF && !bIsF) return -1
    if (!aIsF && bIsF) return 1

    // Numbers next
    const aIsNum = /^\d+$/.test(a)
    const bIsNum = /^\d+$/.test(b)

    if (aIsNum && bIsNum) {
      return parseInt(a) - parseInt(b)
    }
    if (aIsNum && !bIsNum) return -1
    if (!aIsNum && bIsNum) return 1

    // Letters
    const aIsLetter = /^[A-Z]$/.test(a)
    const bIsLetter = /^[A-Z]$/.test(b)

    if (aIsLetter && bIsLetter) {
      return a.localeCompare(b)
    }
    if (aIsLetter && !bIsLetter) return -1
    if (!aIsLetter && bIsLetter) return 1

    // Special keys
    const specialOrder = ['Space', 'Tab', 'Enter', 'Escape']
    const aSpecial = specialOrder.indexOf(a)
    const bSpecial = specialOrder.indexOf(b)

    if (aSpecial !== -1 && bSpecial !== -1) {
      return aSpecial - bSpecial
    }
    if (aSpecial !== -1 && bSpecial === -1) return -1
    if (aSpecial === -1 && bSpecial !== -1) return 1

    // Default alphabetical
    return a.localeCompare(b)
  }

  groupKeysByType(sortedKeys, keys) {
    const groups = {
      'Function Keys': [],
      'Number Keys': [],
      'Letter Keys': [],
      'Special Keys': [],
      'Modifier Combinations': [],
    }

    sortedKeys.forEach((key) => {
      if (/^F\d+$/.test(key)) {
        groups['Function Keys'].push(key)
      } else if (/^\d+$/.test(key)) {
        groups['Number Keys'].push(key)
      } else if (/^[A-Z]$/.test(key)) {
        groups['Letter Keys'].push(key)
      } else if (key.includes('+')) {
        groups['Modifier Combinations'].push(key)
      } else {
        groups['Special Keys'].push(key)
      }
    })

    return groups
  }

  generateFileFooter() {
    return `; ================================================================
; End of keybind file
; ================================================================
; 
; Additional STO Commands Reference:
; 
; Targeting:
;   target_nearest_enemy    - Target closest hostile
;   target_nearest_friend   - Target closest friendly
;   target_self            - Target your own ship
; 
; Combat:
;   FireAll               - Fire all weapons
;   FirePhasers          - Fire beam weapons only
;   FireTorps            - Fire torpedo weapons only
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

  // JSON Profile Export
  exportJSONProfile(profile, environment = profile.currentEnvironment || 'space') {
    try {
      const exportData = {
        version: STO_DATA.settings.version,
        exported: new Date().toISOString(),
        type: 'profile',
        profile: this.sanitizeProfileForExport(profile),
      }

      const content = JSON.stringify(exportData, null, 2)
      this.downloadFile(
        content,
        this.generateFileName(profile, 'json', environment),
        'application/json'
      )

      stoUI.showToast(i18next.t('profile_exported_json'), 'success')
    } catch (error) {
      stoUI.showToast(
        i18next.t('failed_to_export_profile', { error: error.message }),
        'error'
      )
    }
  }

  // Complete Project Export
  exportCompleteProject() {
    try {
      const data = stoStorage.getAllData()
      const exportData = {
        version: STO_DATA.settings.version,
        exported: new Date().toISOString(),
        type: 'project',
        data: data,
      }

      const content = JSON.stringify(exportData, null, 2)
      const filename = `STO_Tools_Keybinds_Project_${new Date().toISOString().split('T')[0]}.json`
      this.downloadFile(content, filename, 'application/json')

      stoUI.showToast(i18next.t('complete_project_exported'), 'success')
    } catch (error) {
      stoUI.showToast(
        i18next.t('failed_to_export_project', { error: error.message }),
        'error'
      )
    }
  }

  // CSV Data Export
  exportCSVData(profile, environment = profile.currentEnvironment || 'space') {
    try {
      const csvContent = this.generateCSVData(profile)
      this.downloadFile(
        csvContent,
        this.generateFileName(profile, 'csv', environment),
        'text/csv'
      )

      stoUI.showToast(i18next.t('data_exported_csv'), 'success')
    } catch (error) {
      stoUI.showToast(
        i18next.t('failed_to_export_csv', { error: error.message }),
        'error'
      )
    }
  }

  generateCSVData(profile) {
    let csv = i18next.t('csv_header') + '\n'

    Object.entries(profile.keys).forEach(([key, commands]) => {
      commands.forEach((command, index) => {
        const row = [
          this.escapeCSV(key),
          this.escapeCSV(command.command),
          this.escapeCSV(command.type),
          this.escapeCSV(command.text || ''),
          index + 1,
        ].join(',')
        csv += row + '\n'
      })
    })

    return csv
  }

  escapeCSV(value) {
    if (typeof value !== 'string') {
      value = String(value)
    }

    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return '"' + value.replace(/"/g, '""') + '"'
    }

    return value
  }

  // HTML Report Export
  exportHTMLReport(profile, environment = profile.currentEnvironment || 'space') {
    try {
      const htmlContent = this.generateHTMLReport(profile)
      this.downloadFile(
        htmlContent,
        this.generateFileName(profile, 'html', environment),
        'text/html'
      )

      stoUI.showToast(i18next.t('html_report_exported'), 'success')
    } catch (error) {
      stoUI.showToast(
        i18next.t('failed_to_export_html_report', { error: error.message }),
        'error'
      )
    }
  }

  generateHTMLReport(profile) {
    const stats = stoKeybinds.getProfileStats(profile)
    const timestamp = new Date().toLocaleString()

    return `<!DOCTYPE html>
<html lang="${i18next.language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${profile.name} - ${i18next.t('sto_keybind_report')}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .stats { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 30px; }
        .keybind-group { margin-bottom: 30px; }
        .keybind-group h3 { color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
        .keybind { margin-bottom: 15px; padding: 10px; background: #fafafa; border-left: 4px solid #007acc; }
        .key { font-weight: bold; color: #007acc; }
        .commands { margin-top: 5px; }
        .command { display: inline-block; margin: 2px 5px 2px 0; padding: 2px 8px; background: #e0e0e0; border-radius: 3px; font-size: 0.9em; }
        .command.targeting { background: #d4edda; }
        .command.combat { background: #f8d7da; }
        .command.tray { background: #cce5ff; }
        .command.power { background: #fff3cd; }
        .command.alias { background: #e2e3e5; }
        .aliases { margin-top: 30px; }
        .alias { margin-bottom: 15px; padding: 10px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 5px; }
        .alias-name { font-weight: bold; color: #495057; }
        .alias-commands { font-family: monospace; background: #e9ecef; padding: 5px; margin-top: 5px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${profile.name}</h1>
        <p><strong>${i18next.t('mode')}</strong> ${(profile.currentEnvironment || 'space').toUpperCase()}</p>
        <p><strong>${i18next.t('generated')}</strong> ${timestamp}</p>
        <p><strong>${i18next.t('created_by')}</strong> STO Tools Keybind Manager v${STO_DATA.settings.version}</p>
    </div>

    <div class="stats">
        <h2>${i18next.t('statistics')}</h2>
        <ul>
            <li><strong>${i18next.t('keys_bound')}</strong> ${stats.totalKeys}</li>
            <li><strong>${i18next.t('total_commands')}</strong> ${stats.totalCommands}</li>
            <li><strong>${i18next.t('aliases_defined')}</strong> ${stats.totalAliases}</li>
        </ul>
    </div>

    ${this.generateHTMLKeybindSection(profile.keys)}
    ${this.generateHTMLAliasSection(profile.aliases)}

    <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; color: #666; font-size: 0.9em;">
        <p>${i18next.t('report_footer')}</p>
    </div>
</body>
</html>`
  }

  generateHTMLKeybindSection(keys) {
    if (!keys || Object.keys(keys).length === 0) {
      return `<div class="keybind-group"><h2>${i18next.t('keybinds')}</h2><p>${i18next.t('no_keybinds_defined')}</p></div>`
    }

    const sortedKeys = Object.keys(keys).sort(
      stoKeybinds.compareKeys.bind(stoKeybinds)
    )
    const keyGroups = this.groupKeysByType(sortedKeys, keys)

    let html = `<div class="keybind-group"><h2>${i18next.t('keybinds')}</h2>`

    Object.entries(keyGroups).forEach(([groupName, groupKeys]) => {
      if (groupKeys.length === 0) return

      html += `<h3>${groupName}</h3>`

      groupKeys.forEach((key) => {
        const commands = keys[key]
        if (commands && commands.length > 0) {
          html += `<div class="keybind">
                        <div class="key">${key}</div>
                        <div class="commands">
                            ${commands
                              .map(
                                (cmd) =>
                                  `<span class="command ${cmd.type}">${cmd.text || cmd.command}</span>`
                              )
                              .join('')}
                        </div>
                    </div>`
        }
      })
    })

    html += '</div>'
    return html
  }

  generateHTMLAliasSection(aliases) {
    if (!aliases || Object.keys(aliases).length === 0) {
      return ''
    }

    let html = `<div class="aliases"><h2>${i18next.t('command_aliases')}</h2>`

    Object.entries(aliases)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([name, alias]) => {
        html += `<div class="alias">
                <div class="alias-name">${name}</div>
                ${alias.description ? `<div>${alias.description}</div>` : ''}
                <div class="alias-commands">${alias.commands}</div>
            </div>`
      })

    html += '</div>'
    return html
  }

  // Copy Operations
  copyCommandPreview() {
    const preview = document.getElementById('commandPreview')
    if (!preview || !preview.textContent.trim()) {
      stoUI.showToast(i18next.t('no_command_to_copy'), 'warning')
      return
    }

    stoUI.copyToClipboard(preview.textContent)
  }

  // Utility Methods
  generateFileName(profile, extension, environment = profile.currentEnvironment || 'space') {
    const env = environment || profile.currentEnvironment || 'space'
    const safeName = profile.name.replace(/[^a-zA-Z0-9\-_]/g, '_')
    const timestamp = new Date().toISOString().split('T')[0]
    return `${safeName}_${env}_${timestamp}.${extension}`
  }

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  sanitizeProfileForExport(profile) {
    // Create a clean copy of the profile for export
    const sanitized = JSON.parse(JSON.stringify(profile))

    // Remove any internal IDs or temporary data
    if (sanitized.keys) {
      Object.values(sanitized.keys).forEach((commands) => {
        commands.forEach((command) => {
          // Keep essential data, remove internal IDs
          delete command.id
        })
      })
    }

    return sanitized
  }

  // Batch Export Operations
  exportAllProfiles() {
    const data = stoStorage.getAllData()
    const profiles = data.profiles

    if (!profiles || Object.keys(profiles).length === 0) {
      stoUI.showToast(i18next.t('no_profiles_to_export'), 'warning')
      return
    }

    // Create a zip-like structure (for now, export as separate files)
    Object.entries(profiles).forEach(([id, profile]) => {
      setTimeout(() => {
        this.exportSTOKeybindFile(profile)
      }, 100) // Small delay to prevent browser blocking
    })

    stoUI.showToast(
      i18next.t('exporting_profiles', {
        count: Object.keys(profiles).length,
      }),
      'info'
    )
  }

  // Import Operations (for completeness)
  async importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const content = e.target.result
          const extension = file.name.split('.').pop().toLowerCase()

          switch (extension) {
            case 'txt':
              resolve(stoKeybinds.importKeybindFile(content))
              break
            case 'json':
              resolve(this.importJSONFile(content))
              break
            default:
              reject(new Error('Unsupported file format'))
          }
        } catch (error) {
          reject(error)
        }
      }

      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  importJSONFile(content) {
    try {
      const data = JSON.parse(content)

      if (data.type === 'profile' && data.profile) {
        return stoProfiles.importProfile(content)
      } else if (data.type === 'project' && data.data) {
        return stoStorage.importData(JSON.stringify(data.data))
      } else {
        throw new Error('Unknown JSON file format')
      }
    } catch (error) {
      throw new Error('Invalid JSON file: ' + error.message)
    }
  }

  // Separate Alias Export
  exportAliases(profile) {
    try {
      const content = this.generateAliasFile(profile)
      this.downloadFile(
        content,
        this.generateAliasFileName(profile, 'txt'),
        'text/plain'
      )

      stoUI.showToast(i18next.t('aliases_exported_successfully'), 'success')
    } catch (error) {
      stoUI.showToast(
        i18next.t('failed_to_export_aliases', { error: error.message }),
        'error'
      )
    }
  }

  generateAliasFile(profile) {
    let content = ''

    // Header with metadata
    const timestamp = new Date().toLocaleString()
    const stats = {
      totalAliases: Object.keys(profile.aliases || {}).length,
    }

    content += `; ================================================================
; ${profile.name} - STO Alias Configuration
; ================================================================
; Mode: ${(profile.currentEnvironment || 'space').toUpperCase()}
; Generated: ${timestamp}
; Created by: STO Tools Keybind Manager v${STO_DATA.settings.version}
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
; Alternative: You can append these aliases to an existing CommandAliases.txt
; file if you already have one with other aliases.
;
; Common STO installation paths:
; - Steam: C:\\Program Files (x86)\\Steam\\steamapps\\common\\Star Trek Online
; - Epic: C:\\Program Files\\Epic Games\\Star Trek Online  
; - Arc: C:\\Program Files (x86)\\Perfect World Entertainment\\Arc Games\\Star Trek Online
; ================================================================

`

    // Export aliases
    if (profile.aliases && Object.keys(profile.aliases).length > 0) {
      content += this.generateAliasSection(profile.aliases)
    } else {
      content += `; ${i18next.t('no_aliases_defined')}\n\n`
    }

    return content
  }

  generateAliasFileName(profile, extension) {
    const safeName = profile.name.replace(/[^a-zA-Z0-9\-_]/g, '_')
    const timestamp = new Date().toISOString().split('T')[0]
    // Aliases are not environment specific; omit environment from filename
    return `${safeName}_aliases_${timestamp}.${extension}`
  }

  async syncToFolder(dirHandle) {
    const data = stoStorage.getAllData()
    const exportData = {
      version: STO_DATA.settings.version,
      exported: new Date().toISOString(),
      type: 'project',
      data,
    }
    await writeFile(dirHandle, 'project.json', JSON.stringify(exportData, null, 2))

    const profiles = data.profiles || {}
    for (const profile of Object.values(profiles)) {
      const base = profile.name.replace(/[^a-zA-Z0-9\-_]/g, '_')
      
      // Generate keybind files for each environment if builds exist
      if (profile.builds?.space) {
        const temp = {
          name: profile.name,
          currentEnvironment: 'space',
          keys: profile.builds.space.keys || {},
          // Include keybindMetadata for stabilization settings
          keybindMetadata: profile.keybindMetadata || {},
        }
        const syncFilename = `${base}_space.txt`
        const content = this.generateSTOKeybindFile(temp, { 
          environment: 'space',
          syncFilename: syncFilename,
          profile: temp
        })
        await writeFile(dirHandle, `${base}/${syncFilename}`, content)
      }
      if (profile.builds?.ground) {
        const temp = {
          name: profile.name,
          currentEnvironment: 'ground',
          keys: profile.builds.ground.keys || {},
          // Include keybindMetadata for stabilization settings
          keybindMetadata: profile.keybindMetadata || {},
        }
        const syncFilename = `${base}_ground.txt`
        const content = this.generateSTOKeybindFile(temp, { 
          environment: 'ground',
          syncFilename: syncFilename,
          profile: temp
        })
        await writeFile(dirHandle, `${base}/${syncFilename}`, content)
      }
      
      // Generate alias file - aliases are profile-level, not build-specific
      const aliases = profile.aliases || {}
      const aliasProfile = {
        name: profile.name,
        currentEnvironment: profile.currentEnvironment || 'space',
        aliases,
      }
      const aliasContent = this.generateAliasFile(aliasProfile)
      await writeFile(dirHandle, `${base}/${base}_aliases.txt`, aliasContent)
    }
  }
}

// Global export manager instance
