import UIComponentBase from '../UIComponentBase.js'
import i18next from 'i18next'

/*
 * BindsetManagerUI - Handles the bindset manager modal
 * Manages the bindset manager modal and its interactions
 */
export default class BindsetManagerUI extends UIComponentBase {
  constructor({ eventBus, confirmDialog = null, inputDialog = null, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'BindsetManagerUI'
    this.document = document
    this.confirmDialog = confirmDialog || (typeof window !== 'undefined' ? window.confirmDialog : null)
    this.inputDialog = inputDialog || (typeof window !== 'undefined' ? window.inputDialog : null)
    this.selectedBindset = null
  }

  async onInit() {
    this.setupEventListeners()
    this.render()
    this.eventBus.on('bindsets:changed', () => {
      // ComponentBase automatically updates this.cache.bindsetNames
      this.render()
    })
  }

  setupEventListeners() {
    if (this.listenersSetup) return
    this.listenersSetup = true

    // Open modal
    this.onDom('bindsetManagerBtn', 'click', 'bindset-manager-open', () => {
      this.render()
      this.emit('modal:show', { modalId: 'bindsetManagerModal' })
    })

    this.onDom('createBindsetBtn', 'click', 'bindset-create', async () => {
      if (!this.inputDialog) return
      
      const title = i18next.t('create_bindset') || 'Create Bindset'
      const message = i18next.t('enter_bindset_name') || 'Enter bindset name:'
      
      const name = await this.inputDialog.prompt(message, {
        title,
        placeholder: i18next.t('bindset_name') || 'Bindset name',
        validate: (value) => {
          const trimmed = value.trim()
          if (!trimmed) return i18next.t('name_required') || 'Name is required'
          if (this.cache.bindsetNames.includes(trimmed)) return i18next.t('name_exists') || 'Name already exists'
          return true
        }
      })
      
      if (!name?.trim()) return
      const res = await this.request('bindset:create', { name: name.trim() })
      if (!res?.success) this.showError(res.error)
    })

    this.onDom('renameBindsetBtn', 'click', 'bindset-rename', async () => {
      if (!this.selectedBindset || !this.inputDialog) return
      
      const title = i18next.t('rename_bindset') || 'Rename Bindset'
      const message = i18next.t('enter_new_name') || 'Enter new name:'
      
      const newName = await this.inputDialog.prompt(message, {
        title,
        defaultValue: this.selectedBindset,
        placeholder: i18next.t('bindset_name') || 'Bindset name',
        validate: (value) => {
          const trimmed = value.trim()
          if (!trimmed) return i18next.t('name_required') || 'Name is required'
          if (trimmed === this.selectedBindset) return i18next.t('name_unchanged') || 'Name is unchanged'
          if (this.cache.bindsetNames.includes(trimmed)) return i18next.t('name_exists') || 'Name already exists'
          return true
        }
      })
      
      if (!newName?.trim() || newName.trim() === this.selectedBindset) return
      const res = await this.request('bindset:rename', { oldName: this.selectedBindset, newName: newName.trim() })
      if (!res?.success) this.showError(res.error)
    })

    this.onDom('deleteBindsetBtn', 'click', 'bindset-delete', async () => {
      if (!this.selectedBindset || !this.confirmDialog) return
      
      const message = i18next.t('confirm_delete_bindset', { name: this.selectedBindset }) || `Delete bindset "${this.selectedBindset}"?`
      const title = i18next.t('confirm_delete') || 'Confirm Delete'
      
      if (await this.confirmDialog.confirm(message, title, 'danger')) {
        const res = await this.request('bindset:delete', { name: this.selectedBindset })
        if (!res?.success) this.showError(res.error)
      }
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
    const names = this.cache.bindsetNames || []
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
      // ComponentBase automatically handles bindset names via bindsets:changed event
      // Re-render if UI already initialized
      if (this.isInitialized()) this.render()
    }
  }
} 