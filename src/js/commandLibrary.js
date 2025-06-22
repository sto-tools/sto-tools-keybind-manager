// Command library and command chain rendering functions
import i18next from 'i18next'

export const commandLibrary = {
  renderCommandChain() {
    const container = document.getElementById('commandList')
    const title = document.getElementById('chainTitle')
    const preview = document.getElementById('commandPreview')
    const commandCount = document.getElementById('commandCount')
    const emptyState = document.getElementById('emptyState')

    if (!container || !title || !preview) return

    if (!this.selectedKey) {
      const selectText = this.currentEnvironment === 'alias' ? 
        i18next.t('select_an_alias_to_edit') : 
        i18next.t('select_a_key_to_edit')
      const previewText = this.currentEnvironment === 'alias' ? 
        i18next.t('select_an_alias_to_see_the_generated_command') : 
        i18next.t('select_a_key_to_see_the_generated_command')
      
      title.textContent = selectText
      preview.textContent = previewText
      if (commandCount) {
        commandCount.textContent = '0'
      }
      if (emptyState) emptyState.style.display = 'block'
      const emptyIcon = this.currentEnvironment === 'alias' ? 'fas fa-mask' : 'fas fa-keyboard'
      const emptyTitle = this.currentEnvironment === 'alias' ? i18next.t('no_alias_selected') : i18next.t('no_key_selected')
      const emptyDesc = this.currentEnvironment === 'alias' ? 
        i18next.t('select_alias_from_left_panel') : 
        i18next.t('select_key_from_left_panel')
      
      container.innerHTML =
        `<div class="empty-state" id="emptyState"><i class="${emptyIcon}"></i><h4>${emptyTitle}</h4><p>${emptyDesc}</p></div>`
      return
    }

    // Get commands based on current mode
    let commands = []
    let profile
    
    if (this.currentEnvironment === 'alias') {
      // For aliases, get the raw profile since aliases are profile-level, not build-specific
      profile = stoStorage.getProfile(this.currentProfile)
      if (!profile) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h4>No Valid Profile</h4>
            <p>Please create or select a valid profile to manage commands.</p>
          </div>
        `
        preview.textContent = ''
        return
      }
      
      const alias = profile.aliases && profile.aliases[this.selectedKey]
      if (alias && alias.commands) {
        // Convert alias command string to command array format
        const commandStrings = alias.commands.split('$$').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0)
        commands = commandStrings.map((cmd, index) => {
          // Find the command definition to get the correct icon and name
          const commandDef = this.findCommandDefinition({ command: cmd })
          return {
            command: cmd,
            text: commandDef ? commandDef.name : cmd,
            type: 'alias',
            icon: commandDef ? commandDef.icon : '🎭', // Use command library icon if available, fallback to alias icon
            id: `alias_${index}`
          }
        })
      }
    } else {
      // For keybinds, use the build-specific view
      profile = this.getCurrentProfile()
      if (!profile) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h4>No Valid Profile</h4>
            <p>Please create or select a valid profile to manage commands.</p>
          </div>
        `
        preview.textContent = ''
        return
      }
      commands = profile.keys[this.selectedKey] || []
    }

    const chainType = this.currentEnvironment === 'alias' ? 'Alias Chain' : 'Command Chain'
    title.textContent = `${chainType} for ${this.selectedKey}`
    if (commandCount) {
      commandCount.textContent = commands.length.toString()
    }

    if (commands.length === 0) {
      const emptyMessage = this.currentEnvironment === 'alias' ? 
        `${i18next.t('click_add_command_to_start_building_your_alias_chain')} ${this.selectedKey}.` :
        `${i18next.t('click_add_command_to_start_building_your_command_chain')} ${this.selectedKey}.`
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-plus-circle"></i>
          <h4 data-i18n="no_commands">${i18next.t('no_commands')}</h4>
          <p>${emptyMessage}</p>
        </div>
      `
      if (this.currentEnvironment === 'alias') {
        preview.textContent = `alias ${this.selectedKey} <&  &>`
      } else {
        preview.textContent = `${this.selectedKey} ""`
      }
    } else {
      container.innerHTML = ''
      commands.forEach((command, index) => {
        const element = this.createCommandElement(command, index, commands.length)
        container.appendChild(element)
      })

      // Generate preview based on mode
      if (this.currentEnvironment === 'alias') {
        // For aliases, show the alias command format with <& and &> delimiters
        const commandString = commands.map((cmd) => cmd.command).join(' $$ ')
        preview.textContent = `alias ${this.selectedKey} <& ${commandString} &>`
      } else {
        // For keybinds, use the existing logic with optional mirroring
        const stabilizeCheckbox = document.getElementById('stabilizeExecutionOrder')
      const shouldStabilize = stabilizeCheckbox && stabilizeCheckbox.checked

      let commandString
      if (shouldStabilize && commands.length > 1) {
        commandString = stoKeybinds.generateMirroredCommandString(commands)
      } else {
        commandString = commands.map((cmd) => cmd.command).join(' $$ ')
      }

      preview.textContent = `${this.selectedKey} "${commandString}"`
      }
    }
  },

  createCommandElement(command, index, totalCommands) {
    const element = document.createElement('div')
    element.className = 'command-item-row'
    element.dataset.index = index
    element.draggable = true

    // Check if this command matches a library definition
    const commandDef = this.findCommandDefinition(command)
    const isParameterized = commandDef && commandDef.customizable

    // Use library definition for display if available
    let displayName = command.text
    let displayIcon = command.icon

    if (commandDef) {
      displayName = commandDef.name
      displayIcon = commandDef.icon

      // For parameterized commands, add parameter details to the name
      if (isParameterized && command.parameters) {
        if (commandDef.commandId === 'tray_with_backup') {
          const p = command.parameters
          displayName = `${commandDef.name} (${p.active} ${p.tray} ${p.slot} ${p.backup_tray} ${p.backup_slot})`
        } else if (commandDef.commandId === 'custom_tray') {
          const p = command.parameters
          displayName = `${commandDef.name} (${p.tray} ${p.slot})`
        } else if (commandDef.commandId === 'target') {
          const p = command.parameters
          displayName = `${commandDef.name}: ${p.entityName}`
        }
      } else if (isParameterized) {
        // Extract parameters from command string for display
        if (command.command.includes('TrayExecByTrayWithBackup')) {
          const parts = command.command.split(' ')
          if (parts.length >= 6) {
            displayName = `${commandDef.name} (${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]} ${parts[5]})`
          }
        } else if (command.command.includes('TrayExec')) {
          const parts = command.command.replace('+', '').split(' ')
          if (parts.length >= 3) {
            displayName = `${commandDef.name} (${parts[1]} ${parts[2]})`
          }
        } else if (command.command.includes('Target ')) {
          const match = command.command.match(/Target "([^"]+)"/)
          if (match) {
            displayName = `${commandDef.name}: ${match[1]}`
          }
        }
      }
    }

    // Add parameters data attribute for styling
    if (isParameterized) {
      element.dataset.parameters = 'true'
      element.classList.add('customizable')
    }

    // Check if command has a warning
    const warningInfo = this.getCommandWarning(command)
    const warningIcon = warningInfo
      ? `<span class="command-warning-icon" title="${warningInfo}"><i class="fas fa-exclamation-triangle"></i></span>`
      : ''

    // Add parameter indicator for tray commands and other parameterized commands
    const parameterIndicator = isParameterized
      ? ' <span class="param-indicator" title="Editable parameters">⚙️</span>'
      : ''

    element.innerHTML = `
            <div class="command-number">${index + 1}</div>
            <div class="command-content">
                <span class="command-icon">${displayIcon}</span>
                <span class="command-text">${displayName}${parameterIndicator}</span>
                ${warningIcon}
            </div>
            <span class="command-type ${command.type}">${command.type}</span>
            <div class="command-actions">
                <button class="btn btn-small-icon" onclick="app.editCommand(${index})" title="Edit Command">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-small-icon btn-danger" onclick="app.deleteCommand('${this.selectedKey}', ${index})" title="Delete Command">
                    <i class="fas fa-times"></i>
                </button>
                <button class="btn btn-small-icon" onclick="app.moveCommand('${this.selectedKey}', ${index}, ${index - 1})" 
                        title="Move Up" ${index === 0 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-up"></i>
                </button>
                <button class="btn btn-small-icon" onclick="app.moveCommand('${this.selectedKey}', ${index}, ${index + 1})" 
                        title="Move Down" ${index === totalCommands - 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>
        `

    return element
  },

  getCommandWarning(command) {
    // Look up the command in the data structure to find its warning
    const categories = STO_DATA.commands

    for (const [categoryId, category] of Object.entries(categories)) {
      for (const [cmdId, cmdData] of Object.entries(category.commands)) {
        // Match by command text or actual command
        if (
          cmdData.command === command.command ||
          cmdData.name === command.text ||
          command.command.includes(cmdData.command)
        ) {
          return cmdData.warning || null
        }
      }
    }

    return null
  },

  setupCommandLibrary() {
    const container = document.getElementById('commandCategories')
    if (!container) return

    container.innerHTML = ''

    Object.entries(STO_DATA.commands).forEach(([categoryId, category]) => {
      const categoryElement = this.createCategoryElement(categoryId, category)
      container.appendChild(categoryElement)
    })

    // Apply environment filtering after creating elements
    this.filterCommandLibrary()
    
    // Re-add aliases after rebuilding the command library
    // This ensures aliases are preserved when the library is rebuilt (e.g., on language change)
    if (typeof stoAliases !== 'undefined' && stoAliases.updateCommandLibrary) {
      stoAliases.updateCommandLibrary()
    }
  },

  createCategoryElement(categoryId, category) {
    const element = document.createElement('div')
    element.className = 'category'
    element.dataset.category = categoryId

    // Check if category should be collapsed (similar to Keys UI)
    const storageKey = `commandCategory_${categoryId}_collapsed`
    const isCollapsed = localStorage.getItem(storageKey) === 'true'

    element.innerHTML = `
            <h4 class="${isCollapsed ? 'collapsed' : ''}" data-category="${categoryId}">
                <i class="fas fa-chevron-right category-chevron"></i>
                <i class="${category.icon}"></i> 
                ${category.name}
                <span class="command-count">(${Object.keys(category.commands).length})</span>
            </h4>
            <div class="category-commands ${isCollapsed ? 'collapsed' : ''}">
                ${Object.entries(category.commands)
                  .map(
                    ([cmdId, cmd]) => `
                    <div class="command-item ${cmd.customizable ? 'customizable' : ''}" data-command="${cmdId}" title="${cmd.description}${cmd.customizable ? ' (Customizable)' : ''}">
                        ${cmd.icon} ${cmd.name}${cmd.customizable ? ' <span class="param-indicator">⚙️</span>' : ''}
                    </div>
                `
                  )
                  .join('')}
            </div>
        `

    // Add click handler for category header
    const header = element.querySelector('h4')
    header.addEventListener('click', () => {
      this.toggleCommandCategory(categoryId, element)
    })

    // Add click handlers for commands
    element.addEventListener('click', (e) => {
      if (e.target.classList.contains('command-item')) {
        const commandId = e.target.dataset.command
        this.addCommandFromLibrary(categoryId, commandId)
      }
    })

    return element
  },
  toggleCommandCategory(categoryId, element) {
    const header = element.querySelector('h4')
    const commands = element.querySelector('.category-commands')
    const chevron = header.querySelector('.category-chevron')

    const isCollapsed = commands.classList.contains('collapsed')
    const storageKey = `commandCategory_${categoryId}_collapsed`

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

  addCommandFromLibrary(categoryId, commandId) {
    if (!this.selectedKey) {
      stoUI.showToast(i18next.t('please_select_a_key_first'), 'warning')
      return
    }

    const commandDef = STO_DATA.commands[categoryId].commands[commandId]
    if (!commandDef) return

    // Check if command is parameterized
    if (commandDef.customizable && commandDef.parameters) {
      this.showParameterModal(categoryId, commandId, commandDef)
      return
    }

    const command = {
      command: commandDef.command,
      type: categoryId,
      icon: commandDef.icon,
      text: commandDef.name,
      id: this.generateCommandId(),
    }

    this.addCommand(this.selectedKey, command)
  },

  setupDragAndDrop() {
    const commandList = document.getElementById('commandList')
    if (!commandList) return

    stoUI.initDragAndDrop(commandList, {
      dragSelector: '.command-item-row',
      dropZoneSelector: '.command-item-row',
      onDrop: (e, dragState, dropZone) => {
        if (!this.selectedKey) return

        const fromIndex = parseInt(dragState.dragElement.dataset.index)
        const toIndex = parseInt(dropZone.dataset.index)

        if (fromIndex !== toIndex) {
          this.moveCommand(this.selectedKey, fromIndex, toIndex)
        }
      },
    })
  },

  updateChainActions() {
    const hasSelectedKey = !!this.selectedKey

    if (this.currentEnvironment === 'alias') {
      // In alias mode, enable/disable alias-specific buttons
      const aliasButtons = ['deleteAliasChainBtn', 'duplicateAliasChainBtn']
      aliasButtons.forEach((btnId) => {
        const btn = document.getElementById(btnId)
        if (btn) {
          btn.disabled = !hasSelectedKey
        }
      })

      // Always enable addCommandBtn in alias mode when an alias is selected
      const addCommandBtn = document.getElementById('addCommandBtn')
      if (addCommandBtn) {
        addCommandBtn.disabled = !hasSelectedKey
      }

      // Disable key-specific buttons in alias mode
      const keyButtons = ['importFromKeyBtn', 'deleteKeyBtn', 'duplicateKeyBtn']
      keyButtons.forEach((btnId) => {
        const btn = document.getElementById(btnId)
        if (btn) {
          btn.disabled = true
        }
      })
    } else {
      // In key mode, enable/disable key-specific buttons
    const buttonsToToggle = [
      'addCommandBtn',
      'importFromKeyBtn',
      'deleteKeyBtn',
      'duplicateKeyBtn',
    ]

    buttonsToToggle.forEach((btnId) => {
      const btn = document.getElementById(btnId)
      if (btn) {
        btn.disabled = !hasSelectedKey
      }
    })

      // Disable alias-specific buttons in key mode
      const aliasButtons = ['deleteAliasChainBtn', 'duplicateAliasChainBtn']
      aliasButtons.forEach((btnId) => {
        const btn = document.getElementById(btnId)
        if (btn) {
          btn.disabled = true
        }
      })
    }
  }


};
