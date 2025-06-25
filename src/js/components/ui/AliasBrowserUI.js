import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import i18next from 'i18next'

export default class AliasBrowserUI extends ComponentBase {
  constructor ({ service, document = window.document }) {
    super(eventBus)
    this.componentName = 'AliasBrowserUI'
    this.service  = service
    this.document = document
  }

  onInit () {
    if (!this.service) return

    this.service.addEventListener('aliases-changed', () => this.render())
    this.service.addEventListener('alias-selected', () => this.render())

    // Toggle visibility based on current environment
    this.eventBus.on('environment:changed', (d = {}) => {
      const env = typeof d === 'string' ? d : d.environment || d.newMode || d.mode
      this.toggleVisibility(env)
    })

    // Initial render & visibility
    this.render()
    this.toggleVisibility(this.service.currentEnvironment || 'space')
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
        this.emit('alias-browser/alias-clicked', { name: item.dataset.alias })
      })
    })
  }

  createAliasElement (name, alias) {
    const commandCount = typeof alias.commands === 'string' && alias.commands.trim() 
      ? alias.commands.trim().split(/\s*\$\$/).length 
      : 0
    const isSelected   = this.service.selectedAliasName === name
    const description  = alias.description || ''
    const lengthClass  = name.length <= 8 ? 'short' : name.length <= 12 ? 'medium' : name.length <= 16 ? 'long' : 'extra-long'

    return `
      <div class="alias-chain-item ${isSelected ? 'selected' : ''}" data-alias="${name}" data-length="${lengthClass}" title="${description}">
        <div class="alias-name">${name}</div>
        <div class="alias-command-count">${commandCount} <span data-i18n="commands">${i18next.t('commands')}</span></div>
      </div>`
  }

  toggleVisibility (env) {
    const container = this.document.getElementById('aliasSelectorContainer') || this.document.getElementById('aliasGrid')?.parentElement?.parentElement
    if (!container) return
    container.style.display = (env === 'alias') ? '' : 'none'
  }

  /* ------------------------------------------------------------
   * Late-join: when other components send us their state snapshot we
   * immediately sync our visibility so that the UI is correct on first
   * paint even if the environment was set long before this UI initialised.
   * ---------------------------------------------------------- */
  handleInitialState (sender, state) {
    if (!state || !state.environment) return
    this.toggleVisibility(state.environment)
    // Also propagate environment to the underlying service if it tracks it
    if (this.service && typeof this.service.currentEnvironment !== 'undefined') {
      this.service.currentEnvironment = state.environment
    }
  }
} 