export const uiRendering = {
  renderProfiles() {
    const select = document.getElementById('profileSelect')
    if (!select) return

    const data = stoStorage.getAllData()
    select.innerHTML = ''

    if (Object.keys(data.profiles).length === 0) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No profiles available'
      option.disabled = true
      select.appendChild(option)
    } else {
      Object.entries(data.profiles).forEach(([id, profile]) => {
        const option = document.createElement('option')
        option.value = id
        option.textContent = profile.name
        if (id === this.currentProfile) {
          option.selected = true
        }
        select.appendChild(option)
      })
    }

    this.updateProfileInfo()
  },

  updateProfileInfo() {
    const profile = this.getCurrentProfile()

    const modeBtns = document.querySelectorAll('.mode-btn')
    modeBtns.forEach((btn) => {
      btn.classList.toggle(
        'active',
        profile && btn.dataset.mode === this.currentEnvironment
      )
      btn.disabled = !this.currentProfile
    })

    const keyCount = document.getElementById('keyCount')
    if (keyCount) {
      if (profile) {
        const count = Object.keys(profile.keys).length
        const keyText = count === 1 ? i18next.t('key') : i18next.t('keys')
        keyCount.textContent = `${count} ${keyText}`
      } else {
        keyCount.textContent = i18next.t('no_profile')
      }
    }
  },

  renderKeyGrid() {
    const grid = document.getElementById('keyGrid')
    if (!grid) return

    const profile = this.getCurrentProfile()
    if (!profile) return

    grid.innerHTML = ''

    if (!profile) {
      grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <h4>No Profile Selected</h4>
                    <p>Create a new profile or load default data to get started.</p>
                </div>
            `
      return
    }

    const keys = Object.keys(profile.keys)
    const keysWithCommands = {}
    keys.forEach((key) => {
      const commands = profile.keys[key]
      if (commands && commands.length > 0) {
        keysWithCommands[key] = commands
      }
    })
    const allKeys = [...new Set([...keys, ...Object.keys(keysWithCommands)])]

    const viewMode = localStorage.getItem('keyViewMode') || 'key-types'
    if (viewMode === 'key-types') {
      this.renderKeyTypeView(grid, profile, allKeys)
    } else if (viewMode === 'grid') {
      this.renderSimpleGridView(grid, allKeys)
    } else {
      this.renderCommandCategoryView(grid, keysWithCommands, allKeys)
    }
  },

  renderSimpleGridView(grid, allKeys) {
    // Simple grid layout without categories
    grid.classList.remove('categorized')
    
    // Sort keys for consistent display
    const sortedKeys = allKeys.sort(this.compareKeys.bind(this))
    
    sortedKeys.forEach((keyName) => {
      const keyElement = this.createKeyElement(keyName)
      grid.appendChild(keyElement)
    })
  },

  renderCommandCategoryView(grid, keysWithCommands, allKeys) {
    grid.classList.add('categorized')

    const categories = this.categorizeKeys(keysWithCommands, allKeys)

    const sortedCategories = Object.entries(categories).sort(
      ([aId, aData], [bId, bData]) => {
        if (aData.priority !== bData.priority) {
          return aData.priority - bData.priority
        }
        return aData.name.localeCompare(bData.name)
      }
    )

    sortedCategories.forEach(([categoryId, categoryData]) => {
      const categoryElement = this.createKeyCategoryElement(categoryId, categoryData)
      grid.appendChild(categoryElement)
    })
  },

  categorizeKeys(keysWithCommands, allKeys) {
    const categories = {}

    categories.unknown = {
      name: 'Unknown',
      icon: 'fas fa-question-circle',
      keys: new Set(),
      priority: 0,
    }

    Object.entries(STO_DATA.commands).forEach(([categoryId, categoryData]) => {
      categories[categoryId] = {
        name: categoryData.name,
        icon: categoryData.icon,
        keys: new Set(),
        priority: 1,
      }
    })

    allKeys.forEach((keyName) => {
      const commands = keysWithCommands[keyName] || []

      if (!commands || commands.length === 0) {
        categories.unknown.keys.add(keyName)
        return
      }

      const keyCategories = new Set()
      commands.forEach((command) => {
        if (command.type && categories[command.type]) {
          keyCategories.add(command.type)
        } else if (window.stoCommands) {
          const detectedType = window.stoCommands.detectCommandType(command.command)
          if (categories[detectedType]) {
            keyCategories.add(detectedType)
          }
        }
      })

      if (keyCategories.size > 0) {
        keyCategories.forEach((categoryId) => {
          categories[categoryId].keys.add(keyName)
        })
      } else {
        if (!categories.custom) {
          categories.custom = {
            name: 'Custom Commands',
            icon: 'fas fa-cog',
            keys: new Set(),
            priority: 2,
          }
        }
        categories.custom.keys.add(keyName)
      }
    })

    Object.values(categories).forEach((category) => {
      category.keys = Array.from(category.keys).sort(this.compareKeys.bind(this))
    })

    return categories
  },

  createKeyCategoryElement(categoryId, categoryData, mode = 'command') {
    const element = document.createElement('div')
    element.className = 'category'
    element.dataset.category = categoryId

    const storageKey =
      mode === 'key-type'
        ? `keyTypeCategory_${categoryId}_collapsed`
        : `keyCategory_${categoryId}_collapsed`
    const isCollapsed = localStorage.getItem(storageKey) === 'true'

    element.innerHTML = `
            <h4 class="${isCollapsed ? 'collapsed' : ''}" data-category="${categoryId}" data-mode="${mode}">
                <i class="fas fa-chevron-right category-chevron"></i>
                <i class="${categoryData.icon}"></i>
                ${categoryData.name}
                <span class="key-count">(${categoryData.keys.length})</span>
            </h4>
            <div class="category-commands ${isCollapsed ? 'collapsed' : ''}">
                ${categoryData.keys.map((keyName) => this.createKeyElementHTML(keyName)).join('')}
            </div>
        `

    const header = element.querySelector('h4')
    header.addEventListener('click', () => {
      this.toggleKeyCategory(categoryId, element, mode)
    })

    const keyElements = element.querySelectorAll('.command-item')
    keyElements.forEach((keyElement) => {
      keyElement.addEventListener('click', () => {
        const keyName = keyElement.dataset.key
        this.selectKey(keyName)
      })
    })

    return element
  },

  createKeyElementHTML(keyName) {
    const profile = this.getCurrentProfile()
    const commands = profile.keys[keyName] || []
    const isActive = keyName === this.selectedKey

    // Filter out blank commands for display
    const nonBlankCommands = commands.filter(cmd => {
      if (typeof cmd === 'string') {
        return cmd.trim() !== ''
      } else if (cmd && typeof cmd === 'object' && typeof cmd.command === 'string') {
        return cmd.command.trim() !== ''
      }
      return false
    })

    let lengthClass
    if (keyName.length <= 3) {
      lengthClass = 'short'
    } else if (keyName.length <= 5) {
      lengthClass = 'medium'
    } else {
      lengthClass = 'long'
    }

    return `
            <div class="command-item ${isActive ? 'active' : ''}" data-key="${keyName}" data-length="${lengthClass}">
                <span class="key-label">${keyName}</span>
                ${
                  nonBlankCommands.length > 0
                    ? `
                    <span class="command-count-badge">${nonBlankCommands.length}</span>
                `
                    : ''
                }
            </div>
        `
  },

  toggleKeyCategory(categoryId, element, mode = 'command') {
    const header = element.querySelector('h4')
    const commands = element.querySelector('.category-commands')
    const chevron = header.querySelector('.category-chevron')

    const isCollapsed = commands.classList.contains('collapsed')

    const storageKey =
      mode === 'key-type'
        ? `keyTypeCategory_${categoryId}_collapsed`
        : `keyCategory_${categoryId}_collapsed`

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
  },

  formatKeyName(keyName) {
    if (keyName.includes('+')) {
      return keyName.replace(/\+/g, '<br>+<br>')
    }
    if (keyName.includes('_')) {
      return keyName.replace(/_/g, '<br>_<br>')
    }
    return keyName
  },

  detectKeyTypes(keyName) {
    const types = []

    if (keyName.includes('+')) {
      const parts = keyName.split('+')
      const hasModifier = parts.some((part) =>
        part.match(/^(Ctrl|Control|Alt|Shift|Win|Cmd|Super)$/i)
      )

      if (hasModifier) {
        types.push('modifiers')
      }
    }

    const baseKey = keyName.split('+').pop()

    if (baseKey.match(/^F\d+$/)) types.push('function')
    else if (
      baseKey.match(
        /^(Lbutton|Rbutton|Mbutton|Leftdrag|Rightdrag|Middledrag|Leftclick|Rightclick|Middleclick|Leftdoubleclick|Rightdoubleclick|Middledoubleclick|Wheelplus|Wheelminus|Mousechord|Mouse|Wheel|LMouse|RMouse|MMouse|XMouse|Drag)/i
      )
    )
      types.push('mouse')
    else if (baseKey.match(/^(Numpad|Keypad)/i)) types.push('numberpad')
    else if (baseKey.match(/^(Ctrl|Control|Alt|Shift|Win|Cmd|Super)$/i)) {
      if (!types.includes('modifiers')) types.push('modifiers')
    }
    else if (
      baseKey.match(/^(Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete)$/i)
    )
      types.push('navigation')
    else if (
      baseKey.match(
        /^(Space|Tab|Enter|Return|Escape|Esc|Backspace|CapsLock|ScrollLock|NumLock|PrintScreen|Pause|Break)$/i
      )
    )
      types.push('system')
    else if (baseKey.match(/^[0-9]$/)) types.push('alphanumeric')
    else if (baseKey.match(/^[A-Za-z]$/)) types.push('alphanumeric')
    else if (
      baseKey.match(/^[`~!@#$%^&*()_+\-=\[\]{}\\|;':",./<>?]$/) ||
      baseKey.match(
        /^(Comma|Period|Semicolon|Quote|Slash|Backslash|Minus|Plus|Equals|Bracket|Grave|Tilde)$/i
      )
    ) {
      types.push('symbols')
    } else {
      types.push('other')
    }

    return types.length > 0 ? types : ['other']
  },

  categorizeKeysByType(keysWithCommands, allKeys) {
    const categories = {
      function: {
        name: 'Function Keys',
        icon: 'fas fa-keyboard',
        keys: new Set(),
        priority: 1,
      },
      alphanumeric: {
        name: 'Letters & Numbers',
        icon: 'fas fa-font',
        keys: new Set(),
        priority: 2,
      },
      numberpad: {
        name: 'Numberpad',
        icon: 'fas fa-calculator',
        keys: new Set(),
        priority: 3,
      },
      modifiers: {
        name: 'Modifier Keys',
        icon: 'fas fa-hand-paper',
        keys: new Set(),
        priority: 4,
      },
      navigation: {
        name: 'Navigation',
        icon: 'fas fa-arrows-alt',
        keys: new Set(),
        priority: 5,
      },
      system: {
        name: 'System Keys',
        icon: 'fas fa-cogs',
        keys: new Set(),
        priority: 6,
      },
      mouse: {
        name: 'Mouse & Wheel',
        icon: 'fas fa-mouse',
        keys: new Set(),
        priority: 7,
      },
      symbols: {
        name: 'Symbols & Punctuation',
        icon: 'fas fa-at',
        keys: new Set(),
        priority: 8,
      },
      other: {
        name: 'Other Keys',
        icon: 'fas fa-question-circle',
        keys: new Set(),
        priority: 9,
      },
    }

    allKeys.forEach((keyName) => {
      const keyTypes = this.detectKeyTypes(keyName)
      keyTypes.forEach((keyType) => {
        if (categories[keyType]) {
          categories[keyType].keys.add(keyName)
        } else {
          categories.other.keys.add(keyName)
        }
      })
    })

    Object.values(categories).forEach((category) => {
      category.keys = Array.from(category.keys).sort(this.compareKeys.bind(this))
    })

    return categories
  },

  renderKeyTypeView(grid, profile, allKeys) {
    grid.classList.add('categorized')

    const categorizedKeys = this.categorizeKeysByType(profile.keys, allKeys)

    const sortedCategories = Object.entries(categorizedKeys).sort(
      ([aId, aData], [bId, bData]) => {
        return aData.priority - bData.priority
      }
    )

    sortedCategories.forEach(([categoryId, categoryData]) => {
      const categoryElement = this.createKeyCategoryElement(
        categoryId,
        categoryData,
        'key-type'
      )
      grid.appendChild(categoryElement)
    })
  },

  compareKeys(a, b) {
    const getKeyPriority = (key) => {
      if (key === 'Space') return 0
      if (key.match(/^[0-9]$/)) return 1
      if (key.match(/^F[0-9]+$/)) return 2
      if (key.includes('Ctrl+')) return 3
      if (key.includes('Alt+')) return 4
      if (key.includes('Shift+')) return 5
      return 6
    }

    const priorityA = getKeyPriority(a)
    const priorityB = getKeyPriority(b)

    if (priorityA !== priorityB) {
      return priorityA - priorityB
    }

    return a.localeCompare(b)
  },

  createKeyElement(keyName) {
    const profile = this.getCurrentProfile()
    const commands = profile.keys[keyName] || []
    const isSelected = keyName === this.selectedKey

    // Filter out blank commands for display
    const nonBlankCommands = commands.filter(cmd => {
      if (typeof cmd === 'string') {
        return cmd.trim() !== ''
      } else if (cmd && typeof cmd === 'object' && typeof cmd.command === 'string') {
        return cmd.command.trim() !== ''
      }
      return false
    })

    const keyElement = document.createElement('div')
    keyElement.className = `key-item ${isSelected ? 'active' : ''}`
    keyElement.dataset.key = keyName
    keyElement.title = `${keyName}: ${nonBlankCommands.length} command${nonBlankCommands.length !== 1 ? 's' : ''}`

    const formattedKeyName = this.formatKeyName(keyName)
    const hasLineBreaks = formattedKeyName.includes('<br>')

    let lengthClass
    if (hasLineBreaks) {
      const parts = keyName.split(/[+_]/)
      const longestPart = Math.max(...parts.map((part) => part.length))
      if (longestPart <= 4) {
        lengthClass = 'short'
      } else if (longestPart <= 8) {
        lengthClass = 'medium'
      } else {
        lengthClass = 'long'
      }
    } else {
      const keyLength = keyName.length
      if (keyLength <= 3) {
        lengthClass = 'short'
      } else if (keyLength <= 5) {
        lengthClass = 'medium'
      } else if (keyLength <= 8) {
        lengthClass = 'long'
      } else {
        lengthClass = 'extra-long'
      }
    }

    keyElement.dataset.length = lengthClass

    keyElement.innerHTML = `
            <div class="key-label">${formattedKeyName}</div>
            ${
              nonBlankCommands.length > 0
                ? `
                <div class="activity-bar" style="width: ${Math.min(nonBlankCommands.length * 15, 100)}%"></div>
                <div class="command-count-badge">${nonBlankCommands.length}</div>
            `
                : ''
            }
        `

    keyElement.addEventListener('click', () => {
      this.selectKey(keyName)
    })

    return keyElement
  },

  selectKey(keyName) {
    this.selectedKey = keyName
    this.renderKeyGrid()
    this.renderCommandChain()
    this.updateChainActions()
  },
}
