import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import i18next from 'i18next'

export default class AliasBrowserUI extends ComponentBase {
  constructor ({ service, document = window.document }) {
    super(eventBus)
    this.service  = service
    this.document = document
  }

  onInit () {
    if (!this.service) return

    this.service.addEventListener('aliases:changed', () => this.render())
    this.service.addEventListener('alias:selected', () => this.render())

    // Initial render
    this.render()
  }

  render () {
    const grid = this.document.getElementById('aliasGrid')
    if (!grid) return

    const aliases = this.service.getAliases()
    const entries = Object.entries(aliases)

    if (entries.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-mask"></i>
          <h4 data-i18n="no_aliases_defined">${i18next.t('no_aliases_defined')}</h4>
          <p data-i18n="create_alias_to_get_started">${i18next.t('create_alias_to_get_started')}</p>
        </div>`
      return
    }

    grid.classList.remove('categorized')
    grid.innerHTML = entries.map(([name, alias]) => this.createAliasElement(name, alias)).join('')

    grid.querySelectorAll('.alias-chain-item').forEach((item) => {
      item.addEventListener('click', () => {
        this.service.selectAlias(item.dataset.alias)
        this.emit('alias-browser:alias-clicked', { name: item.dataset.alias })
      })
    })
  }

  createAliasElement (name, alias) {
    const commandCount = alias.commands ? alias.commands.split(/\s*\$\$/).length : 0
    const isSelected   = this.service.selectedAliasName === name
    const description  = alias.description || ''
    const lengthClass  = name.length <= 8 ? 'short' : name.length <= 12 ? 'medium' : name.length <= 16 ? 'long' : 'extra-long'

    return `
      <div class="alias-chain-item ${isSelected ? 'selected' : ''}" data-alias="${name}" data-length="${lengthClass}" title="${description}">
        <div class="alias-name">${name}</div>
        <div class="alias-command-count">${commandCount} <span data-i18n="commands">${i18next.t('commands')}</span></div>
      </div>`
  }
} 