import ComponentBase from '../ComponentBase.js'
import i18next from 'i18next'
import store from '../../core/store.js'

export default class AliasModalService extends ComponentBase {
  constructor({ eventBus, storage, ui }) {
    super(eventBus)
    this.storage = storage
    this.ui = ui
    this.currentAlias = null
  }

  init() {
    super.init()
  }

  saveAlias({ name, description = '', commands }) {
    const validation = this.validateAlias(name, commands)
    if (!validation.valid) {
      if (this.ui && this.ui.showToast) {
        this.ui.showToast(i18next.t('validation_error'), 'error')
      }
      return false
    }

    const profile = this.getProfile()
    if (!profile) {
      if (this.ui && this.ui.showToast) {
        this.ui.showToast(i18next.t('no_active_profile'), 'error')
      }
      return false
    }

    if (!profile.aliases) {
      profile.aliases = {}
    }

    if (!this.currentAlias && profile.aliases[name]) {
      if (this.ui && this.ui.showToast) {
        this.ui.showToast(i18next.t('alias_exists'), 'error')
      }
      return false
    }

    profile.aliases[name] = {
      name,
      description,
      commands,
      created: this.currentAlias
        ? profile.aliases[name]?.created
        : new Date().toISOString(),
      lastModified: new Date().toISOString(),
    }

    // Persist changes
    if (this.storage && typeof this.storage.saveProfile === 'function') {
      this.storage.saveProfile(store.currentProfile, profile)
    }

    this.updateCommandLibrary()

    const action = this.currentAlias ? 'updated' : 'created'
    if (this.ui && this.ui.showToast) {
      this.ui.showToast(i18next.t(`alias_${action}`, { alias: name }), 'success')
    }

    return true
  }

  deleteAlias(aliasName) {
    const profile = this.getProfile()
    if (profile && profile.aliases && profile.aliases[aliasName]) {
      delete profile.aliases[aliasName]
      if (this.storage && typeof this.storage.saveProfile === 'function') {
        this.storage.saveProfile(store.currentProfile, profile)
      }
      this.updateCommandLibrary()
      if (this.ui && this.ui.showToast) {
        this.ui.showToast(
          i18next.t('alias_deleted', { alias: aliasName }),
          'success'
        )
      }
      return true
    }
    return false
  }

  useAlias(aliasName) {
    if (!store.selectedKey) {
      if (this.ui && this.ui.showToast) {
        this.ui.showToast(i18next.t('please_select_a_key_first'), 'warning')
      }
      return false
    }

    const command = {
      command: aliasName,
      type: 'alias',
      icon: '🎭',
      text: `Alias: ${aliasName}`,
      id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }

    // emit event so CommandChainService can handle append
    this.emit('commandlibrary:add', { categoryId: 'alias', commandId: aliasName, commandObj: command })

    if (this.ui && this.ui.showToast) {
      this.ui.showToast(
        i18next.t('alias_added_to_key', {
          alias: aliasName,
          key: store.selectedKey,
        }),
        'success'
      )
    }
    return true
  }

  validateAlias(name, commands) {
    if (!name) {
      return { valid: false, error: 'Alias name is required' }
    }

    if (!STO_DATA.validation.aliasNamePattern.test(name)) {
      return {
        valid: false,
        error:
          'Invalid alias name. Use only letters, numbers, and underscores. Must start with a letter.',
      }
    }

    if (name.length > 30) {
      return {
        valid: false,
        error: 'Alias name is too long (max 30 characters)',
      }
    }

    const reservedNames = [
      'alias',
      'bind',
      'unbind',
      'bind_load_file',
      'bind_save_file',
    ]
    if (reservedNames.includes(name.toLowerCase())) {
      return { valid: false, error: 'This is a reserved command name' }
    }

    if (!commands) {
      return { valid: false, error: 'Commands are required' }
    }

    if (commands.length > 500) {
      return {
        valid: false,
        error: 'Command sequence is too long (max 500 characters)',
      }
    }

    {
      const profile = this.getProfile()
      if (profile && profile.aliases) {
        const aliasNames = Object.keys(profile.aliases)
        if (
          aliasNames.some(
            (aliasName) => commands.includes(aliasName) && aliasName !== name
          )
        ) {
          return {
            valid: false,
            error: 'Potential circular reference detected',
          }
        }
      }
    }

    return { valid: true }
  }

  addAliasToKey(aliasName) {
    // Resolve the currently selected key/alias from the new service-first API.
    const selected = (window.app && app.commandLibraryService && app.commandLibraryService.selectedKey) || store.selectedKey || null

    if (!selected) {
      if (this.ui && this.ui.showToast) {
        this.ui.showToast(i18next.t('please_select_a_key_first'), 'warning')
      }
      return false
    }

    const profile = this.getProfile()
    const alias = profile.aliases[aliasName]

    if (!alias) {
      if (this.ui && this.ui.showToast) {
        this.ui.showToast(i18next.t('alias_not_found', { alias: aliasName }), 'error')
      }
      return false
    }

    const command = {
      command: aliasName,
      type: 'alias',
      icon: '🎭',
      text: `Alias: ${aliasName}`,
      description: alias.description,
      id: app.generateCommandId(),
    }

    app.addCommand(selected, command)
    
    if (this.ui && this.ui.showToast) {
      this.ui.showToast(
        i18next.t('alias_added_to_key', {
          alias: aliasName,
          key: selected,
        }),
        'success'
      )
    }
    
    return true
  }

  getAliasTemplates() {
    return {
      space_combat: {
        name: 'Space Combat',
        description: 'Aliases for space combat scenarios',
        templates: {
          AttackRun: {
            name: 'AttackRun',
            description: 'Full attack sequence with targeting',
            commands:
              'target_nearest_enemy $$ +STOTrayExecByTray 0 0 $$ +STOTrayExecByTray 0 1',
          },
          DefensiveMode: {
            name: 'DefensiveMode',
            description: 'Defensive abilities and shield management',
            commands:
              'target_self $$ +power_exec Distribute_Shields $$ +STOTrayExecByTray 2 0 $$ +STOTrayExecByTray 2 1',
          },
          HealSelf: {
            name: 'HealSelf',
            description: 'Self-healing sequence',
            commands:
              'target_self $$ +STOTrayExecByTray 3 0 $$ +STOTrayExecByTray 3 1',
          },
        },
      },
      ground_combat: {
        name: 'Ground Combat',
        description: 'Aliases for ground combat scenarios',
        templates: {
          GroundAttack: {
            name: 'GroundAttack',
            description: 'Basic ground combat sequence',
            commands:
              'target_nearest_enemy $$ +STOTrayExecByTray 0 0 $$ +STOTrayExecByTray 0 1',
          },
          GroundHeal: {
            name: 'GroundHeal',
            description: 'Ground healing sequence',
            commands:
              'target_self $$ +STOTrayExecByTray 1 0 $$ +STOTrayExecByTray 1 1',
          },
        },
      },
      communication: {
        name: 'Communication',
        description: 'Aliases for team communication',
        templates: {
          TeamReady: {
            name: 'TeamReady',
            description: 'Announce ready status to team',
            commands: 'team Ready!',
          },
          NeedHealing: {
            name: 'NeedHealing',
            description: 'Request healing from team',
            commands: 'team Need healing!',
          },
          Incoming: {
            name: 'Incoming',
            description: 'Warn team of incoming enemies',
            commands: 'team Incoming enemies!',
          },
        },
      },
    }
  }

  createAliasFromTemplate(category, templateId) {
    const templates = this.getAliasTemplates()
    const template = templates[category]?.templates?.[templateId]

    if (!template) {
      if (this.ui && this.ui.showToast) {
        this.ui.showToast(i18next.t('template_not_found'), 'error')
      }
      return false
    }

    const profile = this.getProfile()
    if (profile.aliases && profile.aliases[template.name]) {
      if (this.ui && this.ui.showToast) {
        this.ui.showToast(
          i18next.t('alias_template_exists', { alias: template.name }),
          'warning'
        )
      }
      return false
    }

    if (!profile.aliases) {
      profile.aliases = {}
    }

    profile.aliases[template.name] = {
      ...template,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    }

    if (this.storage && typeof this.storage.saveProfile === 'function') {
      this.storage.saveProfile(store.currentProfile, profile)
    }
    this.updateCommandLibrary()

    // Update the alias list UI if available - call the UI's renderAliasList method
    if (this.ui && typeof this.ui.renderAliasList === 'function') {
      this.ui.renderAliasList()
    }

    if (this.ui && this.ui.showToast) {
      this.ui.showToast(
        i18next.t('alias_created_from_template', { alias: template.name }),
        'success'
      )
    }
    return true
  }

  getAliasUsage(aliasName) {
    const profile = this.getProfile()
    if (!profile) return []

    const usage = []

    Object.entries(profile.keys).forEach(([key, commands]) => {
      commands.forEach((command, index) => {
        if (
          command.command === aliasName ||
          command.command.includes(aliasName)
        ) {
          usage.push({
            type: 'keybind',
            key: key,
            position: index + 1,
            context: `Key "${key}", command ${index + 1}`,
          })
        }
      })
    })

    Object.entries(profile.aliases || {}).forEach(([name, alias]) => {
      if (name !== aliasName && alias.commands.includes(aliasName)) {
        usage.push({
          type: 'alias',
          alias: name,
          context: `Alias "${name}"`,
        })
      }
    })

    return usage
  }

  createAliasChain(name, description = '') {
    const profile = this.getProfile()
    if (!profile) return

    // Initialize aliases object if it doesn't exist
    if (!profile.aliases) {
      profile.aliases = {}
    }

    // Check if alias already exists
    if (profile.aliases[name]) {
      if (this.ui && this.ui.showToast) {
        this.ui.showToast(i18next.t('alias_already_exists', {name: name}), 'error')
      }
      return
    }

    // Create new alias
    profile.aliases[name] = {
      name: name,
      description: description,
      commands: '',
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    }

    if (this.storage && typeof this.storage.saveProfile === 'function') {
      this.storage.saveProfile(store.currentProfile, profile)
    }
    // Save profile UI refresh
    this.updateCommandLibrary()
    
    // Update UI
    if (this.ui && this.ui.showToast) {
      this.ui.showToast(i18next.t('alias_created', {name: name}), 'success')
    }
  }

  renderAliasGrid() {
    // This method is now handled by AliasUI, but we keep it for backward compatibility
    if (this.ui && this.ui.renderAliasList) {
      this.ui.renderAliasList()
    }
  }

  getProfile() {
    const profileId = store.currentProfile
    return profileId ? this.storage.getProfile?.(profileId) : null
  }
}
