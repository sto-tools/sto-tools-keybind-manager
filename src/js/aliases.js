// STO Tools Keybind Manager - Alias Management
// Handles command alias creation, editing, and management
import store from './store.js'
import eventBus from './eventBus.js'

export default class STOAliasManager {
  constructor() {
    this.currentAlias = null
    // Don't initialize immediately - wait for app to be ready
  }

  init() {
    this.setupEventListeners()
    // Update command library to show existing aliases on initialization
    this.updateCommandLibrary()
  }

  setupEventListeners() {
    // Alias manager button
    eventBus.onDom('addAliasBtn', 'click', 'alias-manager-open', () => {
      this.showAliasManager()
    })

    // New alias button
    eventBus.onDom('newAliasBtn', 'click', 'alias-new', () => {
      this.showEditAliasModal()
    })

    // Save alias button
    eventBus.onDom('saveAliasBtn', 'click', 'alias-save', () => {
      this.saveAlias()
    })

    // Alias input changes for live preview
    document.addEventListener('input', (e) => {
      if (
        ['aliasName', 'aliasCommands', 'aliasDescription'].includes(e.target.id)
      ) {
        this.updateAliasPreview()
      }
    })

    // Insert $Target variable button in alias editor
    document.addEventListener('click', (e) => {
      if (
        e.target.classList.contains('insert-target-btn') ||
        e.target.closest('.insert-target-btn')
      ) {
        e.preventDefault()
        const button = e.target.classList.contains('insert-target-btn')
          ? e.target
          : e.target.closest('.insert-target-btn')
        const textareaContainer = button.closest('.textarea-with-button')
        const textarea = textareaContainer
          ? textareaContainer.querySelector('textarea')
          : null

        if (textarea) {
          this.insertTargetVariable(textarea)
        }
      }
    })
  }

  // Alias Manager Modal
  showAliasManager() {
    this.renderAliasList()
    modalManager.show('aliasManagerModal')
  }

  renderAliasList() {
    const container = document.getElementById('aliasList')
    if (!container) return

    const profile = app.getCurrentProfile()
    if (!profile || !profile.aliases) {
      container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-mask"></i>
                    <h4>No Aliases</h4>
                    <p>Create command aliases to simplify complex command sequences.</p>
                </div>
            `
      return
    }

    const aliases = Object.entries(profile.aliases)

    if (aliases.length === 0) {
      container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-mask"></i>
                    <h4>No Aliases</h4>
                    <p>Create command aliases to simplify complex command sequences.</p>
                </div>
            `
      return
    }

    container.innerHTML = `
            <div class="alias-grid">
                ${aliases.map(([name, alias]) => this.createAliasCard(name, alias)).join('')}
            </div>
        `

    // Add event listeners to alias cards
    container.querySelectorAll('.alias-card').forEach((card) => {
      const aliasName = card.dataset.alias

      card.querySelector('.edit-alias-btn')?.addEventListener('click', () => {
        this.editAlias(aliasName)
      })

      card.querySelector('.delete-alias-btn')?.addEventListener('click', () => {
        this.confirmDeleteAlias(aliasName)
      })

      card.querySelector('.use-alias-btn')?.addEventListener('click', () => {
        this.useAlias(aliasName)
      })
    })
  }

  createAliasCard(name, alias) {
    const commandPreview =
      alias.commands.length > 60
        ? alias.commands.substring(0, 60) + '...'
        : alias.commands

    return `
            <div class="alias-card" data-alias="${name}">
                <div class="alias-header">
                    <h4>${name}</h4>
                    <div class="alias-actions">
                        <button class="btn btn-small-icon edit-alias-btn" title="Edit Alias">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-small-icon use-alias-btn" title="Add to Current Key">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn btn-small-icon btn-danger delete-alias-btn" title="Delete Alias">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="alias-description">
                    ${alias.description || 'No description'}
                </div>
                <div class="alias-commands">
                    <code>${commandPreview}</code>
                </div>
                <div class="alias-usage">
                    Usage: <code>${name}</code>
                </div>
            </div>
        `
  }

  // Edit Alias Modal
  showEditAliasModal(aliasName = null) {
    const title = document.getElementById('editAliasTitle')
    const nameInput = document.getElementById('aliasName')
    const descInput = document.getElementById('aliasDescription')
    const commandsInput = document.getElementById('aliasCommands')

    if (aliasName) {
      // Editing existing alias
      const profile = app.getCurrentProfile()
      const alias = profile.aliases[aliasName]

      if (title) title.textContent = 'Edit Alias'
      if (nameInput) {
        nameInput.value = aliasName
        nameInput.disabled = true // Can't change alias name
      }
      if (descInput) descInput.value = alias.description || ''
      if (commandsInput) commandsInput.value = alias.commands

      this.currentAlias = aliasName
    } else {
      // Creating new alias
      if (title) title.textContent = 'New Alias'
      if (nameInput) {
        nameInput.value = ''
        nameInput.disabled = false
      }
      if (descInput) descInput.value = ''
      if (commandsInput) commandsInput.value = ''

      this.currentAlias = null
    }

    this.updateAliasPreview()
    modalManager.hide('aliasManagerModal')
    modalManager.show('editAliasModal')
  }

  editAlias(aliasName) {
    this.showEditAliasModal(aliasName)
  }

  async confirmDeleteAlias(aliasName) {
    const confirmed = await stoUI.confirm(
      `Are you sure you want to delete the alias "${aliasName}"?`,
      'Delete Alias',
      'danger'
    )

    if (confirmed) {
      this.deleteAlias(aliasName)
    }
  }

  deleteAlias(aliasName) {
    const profile = app.getCurrentProfile()
    if (profile && profile.aliases && profile.aliases[aliasName]) {
      delete profile.aliases[aliasName]
      app.saveProfile()
      app.setModified(true)

      this.renderAliasList()
      this.updateCommandLibrary()

      stoUI.showToast(`Alias "${aliasName}" deleted`, 'success')
    }
  }

  useAlias(aliasName) {
    if (!store.selectedKey) {
      stoUI.showToast('Please select a key first', 'warning')
      return
    }

    const command = {
      command: aliasName,
      type: 'alias',
      icon: '🎭',
      text: `Alias: ${aliasName}`,
      id: app.generateCommandId(),
    }

    app.addCommand(store.selectedKey, command)
    modalManager.hide('aliasManagerModal')
    stoUI.showToast(
      `Alias "${aliasName}" added to ${store.selectedKey}`,
      'success'
    )
  }

  // Save Alias
  saveAlias() {
    const nameInput = document.getElementById('aliasName')
    const descInput = document.getElementById('aliasDescription')
    const commandsInput = document.getElementById('aliasCommands')

    if (!nameInput || !commandsInput) return

    const name = nameInput.value.trim()
    const description = descInput?.value.trim() || ''
    const commands = commandsInput.value.trim()

    // Validation
    const validation = this.validateAlias(name, commands)
    if (!validation.valid) {
      stoUI.showToast(validation.error, 'error')
      return
    }

    const profile = app.getCurrentProfile()
    if (!profile) {
      stoUI.showToast('No active profile', 'error')
      return
    }

    // Initialize aliases object if it doesn't exist
    if (!profile.aliases) {
      profile.aliases = {}
    }

    // Check for duplicate names (only when creating new alias)
    if (!this.currentAlias && profile.aliases[name]) {
      stoUI.showToast('An alias with this name already exists', 'error')
      nameInput.focus()
      return
    }

    // Save alias
    profile.aliases[name] = {
      name: name,
      description: description,
      commands: commands,
      created: this.currentAlias
        ? profile.aliases[name]?.created
        : new Date().toISOString(),
      lastModified: new Date().toISOString(),
    }

    app.saveProfile()
    app.setModified(true)

    // Update UI
    this.updateCommandLibrary()

    const action = this.currentAlias ? 'updated' : 'created'
    stoUI.showToast(`Alias "${name}" ${action}`, 'success')

    modalManager.hide('editAliasModal')
    this.showAliasManager()
  }

  validateAlias(name, commands) {
    // Validate name
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

    // Check for reserved names
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

    // Validate commands
    if (!commands) {
      return { valid: false, error: 'Commands are required' }
    }

    if (commands.length > 500) {
      return {
        valid: false,
        error: 'Command sequence is too long (max 500 characters)',
      }
    }

    // Check for circular references (only if app is available)
    if (typeof app !== 'undefined' && app.getCurrentProfile) {
      const profile = app.getCurrentProfile()
      if (profile && profile.aliases) {
        const aliasNames = Object.keys(profile.aliases)
        if (
          aliasNames.some(
            (aliasName) => commands.includes(aliasName) && aliasName !== name
          )
        ) {
          // This is a simplified check - a more thorough check would trace the full dependency graph
          return {
            valid: false,
            error: 'Potential circular reference detected',
          }
        }
      }
    }

    return { valid: true }
  }

  updateAliasPreview() {
    const preview = document.getElementById('aliasPreview')
    const nameInput = document.getElementById('aliasName')
    const commandsInput = document.getElementById('aliasCommands')

    if (!preview || !nameInput || !commandsInput) return

    const name = nameInput.value.trim() || 'AliasName'
    const commands = commandsInput.value.trim() || 'command sequence'

    preview.textContent = `alias ${name} <& ${commands} &>`
  }

  // Command Library Integration
  updateCommandLibrary() {
    const profile = app.getCurrentProfile()
    if (!profile || !profile.aliases) return

    // Find or create aliases category in command library
    const categories = document.getElementById('commandCategories')
    if (!categories) return

    // Remove existing alias categories
    const existingAliasCategory = categories.querySelector(
      '[data-category="aliases"]'
    )
    if (existingAliasCategory) {
      existingAliasCategory.remove()
    }
    const existingVertigoCategory = categories.querySelector(
      '[data-category="vertigo-aliases"]'
    )
    if (existingVertigoCategory) {
      existingVertigoCategory.remove()
    }

    // Separate regular aliases from VFX aliases
    const allAliases = Object.entries(profile.aliases)
    const regularAliases = allAliases.filter(
      ([name, alias]) => !name.startsWith('dynFxSetFXExlusionList_')
    )
    const vertigoAliases = allAliases.filter(([name, alias]) =>
      name.startsWith('dynFxSetFXExlusionList_')
    )

    // Add regular aliases category if there are regular aliases
    if (regularAliases.length > 0) {
      const aliasCategory = this.createAliasCategoryElement(
        regularAliases,
        'aliases',
        'Command Aliases',
        'fas fa-mask'
      )
      categories.appendChild(aliasCategory)
    }

    // Add VFX aliases category if there are VERTIGO aliases
    if (vertigoAliases.length > 0) {
      const vertigoCategory = this.createAliasCategoryElement(
        vertigoAliases,
        'vertigo-aliases',
        'VFX Aliases',
        'fas fa-eye-slash'
      )
      categories.appendChild(vertigoCategory)
    }
  }

  createAliasCategoryElement(
    aliases,
    categoryType = 'aliases',
    title = 'Command Aliases',
    iconClass = 'fas fa-mask'
  ) {
    const element = document.createElement('div')
    element.className = 'category'
    element.dataset.category = categoryType

    // Check if category should be collapsed (similar to main command library)
    const storageKey = `commandCategory_${categoryType}_collapsed`
    const isCollapsed = localStorage.getItem(storageKey) === 'true'

    // Choose appropriate icon and styling for different alias types
    const isVertigo = categoryType === 'vertigo-aliases'
    const itemIcon = isVertigo ? '👁️' : '🎭'
    const itemClass = isVertigo
      ? 'command-item vertigo-alias-item'
      : 'command-item alias-item'

    element.innerHTML = `
            <h4 class="${isCollapsed ? 'collapsed' : ''}" data-category="${categoryType}">
                <i class="fas fa-chevron-right category-chevron"></i>
                <i class="${iconClass}"></i> 
                ${title}
                <span class="command-count">(${aliases.length})</span>
            </h4>
            <div class="category-commands ${isCollapsed ? 'collapsed' : ''}">
                ${aliases
                  .map(
                    ([name, alias]) => `
                    <div class="${itemClass}" data-alias="${name}" title="${alias.description || alias.commands}">
                        ${itemIcon} ${name}
                    </div>
                `
                  )
                  .join('')}
            </div>
        `

    // Add click handler for category header
    const header = element.querySelector('h4')
    header.addEventListener('click', () => {
      this.toggleAliasCategory(categoryType, element)
    })

    // Add click handlers for aliases
    element.addEventListener('click', (e) => {
      if (
        e.target.classList.contains('alias-item') ||
        e.target.classList.contains('vertigo-alias-item')
      ) {
        const aliasName = e.target.dataset.alias
        this.addAliasToKey(aliasName)
      }
    })

    return element
  }

  toggleAliasCategory(categoryType, element) {
    const header = element.querySelector('h4')
    const commands = element.querySelector('.category-commands')
    const chevron = header.querySelector('.category-chevron')

    const isCollapsed = commands.classList.contains('collapsed')
    const storageKey = `commandCategory_${categoryType}_collapsed`

    if (isCollapsed) {
      commands.classList.remove('collapsed')
      header.classList.remove('collapsed')
      chevron.style.transform = 'rotate(90deg)'
      localStorage.setItem(storageKey, 'false')
    } else {
      commands.classList.add('collapsed')
      header.classList.add('collapsed')
      chevron.style.transform = 'rotate(0deg)'
      localStorage.setItem(storageKey, 'true')
    }
  }

  addAliasToKey(aliasName) {
    if (!store.selectedKey) {
      stoUI.showToast('Please select a key first', 'warning')
      return
    }

    const profile = app.getCurrentProfile()
    const alias = profile.aliases[aliasName]

    if (!alias) {
      stoUI.showToast('Alias not found', 'error')
      return
    }

    const command = {
      command: aliasName,
      type: 'alias',
      icon: '🎭',
      text: `Alias: ${aliasName}`,
      description: alias.description,
      id: app.generateCommandId(),
    }

    app.addCommand(store.selectedKey, command)
  }

  // Alias Templates
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
      stoUI.showToast('Template not found', 'error')
      return
    }

    // Check if alias already exists
    const profile = app.getCurrentProfile()
    if (profile.aliases && profile.aliases[template.name]) {
      stoUI.showToast(`Alias "${template.name}" already exists`, 'warning')
      return
    }

    // Create alias
    if (!profile.aliases) {
      profile.aliases = {}
    }

    profile.aliases[template.name] = {
      ...template,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    }

    app.saveProfile()
    app.setModified(true)

    this.updateCommandLibrary()
    this.renderAliasList()

    stoUI.showToast(`Alias "${template.name}" created from template`, 'success')
  }

  // Utility Methods

  getAliasUsage(aliasName) {
    const profile = app.getCurrentProfile()
    if (!profile) return []

    const usage = []

    // Check in keybinds
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

    // Check in other aliases
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

  insertTargetVariable(textarea) {
    const targetVar = '$Target'
    const cursorPosition = textarea.selectionStart
    const value = textarea.value
    const newValue =
      value.slice(0, cursorPosition) + targetVar + value.slice(cursorPosition)
    textarea.value = newValue
    textarea.setSelectionRange(
      cursorPosition + targetVar.length,
      cursorPosition + targetVar.length
    )
    textarea.focus()

    // Trigger input event to update preview
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

// Global alias manager instance
