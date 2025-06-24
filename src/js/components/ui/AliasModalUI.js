import ComponentBase from '../ComponentBase.js'
import i18next from 'i18next'

export default class AliasModalUI extends ComponentBase {
  constructor({ service, eventBus, ui, modalManager, document }) {
    super(eventBus)
    this.service = service
    this.ui = ui
    this.modalManager = modalManager
    this.document = document
  }

  init() {
    super.init()
    this.setupEventListeners()
  }

  setupEventListeners() {
    this.eventBus.onDom('newAliasBtn', 'click', 'alias-new', () => {
      this.showEditAliasModal()
    })

    this.eventBus.onDom('saveAliasBtn', 'click', 'alias-save', () => {
      this.handleSaveAlias()
    })

    this.document.addEventListener('input', (e) => {
      if (['aliasName', 'aliasCommands', 'aliasDescription'].includes(e.target.id)) {
        this.updateAliasPreview()
      }
    })

    this.document.addEventListener('click', (e) => {
      if (e.target.classList.contains('insert-target-btn') || e.target.closest('.insert-target-btn')) {
        e.preventDefault()
        const button = e.target.classList.contains('insert-target-btn') ? e.target : e.target.closest('.insert-target-btn')
        const textareaContainer = button.closest('.textarea-with-button')
        const textarea = textareaContainer ? textareaContainer.querySelector('textarea') : null
        if (textarea) {
          this.insertTargetVariable(textarea)
        }
      }
    })
  }

  showAliasManager() {
    this.renderAliasList()
    this.modalManager.show('aliasManagerModal')
  }

  renderAliasList() {
    const container = this.document.getElementById('aliasList')
    if (!container) return

    const profile = this.service.getProfile()
    if (!profile || !profile.aliases || Object.keys(profile.aliases).length === 0) {
      container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-mask"></i>
                    <h4>${i18next.t('no_aliases')}</h4>
                    <p>${i18next.t('create_aliases_hint')}</p>
                </div>
            `
      return
    }

    const aliases = Object.entries(profile.aliases)
    container.innerHTML = `
            <div class="alias-grid">
                ${aliases.map(([name, alias]) => this.createAliasCard(name, alias)).join('')}
            </div>
        `

    container.querySelectorAll('.alias-card').forEach((card) => {
      const aliasName = card.dataset.alias

      card.querySelector('.edit-alias-btn')?.addEventListener('click', () => {
        this.editAlias(aliasName)
      })

      card.querySelector('.delete-alias-btn')?.addEventListener('click', () => {
        this.confirmDeleteAlias(aliasName)
      })

      card.querySelector('.use-alias-btn')?.addEventListener('click', () => {
        this.service.useAlias(aliasName)
      })
    })
  }

  createAliasCard(name, alias) {
    const commandPreview =
      alias.commands.length > 60 ? alias.commands.substring(0, 60) + '...' : alias.commands

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

  showEditAliasModal(aliasName = null) {
    const title = this.document.getElementById('editAliasTitle')
    const nameInput = this.document.getElementById('aliasName')
    const descInput = this.document.getElementById('aliasDescription')
    const commandsInput = this.document.getElementById('aliasCommands')

    if (aliasName) {
      const profile = this.service.getProfile()
      const alias = profile.aliases[aliasName]

      if (title) title.textContent = i18next.t('edit_alias')
      if (nameInput) {
        nameInput.value = aliasName
        nameInput.disabled = true
      }
      if (descInput) descInput.value = alias.description || ''
      if (commandsInput) commandsInput.value = alias.commands

      this.service.currentAlias = aliasName
    } else {
      if (title) title.textContent = i18next.t('new_alias')
      if (nameInput) {
        nameInput.value = ''
        nameInput.disabled = false
      }
      if (descInput) descInput.value = ''
      if (commandsInput) commandsInput.value = ''

      this.service.currentAlias = null
    }

    this.updateAliasPreview()
    this.modalManager.hide('aliasManagerModal')
    this.modalManager.show('editAliasModal')
  }

  editAlias(aliasName) {
    this.showEditAliasModal(aliasName)
  }

  async confirmDeleteAlias(aliasName) {
    const confirmed = await this.ui.confirm(
      i18next.t('confirm_delete_alias', { aliasName }),
      i18next.t('delete_alias'),
      'danger'
    )

    if (confirmed) {
      this.service.deleteAlias(aliasName)
      this.renderAliasList()
    }
  }

  handleSaveAlias() {
    const nameInput = this.document.getElementById('aliasName')
    const descInput = this.document.getElementById('aliasDescription')
    const commandsInput = this.document.getElementById('aliasCommands')
    if (!nameInput || !commandsInput) return

    const name = nameInput.value.trim()
    const description = descInput?.value.trim() || ''
    const commands = commandsInput.value.trim()

    const success = this.service.saveAlias({ name, description, commands })
    if (success) {
      this.modalManager.hide('editAliasModal')
      this.showAliasManager()
    }
  }

  updateAliasPreview() {
    const preview = this.document.getElementById('aliasPreview')
    const nameInput = this.document.getElementById('aliasName')
    const commandsInput = this.document.getElementById('aliasCommands')
    if (!preview || !nameInput || !commandsInput) return

    const name = nameInput.value.trim() || 'AliasName'
    const commands = commandsInput.value.trim() || 'command sequence'

    preview.textContent = `alias ${name} <& ${commands} &>`
  }

  insertTargetVariable(textarea) {
    const cursorPos = textarea.selectionStart
    const textBefore = textarea.value.substring(0, cursorPos)
    const textAfter = textarea.value.substring(cursorPos)
    
    textarea.value = textBefore + '$Target' + textAfter
    textarea.selectionStart = textarea.selectionEnd = cursorPos + 7
    
    // Maintain focus on the textarea
    textarea.focus()
    
    // Trigger input event to update preview
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }

  updateCommandLibrary() {
    // This method is now handled by AliasService, but we keep it for backward compatibility
    if (this.service && this.service.updateCommandLibrary) {
      this.service.updateCommandLibrary()
    }
  }

  createAliasCategoryElement(aliases, categoryType = 'aliases', titleKey = 'command_aliases', iconClass = 'fas fa-mask') {
    if (!aliases || aliases.length === 0) {
      return null
    }

    const category = document.createElement('div')
    category.className = 'category'
    category.dataset.category = categoryType

    const header = document.createElement('div')
    header.className = 'category-header'
    header.innerHTML = `
      <i class="${iconClass}"></i>
      <span>${i18next.t(titleKey)}</span>
      <span class="category-count">(${aliases.length})</span>
    `

    const content = document.createElement('div')
    content.className = 'category-content'

    aliases.forEach(([name, alias]) => {
      const item = document.createElement('div')
      item.className = 'command-item alias-command'
      item.dataset.command = name
      item.dataset.type = 'alias'
      item.innerHTML = `
        <div class="command-icon">🎭</div>
        <div class="command-info">
          <div class="command-name">${name}</div>
          <div class="command-description">${alias.description || ''}</div>
        </div>
      `
      content.appendChild(item)
    })

    category.appendChild(header)
    category.appendChild(content)

    return category
  }
}
