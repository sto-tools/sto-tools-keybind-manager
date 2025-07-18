import ComponentBase from '../ComponentBase.js'
import i18next from 'i18next'

/*
 * BindsetManagerUI - Handles the bindset manager modal
 * Manages the bindset manager modal and its interactions
 */
export default class BindsetManagerUI extends ComponentBase {
  constructor({ eventBus, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'BindsetManagerUI'
    this.document = document
    this.selectedBindset = null
    this._bindsetNames = ['Primary Bindset']
  }

  async onInit() {
    this.setupEventListeners()
    this.render()
    this.eventBus.on('bindsets:changed', ({ names } = {}) => {
      if (Array.isArray(names)) {
        this._bindsetNames = names
      }
      this.render()
    })
  }

  setupEventListeners() {
    if (this.listenersSetup) return
    this.listenersSetup = true

    // Open modal
    this.eventBus.onDom('bindsetManagerBtn', 'click', 'bindset-manager-open', () => {
      this.render()
      this.emit('modal:show', { modalId: 'bindsetManagerModal' })
    })

    this.eventBus.onDom('createBindsetBtn', 'click', 'bindset-create', async () => {
      const name = prompt(i18next.t('enter_name') || 'Bindset name:')?.trim()
      if (!name) return
      const res = await this.request('bindset:create', { name })
      if (!res?.success) this.showError(res.error)
    })

    this.eventBus.onDom('renameBindsetBtn', 'click', 'bindset-rename', async () => {
      if (!this.selectedBindset) return
      const newName = prompt(i18next.t('enter_new_name') || 'New name:', this.selectedBindset)?.trim()
      if (!newName || newName === this.selectedBindset) return
      const res = await this.request('bindset:rename', { oldName: this.selectedBindset, newName })
      if (!res?.success) this.showError(res.error)
    })

    this.eventBus.onDom('deleteBindsetBtn', 'click', 'bindset-delete', async () => {
      if (!this.selectedBindset) return
      if (!confirm(i18next.t('confirm_delete') || 'Delete?')) return
      const res = await this.request('bindset:delete', { name: this.selectedBindset })
      if (!res?.success) this.showError(res.error)
    })
  }

  showError(err) {
    const map = {
      invalid_name: 'invalid_name',
      name_exists: 'bindset_name_in_use',
      not_found: 'not_found',
      not_empty: 'bindset_not_empty',
    }
    const key = map[err] || 'error'
    const el = this.document.getElementById('bindsetError')
    if (el) {
      el.textContent = i18next.t(key)
      el.style.display = ''
      setTimeout(() => { el.style.display = 'none' }, 4000)
    }
  }

  async render() {
    const listUl = this.document.getElementById('bindsetList')
    if (!listUl) return
    const names = this._bindsetNames || []
    listUl.innerHTML = ''
    names.forEach(name => {
      const li = this.document.createElement('li')
      li.textContent = name
      li.className = 'bindset-item' + (name === this.selectedBindset ? ' selected' : '')
      li.onclick = () => {
        this.selectedBindset = (name === this.selectedBindset) ? null : name
        this.render()
      }
      listUl.appendChild(li)
    })
    const renameBtn = this.document.getElementById('renameBindsetBtn')
    const deleteBtn = this.document.getElementById('deleteBindsetBtn')
    const valid = this.selectedBindset && this.selectedBindset !== 'Primary Bindset'
    if (renameBtn) renameBtn.disabled = !valid
    if (deleteBtn) deleteBtn.disabled = !valid
  }

  // Late-join support
  handleInitialState(sender, state) {
    if (state && state.bindsets) {
      this._bindsetNames = Array.isArray(state.bindsets) ? state.bindsets : [...state.bindsets]
      // Re-render if UI already initialized
      if (this.isInitialized()) this.render()
    }
  }
} 