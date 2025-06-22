// STO Tools Keybind Manager - Command Management
// Handles command building, editing, and validation

export default class STOCommandManager {
  constructor() {
    this.currentCommand = null
    this.commandBuilders = new Map()
    this.init()
  }

  init() {
    this.setupCommandBuilders()
    this.setupEventListeners()
  }

  // Command Builder Setup
  setupCommandBuilders() {
    // Targeting commands
    this.commandBuilders.set('targeting', {
      build: (commandId, params = {}) => {
        const cmd = STO_DATA.commands.targeting.commands[commandId]
        if (!cmd) return null

        return {
          command: cmd.command,
          type: 'targeting',
          icon: cmd.icon,
          text: cmd.name,
          description: cmd.description,
        }
      },
      getUI: () => this.createTargetingUI(),
    })

    // Combat commands
    this.commandBuilders.set('combat', {
      build: (commandId, params = {}) => {
        const cmd = STO_DATA.commands.combat.commands[commandId]
        if (!cmd) return null

        // Handle customizable commands
        if (cmd.customizable && cmd.parameters) {
          let command = cmd.command
          
          // Replace parameters in the command
          Object.entries(cmd.parameters).forEach(([paramName, paramConfig]) => {
            const value = params[paramName] || paramConfig.default || ''
            const placeholder = `{{${paramName}}}`
            command = command.replace(placeholder, value)
          })

          // Handle specific parameter replacements for setactivecostume
          if (commandId === 'setactivecostume') {
            const modifier1 = params.modifier1 || 'modifier1'
            const modifier2 = params.modifier2 || 'modifier2'
            command = `setactivecostume ${modifier1} ${modifier2}`
          }

          return {
            command: command,
            type: 'combat',
            icon: cmd.icon,
            text: cmd.name,
            description: cmd.description,
            environment: cmd.environment,
            parameters: params,
          }
        }

        return {
          command: cmd.command,
          type: 'combat',
          icon: cmd.icon,
          text: cmd.name,
          description: cmd.description,
          environment: cmd.environment,
        }
      },
      getUI: () => this.createCombatUI(),
    })

    // Cosmetic commands
    this.commandBuilders.set('cosmetic', {
      build: (commandId, params = {}) => {
        const cmd = STO_DATA.commands.cosmetic.commands[commandId]
        if (!cmd) return null

        // Handle customizable commands
        if (cmd.customizable && cmd.parameters) {
          let command = cmd.command
          
          // Replace parameters in the command
          Object.entries(cmd.parameters).forEach(([paramName, paramConfig]) => {
            const value = params[paramName] || paramConfig.default || ''
            const placeholder = `{{${paramName}}}`
            command = command.replace(placeholder, value)
          })

          // Handle specific parameter replacements for setactivecostume
          if (commandId === 'setactivecostume') {
            const modifier1 = params.modifier1 || 'modifier1'
            const modifier2 = params.modifier2 || 'modifier2'
            command = `setactivecostume ${modifier1} ${modifier2}`
          }

          return {
            command: command,
            type: 'cosmetic',
            icon: cmd.icon,
            text: cmd.name,
            description: cmd.description,
            environment: cmd.environment,
            parameters: params,
          }
        }

        return {
          command: cmd.command,
          type: 'cosmetic',
          icon: cmd.icon,
          text: cmd.name,
          description: cmd.description,
          environment: cmd.environment,
        }
      },
      getUI: () => this.createCosmeticUI(),
    })

    // Tray execution commands
    this.commandBuilders.set('tray', {
      build: (commandId, params = {}) => {
        const tray = params.tray || 0
        const slot = params.slot || 0

        // Handle backup tray commands
        if (commandId === 'tray_with_backup') {
          const backupTray = params.backup_tray || 0
          const backupSlot = params.backup_slot || 0
          const active = params.active || 'on'

          return {
            command: `TrayExecByTrayWithBackup ${tray} ${slot} ${backupTray} ${backupSlot} ${active === 'on' ? 1 : 0}`,
            type: 'tray',
            icon: '⚡',
            text: `Execute Tray ${tray + 1} Slot ${slot + 1} (with backup)`,
            description: `Execute ability in tray ${tray + 1}, slot ${slot + 1} with backup in tray ${backupTray + 1}, slot ${backupSlot + 1}`,
            parameters: {
              tray,
              slot,
              backup_tray: backupTray,
              backup_slot: backupSlot,
              active,
            },
          }
        }

        // Handle tray range commands
        if (commandId === 'tray_range') {
          const startTray = params.start_tray || 0
          const startSlot = params.start_slot || 0
          const endTray = params.end_tray || 0
          const endSlot = params.end_slot || 0
          const commandType = params.command_type || 'STOTrayExecByTray'

          const commands = this.generateTrayRangeCommands(
            startTray,
            startSlot,
            endTray,
            endSlot,
            commandType
          )

          // Return an array of individual command objects instead of a single command with $$
          return commands.map((cmd, index) => ({
            command: cmd,
            type: 'tray',
            icon: '⚡',
            text:
              index === 0
                ? `Execute Range: Tray ${startTray + 1} Slot ${startSlot + 1} to Tray ${endTray + 1} Slot ${endSlot + 1}`
                : cmd,
            description:
              index === 0
                ? `Execute abilities from tray ${startTray + 1} slot ${startSlot + 1} to tray ${endTray + 1} slot ${endSlot + 1}`
                : cmd,
            parameters:
              index === 0
                ? {
                    start_tray: startTray,
                    start_slot: startSlot,
                    end_tray: endTray,
                    end_slot: endSlot,
                    command_type: commandType,
                  }
                : undefined,
          }))
        }

        // Handle tray range with backup commands
        if (commandId === 'tray_range_with_backup') {
          const active = params.active || 1
          const startTray = params.start_tray || 0
          const startSlot = params.start_slot || 0
          const endTray = params.end_tray || 0
          const endSlot = params.end_slot || 0
          const backupStartTray = params.backup_start_tray || 0
          const backupStartSlot = params.backup_start_slot || 0
          const backupEndTray = params.backup_end_tray || 0
          const backupEndSlot = params.backup_end_slot || 0

          const commands = this.generateTrayRangeWithBackupCommands(
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

          // Return an array of individual command objects instead of a single command with $$
          return commands.map((cmd, index) => ({
            command: cmd,
            type: 'tray',
            icon: '⚡',
            text:
              index === 0
                ? `Execute Range with Backup: Tray ${startTray + 1}-${endTray + 1}`
                : cmd,
            description:
              index === 0
                ? `Execute abilities from tray ${startTray + 1} to ${endTray + 1} with backup range`
                : cmd,
            parameters:
              index === 0
                ? {
                    active,
                    start_tray: startTray,
                    start_slot: startSlot,
                    end_tray: endTray,
                    end_slot: endSlot,
                    backup_start_tray: backupStartTray,
                    backup_start_slot: backupStartSlot,
                    backup_end_tray: backupEndTray,
                    backup_end_slot: backupEndSlot,
                  }
                : undefined,
          }))
        }

        // Handle whole tray commands
        if (commandId === 'whole_tray') {
          const commandType = params.command_type || 'STOTrayExecByTray'
          const commands = this.generateWholeTrayCommands(tray, commandType)

          // Return an array of individual command objects instead of a single command with $$
          return commands.map((cmd, index) => ({
            command: cmd,
            type: 'tray',
            icon: '⚡',
            text: index === 0 ? `Execute Whole Tray ${tray + 1}` : cmd,
            description:
              index === 0 ? `Execute all abilities in tray ${tray + 1}` : cmd,
            parameters:
              index === 0 ? { tray, command_type: commandType } : undefined,
          }))
        }

        // Handle whole tray with backup commands
        if (commandId === 'whole_tray_with_backup') {
          const active = params.active || 1
          const backupTray = params.backup_tray || 0

          const commands = this.generateWholeTrayWithBackupCommands(
            active,
            tray,
            backupTray
          )

          // Return an array of individual command objects instead of a single command with $$
          return commands.map((cmd, index) => ({
            command: cmd,
            type: 'tray',
            icon: '⚡',
            text:
              index === 0
                ? `Execute Whole Tray ${tray + 1} (with backup Tray ${backupTray + 1})`
                : cmd,
            description:
              index === 0
                ? `Execute all abilities in tray ${tray + 1} with backup from tray ${backupTray + 1}`
                : cmd,
            parameters:
              index === 0
                ? { active, tray, backup_tray: backupTray }
                : undefined,
          }))
        }

        // Regular tray command
        const commandType = params.command_type || 'STOTrayExecByTray'
        const prefix = '+'

        return {
          command: `${prefix}${commandType} ${tray} ${slot}`,
          type: 'tray',
          icon: '⚡',
          text: `Execute Tray ${tray + 1} Slot ${slot + 1}`,
          description: `Execute ability in tray ${tray + 1}, slot ${slot + 1}`,
          parameters: { tray, slot, command_type: commandType },
        }
      },
      getUI: () => this.createTrayUI(),
    })

    // Shield management commands
    this.commandBuilders.set('power', {
      build: (commandId, params = {}) => {
        const cmd = STO_DATA.commands.power.commands[commandId]
        if (!cmd) return null

        return {
          command: cmd.command,
          type: 'power',
          icon: cmd.icon,
          text: cmd.name,
          description: cmd.description,
        }
      },
      getUI: () => this.createPowerUI(),
    })

    // Movement commands
    this.commandBuilders.set('movement', {
      build: (commandId, params = {}) => {
        const cmd = STO_DATA.commands.movement.commands[commandId]
        if (!cmd) return null

        let command = cmd.command

        // Handle parameterized movement commands
        if (cmd.customizable && params) {
          if (commandId === 'throttle_adjust' && params.amount !== undefined) {
            command = `${cmd.command} ${params.amount}`
          } else if (
            commandId === 'throttle_set' &&
            params.position !== undefined
          ) {
            command = `${cmd.command} ${params.position}`
          }
        }

        return {
          command: command,
          type: 'movement',
          icon: cmd.icon,
          text: cmd.name,
          description: cmd.description,
        }
      },
      getUI: () => this.createMovementUI(),
    })

    // Camera commands
    this.commandBuilders.set('camera', {
      build: (commandId, params = {}) => {
        const cmd = STO_DATA.commands.camera.commands[commandId]
        if (!cmd) return null

        let command = cmd.command

        // Handle parameterized camera commands
        if (cmd.customizable && params) {
          if (commandId === 'cam_distance' && params.distance !== undefined) {
            command = `${cmd.command} ${params.distance}`
          }
        }

        return {
          command: command,
          type: 'camera',
          icon: cmd.icon,
          text: cmd.name,
          description: cmd.description,
        }
      },
      getUI: () => this.createCameraUI(),
    })

    // Communication commands
    this.commandBuilders.set('communication', {
      build: (commandId, params = {}) => {
        const cmd = STO_DATA.commands.communication.commands[commandId]
        if (!cmd) return null

        const message = params.message || 'Message text here'

        return {
          command: `${cmd.command} ${message}`,
          type: 'communication',
          icon: cmd.icon,
          text: `${cmd.name}: ${message}`,
          description: cmd.description,
          parameters: { message },
        }
      },
      getUI: () => this.createCommunicationUI(),
    })

    // System commands
    this.commandBuilders.set('system', {
      build: (commandId, params = {}) => {
        const cmd = STO_DATA.commands.system.commands[commandId]
        if (!cmd) return null

        let command = cmd.command

        // Handle parameterized system commands
        if (cmd.customizable && params) {
          // File-based commands
          if (
            (commandId === 'bind_save_file' ||
              commandId === 'bind_load_file' ||
              commandId === 'ui_load_file' ||
              commandId === 'ui_save_file') &&
            params.filename
          ) {
            command = `${cmd.command} ${params.filename}`
          }
          // State-based commands (0/1)
          else if (
            (commandId === 'combat_log' ||
              commandId === 'chat_log' ||
              commandId === 'remember_ui_lists' ||
              commandId === 'ui_remember_positions' ||
              commandId === 'safe_login' ||
              commandId === 'net_timing_graph' ||
              commandId === 'net_timing_graph_paused' ||
              commandId === 'netgraph') &&
            params.state !== undefined
          ) {
            command = `${cmd.command} ${params.state}`
          }
          // Tooltip delay command
          else if (commandId === 'ui_tooltip_delay' && params.seconds !== undefined) {
            command = `${cmd.command} ${params.seconds}`
          }
          // Net timing graph alpha command
          else if (commandId === 'net_timing_graph_alpha' && params.alpha !== undefined) {
            command = `${cmd.command} ${params.alpha}`
          }
        }

        return {
          command: command,
          type: 'system',
          icon: cmd.icon,
          text: cmd.name,
          description: cmd.description,
        }
      },
      getUI: () => this.createSystemUI(),
    })

    // Alias commands
    this.commandBuilders.set('alias', {
      build: (commandId, params = {}) => {
        const aliasName = params.alias_name || ''

        if (!aliasName.trim()) {
          return null
        }

        return {
          command: aliasName,
          type: 'alias',
          icon: '📝',
          text: `Alias: ${aliasName}`,
          description: 'Execute custom alias',
          parameters: { alias_name: aliasName },
        }
      },
      getUI: () => this.createAliasUI(),
    })

    // Custom commands
    this.commandBuilders.set('custom', {
      build: (commandId, params = {}) => {
        const command = params.command || ''
        const text = params.text || 'Custom Command'

        return {
          command: command,
          type: 'custom',
          icon: '⚙️',
          text: text,
          description: 'Custom command',
          parameters: { command, text },
        }
      },
      getUI: () => this.createCustomUI(),
    })

    // Bridge Officer commands
    this.commandBuilders.set('bridge_officer', {
      build: (commandId, params = {}) => {
        const cmd = STO_DATA.commands.bridge_officer.commands[commandId]
        if (!cmd) return null

        // Handle customizable commands
        if (cmd.customizable && cmd.parameters) {
          let command = cmd.command
          Object.entries(cmd.parameters).forEach(([paramName, paramConfig]) => {
            const value = params[paramName] || paramConfig.default || ''
            const placeholder = `{{${paramName}}}`
            command = command.replace(placeholder, value)
          })
          if (commandId === 'assist') {
            const name = params.name || ''
            command = name ? `Assist ${name}` : 'Assist'
          }
          return {
            command: command,
            type: 'bridge_officer',
            icon: cmd.icon,
            text: cmd.name,
            description: cmd.description,
            environment: cmd.environment,
            parameters: params,
          }
        }
        return {
          command: cmd.command,
          type: 'bridge_officer',
          icon: cmd.icon,
          text: cmd.name,
          description: cmd.description,
          environment: cmd.environment,
        }
      },
      getUI: () => this.createBridgeOfficerUI(),
    })
  }

  // UI Builders for different command types
  createTargetingUI() {
    const commands = STO_DATA.commands.targeting.commands
    return `
            <div class="command-selector">
                <label for="targetingCommand">${i18next.t('targeting_command')}</label>
                <select id="targetingCommand">
                    <option value="">${i18next.t('select_targeting_command')}</option>
                    ${Object.entries(commands)
                      .map(
                        ([id, cmd]) =>
                          `<option value="${id}">${cmd.name}</option>`
                      )
                      .join('')}
                </select>
            </div>
        `
  }

  createCombatUI() {
    const commands = STO_DATA.commands.combat.commands

    return `
            <div class="command-selector">
                <label for="combatCommand">${i18next.t('combat_command')}:</label>
                <select id="combatCommand">
                    <option value="">${i18next.t('select_combat_command')}</option>
                    ${Object.entries(commands)
                      .map(
                        ([id, cmd]) =>
                          `<option value="${id}">${cmd.name}</option>`
                      )
                      .join('')}
                </select>
                <div id="combatCommandWarning" class="command-warning" style="display: none;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span id="combatWarningText"></span>
                </div>
            </div>
        `
  }

  createCosmeticUI() {
    const commands = STO_DATA.commands.cosmetic.commands

    return `
            <div class="command-selector">
                <label for="cosmeticCommand">${i18next.t('cosmetic_command')}:</label>
                <select id="cosmeticCommand">
                    <option value="">${i18next.t('select_cosmetic_command')}</option>
                    ${Object.entries(commands)
                      .map(
                        ([id, cmd]) =>
                          `<option value="${id}">${cmd.name}</option>`
                      )
                      .join('')}
                </select>
            </div>
            
            <!-- Parameter Configuration for Customizable Commands -->
            <div id="cosmeticParamsConfig" class="params-config-section" style="display: none;">
                <h4>${i18next.t('parameter_configuration')}</h4>
                
                <!-- setactivecostume parameters -->
                <div id="setactivecostumeParams" class="param-group" style="display: none;">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="modifier1">${i18next.t('modifier_1')}:</label>
                            <input type="text" id="modifier1" placeholder="${i18next.t('first_modifier')}" value="modifier1">
                        </div>
                        <div class="form-group">
                            <label for="modifier2">${i18next.t('modifier_2')}:</label>
                            <input type="text" id="modifier2" placeholder="${i18next.t('second_modifier')}" value="modifier2">
                        </div>
                    </div>
                </div>
            </div>
        `
  }

  createTrayUI() {
    return `
            <div class="tray-builder">
                <div class="form-group">
                    <label for="trayCommandType">${i18next.t('command_type')}:</label>
                    <select id="trayCommandType">
                        <option value="custom_tray">${i18next.t('single_tray_slot')}</option>
                        <option value="tray_with_backup">${i18next.t('single_tray_with_backup')}</option>
                        <option value="tray_range">${i18next.t('tray_range')}</option>
                        <option value="tray_range_with_backup">${i18next.t('tray_range_with_backup')}</option>
                        <option value="whole_tray">${i18next.t('whole_tray')}</option>
                        <option value="whole_tray_with_backup">${i18next.t('whole_tray_with_backup')}</option>
                    </select>
                </div>
                
                <!-- Single Tray Configuration -->
                <div id="singleTrayConfig" class="tray-config-section">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="trayNumber">${i18next.t('tray_number')}:</label>
                            <select id="trayNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="slotNumber">${i18next.t('slot_number')}:</label>
                            <select id="slotNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Backup Configuration -->
                <div id="backupConfig" class="tray-config-section" style="display: none;">
                    <h4>${i18next.t('backup_configuration')}</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="backupTrayNumber">${i18next.t('backup_tray')}:</label>
                            <select id="backupTrayNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="backupSlotNumber">${i18next.t('backup_slot')}:</label>
                            <select id="backupSlotNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="activeState">${i18next.t('active_state')}:</label>
                        <select id="activeState">
                            <option value="1">${i18next.t('active')}</option>
                            <option value="0">${i18next.t('inactive')}</option>
                        </select>
                    </div>
                </div>
                
                <!-- Range Configuration -->
                <div id="rangeConfig" class="tray-config-section" style="display: none;">
                    <h4>${i18next.t('range_configuration')}</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="startTrayNumber">${i18next.t('start_tray')}:</label>
                            <select id="startTrayNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="startSlotNumber">${i18next.t('start_slot')}:</label>
                            <select id="startSlotNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="endTrayNumber">${i18next.t('end_tray')}:</label>
                            <select id="endTrayNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="endSlotNumber">${i18next.t('end_slot')}:</label>
                            <select id="endSlotNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Backup Range Configuration -->
                <div id="backupRangeConfig" class="tray-config-section" style="display: none;">
                    <h4>${i18next.t('backup_range_configuration')}</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="backupStartTrayNumber">${i18next.t('backup_start_tray')}:</label>
                            <select id="backupStartTrayNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="backupStartSlotNumber">${i18next.t('backup_start_slot')}:</label>
                            <select id="backupStartSlotNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="backupEndTrayNumber">${i18next.t('backup_end_tray')}:</label>
                            <select id="backupEndTrayNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="backupEndSlotNumber">${i18next.t('backup_end_slot')}:</label>
                            <select id="backupEndSlotNumber">
                                ${Array.from(
                                  { length: 10 },
                                  (_, i) =>
                                    `<option value="${i}">${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Command Type Selection -->
                <div id="commandTypeConfig" class="tray-config-section" style="display: none;">
                    <div class="form-group">
                        <label for="trayCommandVariant">${i18next.t('command_variant')}:</label>
                        <select id="trayCommandVariant">
                            <option value="STOTrayExecByTray">${i18next.t('stotrayexecbytray_description')}</option>
                            <option value="TrayExecByTray">${i18next.t('trayexecbytray_description')}</option>
                        </select>
                    </div>
                </div>
                
                <div class="tray-visual" id="trayVisual">
                    <!-- Visual tray representation will be generated here -->
                </div>
            </div>
        `
  }

  createPowerUI() {
    const commands = STO_DATA.commands.power.commands

    return `
            <div class="command-selector">
                <label for="powerCommand">${i18next.t('shield_command')}:</label>
                <select id="powerCommand">
                    <option value="">${i18next.t('select_shield_command')}</option>
                    ${Object.entries(commands)
                      .map(
                        ([id, cmd]) =>
                          `<option value="${id}">${cmd.name}</option>`
                      )
                      .join('')}
                </select>
                <div id="powerCommandWarning" class="command-warning" style="display: none;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span id="powerWarningText"></span>
                </div>
            </div>
        `
  }

  createMovementUI() {
    const commands = STO_DATA.commands.movement.commands

    return `
            <div class="command-selector">
                <label for="movementCommand">${i18next.t('movement_command')}:</label>
                <select id="movementCommand">
                    <option value="">${i18next.t('select_movement_command')}</option>
                    ${Object.entries(commands)
                      .map(
                        ([id, cmd]) =>
                          `<option value="${id}">${cmd.name}</option>`
                      )
                      .join('')}
                </select>
                <div id="movementParams" style="display: none;">
                    <div class="form-group">
                        <label for="movementAmount">${i18next.t('amount')}: (-1 to 1)</label>
                        <input type="number" id="movementAmount" min="-1" max="1" step="0.05" value="0.25">
                    </div>
                    <div class="form-group">
                        <label for="movementPosition">${i18next.t('position')}: (-1 to 1)</label>
                        <input type="number" id="movementPosition" min="-1" max="1" step="0.1" value="1">
                    </div>
                </div>
            </div>
        `
  }

  createCommunicationUI() {
    const commands = STO_DATA.commands.communication.commands

    return `
            <div class="communication-builder">
                <div class="form-group">
                    <label for="commCommand">${i18next.t('communication_type')}:</label>
                    <select id="commCommand">
                        <option value="">${i18next.t('select_communication_type')}</option>
                        ${Object.entries(commands)
                          .map(
                            ([id, cmd]) =>
                              `<option value="${id}">${cmd.name}</option>`
                          )
                          .join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="commMessage">${i18next.t('message')}:</label>
                    <div class="input-with-button">
                        <input type="text" id="commMessage" placeholder="${i18next.t('enter_your_message')}" maxlength="100">
                        <button type="button" class="btn btn-small insert-target-btn" title="${i18next.t('insert_target_variable')}">
                            <i class="fas fa-crosshairs"></i> $Target
                        </button>
                    </div>
                    <small>${i18next.t('maximum_100_characters')}</small>
                </div>
                <div class="variable-help">
                    <h4><i class="fas fa-info-circle"></i> ${i18next.t('sto_variables')}</h4>
                    <div class="variable-info">
                        <strong>$Target</strong> - ${i18next.t('replaced_with_your_current_targets_name')}<br>
                        <em>${i18next.t('example')}:</em> <code>team Attacking [$Target]</code> → <code>team Attacking [Borg Cube]</code>
                    </div>
                </div>
            </div>
        `
  }

  createCameraUI() {
    const commands = STO_DATA.commands.camera.commands

    return `
            <div class="command-selector">
                <label for="cameraCommand">${i18next.t('camera_command')}:</label>
                <select id="cameraCommand">
                    <option value="">${i18next.t('select_camera_command')}</option>
                    ${Object.entries(commands)
                      .map(
                        ([id, cmd]) =>
                          `<option value="${id}">${cmd.name}</option>`
                      )
                      .join('')}
                </select>
                <div id="cameraParams" style="display: none;">
                    <div class="form-group">
                        <label for="cameraDistance">${i18next.t('distance')}:</label>
                        <input type="number" id="cameraDistance" min="1" max="500" value="50">
                    </div>
                </div>
            </div>
        `
  }

  createSystemUI() {
    const commands = STO_DATA.commands.system.commands

    return `
            <div class="command-selector">
                <label for="systemCommand">${i18next.t('system_command')}:</label>
                <select id="systemCommand">
                    <option value="">${i18next.t('select_system_command')}</option>
                    ${Object.entries(commands)
                      .map(
                        ([id, cmd]) =>
                          `<option value="${id}">${cmd.name}</option>`
                      )
                      .join('')}
                </select>
                <div id="systemParams" style="display: none;">
                    <!-- File-based parameters -->
                    <div id="systemFileParams" class="form-group" style="display: none;">
                        <label for="systemFilename">${i18next.t('filename')}:</label>
                        <input type="text" id="systemFilename" value="my_binds.txt">
                    </div>
                    <!-- State-based parameters (0/1) -->
                    <div id="systemStateParams" class="form-group" style="display: none;">
                        <label for="systemState">${i18next.t('state')}: (0/1)</label>
                        <select id="systemState">
                            <option value="1">${i18next.t('on')}</option>
                            <option value="0">${i18next.t('off')}</option>
                        </select>
                    </div>
                    <!-- Tooltip delay parameter -->
                    <div id="systemTooltipParams" class="form-group" style="display: none;">
                        <label for="systemTooltipDelay">${i18next.t('delay_seconds')}:</label>
                        <input type="number" id="systemTooltipDelay" min="0" max="10" step="0.1" value="0.5">
                    </div>
                    <!-- Net graph alpha parameter -->
                    <div id="systemAlphaParams" class="form-group" style="display: none;">
                        <label for="systemAlpha">${i18next.t('transparency_level')}:</label>
                        <input type="number" id="systemAlpha" min="50" max="255" value="255">
                        <small>50 = highest transparency, 255 = no transparency</small>
                    </div>
                </div>
            </div>
        `
  }

  createAliasUI() {
    // Get available aliases from current profile
    const profile = app?.getCurrentProfile()
    const aliases = profile?.aliases || {}
    const aliasEntries = Object.entries(aliases)

    if (aliasEntries.length === 0) {
      return `
                <div class="alias-builder">
                    <div class="empty-state">
                        <i class="fas fa-mask"></i>
                        <h4>${i18next.t('no_aliases_available')}</h4>
                        <p>${i18next.t('create_aliases_in_the_alias_manager_first')}</p>
                        <button type="button" class="btn btn-primary" id="openAliasManager">
                            <i class="fas fa-plus"></i> ${i18next.t('create_alias')}
                        </button>
                    </div>
                </div>
            `
    }

    return `
            <div class="alias-builder">
                <div class="form-group">
                    <div class="form-check form-switch mb-3">
                        <input class="form-check-input" type="checkbox" id="aliasToggleMode" />
                        <label class="form-check-label" for="aliasToggleMode">
                            Toggle Mode
                            <i class="fas fa-question-circle ms-1" 
                               data-bs-toggle="tooltip" 
                               title="When enabled, the alias will automatically toggle between its on/off states">

                            </i>
                        </label>
                    </div>
                    

                    <label for="aliasSelect">${i18next.t('available_aliases')}:</label>
                    <select id="aliasSelect" class="form-select">
                        <option value="">${i18next.t('select_an_alias')}</option>

                        ${aliasEntries
                          .map(
                            ([name, alias]) =>
                              `<option value="${name}">${name}${alias.description ? ' - ' + alias.description : ''}</option>`
                          )
                          .join('')}
                    </select>
                </div>
                <div id="aliasPreviewSection" style="display: none;">
                    <div class="alias-info">
                        <label>${i18next.t('alias_commands')}:</label>
                        <div class="command-preview" id="selectedAliasPreview"></div>
                    </div>
                </div>
                <div id="toggleAliasInfo" class="alert alert-info mt-3" style="display: none;">
                    <i class="fas fa-info-circle me-2"></i>

                    ${i18next.t('this_alias_will_automatically_toggle_between_its_onoff_states_when_executed')}

                </div>
            </div>
        `
  }

  createCustomUI() {
    return `
            <div class="custom-builder">
                <div class="form-group">
                    <label for="customCommand">${i18next.t('command')}:</label>
                    <div class="input-with-button">
                        <input type="text" id="customCommand" placeholder="${i18next.t('enter_sto_command')}" autocomplete="off">
                        <button type="button" class="btn btn-small insert-target-btn" title="${i18next.t('insert_target_variable')}">
                            <i class="fas fa-crosshairs"></i> $Target
                        </button>
                    </div>
                    <small>${i18next.t('enter_the_exact_sto_command_syntax')}</small>
                </div>
                <div class="form-group">
                    <label for="customText">${i18next.t('display_text')}:</label>
                    <input type="text" id="customText" placeholder="${i18next.t('descriptive_name_for_this_command')}" autocomplete="off">
                </div>
                <div class="command-help">
                    <h4>${i18next.t('common_commands')}:</h4>
                    <div class="command-examples">
                        <button type="button" class="example-cmd" data-cmd="target_nearest_enemy">target_nearest_enemy</button>
                        <button type="button" class="example-cmd" data-cmd="FireAll">FireAll</button>
                        <button type="button" class="example-cmd" data-cmd="+power_exec Distribute_Shields">+power_exec Distribute_Shields</button>
                        <button type="button" class="example-cmd" data-cmd="+STOTrayExecByTray 0 0">+STOTrayExecByTray 0 0</button>
                        <button type="button" class="example-cmd" data-cmd='team Attacking [$Target]'>team Attacking [$Target]</button>
                    </div>
                </div>
                <div class="variable-help">
                    <h4><i class="fas fa-info-circle"></i> ${i18next.t('sto_variables')}</h4>
                    <div class="variable-info">
                        <strong>$Target</strong> - ${i18next.t('replaced_with_your_current_targets_name')}<br>
                        <em>${i18next.t('example')}:</em> <code>team Focus fire on [$Target]</code>
                    </div>
                </div>
            </div>
        `
  }

  // Event Listeners
  setupEventListeners() {
    // Command type change handler
    document.addEventListener('change', (e) => {
      if (e.target.id === 'commandType') {
        this.handleCommandTypeChange(e.target.value)
      }
    })

    // Tray visual updates
    document.addEventListener('change', (e) => {
      if (e.target.id === 'trayNumber' || e.target.id === 'slotNumber') {
        this.updateTrayVisual()
        this.updateCommandPreview()
      }
    })

    // Communication message updates
    document.addEventListener('input', (e) => {
      if (e.target.id === 'commMessage') {
        this.updateCommandPreview()
      }
    })

    // Custom command updates
    document.addEventListener('input', (e) => {
      if (e.target.id === 'customCommand' || e.target.id === 'customText') {
        this.updateCommandPreview()
      }
    })

    // Example command buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('example-cmd')) {
        const cmd = e.target.dataset.cmd
        const input = document.getElementById('customCommand')
        if (input) {
          input.value = cmd
          this.updateCommandPreview()
        }
      }
    })

    // Insert $Target variable buttons
    document.addEventListener('click', (e) => {
      if (
        e.target.classList.contains('insert-target-btn') ||
        e.target.closest('.insert-target-btn')
      ) {
        e.preventDefault()
        const button = e.target.classList.contains('insert-target-btn')
          ? e.target
          : e.target.closest('.insert-target-btn')
        const inputContainer = button.closest('.input-with-button')
        const input = inputContainer
          ? inputContainer.querySelector('input')
          : null

        if (input) {
          this.insertTargetVariable(input)
        }
      }
    })

    // Command selection changes
    document.addEventListener('change', (e) => {
      const commandSelectors = [
        'targetingCommand',
        'combatCommand',
        'powerCommand',
        'movementCommand',
        'cameraCommand',
        'systemCommand',
        'commCommand',
        'aliasSelect',
      ]

      if (commandSelectors.includes(e.target.id)) {
        this.updateCommandPreview()
      }
    })

    // Language change listener
    if (window.i18next) {
      window.i18next.on('languageChanged', () => {
        this.regenerateModalContent()
      })
    }
  }

  // Command Type Change Handler
  handleCommandTypeChange(type) {
    const builder = document.getElementById('commandBuilder')
    const preview = document.getElementById('modalCommandPreview')
    const saveBtn = document.getElementById('saveCommandBtn')

    if (!builder) return

    if (type && this.commandBuilders.has(type)) {
      const ui = this.commandBuilders.get(type).getUI()
      builder.innerHTML = ui

      // Setup specific event listeners for this type
      this.setupTypeSpecificListeners(type)

      // Enable save button
      if (saveBtn) saveBtn.disabled = false

      // Update preview
      this.updateCommandPreview()
    } else {
      builder.innerHTML =
        `<p class="text-muted">${i18next.t('select_a_command_type_to_see_preview')}</p>`
      if (preview) preview.textContent = i18next.t('select_a_command_type_to_see_preview')
      if (saveBtn) saveBtn.disabled = true
    }
  }

  setupTypeSpecificListeners(type) {
    if (type === 'tray') {
      this.updateTrayVisual()

      // Add listener for tray command type selection
      const trayCommandType = document.getElementById('trayCommandType')
      if (trayCommandType) {
        trayCommandType.addEventListener('change', () => {
          this.updateTrayConfigSections(trayCommandType.value)
          this.updateCommandPreview()
        })

        // Initialize with default selection
        this.updateTrayConfigSections(trayCommandType.value)
      }

      // Add listeners for all tray configuration inputs
      const inputs = [
        'trayNumber',
        'slotNumber',
        'backupTrayNumber',
        'backupSlotNumber',
        'activeState',
        'startTrayNumber',
        'startSlotNumber',
        'endTrayNumber',
        'endSlotNumber',
        'backupStartTrayNumber',
        'backupStartSlotNumber',
        'backupEndTrayNumber',
        'backupEndSlotNumber',
        'trayCommandVariant',
      ]

      inputs.forEach((inputId) => {
        const input = document.getElementById(inputId)
        if (input) {
          input.addEventListener('change', () => {
            this.updateTrayVisual()
            this.updateCommandPreview()
          })
        }
      })
    } else if (type === 'power') {
      // Add power command change listener for warnings
      const powerSelect = document.getElementById('powerCommand')
      if (powerSelect) {
        powerSelect.addEventListener('change', () => {
          this.showPowerWarning(powerSelect.value)
        })
      }
    } else if (type === 'combat') {
      // Add combat command change listener for warnings
      const combatSelect = document.getElementById('combatCommand')
      if (combatSelect) {
        combatSelect.addEventListener('change', () => {
          this.showCombatWarning(combatSelect.value)
          this.updateCombatParams(combatSelect.value)
          this.updateCommandPreview()
        })
      }

      // Add parameter change listeners for customizable combat commands
      const combatInputs = ['modifier1', 'modifier2']
      combatInputs.forEach((inputId) => {
        const input = document.getElementById(inputId)
        if (input) {
          input.addEventListener('change', () => {
            this.updateCommandPreview()
          })
          input.addEventListener('input', () => {
            this.updateCommandPreview()
          })
        }
      })
    } else if (type === 'cosmetic') {
      // Add cosmetic command change listener
      const cosmeticSelect = document.getElementById('cosmeticCommand')
      if (cosmeticSelect) {
        cosmeticSelect.addEventListener('change', () => {
          this.updateCosmeticParams(cosmeticSelect.value)
          this.updateCommandPreview()
        })
      }

      // Add parameter change listeners for customizable cosmetic commands
      const cosmeticInputs = ['modifier1', 'modifier2']
      cosmeticInputs.forEach((inputId) => {
        const input = document.getElementById(inputId)
        if (input) {
          input.addEventListener('change', () => {
            this.updateCommandPreview()
          })
          input.addEventListener('input', () => {
            this.updateCommandPreview()
          })
        }
      })
    } else if (type === 'bridge_officer') {
      // Add bridge officer command change listener
      const bridgeOfficerSelect = document.getElementById('bridgeOfficerCommand')
      if (bridgeOfficerSelect) {
        bridgeOfficerSelect.addEventListener('change', () => {
          this.updateBridgeOfficerParams(bridgeOfficerSelect.value)
          this.updateCommandPreview()
        })
      }

      // Add parameter change listeners for customizable bridge officer commands
      const bridgeOfficerInputs = ['assistName']
      bridgeOfficerInputs.forEach((inputId) => {
        const input = document.getElementById(inputId)
        if (input) {
          input.addEventListener('change', () => {
            this.updateCommandPreview()
          })
          input.addEventListener('input', () => {
            this.updateCommandPreview()
          })
        }
      })
    } else if (type === 'alias') {
      // Add alias selection listener
      const aliasSelect = document.getElementById('aliasSelect')
      if (aliasSelect) {
        aliasSelect.addEventListener('change', () => {
          this.updateAliasPreview(aliasSelect.value)
          this.updateCommandPreview()
        })
      }

      // Add toggle mode switch listener
      const toggleSwitch = document.getElementById('aliasToggleMode')
      if (toggleSwitch) {
        toggleSwitch.addEventListener('change', () => {
          const toggleInfo = document.getElementById('toggleAliasInfo')
          if (toggleInfo) {
            toggleInfo.style.display = toggleSwitch.checked ? 'block' : 'none'
          }
          this.updateCommandPreview()
        })
        
        // Initialize tooltips
        const tooltipTriggerList = [].slice.call(
          document.querySelectorAll('[data-bs-toggle="tooltip"]')
        )
        tooltipTriggerList.map(
          (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl)
        )
      }

      // Add create alias button listener
      const createBtn = document.getElementById('openAliasManager')
      if (createBtn) {
        createBtn.addEventListener('click', () => {
          if (
            typeof stoAliases !== 'undefined' &&
            stoAliases.showAliasManager
          ) {
            stoAliases.showAliasManager()
          } else {
            stoUI.hideModal('addCommandModal')
            stoUI.showModal('aliasManagerModal')
          }
        })
      }
    } else if (type === 'system') {
      // Add system command selection listener
      const systemSelect = document.getElementById('systemCommand')
      if (systemSelect) {
        systemSelect.addEventListener('change', () => {
          this.updateSystemParams(systemSelect.value)
          this.updateCommandPreview()
        })
      }

      // Add parameter change listeners
      const systemInputs = ['systemFilename', 'systemState', 'systemTooltipDelay']
      systemInputs.forEach((inputId) => {
        const input = document.getElementById(inputId)
        if (input) {
          input.addEventListener('change', () => {
            this.updateCommandPreview()
          })
          input.addEventListener('input', () => {
            this.updateCommandPreview()
          })
        }
      })
    }
  }

  // Update tray configuration sections based on selected command type
  updateTrayConfigSections(commandType) {
    const sections = {
      singleTrayConfig: document.getElementById('singleTrayConfig'),
      backupConfig: document.getElementById('backupConfig'),
      rangeConfig: document.getElementById('rangeConfig'),
      backupRangeConfig: document.getElementById('backupRangeConfig'),
      commandTypeConfig: document.getElementById('commandTypeConfig'),
    }

    // Hide all sections first
    Object.values(sections).forEach((section) => {
      if (section) section.style.display = 'none'
    })

    // Show relevant sections based on command type
    switch (commandType) {
      case 'custom_tray':
        if (sections.singleTrayConfig)
          sections.singleTrayConfig.style.display = 'block'
        if (sections.commandTypeConfig)
          sections.commandTypeConfig.style.display = 'block'
        break

      case 'tray_with_backup':
        if (sections.singleTrayConfig)
          sections.singleTrayConfig.style.display = 'block'
        if (sections.backupConfig) sections.backupConfig.style.display = 'block'
        break

      case 'tray_range':
        if (sections.rangeConfig) sections.rangeConfig.style.display = 'block'
        if (sections.commandTypeConfig)
          sections.commandTypeConfig.style.display = 'block'
        break

      case 'tray_range_with_backup':
        if (sections.rangeConfig) sections.rangeConfig.style.display = 'block'
        if (sections.backupRangeConfig)
          sections.backupRangeConfig.style.display = 'block'
        if (sections.backupConfig) sections.backupConfig.style.display = 'block'
        break

      case 'whole_tray':
        if (sections.singleTrayConfig)
          sections.singleTrayConfig.style.display = 'block'
        if (sections.commandTypeConfig)
          sections.commandTypeConfig.style.display = 'block'
        break

      case 'whole_tray_with_backup':
        if (sections.singleTrayConfig)
          sections.singleTrayConfig.style.display = 'block'
        if (sections.backupConfig) sections.backupConfig.style.display = 'block'
        break
    }
  }

  // Show warning for specific power commands
  showPowerWarning(commandId) {
    const warningDiv = document.getElementById('powerCommandWarning')
    const warningText = document.getElementById('powerWarningText')

    if (!warningDiv || !warningText) return

    if (commandId && STO_DATA.commands.power.commands[commandId]) {
      const command = STO_DATA.commands.power.commands[commandId]
      if (command.warning) {
        warningText.textContent = command.warning
        warningDiv.style.display = 'block'
        return
      }
    }

    // Hide warning if no warning for this command
    warningDiv.style.display = 'none'
  }

  // Show warning for specific combat commands
  showCombatWarning(commandId) {
    const warningDiv = document.getElementById('combatCommandWarning')
    const warningText = document.getElementById('combatWarningText')

    if (!warningDiv || !warningText) return

    if (commandId && STO_DATA.commands.combat.commands[commandId]) {
      const command = STO_DATA.commands.combat.commands[commandId]
      if (command.warning) {
        warningText.textContent = command.warning
        warningDiv.style.display = 'block'
        return
      }
    }

    // Hide warning if no warning for this command
    warningDiv.style.display = 'none'
  }

  updateAliasPreview(aliasName) {
    const previewSection = document.getElementById('aliasPreviewSection')
    const preview = document.getElementById('selectedAliasPreview')

    if (!previewSection || !preview) return

    if (aliasName) {
      const profile = app?.getCurrentProfile()
      const alias = profile?.aliases?.[aliasName]

      if (alias) {
        preview.textContent = alias.commands
        previewSection.style.display = 'block'
      } else {
        previewSection.style.display = 'none'
      }
    } else {
      previewSection.style.display = 'none'
    }
  }

  // Update command preview in modal
  updateCommandPreview() {
    const preview = document.getElementById('modalCommandPreview')
    if (!preview) {
      //console.log('DEBUG: modalCommandPreview element not found')
      return
    }

    const command = this.buildCurrentCommand()
    //console.log('DEBUG: buildCurrentCommand returned:', command)

    if (command) {
      // Handle both single commands and arrays of commands
      if (Array.isArray(command)) {
        //console.log('DEBUG: Command is array with length:', command.length)
        const commandStrings = command.map((cmd) => cmd.command)
        //console.log('DEBUG: Command strings:', commandStrings)
        preview.textContent = commandStrings.join(' $$ ')
      } else {
        //console.log('DEBUG: Command is single object:', command.command)
        preview.textContent = command.command
      }
      preview.className = 'command-preview valid'
    } else {
      console.log('DEBUG: No command returned, showing default message')
      preview.textContent = i18next.t('configure_command_options_to_see_preview')
      preview.className = 'command-preview'
    }
  }

  // Build command from current modal state
  buildCurrentCommand() {
    const typeSelect = document.getElementById('commandType')
    if (!typeSelect || !typeSelect.value) return null

    const type = typeSelect.value
    const builder = this.commandBuilders.get(type)
    if (!builder) return null

    let commandId = null
    let params = {}

    switch (type) {
      case 'targeting':
        commandId = document.getElementById('targetingCommand')?.value
        break

      case 'combat':
        commandId = document.getElementById('combatCommand')?.value
        // Handle customizable combat commands
        if (commandId === 'setactivecostume') {
          params = {
            modifier1: document.getElementById('modifier1')?.value || 'modifier1',
            modifier2: document.getElementById('modifier2')?.value || 'modifier2',
          }
        }
        break

      case 'cosmetic':
        commandId = document.getElementById('cosmeticCommand')?.value
        // Handle customizable cosmetic commands
        if (commandId === 'setactivecostume') {
          params = {
            modifier1: document.getElementById('modifier1')?.value || 'modifier1',
            modifier2: document.getElementById('modifier2')?.value || 'modifier2',
          }
        }
        break

      case 'tray':
        commandId =
          document.getElementById('trayCommandType')?.value || 'custom_tray'

        switch (commandId) {
          case 'custom_tray':
            params = {
              tray: parseInt(document.getElementById('trayNumber')?.value || 0),
              slot: parseInt(document.getElementById('slotNumber')?.value || 0),
              command_type:
                document.getElementById('trayCommandVariant')?.value ||
                'STOTrayExecByTray',
            }
            break

          case 'tray_with_backup':
            params = {
              tray: parseInt(document.getElementById('trayNumber')?.value || 0),
              slot: parseInt(document.getElementById('slotNumber')?.value || 0),
              backup_tray: parseInt(
                document.getElementById('backupTrayNumber')?.value || 0
              ),
              backup_slot: parseInt(
                document.getElementById('backupSlotNumber')?.value || 0
              ),
              active: parseInt(
                document.getElementById('activeState')?.value || 1
              ),
            }
            break

          case 'tray_range':
            params = {
              start_tray: parseInt(
                document.getElementById('startTrayNumber')?.value || 0
              ),
              start_slot: parseInt(
                document.getElementById('startSlotNumber')?.value || 0
              ),
              end_tray: parseInt(
                document.getElementById('endTrayNumber')?.value || 0
              ),
              end_slot: parseInt(
                document.getElementById('endSlotNumber')?.value || 0
              ),
              command_type:
                document.getElementById('trayCommandVariant')?.value ||
                'STOTrayExecByTray',
            }
            break

          case 'tray_range_with_backup':
            params = {
              active: parseInt(
                document.getElementById('activeState')?.value || 1
              ),
              start_tray: parseInt(
                document.getElementById('startTrayNumber')?.value || 0
              ),
              start_slot: parseInt(
                document.getElementById('startSlotNumber')?.value || 0
              ),
              end_tray: parseInt(
                document.getElementById('endTrayNumber')?.value || 0
              ),
              end_slot: parseInt(
                document.getElementById('endSlotNumber')?.value || 0
              ),
              backup_start_tray: parseInt(
                document.getElementById('backupStartTrayNumber')?.value || 0
              ),
              backup_start_slot: parseInt(
                document.getElementById('backupStartSlotNumber')?.value || 0
              ),
              backup_end_tray: parseInt(
                document.getElementById('backupEndTrayNumber')?.value || 0
              ),
              backup_end_slot: parseInt(
                document.getElementById('backupEndSlotNumber')?.value || 0
              ),
            }
            break

          case 'whole_tray':
            params = {
              tray: parseInt(document.getElementById('trayNumber')?.value || 0),
              command_type:
                document.getElementById('trayCommandVariant')?.value ||
                'STOTrayExecByTray',
            }
            break

          case 'whole_tray_with_backup':
            params = {
              active: parseInt(
                document.getElementById('activeState')?.value || 1
              ),
              tray: parseInt(document.getElementById('trayNumber')?.value || 0),
              backup_tray: parseInt(
                document.getElementById('backupTrayNumber')?.value || 0
              ),
            }
            break
        }
        break

      case 'power':
        commandId = document.getElementById('powerCommand')?.value
        break

      case 'movement':
        commandId = document.getElementById('movementCommand')?.value
        if (commandId === 'throttle_adjust') {
          params.amount = parseFloat(
            document.getElementById('movementAmount')?.value || 0.25
          )
        } else if (commandId === 'throttle_set') {
          params.position = parseFloat(
            document.getElementById('movementPosition')?.value || 1
          )
        }
        break

      case 'camera':
        commandId = document.getElementById('cameraCommand')?.value
        if (commandId === 'cam_distance') {
          params.distance = parseInt(
            document.getElementById('cameraDistance')?.value || 50
          )
        }
        break

      case 'communication':
        commandId = document.getElementById('commCommand')?.value
        params = {
          message:
            document.getElementById('commMessage')?.value ||
            'Message text here',
        }
        break

      case 'system':
        commandId = document.getElementById('systemCommand')?.value
        // File-based commands
        if (
          commandId === 'bind_save_file' ||
          commandId === 'bind_load_file' ||
          commandId === 'ui_load_file' ||
          commandId === 'ui_save_file'
        ) {
          params.filename =
            document.getElementById('systemFilename')?.value || 'my_binds.txt'
        }
        // State-based commands (0/1)
        else if (
          commandId === 'combat_log' ||
          commandId === 'chat_log' ||
          commandId === 'remember_ui_lists' ||
          commandId === 'ui_remember_positions' ||
          commandId === 'safe_login' ||
          commandId === 'net_timing_graph' ||
          commandId === 'net_timing_graph_paused' ||
          commandId === 'netgraph'
        ) {
          params.state = parseInt(
            document.getElementById('systemState')?.value || 1
          )
        }
        // Tooltip delay command
        else if (commandId === 'ui_tooltip_delay') {
          params.seconds = parseFloat(
            document.getElementById('systemTooltipDelay')?.value || 0.5
          )
        }
        // Net timing graph alpha command
        else if (commandId === 'net_timing_graph_alpha') {
          params.alpha = parseInt(
            document.getElementById('systemAlpha')?.value || 255
          )
        }
        break

      case 'alias':
        commandId = 'alias'
        params = {
          alias_name: document.getElementById('aliasSelect')?.value || '',
        }
        break

      case 'custom':
        commandId = 'custom'
        params = {
          command: document.getElementById('customCommand')?.value || '',
          text:
            document.getElementById('customText')?.value || 'Custom Command',
        }
        break

      case 'bridge_officer':
        commandId = document.getElementById('bridgeOfficerCommand')?.value
        // Handle customizable bridge officer commands
        if (commandId === 'assist') {
          params = {
            name: document.getElementById('assistName')?.value || '',
          }
        }
        break
    }

    if (!commandId && type !== 'custom') return null

    return builder.build(commandId, params)
  }

  // Update tray visual representation
  updateTrayVisual() {
    const visual = document.getElementById('trayVisual')
    const trayNum = document.getElementById('trayNumber')?.value || 0
    const slotNum = document.getElementById('slotNumber')?.value || 0

    if (!visual) return

    visual.innerHTML = `
            <div class="tray-grid">
                <div class="tray-label">Tray ${parseInt(trayNum) + 1}</div>
                <div class="slot-grid">
                    ${Array.from(
                      { length: 10 },
                      (_, i) => `
                        <div class="slot ${i == slotNum ? 'selected' : ''}" data-slot="${i}">
                            ${i + 1}
                        </div>
                    `
                    ).join('')}
                </div>
            </div>
        `

    // Add click handlers for slots
    visual.querySelectorAll('.slot').forEach((slot) => {
      slot.addEventListener('click', () => {
        const slotSelect = document.getElementById('slotNumber')
        if (slotSelect) {
          slotSelect.value = slot.dataset.slot
          this.updateTrayVisual()
          this.updateCommandPreview()
        }
      })
    })
  }

  // Helper method to generate tray range commands
  generateTrayRangeCommands(
    startTray,
    startSlot,
    endTray,
    endSlot,
    commandType
  ) {
    const commands = []
    const prefix = commandType === 'STOTrayExecByTray' ? '+' : ''

    // If same tray, iterate through slots
    if (startTray === endTray) {
      for (let slot = startSlot; slot <= endSlot; slot++) {
        commands.push(`${prefix}${commandType} ${startTray} ${slot}`)
      }
    } else {
      // Multi-tray range
      // First tray: from startSlot to end of tray (slot 9)
      for (let slot = startSlot; slot <= 9; slot++) {
        commands.push(`${prefix}${commandType} ${startTray} ${slot}`)
      }

      // Middle trays: all slots (0-9)
      for (let tray = startTray + 1; tray < endTray; tray++) {
        for (let slot = 0; slot <= 9; slot++) {
          commands.push(`${prefix}${commandType} ${tray} ${slot}`)
        }
      }

      // Last tray: from slot 0 to endSlot
      if (endTray > startTray) {
        for (let slot = 0; slot <= endSlot; slot++) {
          commands.push(`${prefix}${commandType} ${endTray} ${slot}`)
        }
      }
    }

    return commands
  }

  // Helper method to generate tray range with backup commands
  generateTrayRangeWithBackupCommands(
    active,
    startTray,
    startSlot,
    endTray,
    endSlot,
    backupStartTray,
    backupStartSlot,
    backupEndTray,
    backupEndSlot
  ) {
    const commands = []
    const primarySlots = this.generateTraySlotList(
      startTray,
      startSlot,
      endTray,
      endSlot
    )
    const backupSlots = this.generateTraySlotList(
      backupStartTray,
      backupStartSlot,
      backupEndTray,
      backupEndSlot
    )

    // Pair primary and backup slots
    for (
      let i = 0;
      i < Math.max(primarySlots.length, backupSlots.length);
      i++
    ) {
      const primary = primarySlots[i] || primarySlots[primarySlots.length - 1]
      const backup = backupSlots[i] || backupSlots[backupSlots.length - 1]

      commands.push(
        `TrayExecByTrayWithBackup ${active} ${primary.tray} ${primary.slot} ${backup.tray} ${backup.slot}`
      )
    }

    return commands
  }

  // Helper method to generate whole tray commands
  generateWholeTrayCommands(tray, commandType) {
    const commands = []
    const prefix = commandType === 'STOTrayExecByTray' ? '+' : ''

    for (let slot = 0; slot <= 9; slot++) {
      commands.push(`${prefix}${commandType} ${tray} ${slot}`)
    }

    return commands
  }

  // Helper method to generate whole tray with backup commands
  generateWholeTrayWithBackupCommands(active, tray, backupTray) {
    const commands = []

    for (let slot = 0; slot <= 9; slot++) {
      commands.push(
        `TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${slot}`
      )
    }

    return commands
  }

  // Helper method to generate list of tray slots from range
  generateTraySlotList(startTray, startSlot, endTray, endSlot) {
    const slots = []

    if (startTray === endTray) {
      for (let slot = startSlot; slot <= endSlot; slot++) {
        slots.push({ tray: startTray, slot })
      }
    } else {
      // First tray
      for (let slot = startSlot; slot <= 9; slot++) {
        slots.push({ tray: startTray, slot })
      }

      // Middle trays
      for (let tray = startTray + 1; tray < endTray; tray++) {
        for (let slot = 0; slot <= 9; slot++) {
          slots.push({ tray, slot })
        }
      }

      // Last tray
      if (endTray > startTray) {
        for (let slot = 0; slot <= endSlot; slot++) {
          slots.push({ tray: endTray, slot })
        }
      }
    }

    return slots
  }

  // Get current command for saving
  getCurrentCommand() {
    return this.buildCurrentCommand()
  }

  // Validate command
  validateCommand(command) {
    // Handle arrays of commands (for tray ranges)
    if (Array.isArray(command)) {
      // Validate each command in the array
      for (let i = 0; i < command.length; i++) {
        const validation = this.validateCommand(command[i])
        if (!validation.valid) {
          return {
            valid: false,
            error: `Command ${i + 1}: ${validation.error}`,
          }
        }
      }
      return { valid: true }
    }

    // Handle both string and object inputs
    let cmdString
    if (typeof command === 'string') {
      cmdString = command
    } else if (command && command.command) {
      cmdString = command.command
    } else {
      return { valid: false, error: 'No command provided' }
    }

    if (!cmdString || cmdString.trim().length === 0) {
      return { valid: false, error: 'Command cannot be empty' }
    }

    // Basic STO command validation
    const cmd = cmdString.trim()

    // Check for dangerous commands
    const dangerousCommands = ['quit', 'exit', 'shutdown']
    if (
      dangerousCommands.some((dangerous) =>
        cmd.toLowerCase().includes(dangerous)
      )
    ) {
      return { valid: false, error: 'Dangerous command not allowed' }
    }

    // Check for invalid characters that could break STO
    // Note: $$ is valid as it's the STO command separator for chaining commands
    // Note: | is invalid UNLESS it's inside quoted strings (for communication commands)
    if (this.hasUnquotedPipeCharacter(cmd)) {
      return { valid: false, error: 'Invalid characters in command (|)' }
    }

    return { valid: true }
  }

  // Helper method to check for pipe characters outside of quoted strings
  hasUnquotedPipeCharacter(cmd) {
    let inQuotes = false
    let quoteChar = null

    for (let i = 0; i < cmd.length; i++) {
      const char = cmd[i]

      if (!inQuotes && (char === '"' || char === "'")) {
        // Starting a quoted section
        inQuotes = true
        quoteChar = char
      } else if (inQuotes && char === quoteChar) {
        // Check if this quote is escaped
        let backslashCount = 0
        for (let j = i - 1; j >= 0 && cmd[j] === '\\'; j--) {
          backslashCount++
        }
        // If even number of backslashes (including 0), the quote is not escaped
        if (backslashCount % 2 === 0) {
          inQuotes = false
          quoteChar = null
        }
      } else if (!inQuotes && char === '|') {
        // Found unquoted pipe character
        return true
      }
    }

    return false
  }

  // Command templates
  getTemplateCommands(category) {
    if (!STO_DATA.templates) return []

    const templates = []

    // Search through all template scenarios for templates containing commands of the specified category
    Object.entries(STO_DATA.templates).forEach(([scenarioId, scenario]) => {
      Object.entries(scenario).forEach(([templateId, template]) => {
        // Check if this template contains commands of the specified category
        const hasCategory = template.commands.some((cmd) => {
          const cmdType = this.detectCommandType(cmd)
          return cmdType === category
        })

        if (hasCategory) {
          templates.push({
            id: `${scenarioId}_${templateId}`,
            name: template.name,
            description: template.description,
            scenario: scenarioId,
            commands: template.commands.map((cmd) => ({
              command: cmd,
              type: this.detectCommandType(cmd),
              icon: this.getCommandIcon(cmd),
              text: this.getCommandText(cmd),
            })),
          })
        }
      })
    })

    return templates
  }

  // Utility methods
  detectCommandType(command) {
    if (!command || typeof command !== 'string') return 'custom'

    const cmd = command.toLowerCase().trim()

    // Tray commands
    if (cmd.includes('+stotrayexecbytray')) return 'tray'

    // Communication commands
    if (
      cmd.startsWith('say ') ||
      cmd.startsWith('team ') ||
      cmd.startsWith('zone ') ||
      cmd.startsWith('tell ') ||
      cmd.includes('"')
    )
      return 'communication'

    // Shield management commands
    if (
      cmd.includes('+power_exec') ||
      cmd.includes('distribute_shields') ||
      cmd.includes('reroute_shields')
    )
      return 'power'

    // Movement commands
    if (
      cmd.includes('+fullimpulse') ||
      cmd.includes('+reverse') ||
      cmd.includes('throttle') ||
      cmd.includes('+turn') ||
      cmd.includes('+up') ||
      cmd.includes('+down') ||
      cmd.includes('+left') ||
      cmd.includes('+right') ||
      cmd.includes('+forward') ||
      cmd.includes('+backward') ||
      cmd.includes('follow')
    )
      return 'movement'

    // Camera commands
    if (cmd.includes('cam') || cmd.includes('look') || cmd.includes('zoom'))
      return 'camera'

    // Combat commands
    if (
      cmd.includes('fire') ||
      cmd.includes('attack') ||
      cmd === 'fireall' ||
      cmd === 'firephasers' ||
      cmd === 'firetorps' ||
      cmd === 'firephaserstorps'
    )
      return 'combat'

    // Targeting commands
    if (
      cmd.includes('target') ||
      cmd === 'target_enemy_near' ||
      cmd === 'target_self' ||
      cmd === 'target_friend_near' ||
      cmd === 'target_clear'
    )
      return 'targeting'

    // System commands
    if (
      cmd.includes('+gentoggle') ||
      cmd === 'screenshot' ||
      cmd.includes('hud') ||
      cmd === 'interactwindow'
    )
      return 'system'

    // Default to custom for unknown commands
    return 'custom'
  }

  getCommandIcon(command) {
    const type = this.detectCommandType(command)
    const iconMap = {
      targeting: '🎯',
      combat: '🔥',
      tray: '⚡',
      power: '🔋',
      communication: '💬',
      movement: '🚀',
      camera: '📹',
      system: '⚙️',
    }
    return iconMap[type] || '⚙️'
  }

  getCommandText(command) {
    // Handle tray commands specially
    if (command.includes('+STOTrayExecByTray')) {
      const match = command.match(/\+STOTrayExecByTray\s+(\d+)\s+(\d+)/)
      if (match) {
        const tray = parseInt(match[1]) + 1 // Convert to 1-based
        const slot = parseInt(match[2]) + 1 // Convert to 1-based
        return `Execute Tray ${tray} Slot ${slot}`
      }
    }

    // Try to find a friendly name for the command
    for (const [categoryId, category] of Object.entries(STO_DATA.commands)) {
      for (const [cmdId, cmd] of Object.entries(category.commands)) {
        if (cmd.command === command) {
          return cmd.name
        }
      }
    }

    // Generate a friendly name from the command
    return command
      .replace(/[_+]/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
  }

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
  }

  regenerateModalContent() {
    // Check if the add command modal is currently open
    const modal = document.getElementById('addCommandModal')
    if (!modal || modal.style.display === 'none') {
      return
    }

    // Get the current command type
    const commandTypeSelect = document.getElementById('commandType')
    if (!commandTypeSelect) {
      return
    }

    const currentType = commandTypeSelect.value
    
    // Regenerate the UI for the current command type
    if (currentType && this.commandBuilders.has(currentType)) {
      const builder = document.getElementById('commandBuilder')
      if (builder) {
        const ui = this.commandBuilders.get(currentType).getUI()
        builder.innerHTML = ui
        
        // Re-setup specific event listeners for this type
        this.setupTypeSpecificListeners(currentType)
        
        // Update the preview
        this.updateCommandPreview()
      }
    }
  }

  updateSystemParams(commandId) {
    const systemParams = document.getElementById('systemParams')
    const fileParams = document.getElementById('systemFileParams')
    const stateParams = document.getElementById('systemStateParams')
    const tooltipParams = document.getElementById('systemTooltipParams')
    const alphaParams = document.getElementById('systemAlphaParams')

    if (!systemParams) return

    // Hide all parameter sections first
    if (fileParams) fileParams.style.display = 'none'
    if (stateParams) stateParams.style.display = 'none'
    if (tooltipParams) tooltipParams.style.display = 'none'
    if (alphaParams) alphaParams.style.display = 'none'

    // Show relevant parameter section based on command
    if (commandId) {
      const cmd = STO_DATA.commands.system.commands[commandId]
      if (cmd && cmd.customizable) {
        systemParams.style.display = 'block'

        // File-based commands
        if (
          commandId === 'bind_save_file' ||
          commandId === 'bind_load_file' ||
          commandId === 'ui_load_file' ||
          commandId === 'ui_save_file'
        ) {
          if (fileParams) fileParams.style.display = 'block'
        }
        // State-based commands (0/1)
        else if (
          commandId === 'combat_log' ||
          commandId === 'chat_log' ||
          commandId === 'remember_ui_lists' ||
          commandId === 'ui_remember_positions' ||
          commandId === 'safe_login' ||
          commandId === 'net_timing_graph' ||
          commandId === 'net_timing_graph_paused' ||
          commandId === 'netgraph'
        ) {
          if (stateParams) stateParams.style.display = 'block'
        }
        // Tooltip delay command
        else if (commandId === 'ui_tooltip_delay') {
          if (tooltipParams) tooltipParams.style.display = 'block'
        }
        // Net timing graph alpha command
        else if (commandId === 'net_timing_graph_alpha') {
          if (alphaParams) alphaParams.style.display = 'block'
        }
      } else {
        systemParams.style.display = 'none'
      }
    } else {
      systemParams.style.display = 'none'
    }
  }

  updateCombatParams(commandId) {
    const combatParams = document.getElementById('combatParamsConfig')
    const setactivecostumeParams = document.getElementById('setactivecostumeParams')

    if (!combatParams) return

    // Hide all parameter sections first
    if (setactivecostumeParams) setactivecostumeParams.style.display = 'none'

    // Show relevant parameter section based on command
    if (commandId) {
      const cmd = STO_DATA.commands.combat.commands[commandId]
      if (cmd && cmd.customizable) {
        combatParams.style.display = 'block'

        // Setactivecostume parameters
        if (commandId === 'setactivecostume') {
          if (setactivecostumeParams) setactivecostumeParams.style.display = 'block'
        }
      } else {
        combatParams.style.display = 'none'
      }
    } else {
      combatParams.style.display = 'none'
    }
  }

  updateCosmeticParams(commandId) {
    const cosmeticParams = document.getElementById('cosmeticParamsConfig')
    const setactivecostumeParams = document.getElementById('setactivecostumeParams')

    if (!cosmeticParams) return

    // Hide all parameter sections first
    if (setactivecostumeParams) setactivecostumeParams.style.display = 'none'

    // Show relevant parameter section based on command
    if (commandId) {
      const cmd = STO_DATA.commands.cosmetic.commands[commandId]
      if (cmd && cmd.customizable) {
        cosmeticParams.style.display = 'block'

        // Setactivecostume parameters
        if (commandId === 'setactivecostume') {
          if (setactivecostumeParams) setactivecostumeParams.style.display = 'block'
        }
      } else {
        cosmeticParams.style.display = 'none'
      }
    } else {
      cosmeticParams.style.display = 'none'
    }
  }

  createBridgeOfficerUI() {
    const commands = STO_DATA.commands.bridge_officer.commands
    return `
      <div class="command-selector">
        <label for="bridgeOfficerCommand">${i18next.t('bridge_officer_command')}:</label>
        <select id="bridgeOfficerCommand">
          <option value="">${i18next.t('select_bridge_officer_command')}</option>
          ${Object.entries(commands)
            .map(
              ([id, cmd]) =>
                `<option value="${id}">${cmd.name}</option>`
            )
            .join('')}
        </select>
      </div>
      <div id="bridgeOfficerParamsConfig" class="params-config-section" style="display: none;">
        <h4>${i18next.t('parameter_configuration')}</h4>
        <div id="assistParams" class="param-group" style="display: none;">
          <div class="form-row">
            <div class="form-group">
              <label for="assistName">${i18next.t('entity_name_optional')}:</label>
              <input type="text" id="assistName" placeholder="${i18next.t('entity_name_optional_placeholder')}">
            </div>
          </div>
        </div>
      </div>
    `
  }

  updateBridgeOfficerParams(commandId) {
    const bridgeOfficerParams = document.getElementById('bridgeOfficerParamsConfig')
    const assistParams = document.getElementById('assistParams')

    if (!bridgeOfficerParams) return

    // Hide all parameter sections first
    if (assistParams) assistParams.style.display = 'none'

    // Show relevant parameter section based on command
    if (commandId) {
      const cmd = STO_DATA.commands.bridge_officer.commands[commandId]
      if (cmd && cmd.customizable) {
        bridgeOfficerParams.style.display = 'block'

        // Assist parameters
        if (commandId === 'assist') {
          if (assistParams) assistParams.style.display = 'block'
        }
      } else {
        bridgeOfficerParams.style.display = 'none'
      }
    } else {
      bridgeOfficerParams.style.display = 'none'
    }
  }
}

// Global command manager instance
