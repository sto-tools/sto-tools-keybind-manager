// Alias grid rendering and management functions
import i18next from 'i18next'

export const aliasView = {
  renderAliasGrid() {
    const grid = document.getElementById('aliasGrid')
    if (!grid) return

    const profile = stoStorage.getProfile(this.currentProfile)
    if (!profile || !profile.aliases) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-mask"></i>
          <h4 data-i18n="no_aliases_defined">No aliases defined</h4>
          <p data-i18n="create_alias_to_get_started">Create an alias to get started</p>
        </div>
      `
      return
    }

    const aliases = Object.entries(profile.aliases)
    if (aliases.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-mask"></i>
          <h4 data-i18n="no_aliases_defined">No aliases defined</h4>
          <p data-i18n="create_alias_to_get_started">Create an alias to get started</p>
        </div>
      `
      return
    }

    // Simple grid view for aliases - no view modes needed
    grid.classList.remove('categorized')
    grid.innerHTML = aliases.map(([name, alias]) => 
      this.createAliasChainElement(name, alias)
    ).join('')

    // Add event listeners to alias elements
    grid.querySelectorAll('.alias-chain-item').forEach((item) => {
      item.addEventListener('click', () => {
        this.selectAlias(item.dataset.alias)
      })
    })
  },

  createAliasChainElement(name, alias) {
    const commandCount = alias.commands ? alias.commands.split(/\s*\$\$\s*/).length : 0
    const isSelected = this.selectedKey === name // Reuse selectedKey for alias selection
    const description = alias.description || ''
    
    // Calculate length class for dynamic font sizing (similar to key elements)
    // Since aliases don't use + separators like keys, use simple length-based logic
    const nameLength = name.length
    let lengthClass
    if (nameLength <= 8) {
      lengthClass = 'short'
    } else if (nameLength <= 12) {
      lengthClass = 'medium'
    } else if (nameLength <= 16) {
      lengthClass = 'long'
    } else {
      lengthClass = 'extra-long'
    }
    
    return `
      <div class="alias-chain-item ${isSelected ? 'selected' : ''}" data-alias="${name}" data-length="${lengthClass}" title="${description}">
        <div class="alias-name">${name}</div>
        <div class="alias-command-count">${commandCount} <span data-i18n="commands">commands</span></div>
      </div>
    `
  },

  selectAlias(aliasName) {
    // Reuse the selectedKey property for alias selection
    this.selectedKey = aliasName
    this.renderAliasGrid()
    this.renderCommandChain()
    this.updateChainActions()
  },

  showAliasCreationModal() {
    // Show a simplified modal for creating a new alias
    const modal = this.createAliasCreationModal()
    document.body.appendChild(modal)
    modalManager.show('aliasCreationModal')
  }
,
  createAliasCreationModal() {
    const modal = document.createElement('div')
    modal.id = 'aliasCreationModal'
    modal.className = 'modal'
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 data-i18n="create_new_alias">Create New Alias</h2>
          <button class="modal-close" data-modal="aliasCreationModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="newAliasName" data-i18n="alias_name">Alias Name:</label>
            <input type="text" id="newAliasName" class="form-control" placeholder="MyAlias" />
          </div>
          <div class="form-group">
            <label for="newAliasDescription" data-i18n="description">Description:</label>
            <input type="text" id="newAliasDescription" class="form-control" placeholder="Brief description" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-modal="aliasCreationModal" data-i18n="cancel">Cancel</button>
          <button class="btn btn-primary" id="confirmCreateAliasBtn" data-i18n="create">Create</button>
        </div>
      </div>
    `

    // Add event listener for create button
    modal.querySelector('#confirmCreateAliasBtn').addEventListener('click', () => {
      const name = modal.querySelector('#newAliasName').value.trim()
      const description = modal.querySelector('#newAliasDescription').value.trim()
      
      if (name) {
        this.createAliasChain(name, description)
        modalManager.hide('aliasCreationModal')
        document.body.removeChild(modal)
      }
    })

    return modal
  },

  createAliasChain(name, description = '') {
    const profile = stoStorage.getProfile(this.currentProfile)
    if (!profile) return

    // Initialize aliases object if it doesn't exist
    if (!profile.aliases) {
      profile.aliases = {}
    }

    // Check if alias already exists
    if (profile.aliases[name]) {
      stoUI.showToast(i18next.t('alias_already_exists', {name: name}), 'error')
      return
    }

    // Create new alias
    profile.aliases[name] = {
      description: description,
      commands: ''
    }

    // Save profile
    stoStorage.saveProfile(this.currentProfile, profile)
    
    // Update UI
    this.renderAliasGrid()
    this.selectAlias(name)
    this.setModified(true)
    
    stoUI.showToast(i18next.t('alias_created', {name: name}), 'success')
  }
,
  async confirmDeleteAlias(aliasName) {
    const confirmed = await stoUI.confirm(
      i18next.t('confirm_delete_alias', { aliasName }),
      i18next.t('delete_alias'),
      'danger'
    )

    if (confirmed) {
      this.deleteAliasChain(aliasName)
    }
  },

  deleteAliasChain(aliasName) {
    const profile = stoStorage.getProfile(this.currentProfile)
    if (!profile || !profile.aliases || !profile.aliases[aliasName]) return

    delete profile.aliases[aliasName]
    stoStorage.saveProfile(this.currentProfile, profile)

    // Clear selection if we deleted the selected alias
    if (this.selectedKey === aliasName) {
      this.selectedKey = null
    }

    this.renderAliasGrid()
    this.renderCommandChain()
    this.updateChainActions()
    this.setModified(true)

    stoUI.showToast(i18next.t('alias_deleted', {aliasName: aliasName}), 'success')
  },

  duplicateAlias(aliasName) {
    const profile = stoStorage.getProfile(this.currentProfile)
    if (!profile || !profile.aliases || !profile.aliases[aliasName]) return

    const originalAlias = profile.aliases[aliasName]
    
    // Find a suitable new alias name
    let newAliasName = aliasName + '_copy'
    let counter = 1
    
    while (profile.aliases[newAliasName]) {
      newAliasName = `${aliasName}_copy${counter}`
      counter++
    }

    // Create duplicate
    profile.aliases[newAliasName] = {
      description: originalAlias.description + ' (copy)',
      commands: originalAlias.commands
    }

    stoStorage.saveProfile(this.currentProfile, profile)
    
    this.renderAliasGrid()
    this.selectAlias(newAliasName)
    this.setModified(true)

    stoUI.showToast(i18next.t('alias_created_from_template', {newAliasName: newAliasName}), 'success')
  }
  
}
;
