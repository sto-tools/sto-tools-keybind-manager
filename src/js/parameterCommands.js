import eventBus from './eventBus.js'

export const parameterCommands = {
    // Parameter Modal for Customizable Commands
    showParameterModal(categoryId, commandId, commandDef) {
      this.currentParameterCommand = { categoryId, commandId, commandDef }
  
      // Create modal if it doesn't exist
      if (!document.getElementById('parameterModal')) {
        this.createParameterModal()
      }
  
      // Store command definition in modal for language change regeneration
      const modal = document.getElementById('parameterModal')
      if (modal) {
        modal.setAttribute('data-command-def', JSON.stringify(commandDef))
      }
  
      // Populate modal with parameter inputs
      this.populateParameterModal(commandDef)
  
      // Show modal
      modalManager.show('parameterModal')
    },
  
    createParameterModal() {
      const modal = document.createElement('div')
      modal.className = 'modal'
      modal.id = 'parameterModal'
      modal.innerHTML = `
              <div class="modal-content">
                  <div class="modal-header">
                      <h3 id="parameterModalTitle">Configure Command Parameters</h3>
                      <button class="modal-close" data-modal="parameterModal">
                          <i class="fas fa-times"></i>
                      </button>
                  </div>
                  <div class="modal-body">
                      <div id="parameterInputs">
                          <!-- Parameter inputs will be populated here -->
                      </div>
                      <div class="command-preview-modal">
                          <label>Generated Command:</label>
                          <div class="command-preview" id="parameterCommandPreview">
                              <!-- Command preview will be shown here -->
                          </div>
                      </div>
                  </div>
                  <div class="modal-footer">
                      <button class="btn btn-primary" id="saveParameterCommandBtn">Add Command</button>
                      <button class="btn btn-secondary" data-modal="parameterModal">Cancel</button>
                  </div>
              </div>
          `
  
      document.body.appendChild(modal)
  
      // Add event listeners
      eventBus.onDom(
        'saveParameterCommandBtn',
        'click',
        'parameter-command-save',
        () => {
          this.saveParameterCommand()
        }
      )
  
      // Close modal handlers - handle both X button and Cancel button
      const closeButtons = modal.querySelectorAll(
        '.modal-close, [data-modal="parameterModal"]'
      )
      closeButtons.forEach((button) => {
        button.addEventListener('click', () => {
          this.cancelParameterCommand()
        })
      })
    },
  
    cancelParameterCommand() {
      // Clean up state
      this.currentParameterCommand = null
  
      // Reset modal button text in case we were editing
      const saveBtn = document.getElementById('saveParameterCommandBtn')
      if (saveBtn) {
        saveBtn.textContent = i18next.t('add_command')
      }
  
      // Hide modal
      modalManager.hide('parameterModal')
    },
  
    populateParameterModal(commandDef) {
      const container = document.getElementById('parameterInputs')
      const titleElement = document.getElementById('parameterModalTitle')
  
      titleElement.textContent = `Configure: ${commandDef.name}`
      container.innerHTML = ''
  
      // Create input for each parameter
      Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
        const inputGroup = document.createElement('div')
        inputGroup.className = 'form-group'
  
        const label = document.createElement('label')
        label.textContent = this.formatParameterName(paramName)
        label.setAttribute('for', `param_${paramName}`)
  
        let input // Declare input variable outside the if/else blocks
  
        // For message parameters, create input with $Target button
        if (paramName === 'message') {
          const inputContainer = document.createElement('div')
          inputContainer.className = 'input-with-button'
  
          input = document.createElement('input')
          input.type = 'text'
          input.id = `param_${paramName}`
          input.name = paramName
          input.value = paramDef.default || ''
  
          if (paramDef.placeholder) {
            input.placeholder = paramDef.placeholder
          }
  
          const targetButton = document.createElement('button')
          targetButton.type = 'button'
          targetButton.className = 'btn btn-small insert-target-btn'
          targetButton.title = 'Insert $Target variable'
          targetButton.innerHTML = '<i class="fas fa-crosshairs"></i> $Target'
  
          inputContainer.appendChild(input)
          inputContainer.appendChild(targetButton)
  
          const help = document.createElement('small')
          help.textContent = this.getParameterHelp(paramName, paramDef)
  
          const variableHelp = document.createElement('div')
          variableHelp.className = 'variable-help'
          variableHelp.innerHTML =
            "<strong>$Target</strong> - Use to include your current target's name in the message"
  
          inputGroup.appendChild(label)
          inputGroup.appendChild(inputContainer)
          inputGroup.appendChild(help)
          inputGroup.appendChild(variableHelp)
  
          // Note: Event handling is done by global event delegation in commands.js
        } else {
          // Handle different parameter types
          if (paramDef.type === 'select') {
            // Create select dropdown
            input = document.createElement('select')
            input.id = `param_${paramName}`
            input.name = paramName
  
            // Add options
            paramDef.options.forEach((option) => {
              const optionElement = document.createElement('option')
              optionElement.value = option
              optionElement.textContent =
                option === 'STOTrayExecByTray'
                  ? 'STOTrayExecByTray (shows key binding on UI)'
                  : 'TrayExecByTray (no UI indication)'
              if (option === paramDef.default) {
                optionElement.selected = true
              }
              input.appendChild(optionElement)
            })
          } else {
            // Regular input for non-select parameters
            input = document.createElement('input')
            input.type = paramDef.type === 'number' ? 'number' : 'text'
            input.id = `param_${paramName}`
            input.name = paramName
            input.value = paramDef.default || ''
  
            if (paramDef.placeholder) {
              input.placeholder = paramDef.placeholder
            }
  
            if (paramDef.type === 'number') {
              if (paramDef.min !== undefined) input.min = paramDef.min
              if (paramDef.max !== undefined) input.max = paramDef.max
              if (paramDef.step !== undefined) input.step = paramDef.step
            }
          }
  
          const help = document.createElement('small')
          help.textContent = this.getParameterHelp(paramName, paramDef)
  
          inputGroup.appendChild(label)
          inputGroup.appendChild(input)
          inputGroup.appendChild(help)
        }
        container.appendChild(inputGroup)
  
        // Add real-time preview update
        input.addEventListener('input', () => {
          this.updateParameterPreview()
        })
  
        // Also listen for 'change' event for select elements
        if (input.tagName === 'SELECT') {
          input.addEventListener('change', () => {
            this.updateParameterPreview()
          })
        }
      })
  
      // Initial preview update
      this.updateParameterPreview()
    },
  
    formatParameterName(paramName) {
      return paramName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    },
  
    getParameterHelp(paramName, paramDef) {
      const helps = {
        entityName: 'Name of the entity to target (e.g., ship name, player name)',
        active: 'Whether the command is active (1 = active, 0 = inactive)',
        tray: 'Primary tray number (0-9, where 0 is the first tray)',
        slot: 'Primary slot number (0-9, where 0 is the first slot)',
        backup_tray: 'Backup tray number (0-9, where 0 is the first tray)',
        backup_slot: 'Backup slot number (0-9, where 0 is the first slot)',
        amount: 'Throttle adjustment amount (-1 to 1)',
        position:
          'Throttle position (-1 = full reverse, 0 = stop, 1 = full forward)',
        distance: 'Camera distance from target',
        filename: 'Name of the keybind file (without extension)',
        message: 'Text message to send',
        state: 'Enable (1) or disable (0) combat log',
        command_type:
          'STOTrayExecByTray shows key binding on UI, TrayExecByTray does not',
      }
  
      return (
        helps[paramName] ||
        `${paramDef.type} value ${paramDef.min !== undefined ? `(${paramDef.min} to ${paramDef.max})` : ''}`
      )
    },
  
    updateParameterPreview() {
      if (!this.currentParameterCommand) return
  
      const { categoryId, commandId, commandDef } = this.currentParameterCommand
      const params = this.getParameterValues()
  
      // Generate command using the command builder
      const command = this.buildParameterizedCommand(
        categoryId,
        commandId,
        commandDef,
        params
      )
  
      const preview = document.getElementById('parameterCommandPreview')
      if (preview && command) {
        // Support both single and array command results
        if (Array.isArray(command)) {
          const commandStrings = command.map((cmd) => cmd.command)
          preview.textContent = commandStrings.join(' $$ ')
        } else {
          preview.textContent = command.command
        }
      }
    },
  
    getParameterValues() {
      const params = {}
      const inputs = document.querySelectorAll(
        '#parameterInputs input, #parameterInputs select'
      )
  
      inputs.forEach((input) => {
        const paramName = input.name
        let value = input.value
  
        if (input.type === 'number') {
          value = parseFloat(value) || 0
        }
  
        params[paramName] = value
      })
  
      return params
    },
  
    buildParameterizedCommand(categoryId, commandId, commandDef, params) {
      // Use the command builder logic from commands.js
      const builders = {
        targeting: (params) => {
          if (commandId === 'target' && params.entityName) {
            return {
              command: `${commandDef.command} "${params.entityName}"`,
              text: `Target: ${params.entityName}`,
            }
          }
          return { command: commandDef.command, text: commandDef.name }
        },
        tray: (params) => {
          const tray = params.tray || 0
          const slot = params.slot || 0
  
          if (commandId === 'tray_with_backup') {
            const active = params.active !== undefined ? params.active : 1
            const backupTray = params.backup_tray || 0
            const backupSlot = params.backup_slot || 0
  
            return {
              command: `TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${backupSlot}`,
              text: `Execute Tray ${tray + 1} Slot ${slot + 1} (backup: Tray ${backupTray + 1} Slot ${backupSlot + 1})`,
            }
          } else if (commandId === 'tray_range') {
            const startTray = params.start_tray || 0
            const startSlot = params.start_slot || 0
            const endTray = params.end_tray || 0
            const endSlot = params.end_slot || 0
            const commandType = params.command_type || 'STOTrayExecByTray'
  
            const commands = stoCommands.generateTrayRangeCommands(
              startTray,
              startSlot,
              endTray,
              endSlot,
              commandType
            )
  
            // Return array of command objects with slot-specific parameters
            return commands.map((cmd, index) => {
              // Attempt to extract tray and slot numbers from the command string
              let trayParam, slotParam
              try {
                const parts = cmd.replace('+', '').trim().split(/\s+/)
                trayParam = parseInt(parts[1])
                slotParam = parseInt(parts[2])
              } catch (_) {
                trayParam = undefined
                slotParam = undefined
              }
  
              return {
                command: cmd,
                type: categoryId,
                icon: commandDef.icon,
                text:
                  index === 0
                    ? `Execute Range: Tray ${startTray + 1} Slot ${startSlot + 1} to Tray ${endTray + 1} Slot ${endSlot + 1}`
                    : cmd,
                id: this.generateCommandId(),
                parameters: { tray: trayParam, slot: slotParam },
              }
            })
          } else if (commandId === 'tray_range_with_backup') {
            const active = params.active || 1
            const startTray = params.start_tray || 0
            const startSlot = params.start_slot || 0
            const endTray = params.end_tray || 0
            const endSlot = params.end_slot || 0
            const backupStartTray = params.backup_start_tray || 0
            const backupStartSlot = params.backup_start_slot || 0
            const backupEndTray = params.backup_end_tray || 0
            const backupEndSlot = params.backup_end_slot || 0
  
            const commands = stoCommands.generateTrayRangeWithBackupCommands(
              active,
              startTray,
              startSlot,
              endTray,
              endSlot,
              backupStartTray,
              backupStartSlot,
              backupEndTray,
              backupEndSlot
            )
  
            // Return array with parsed parameters for each command
            return commands.map((cmd, index) => {
              let activeParam,
                primaryTray,
                primarySlot,
                backupTrayParam,
                backupSlotParam
              try {
                const parts = cmd.trim().split(/\s+/)
                // TrayExecByTrayWithBackup <active> <tray> <slot> <backup_tray> <backup_slot>
                activeParam = parseInt(parts[1])
                primaryTray = parseInt(parts[2])
                primarySlot = parseInt(parts[3])
                backupTrayParam = parseInt(parts[4])
                backupSlotParam = parseInt(parts[5])
              } catch (_) {}
  
              return {
                command: cmd,
                type: categoryId,
                icon: commandDef.icon,
                text:
                  index === 0
                    ? `Execute Range with Backup: Tray ${startTray + 1}-${endTray + 1}`
                    : cmd,
                id: this.generateCommandId(),
                parameters: {
                  active: activeParam,
                  tray: primaryTray,
                  slot: primarySlot,
                  backup_tray: backupTrayParam,
                  backup_slot: backupSlotParam,
                },
              }
            })
          } else if (commandId === 'whole_tray') {
            const commandType = params.command_type || 'STOTrayExecByTray'
            const commands = stoCommands.generateWholeTrayCommands(
              tray,
              commandType
            )
  
            // Return array of command objects instead of single command with $$
            return commands.map((cmd, index) => {
              // Extract slot number
              let slotParam
              try {
                const parts = cmd.replace('+', '').trim().split(/\s+/)
                slotParam = parseInt(parts[2])
              } catch (_) {
                slotParam = undefined
              }
  
              return {
                command: cmd,
                type: categoryId,
                icon: commandDef.icon,
                text: index === 0 ? `Execute Whole Tray ${tray + 1}` : cmd,
                id: this.generateCommandId(),
                parameters: { tray, slot: slotParam },
              }
            })
          } else if (commandId === 'whole_tray_with_backup') {
            const active = params.active || 1
            const backupTray = params.backup_tray || 0
  
            const commands = stoCommands.generateWholeTrayWithBackupCommands(
              active,
              tray,
              backupTray
            )
  
            // Return array with parsed parameters for each command
            return commands.map((cmd, index) => {
              let activeParam,
                primaryTray,
                primarySlot,
                backupTrayParam,
                backupSlotParam
              try {
                const parts = cmd.trim().split(/\s+/)
                // TrayExecByTrayWithBackup <active> <tray> <slot> <backup_tray> <backup_slot>
                activeParam = parseInt(parts[1])
                primaryTray = parseInt(parts[2])
                primarySlot = parseInt(parts[3])
                backupTrayParam = parseInt(parts[4])
                backupSlotParam = parseInt(parts[5])
              } catch (_) {}
  
              return {
                command: cmd,
                type: categoryId,
                icon: commandDef.icon,
                text:
                  index === 0
                    ? `Execute Whole Tray ${tray + 1} (with backup Tray ${backupTray + 1})`
                    : cmd,
                id: this.generateCommandId(),
                parameters: {
                  active: activeParam,
                  tray: primaryTray,
                  slot: primarySlot,
                  backup_tray: backupTrayParam,
                  backup_slot: backupSlotParam,
                },
              }
            })
          } else {
            // Preserve original command format when editing
            const isEditing =
              this.currentParameterCommand &&
              this.currentParameterCommand.isEditing
            const commandType = params.command_type || 'STOTrayExecByTray'
            const prefix = '+'
  
            if (isEditing) {
              const profile = this.getCurrentProfile()
              const existingCommand =
                profile.keys[this.selectedKey][
                  this.currentParameterCommand.editIndex
                ]
              if (
                existingCommand &&
                (existingCommand.command.startsWith('TrayExecByTray') ||
                  existingCommand.command.startsWith('+TrayExecByTray'))
              ) {
                return {
                  command: `+TrayExecByTray ${tray} ${slot}`,
                  text: `Execute Tray ${tray + 1} Slot ${slot + 1}`,
                }
              }
            }
  
            return {
              command: `${prefix}${commandType} ${tray} ${slot}`,
              text: `Execute Tray ${tray + 1} Slot ${slot + 1}`,
            }
          }
        },
        movement: (params) => {
          let command = commandDef.command
          if (commandId === 'throttle_adjust' && params.amount !== undefined) {
            command = `${commandDef.command} ${params.amount}`
          } else if (
            commandId === 'throttle_set' &&
            params.position !== undefined
          ) {
            command = `${commandDef.command} ${params.position}`
          }
          return { command, text: commandDef.name }
        },
        camera: (params) => {
          let command = commandDef.command
          if (commandId === 'cam_distance' && params.distance !== undefined) {
            command = `${commandDef.command} ${params.distance}`
          }
          return { command, text: commandDef.name }
        },
        communication: (params) => ({
          command: `${commandDef.command} ${params.message || 'Message text here'}`,
          text: `${commandDef.name}: ${params.message || 'Message text here'}`,
        }),
        system: (params) => {
          let command = commandDef.command
          if (
            (commandId === 'bind_save_file' || commandId === 'bind_load_file') &&
            params.filename
          ) {
            command = `${commandDef.command} ${params.filename}`
          } else if (commandId === 'combat_log' && params.state !== undefined) {
            command = `${commandDef.command} ${params.state}`
          }
          return { command, text: commandDef.name }
        },
      }
  
      const builder = builders[categoryId]
      if (builder) {
        const result = builder(params)
        // If tray (or other) builder returned an array of command objects, forward it
        if (Array.isArray(result)) {
          return result
        }
  
        // Otherwise wrap single command
        return {
          command: result.command,
          type: categoryId,
          icon: commandDef.icon,
          text: result.text,
          id: this.generateCommandId(),
          parameters: params,
        }
      }
  
      return null
    },
  
    saveParameterCommand() {
      if (!this.selectedKey || !this.currentParameterCommand) return
  
      const { categoryId, commandId, commandDef, editIndex, isEditing } =
        this.currentParameterCommand
      const params = this.getParameterValues()
  
      const command = this.buildParameterizedCommand(
        categoryId,
        commandId,
        commandDef,
        params
      )
  
      if (command) {
        if (isEditing && editIndex !== undefined) {
          // For arrays of commands, we need to handle replacement differently
          if (Array.isArray(command)) {
            const profile = this.getCurrentProfile()
            const commands = profile.keys[this.selectedKey]
  
            // Remove the old command and insert the new array of commands
            commands.splice(editIndex, 1, ...command)
  
            stoStorage.saveProfile(this.currentProfile, profile)
            this.renderCommandChain()
            this.setModified(true)
            stoUI.showToast(
              i18next.t('commands_updated_successfully', { count: command.length }),
              'success'
            )
          } else {
            // Update existing single command
            const profile = this.getCurrentProfile()
            profile.keys[this.selectedKey][editIndex] = command
            stoStorage.saveProfile(this.currentProfile, profile)
            this.renderCommandChain()
            this.setModified(true)
            stoUI.showToast(i18next.t('command_updated_successfully'), 'success')
          }
        } else {
          // Add new command (addCommand already handles arrays)
          this.addCommand(this.selectedKey, command)
        }
  
        modalManager.hide('parameterModal')
        this.currentParameterCommand = null
  
        // Reset modal button text
        document.getElementById('saveParameterCommandBtn').textContent =
          i18next.t('add_command')
      }
    },
  
    editCommand(index) {
      if (!this.selectedKey) return
  
      const profile = this.getCurrentProfile()
      const commands = profile.keys[this.selectedKey]
  
      if (!commands || !commands[index]) return
  
      const command = commands[index]
  
      // Check if this is a parameterized command that can be edited
      if (command.parameters && command.type) {
        // Find the original command definition
        const commandDef = this.findCommandDefinition(command)
        if (commandDef && commandDef.customizable) {
          this.editParameterizedCommand(index, command, commandDef)
          return
        }
      }
  
      // Also check if command is detectable as parameterized via findCommandDefinition
      const commandDef = this.findCommandDefinition(command)
      if (commandDef && commandDef.customizable) {
        this.editParameterizedCommand(index, command, commandDef)
        return
      }
  
      // For non-parameterized commands, show command details
      stoUI.showToast(
        i18next.t('command_info', { command: command.command, type: command.type }),
        'info',
        3000
      )
    },
  
    findCommandDefinition(command) {
      // Special handling for tray execution commands - detect by command string
      if (command.command.includes('TrayExec')) {
        const trayCategory = STO_DATA.commands.tray
        if (trayCategory) {
          // Check for multiple TrayExecByTrayWithBackup commands (range with backup)
          if (
            command.command.includes('TrayExecByTrayWithBackup') &&
            command.command.includes('$$')
          ) {
            const parts = command.command.split('$$').map((s) => s.trim())
            if (parts.length > 1) {
              const trayRangeWithBackupDef =
                trayCategory.commands.tray_range_with_backup
              if (trayRangeWithBackupDef) {
                return {
                  commandId: 'tray_range_with_backup',
                  ...trayRangeWithBackupDef,
                }
              }
            }
          }
          // Check for multiple STOTrayExecByTray/TrayExecByTray commands (range)
          else if (
            (command.command.includes('STOTrayExecByTray') ||
              command.command.includes('TrayExecByTray')) &&
            command.command.includes('$$') &&
            !command.command.includes('WithBackup')
          ) {
            const parts = command.command.split('$$').map((s) => s.trim())
            if (parts.length > 1) {
              const trayRangeDef = trayCategory.commands.tray_range
              if (trayRangeDef) {
                return { commandId: 'tray_range', ...trayRangeDef }
              }
            }
          }
          // Check for single TrayExecByTrayWithBackup
          else if (command.command.includes('TrayExecByTrayWithBackup')) {
            const trayWithBackupDef = trayCategory.commands.tray_with_backup
            if (trayWithBackupDef) {
              return { commandId: 'tray_with_backup', ...trayWithBackupDef }
            }
          }
          // Check for STOTrayExecByTray or TrayExecByTray (both use same dialog)
          else if (
            command.command.includes('STOTrayExecByTray') ||
            (command.command.includes('TrayExecByTray') &&
              !command.command.includes('WithBackup'))
          ) {
            const customTrayDef = trayCategory.commands.custom_tray
            if (customTrayDef) {
              return { commandId: 'custom_tray', ...customTrayDef }
            }
          }
        }
      }
  
      const category = STO_DATA.commands[command.type]
      if (!category) return null
  
      // First try to find exact command match (for non-customizable commands)
      for (const [commandId, commandDef] of Object.entries(category.commands)) {
        if (commandDef.command === command.command) {
          return { commandId, ...commandDef }
        }
      }
  
      // Then try to find the command by matching the base command string (for customizable commands)
      for (const [commandId, commandDef] of Object.entries(category.commands)) {
        if (
          commandDef.customizable &&
          command.command.startsWith(commandDef.command.split(' ')[0])
        ) {
          return { commandId, ...commandDef }
        }
      }
  
      return null
    },
  
    editParameterizedCommand(index, command, commandDef) {
      this.currentParameterCommand = {
        categoryId: command.type,
        commandId: commandDef.commandId,
        commandDef,
        editIndex: index,
        isEditing: true,
      }
  
      // Create modal if it doesn't exist
      if (!document.getElementById('parameterModal')) {
        this.createParameterModal()
      }
  
      // Populate modal with existing parameter values
      this.populateParameterModalForEdit(commandDef, command.parameters)
  
      // Change modal title and button text for editing
      document.getElementById('parameterModalTitle').textContent =
        `Edit: ${commandDef.name}`
      document.getElementById('saveParameterCommandBtn').textContent =
        'Update Command'
  
      // Show modal
      modalManager.show('parameterModal')
    },
  
    populateParameterModalForEdit(commandDef, existingParams) {
      const container = document.getElementById('parameterInputs')
      container.innerHTML = ''
  
      // Create input for each parameter with existing values
      Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
        const inputGroup = document.createElement('div')
        inputGroup.className = 'form-group'
  
        const label = document.createElement('label')
        label.textContent = this.formatParameterName(paramName)
        label.setAttribute('for', `param_${paramName}`)
  
        let input
  
        // Handle different parameter types
        if (paramDef.type === 'select') {
          // Create select dropdown
          input = document.createElement('select')
          input.id = `param_${paramName}`
          input.name = paramName
  
          // Add options
          paramDef.options.forEach((option) => {
            const optionElement = document.createElement('option')
            optionElement.value = option
            optionElement.textContent =
              option === 'STOTrayExecByTray'
                ? 'STOTrayExecByTray (shows key binding on UI)'
                : 'TrayExecByTray (no UI indication)'
            input.appendChild(optionElement)
          })
  
          // Set existing value or default
          const existingValue =
            existingParams && existingParams[paramName] !== undefined
              ? existingParams[paramName]
              : paramDef.default
          input.value =
            existingValue !== undefined && existingValue !== null
              ? existingValue
              : paramDef.default
        } else {
          // Regular input for non-select parameters
          input = document.createElement('input')
          input.type = paramDef.type === 'number' ? 'number' : 'text'
          input.id = `param_${paramName}`
          input.name = paramName
  
          // Use existing parameter value or default
          const existingValue =
            existingParams && existingParams[paramName] !== undefined
              ? existingParams[paramName]
              : paramDef.default
          input.value =
            existingValue !== undefined && existingValue !== null
              ? existingValue
              : ''
  
          if (paramDef.placeholder) {
            input.placeholder = paramDef.placeholder
          }
  
          if (paramDef.type === 'number') {
            if (paramDef.min !== undefined) input.min = paramDef.min
            if (paramDef.max !== undefined) input.max = paramDef.max
            if (paramDef.step !== undefined) input.step = paramDef.step
          }
        }
  
        const help = document.createElement('small')
        help.textContent = this.getParameterHelp(paramName, paramDef)
  
        inputGroup.appendChild(label)
        inputGroup.appendChild(input)
        inputGroup.appendChild(help)
        container.appendChild(inputGroup)
  
        // Add real-time preview update
        input.addEventListener('input', () => {
          this.updateParameterPreview()
        })
  
        // Also listen for 'change' event for select elements
        if (input.tagName === 'SELECT') {
          input.addEventListener('change', () => {
            this.updateParameterPreview()
          })
        }
      })
  
      // Initial preview update
      this.updateParameterPreview()
    },
  
    filterCommandLibrary() {
      // Filter commands in the command library based on current environment
      const commandItems = document.querySelectorAll('.command-item')
  
      commandItems.forEach((item) => {
        const commandId = item.dataset.command
        if (!commandId) return
  
        // Find the command definition
        let commandDef = null
        let categoryKey = null
  
        // Search through all categories for this command
        for (const [catKey, category] of Object.entries(STO_DATA.commands)) {
          if (category.commands[commandId]) {
            commandDef = category.commands[commandId]
            categoryKey = catKey
            break
          }
        }
  
        if (commandDef) {
          let shouldShow = true
  
          // Check if command has environment restriction
          if (commandDef.environment) {
            // If command has specific environment, only show it in that environment
            shouldShow = commandDef.environment === this.currentEnvironment
          } else {
            // If no environment specified, show in all environments
            shouldShow = true
          }
  
          // Apply visibility
          item.style.display = shouldShow ? 'flex' : 'none'
        }
      })
  
      // Hide/show categories based on whether they have visible commands
      const categories = document.querySelectorAll('.category')
      categories.forEach((category) => {
        const visibleCommands = category.querySelectorAll(
          '.command-item:not([style*="display: none"])'
        )
        const categoryVisible = visibleCommands.length > 0
        category.style.display = categoryVisible ? 'block' : 'none'
      })
    },
  
    showKeySelectionModal() {
      console.log('[KeyCapture] showKeySelectionModal called')
      this.setupKeySelectionModal()
      modalManager.show('keySelectionModal')
    },
  
    setupKeySelectionModal() {
      console.log('[KeyCapture] setupKeySelectionModal called')
      
      // Initialize the modifier + key selection interface
      this.setupModifierKeySelection()
      
      // Setup Key Capture functionality
      const captureKeyBtn = document.getElementById('keySelectionCaptureBtn')
      console.log('[KeyCapture] setupKeySelectionModal: captureKeyBtn:', captureKeyBtn)
      if (captureKeyBtn) {
        // Remove any existing handlers
        captureKeyBtn.onclick = null
        captureKeyBtn.removeEventListener('click', () => {})
        
        // Add event listener that will work for clicks anywhere on the button
        captureKeyBtn.addEventListener('click', (event) => {
          console.log('[KeyCapture] captureKeyBtn clicked (event delegation)')
          event.preventDefault()
          event.stopPropagation()
          this.startKeyCapture('keySelectionModal')
        })
      }
    },
  
    setupModifierKeySelection() {
      // Initialize state
      this.selectedModifiers = []
      this.selectedKey = null
  
      // Dynamically generate modifier buttons from data.js
      const modifierButtonsContainer = document.querySelector('.modifier-buttons')
      if (modifierButtonsContainer) {
        modifierButtonsContainer.innerHTML = ''
        const modifiers = (STO_DATA.keys.modifiers && STO_DATA.keys.modifiers.keys) || []
        modifiers.forEach(mod => {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'modifier-btn'
          btn.dataset.modifier = mod.key
          btn.dataset.selected = 'false'
          
          // Create span with i18n support
          const span = document.createElement('span')
          span.className = 'modifier-label'
          
          // Map modifier keys to i18n strings
          const i18nKey = mod.key.toLowerCase()
          if (i18nKey === 'ctrl' || i18nKey === 'alt' || i18nKey === 'shift') {
            span.setAttribute('data-i18n', i18nKey)
            span.textContent = mod.description || mod.key
          } else {
            span.textContent = mod.description || mod.key
          }
          
          btn.appendChild(span)
          
          btn.addEventListener('click', () => {
            const isSelected = btn.dataset.selected === 'true'
            if (isSelected) {
              btn.dataset.selected = 'false'
              this.selectedModifiers = this.selectedModifiers.filter(m => m !== mod.key)
            } else {
              btn.dataset.selected = 'true'
              this.selectedModifiers.push(mod.key)
            }
            this.updateKeyPreview()
          })
          modifierButtonsContainer.appendChild(btn)
        })
      }
  
      // Setup tab switching
      const tabBtns = document.querySelectorAll('.tab-btn')
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const tabName = btn.dataset.tab
          
          // Update active tab button
          tabBtns.forEach(b => b.classList.remove('active'))
          btn.classList.add('active')
          
          // Update active tab content
          const tabContents = document.querySelectorAll('.key-tab')
          tabContents.forEach(tab => tab.classList.remove('active'))
          document.getElementById(`${tabName}-tab`).classList.add('active')
          
          // Populate the selected tab if not already done
          this.populateKeyTab(tabName)
        })
      })
      
      // Setup confirm button
      const confirmBtn = document.getElementById('confirmKeySelection')
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          if (this.selectedKey) {
            const keyCombination = this.buildKeyCombination()
            this.selectKeyFromModal(keyCombination)
          }
        })
      }
      
      // Populate the initial tab (common)
      this.populateKeyTab('common')
    },
  
    populateKeyTab(tabName) {
      const gridId = `${tabName}KeyGrid`
      const grid = document.getElementById(gridId)
      if (!grid || grid.children.length > 0) return // Already populated
      
      let keys = []
      
      switch (tabName) {
        case 'common':
          keys = STO_DATA.keys.common.keys
          break
        case 'letters':
          keys = STO_DATA.keys.letters.keys
          break
        case 'numbers':
          keys = STO_DATA.keys.numbers.keys
          break
        case 'function':
          keys = STO_DATA.keys.function.keys
          break
        case 'arrows':
          keys = STO_DATA.keys.arrows.keys
          break
        case 'symbols':
          keys = STO_DATA.keys.symbols.keys
          break
        case 'mouse':
          keys = STO_DATA.keys.mouse.keys
          break
        case 'gamepad':
          keys = STO_DATA.keys.gamepad.keys
          break
      }
      
      grid.innerHTML = ''
      keys.forEach(keyData => {
        const keyItem = document.createElement('div')
        keyItem.className = 'key-item'
        keyItem.dataset.key = keyData.key
        
        // Smart formatting for compound keys and font sizing
        const formattedKeyName = this.formatKeyName(keyData.key)
        const hasLineBreaks = formattedKeyName.includes('<br>')
        
        // Determine length classification
        let lengthClass
        if (hasLineBreaks) {
          // For compound keys with line breaks, check the longest part
          const parts = keyData.key.split(/[+_]/)
          const longestPart = Math.max(...parts.map((part) => part.length))
          if (longestPart <= 4) {
            lengthClass = 'short'
          } else if (longestPart <= 8) {
            lengthClass = 'medium'
          } else {
            lengthClass = 'long'
          }
        } else {
          // For single keys, use total length
          const keyLength = keyData.key.length
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
        
        keyItem.dataset.length = lengthClass
        
        keyItem.innerHTML = `
          <div class="key-label">${formattedKeyName}</div>
        `
        
        keyItem.addEventListener('click', () => {
          // Remove selection from other keys in this tab
          grid.querySelectorAll('.key-item').forEach(item => {
            item.classList.remove('selected')
          })
          
          // Select this key
          keyItem.classList.add('selected')
          this.selectedKey = keyData.key
          this.updateKeyPreview()
        })
        
        grid.appendChild(keyItem)
      })
    },
  
    buildKeyCombination() {
      if (!this.selectedKey) return null
      
      if (this.selectedModifiers.length === 0) {
        return this.selectedKey
      }
      
      return [...this.selectedModifiers, this.selectedKey].join('+')
    },
  
    updateKeyPreview() {
      const previewDisplay = document.getElementById('keyPreviewDisplay')
      const confirmBtn = document.getElementById('confirmKeySelection')
      
      if (!previewDisplay || !confirmBtn) return
      
      const combination = this.buildKeyCombination()
      
      if (combination) {
        previewDisplay.innerHTML = `<span class="key-combination">${combination}</span>`
        confirmBtn.disabled = false
      } else {
        previewDisplay.innerHTML = '<span class="no-selection" data-i18n="no_key_selected">No key selected</span>'
        confirmBtn.disabled = true
      }
  
      // Setup Key Capture functionality
      const captureKeyBtn = document.getElementById('captureKeyBtn')
      console.log('[KeyCapture] setupKeySelectionModal: captureKeyBtn:', captureKeyBtn)
      if (captureKeyBtn) {
        // Remove any existing handlers
        captureKeyBtn.onclick = null
        captureKeyBtn.removeEventListener('click', () => {})
        
        // Add event listener that will work for clicks anywhere on the button
        captureKeyBtn.addEventListener('click', (event) => {
          console.log('[KeyCapture] captureKeyBtn clicked (event delegation)')
          event.preventDefault()
          event.stopPropagation()
          this.startKeyCapture('keySelectionModal')
        })
      }
    },
  
    populateCommonKeys() {
      const commonKeysGrid = document.getElementById('commonKeysGrid')
      if (!commonKeysGrid) return
  
      const commonKeys = STO_DATA.keys.common.keys
      commonKeysGrid.innerHTML = ''
  
      commonKeys.forEach((keyData) => {
        const keyButton = document.createElement('div')
        keyButton.className = 'key-button'
        keyButton.onclick = () => this.selectKeyFromModal(keyData.key)
  
        keyButton.innerHTML = `
                  <div class="key-name">${keyData.key}</div>
                  <div class="key-desc">${keyData.description}</div>
              `
  
        commonKeysGrid.appendChild(keyButton)
      })
    },
  
    selectKeyFromModal(keyName) {
      modalManager.hide('keySelectionModal')
      
      // Add the key to the profile if it doesn't exist, then select it
      this.addKey(keyName)
    },
  
    insertTargetVariable(input) {
      const targetVar = '$Target'
      const cursorPosition = input.selectionStart
      const value = input.value
      const newValue =
        value.slice(0, cursorPosition) + targetVar + value.slice(cursorPosition)
      input.value = newValue
      input.setSelectionRange(
        cursorPosition + targetVar.length,
        cursorPosition + targetVar.length
      )
      input.focus()
  
      // Trigger input event to update preview
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
  
    // Vertigo VFX Manager Methods
    showVertigoModal() {
      // Load state from root profile (not build-specific view)
      const rootProfile = stoStorage.getProfile(this.currentProfile)
      if (rootProfile) {
        vertigoManager.loadState(rootProfile)
      }
  
      // Store the initial state for potential rollback on cancel
      this.vertigoInitialState = {
        selectedEffects: {
          space: new Set(vertigoManager.selectedEffects.space),
          ground: new Set(vertigoManager.selectedEffects.ground),
        },
        showPlayerSay: vertigoManager.showPlayerSay,
      }
  
      this.populateVertigoModal()
      this.setupVertigoEventListeners()
      modalManager.show('vertigoModal')
    },
  
    populateVertigoModal() {
      // Populate space effects
      const spaceList = document.getElementById('spaceEffectsList')
      if (spaceList) {
        spaceList.innerHTML = ''
        VFX_EFFECTS.space.forEach((effect) => {
          const effectItem = this.createEffectItem('space', effect)
          spaceList.appendChild(effectItem)
        })
      }
  
      // Populate ground effects
      const groundList = document.getElementById('groundEffectsList')
      if (groundList) {
        groundList.innerHTML = ''
        VFX_EFFECTS.ground.forEach((effect) => {
          const effectItem = this.createEffectItem('ground', effect)
          groundList.appendChild(effectItem)
        })
      }
  
      // Update UI state based on loaded data
      this.updateVertigoCheckboxes('space')
      this.updateVertigoCheckboxes('ground')
  
      // Update PlayerSay checkbox
      const playerSayCheckbox = document.getElementById('vertigoShowPlayerSay')
      if (playerSayCheckbox) {
        playerSayCheckbox.checked = vertigoManager.showPlayerSay
      }
  
      // Update effect counts and preview
      this.updateVertigoEffectCounts()
      this.updateVertigoPreview()
    },
  
    createEffectItem(environment, effect) {
      const item = document.createElement('div')
      item.className = 'effect-item'
      item.innerHTML = `
              <input type="checkbox" id="effect_${environment}_${effect.effect.replace(/[^a-zA-Z0-9]/g, '_')}" 
                     data-environment="${environment}" 
                     data-effect="${effect.effect}">
              <label for="effect_${environment}_${effect.effect.replace(/[^a-zA-Z0-9]/g, '_')}" 
                     class="effect-label">${effect.label}</label>
          `
  
      const checkbox = item.querySelector('input[type="checkbox"]')
      checkbox.addEventListener('change', () => {
        vertigoManager.toggleEffect(environment, effect.effect)
        this.updateVertigoEffectCounts()
        this.updateVertigoPreview()
        item.classList.toggle('selected', checkbox.checked)
  
        // Note: Don't save immediately - only save when "Generate Aliases" is clicked
        // This allows for proper transaction behavior with rollback on cancel
      })
  
      const label = item.querySelector('.effect-label')
      label.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked
        checkbox.dispatchEvent(new Event('change'))
      })
  
      return item
    },
  
    setupVertigoEventListeners() {
      // Clear existing listeners to avoid duplicates
      const existingListeners = [
        'spaceSelectAll',
        'spaceClearAll',
        'groundSelectAll',
        'groundClearAll',
        'vertigoShowPlayerSay',
        'saveVertigoBtn',
      ]
      existingListeners.forEach((id) => {
        const element = document.getElementById(id)
        if (element) {
          element.replaceWith(element.cloneNode(true))
        }
      })
  
      // Space controls
      eventBus.onDom(
        'spaceSelectAll',
        'click',
        'vertigo-space-select-all',
        () => {
          try {
            vertigoManager.selectAllEffects('space')
            this.updateVertigoCheckboxes('space')
            this.updateVertigoEffectCounts()
            this.updateVertigoPreview()
  
            // Note: Don't save immediately - only save when "Generate Aliases" is clicked
          } catch (error) {
            if (error instanceof InvalidEnvironmentError) {
              stoUI.showToast(i18next.t('error_message', {error: error.message}), 'error')
            } else {
              stoUI.showToast(i18next.t('failed_to_select_all_space_effects'), 'error')
              console.error('Error selecting all space effects:', error)
            }
          }
        }
      )
  
      eventBus.onDom('spaceClearAll', 'click', 'vertigo-space-clear-all', () => {
        vertigoManager.selectedEffects.space.clear()
        this.updateVertigoCheckboxes('space')
        this.updateVertigoEffectCounts()
        this.updateVertigoPreview()
  
        // Note: Don't save immediately - only save when "Generate Aliases" is clicked
      })
  
      // Ground controls
      eventBus.onDom(
        'groundSelectAll',
        'click',
        'vertigo-ground-select-all',
        () => {
          try {
            vertigoManager.selectAllEffects('ground')
            this.updateVertigoCheckboxes('ground')
            this.updateVertigoEffectCounts()
            this.updateVertigoPreview()
  
            // Note: Don't save immediately - only save when "Generate Aliases" is clicked
          } catch (error) {
            if (error instanceof InvalidEnvironmentError) {
              stoUI.showToast(i18next.t('error_message', {error: error.message}), 'error')
            } else {
              stoUI.showToast(i18next.t('failed_to_select_all_ground_effects'), 'error')
              console.error('Error selecting all ground effects:', error)
            }
          }
        }
      )
  
      eventBus.onDom(
        'groundClearAll',
        'click',
        'vertigo-ground-clear-all',
        () => {
          vertigoManager.selectedEffects.ground.clear()
          this.updateVertigoCheckboxes('ground')
          this.updateVertigoEffectCounts()
          this.updateVertigoPreview()
  
          // Note: Don't save immediately - only save when "Generate Aliases" is clicked
        }
      )
  
      // Show Player Say toggle
      eventBus.onDom(
        'vertigoShowPlayerSay',
        'change',
        'vertigo-show-playersay',
        (e) => {
          vertigoManager.showPlayerSay = e.target.checked
          this.updateVertigoPreview()
  
          // Note: Don't save immediately - only save when "Generate Aliases" is clicked
        }
      )
  
      // Generate aliases button
      eventBus.onDom('saveVertigoBtn', 'click', 'vertigo-save', () => {
        this.generateVertigoAliases()
      })
    },
  
    updateVertigoCheckboxes(environment) {
      const checkboxes = document.querySelectorAll(
        `input[data-environment="${environment}"]`
      )
      checkboxes.forEach((checkbox) => {
        const effectName = checkbox.dataset.effect
        const isSelected = vertigoManager.isEffectSelected(
          environment,
          effectName
        )
        checkbox.checked = isSelected
        checkbox.closest('.effect-item').classList.toggle('selected', isSelected)
      })
    },
  
    updateVertigoEffectCounts() {
      const spaceCount = vertigoManager.getEffectCount('space')
      const groundCount = vertigoManager.getEffectCount('ground')
  
      const spaceCounter = document.getElementById('spaceEffectCount')
      const groundCounter = document.getElementById('groundEffectCount')
  
      if (spaceCounter) {
        spaceCounter.textContent = `${spaceCount} selected`
      }
  
      if (groundCounter) {
        groundCounter.textContent = `${groundCount} selected`
      }
    },
  
    updateVertigoPreview() {
      const spacePreview = document.getElementById('spaceAliasCommand')
      const groundPreview = document.getElementById('groundAliasCommand')
  
      // Update space preview
      if (spacePreview) {
        try {
          const spaceAlias = vertigoManager.generateAlias('space')
          spacePreview.textContent = spaceAlias || 'No space effects selected'
        } catch (error) {
          if (error instanceof InvalidEnvironmentError) {
            spacePreview.textContent = 'Error: Invalid environment'
            stoUI.showToast(i18next.t('space_preview_error', {error: error.message}), 'error')
          } else {
            spacePreview.textContent = 'Error generating preview'
            console.error('Error generating space alias preview:', error)
          }
        }
      }
      
      // Update ground preview
      if (groundPreview) {
        try {
          const groundAlias = vertigoManager.generateAlias('ground')
          groundPreview.textContent = groundAlias || 'No ground effects selected'
        } catch (error) {
          if (error instanceof InvalidEnvironmentError) {
            groundPreview.textContent = 'Error: Invalid environment'
            stoUI.showToast(i18next.t('ground_preview_error', {error: error.message}), 'error')
          } else {
            groundPreview.textContent = 'Error generating preview'
            console.error('Error generating ground alias preview:', error)
          }
        }
      }
    },
  
    generateVertigoAliases() {
      let spaceAlias = ''
      let groundAlias = ''
  
      // Generate aliases with error handling
      try {
        spaceAlias = vertigoManager.generateAlias('space')
      } catch (error) {
        if (error instanceof InvalidEnvironmentError) {
          stoUI.showToast(i18next.t('space_alias_error', {error: error.message}), 'error')
          return
        } else {
          stoUI.showToast(i18next.t('failed_to_generate_space_alias'), 'error')
          console.error('Error generating space alias:', error)
          return
        }
      }
  
      try {
        groundAlias = vertigoManager.generateAlias('ground')
      } catch (error) {
        if (error instanceof InvalidEnvironmentError) {
          stoUI.showToast(i18next.t('ground_alias_error', {error: error.message}), 'error')
          return
        } else {
          stoUI.showToast(i18next.t('failed_to_generate_ground_alias'), 'error')
          console.error('Error generating ground alias:', error)
          return
        }
      }
  
      if (!spaceAlias && !groundAlias) {
        stoUI.showToast(
          i18next.t('no_effects_selected'),
          'warning'
        )
        return
      }
  
      const currentProfile = this.getCurrentProfile()
      if (!currentProfile) {
        stoUI.showToast(i18next.t('no_profile_selected'), 'error')
        return
      }
  
      // Get the root profile object (not the build-specific view)
      const rootProfile = stoStorage.getProfile(this.currentProfile)
      if (!rootProfile) {
        stoUI.showToast(i18next.t('no_profile_found'), 'error')
        return
      }
  
      let addedCount = 0
  
      // Ensure aliases structure exists at profile level (not build-specific)
      if (!rootProfile.aliases) {
        rootProfile.aliases = {}
      }
  
      // Add space alias if effects are selected
      if (spaceAlias) {
        const spaceAliasName = 'dynFxSetFXExlusionList_Space'
        // Extract commands from the full alias (remove the alias name and brackets)
        // spaceAlias format: 'alias aliasName <& commands&>'
        const match = spaceAlias.match(/alias\s+\w+\s+<&\s+(.+?)&>/)
        const spaceCommands = match ? match[1] : ''
  
        rootProfile.aliases[spaceAliasName] = {
          name: spaceAliasName,
          description: 'VFX - Disable Space Visual Effects',
          commands: spaceCommands,
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        }
        addedCount++
      }
  
      // Add ground alias if effects are selected
      if (groundAlias) {
        const groundAliasName = 'dynFxSetFXExlusionList_Ground'
        // Extract commands from the full alias (remove the alias name and brackets)
        // groundAlias format: 'alias aliasName <& commands&>'
        const match = groundAlias.match(/alias\s+\w+\s+<&\s+(.+?)&>/)
        const groundCommands = match ? match[1] : ''
  
        rootProfile.aliases[groundAliasName] = {
          name: groundAliasName,
          description: 'VFX - Disable Ground Visual Effects',
          commands: groundCommands,
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        }
        addedCount++
      }
  
      // Save current state to root profile so it persists (commit the transaction)
      vertigoManager.saveState(rootProfile)
  
      // Save the root profile to storage
      stoStorage.saveProfile(this.currentProfile, rootProfile)
  
      // Save the changes - follow the same pattern as aliases.js
      this.saveProfile()
      this.setModified(true)
  
      // Update the command library to show the new VFX aliases
      if (typeof stoAliases !== 'undefined' && stoAliases.updateCommandLibrary) {
        stoAliases.updateCommandLibrary()
      }
  
      // Update the stored initial state to the new saved state
      this.vertigoInitialState = {
        selectedEffects: {
          space: new Set(vertigoManager.selectedEffects.space),
          ground: new Set(vertigoManager.selectedEffects.ground),
        },
        showPlayerSay: vertigoManager.showPlayerSay,
      }
  
      // Set flag to indicate we're saving (not canceling)
      this.vertigoSaving = true
  
      // Close modal and show success message
      modalManager.hide('vertigoModal')
      stoUI.showToast(
        i18next.t('generated_vertigo_aliases', { count: addedCount, plural: addedCount > 1 ? 'es' : '' }),
        'success'
      )
    },
  
    // Theme Management
    applyTheme() {
      const settings = stoStorage.getSettings()
      const theme = settings.theme || 'default'
  
      if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark')
      } else {
        document.documentElement.removeAttribute('data-theme')
      }
  
      this.updateThemeToggleButton(theme)
    },
  
    toggleTheme() {
      const settings = stoStorage.getSettings()
      const currentTheme = settings.theme || 'default'
      const newTheme = currentTheme === 'dark' ? 'default' : 'dark'
  
      settings.theme = newTheme
      stoStorage.saveSettings(settings)
  
      this.applyTheme()
  
      const themeName = newTheme === 'dark' ? 'Dark Mode' : 'Light Mode'
      stoUI.showToast(i18next.t('switched_to_theme', {themeName: themeName}), 'success')
    },
  
    updateThemeToggleButton(theme) {
      const themeToggleBtn = document.getElementById('themeToggleBtn')
      const themeToggleText = document.getElementById('themeToggleText')
      const themeIcon = themeToggleBtn?.querySelector('i')
  
      if (themeToggleBtn && themeToggleText && themeIcon) {
        if (theme === 'dark') {
          themeIcon.className = 'fas fa-sun'
          themeToggleText.textContent = 'Light Mode'
        } else {
          themeIcon.className = 'fas fa-moon'
          themeToggleText.textContent = 'Dark Mode'
        }
      }
    },
  
    async applyLanguage() {
      const settings = stoStorage.getSettings()
      const lang = settings.language || 'en'
  
      if (typeof i18next !== 'undefined' && i18next.language !== lang) {
        await i18next.changeLanguage(lang)
      }
  
      if (typeof applyTranslations === 'function') {
        applyTranslations()
      }
  
      const flag = document.getElementById('languageFlag')
      const flagClasses = { en: 'fi fi-gb', de: 'fi fi-de', es: 'fi fi-es', fr: 'fi fi-fr' }
      if (flag) {
        flag.className = flagClasses[lang] || 'fi fi-gb'
      }
    },
  
    async changeLanguage(lang) {
      const settings = stoStorage.getSettings()
      settings.language = lang
      stoStorage.saveSettings(settings)
  
      await this.applyLanguage()
      
      // Re-localize command data with new language
      if (window.localizeCommandData) {
        window.localizeCommandData()
      }
      
      // Re-render all dynamic content
      this.renderProfiles()
      this.renderKeyGrid()
      this.renderCommandChain()
      
      // Update command library if it exists
      if (this.setupCommandLibrary) {
        this.setupCommandLibrary()
      }
      
      // Update export formats if export manager exists
      if (typeof stoExport !== 'undefined' && stoExport.init) {
        stoExport.init()
      }
      
      stoUI.showToast(i18next.t('language_updated'), 'success')
    },
  
    // Alias Options Multiselect Methods
    toggleAliasOptionsDropdown() {
      const dropdown = document.getElementById('aliasOptionsDropdown')
      const menu = document.getElementById('aliasOptionsMenu')
      
      if (!dropdown || !menu) return
      
      const isOpen = menu.style.display === 'block'
      
      if (isOpen) {
        this.closeAliasOptionsDropdown()
      } else {
        this.openAliasOptionsDropdown()
      }
    },
  
    openAliasOptionsDropdown() {
      const dropdown = document.getElementById('aliasOptionsDropdown')
      const menu = document.getElementById('aliasOptionsMenu')
      
      if (!dropdown || !menu) return
      
      dropdown.classList.add('active')
      menu.style.display = 'block'
    },
  
    closeAliasOptionsDropdown() {
      const dropdown = document.getElementById('aliasOptionsDropdown')
      const menu = document.getElementById('aliasOptionsMenu')
      
      if (!dropdown || !menu) return
      
      dropdown.classList.remove('active')
      menu.style.display = 'none'
    },
  
    updateAliasOptionsLabel() {
      const checkboxes = [
        { id: 'aliasStabilizeOption', label: 'Stabilize' },
        { id: 'aliasToggleOption', label: 'Toggle' },
        { id: 'aliasCycleOption', label: 'Cycle' }
      ]
      
      const selected = checkboxes.filter(cb => {
        const checkbox = document.getElementById(cb.id)
        return checkbox && checkbox.checked
      })
      
      const label = document.querySelector('#aliasOptionsDropdown .multiselect-label')
      if (label) {
        if (selected.length === 0) {
          label.textContent = i18next.t('select_options')
        } else if (selected.length === 1) {
          label.textContent = selected[0].label
        } else {
          label.textContent = `${selected.length} options selected`
        }
      }
    },
};
