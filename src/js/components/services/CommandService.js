import ComponentBase from '../ComponentBase.js'

/**
 * CommandService – the authoritative service for creating, deleting and
 * rearranging commands in a profile.  It owns no UI concerns whatsoever.  A
 * higher-level feature (CommandLibraryService / future templates) can call
 * this service to persist changes and broadcast events.
 */
export default class CommandService extends ComponentBase {
  constructor ({ storage, eventBus, i18n, ui } = {}) {
    super(eventBus)
    this.storage = storage
    this.i18n = i18n
    this.ui = ui

    this.selectedKey = null
    this.currentEnvironment = 'space'
    this.currentProfile = null
  }

  /* ------------------------------------------------------------------
   * State setters
   * ------------------------------------------------------------------ */
  setSelectedKey (key) {
    this.selectedKey = key
  }

  setCurrentEnvironment (environment) {
    this.currentEnvironment = environment
  }

  setCurrentProfile (profileId) {
    this.currentProfile = profileId
  }

  /** Convenience getter */
  getCurrentProfileId () {
    return this.currentProfile
  }

  /* ------------------------------------------------------------------
   * Profile helpers – copied verbatim from the original CommandLibraryService
   * ------------------------------------------------------------------ */
  getCurrentProfile () {
    if (!this.currentProfile) return null
    const profile = this.storage.getProfile(this.currentProfile)
    if (!profile) return null
    return this.getCurrentBuild(profile)
  }

  getCurrentBuild (profile) {
    if (!profile) return null

    if (!profile.builds) {
      profile.builds = {
        space: { keys: {} },
        ground: { keys: {} },
      }
    }

    if (!profile.builds[this.currentEnvironment]) {
      profile.builds[this.currentEnvironment] = { keys: {} }
    }

    if (!profile.builds[this.currentEnvironment].keys) {
      profile.builds[this.currentEnvironment].keys = {}
    }

    return {
      ...profile,
      keys: profile.builds[this.currentEnvironment].keys,
      aliases: profile.aliases || {},
    }
  }

  /* ------------------------------------------------------------------
   * Core command operations
   * ------------------------------------------------------------------ */
  /** Add a command (either to a keybind array or to an alias command string) */
  addCommand (key, command) {
    if (!this.selectedKey) {
      this.ui?.showToast?.(this.i18n.t('please_select_a_key_first'), 'warning')
      return false
    }

    const profile = this.getCurrentProfile()
    if (!profile) {
      this.ui?.showToast?.(this.i18n.t('no_valid_profile'), 'error')
      return false
    }

    if (this.currentEnvironment === 'alias') {
      // ----- Alias chain -----
      const currentAlias = profile.aliases && profile.aliases[key]
      const currentCommands = currentAlias && currentAlias.commands
        ? currentAlias.commands.split(/\s*\$\$\s*/).filter((cmd) => cmd.trim().length > 0)
        : []
      currentCommands.push(command.command)
      const newCommandString = currentCommands.join(' $$ ')
      if (!profile.aliases) profile.aliases = {}
      if (!profile.aliases[key]) profile.aliases[key] = {}
      profile.aliases[key].commands = newCommandString
    } else {
      // ----- Key-bind -----
      if (!profile.keys[key]) profile.keys[key] = []
      profile.keys[key].push(command)
    }

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('command-added', { key, command })
    return true
  }

  /** Delete command */
  deleteCommand (key, index) {
    const profile = this.getCurrentProfile()
    if (!profile) return false

    const isAliasContext =
      this.currentEnvironment === 'alias' ||
      (profile.aliases && Object.prototype.hasOwnProperty.call(profile.aliases, key))

    if (isAliasContext) {
      const currentAlias = profile.aliases && profile.aliases[key]
      if (!currentAlias || !currentAlias.commands) return false

      const commands = currentAlias.commands
        .split(/\s*\$\$\s*/)
        .filter((cmd) => cmd.trim().length > 0)

      if (index >= 0 && index < commands.length) {
        commands.splice(index, 1)
        profile.aliases[key].commands = commands.join(' $$ ')
      }
    } else {
      if (profile.keys[key] && profile.keys[key][index]) {
        profile.keys[key].splice(index, 1)
      }
    }

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('command-deleted', { key, index })
    return true
  }

  /** Move command */
  moveCommand (key, fromIndex, toIndex) {
    const profile = this.getCurrentProfile()
    if (!profile) return false

    if (this.currentEnvironment === 'alias') {
      const currentAlias = profile.aliases && profile.aliases[key]
      if (!currentAlias || !currentAlias.commands) return false

      const commands = currentAlias.commands
        .split(/\s*\$\$\s*/)
        .filter((cmd) => cmd.trim().length > 0)

      if (
        fromIndex >= 0 &&
        fromIndex < commands.length &&
        toIndex >= 0 &&
        toIndex < commands.length
      ) {
        const [moved] = commands.splice(fromIndex, 1)
        commands.splice(toIndex, 0, moved)
        profile.aliases[key].commands = commands.join(' $$ ')
      }
    } else {
      if (
        profile.keys[key] &&
        fromIndex >= 0 &&
        fromIndex < profile.keys[key].length &&
        toIndex >= 0 &&
        toIndex < profile.keys[key].length
      ) {
        const [moved] = profile.keys[key].splice(fromIndex, 1)
        profile.keys[key].splice(toIndex, 0, moved)
      }
    }

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('command-moved', { key, fromIndex, toIndex })
    return true
  }

  /* ------------------------------------------------------------------
   * Command lookup helpers (unchanged from library)
   * ------------------------------------------------------------------ */
  findCommandDefinition (command) {
    if (!STO_DATA || !STO_DATA.commands) return null
    // Special Tray logic is preserved from original implementation (copy-paste)
    const isTrayExec = command.command && command.command.includes('TrayExec')
    if (isTrayExec) {
      const trayCategory = STO_DATA.commands.tray
      if (trayCategory) {
        if (command.command.includes('TrayExecByTrayWithBackup') && command.command.includes('$$')) {
          return { commandId: 'tray_range_with_backup', ...trayCategory.commands.tray_range_with_backup }
        } else if (
          (command.command.includes('STOTrayExecByTray') || command.command.includes('TrayExecByTray')) &&
          command.command.includes('$$') &&
          !command.command.includes('WithBackup')
        ) {
          return { commandId: 'tray_range', ...trayCategory.commands.tray_range }
        } else if (command.command.includes('TrayExecByTrayWithBackup')) {
          return { commandId: 'tray_with_backup', ...trayCategory.commands.tray_with_backup }
        } else if (
          command.command.includes('STOTrayExecByTray') ||
          (command.command.includes('TrayExecByTray') && !command.command.includes('WithBackup'))
        ) {
          return { commandId: 'custom_tray', ...trayCategory.commands.custom_tray }
        }
      }
    }

    const category = STO_DATA.commands[command.type]
    if (!category) return null

    for (const [cmdId, cmdDef] of Object.entries(category.commands)) {
      if (cmdDef.command === command.command) {
        return { commandId: cmdId, ...cmdDef }
      }
    }

    for (const [cmdId, cmdDef] of Object.entries(category.commands)) {
      if (cmdDef.customizable && command.command.startsWith(cmdDef.command.split(' ')[0])) {
        return { commandId: cmdId, ...cmdDef }
      }
    }

    return null
  }

  getCommandWarning (command) {
    if (!STO_DATA || !STO_DATA.commands) return null

    const categories = STO_DATA.commands
    for (const [categoryId, category] of Object.entries(categories)) {
      for (const [cmdId, cmdData] of Object.entries(category.commands)) {
        if (
          cmdData.command === command.command ||
          cmdData.name === command.text ||
          (command.command && command.command.includes(cmdData.command))
        ) {
          return cmdData.warning || null
        }
      }
    }
    return null
  }

  /* ------------------------------------------------------------------ */
  generateCommandId () {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  onInit () {
    this.setupEventListeners()
  }

  setupEventListeners () {
    if (!this.eventBus) return

    // UI emits when a keybind is chosen
    this.eventBus.on('key-selected', ({ key, name } = {}) => {
      this.selectedKey = key || name || null
    })

    // Alias browser emits when an alias is chosen
    this.eventBus.on('alias-selected', ({ name } = {}) => {
      if (!name) return
      this.currentEnvironment = 'alias'
      this.selectedKey = name
    })

    // Mode switches between space/ground via modeManagement
    this.eventBus.on('environment-changed', ({ environment } = {}) => {
      if (environment) this.currentEnvironment = environment
    })

    // Profile service tells us when the active profile changes
    this.eventBus.on('profile-switched', ({ profile, environment } = {}) => {
      this.currentProfile = profile
      if (environment) this.currentEnvironment = environment
      // Reset key selection – UI will emit a fresh key-selected later.
      this.selectedKey = null
    })
  }
} 