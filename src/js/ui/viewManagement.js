export const viewManagement = {
  updateViewToggleButton(viewMode) {
    const toggleBtn = document.getElementById('toggleKeyViewBtn')
    if (toggleBtn) {
      const icon = toggleBtn.querySelector('i')
      if (viewMode === 'categorized') {
        icon.className = 'fas fa-sitemap'
        toggleBtn.title = 'Switch to key type view'
      } else if (viewMode === 'key-types') {
        icon.className = 'fas fa-th'
        toggleBtn.title = 'Switch to grid view'
      } else {
        icon.className = 'fas fa-list'
        toggleBtn.title = 'Switch to command categories'
      }
    }
  },

  toggleKeyView() {
    if (this.currentEnvironment === 'alias') {
      return
    }

    const currentMode = localStorage.getItem('keyViewMode') || 'key-types'
    let newMode
    if (currentMode === 'key-types') {
      newMode = 'grid'
    } else if (currentMode === 'grid') {
      newMode = 'categorized'
    } else {
      newMode = 'key-types'
    }

    localStorage.setItem('keyViewMode', newMode)
    this.renderKeyGrid()
    this.updateViewToggleButton(newMode)
  },

  filterKeys(filter) {
    const filterLower = filter.toLowerCase()
    const keyItems = document.querySelectorAll('.key-item')
    keyItems.forEach((item) => {
      const keyName = item.dataset.key.toLowerCase()
      const visible = !filter || keyName.includes(filterLower)
      item.style.display = visible ? 'flex' : 'none'
    })

    const commandItems = document.querySelectorAll('.command-item[data-key]')
    commandItems.forEach((item) => {
      const keyName = item.dataset.key.toLowerCase()
      const visible = !filter || keyName.includes(filterLower)
      item.style.display = visible ? 'flex' : 'none'
    })

    const categories = document.querySelectorAll('.category')
    categories.forEach((category) => {
      const visibleKeys = category.querySelectorAll(
        '.command-item[data-key]:not([style*="display: none"])'
      )
      const categoryVisible = !filter || visibleKeys.length > 0
      category.style.display = categoryVisible ? 'block' : 'none'
    })
  },

  filterCommands(filter) {
    const commandItems = document.querySelectorAll('.command-item')
    const filterLower = filter.toLowerCase()
    commandItems.forEach((item) => {
      const text = item.textContent.toLowerCase()
      const visible = !filter || text.includes(filterLower)
      item.style.display = visible ? 'flex' : 'none'
    })

    const categories = document.querySelectorAll('.category')
    categories.forEach((category) => {
      const visibleCommands = category.querySelectorAll(
        '.command-item:not([style*="display: none"])'
      )
      const categoryVisible = !filter || visibleCommands.length > 0
      category.style.display = categoryVisible ? 'block' : 'none'
    })
  },

  showAllKeys() {
    const keyItems = document.querySelectorAll('.key-item')
    keyItems.forEach((item) => {
      item.style.display = 'flex'
    })

    const commandItems = document.querySelectorAll('.command-item[data-key]')
    commandItems.forEach((item) => {
      item.style.display = 'flex'
    })

    const categories = document.querySelectorAll('.category')
    categories.forEach((category) => {
      category.style.display = 'block'
    })

    const filterInput = document.getElementById('keyFilter')
    if (filterInput) {
      filterInput.value = ''
    }
  },
}
