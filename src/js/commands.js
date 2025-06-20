// STO Tools Keybind Manager - Command Management
// Handles command building, editing, and validation

export default class STOCommandManager {
    constructor() {
        this.currentCommand = null;
        this.commandBuilders = new Map();
        this.init();
    }

    init() {
        this.setupCommandBuilders();
        this.setupEventListeners();
    }

    // Command Builder Setup
    setupCommandBuilders() {
        // Targeting commands
        this.commandBuilders.set('targeting', {
            build: (commandId, params = {}) => {
                const cmd = STO_DATA.commands.targeting.commands[commandId];
                if (!cmd) return null;
                
                return {
                    command: cmd.command,
                    type: 'targeting',
                    icon: cmd.icon,
                    text: cmd.name,
                    description: cmd.description
                };
            },
            getUI: () => this.createTargetingUI()
        });

        // Combat commands
        this.commandBuilders.set('combat', {
            build: (commandId, params = {}) => {
                const cmd = STO_DATA.commands.combat.commands[commandId];
                if (!cmd) return null;
                
                return {
                    command: cmd.command,
                    type: 'combat',
                    icon: cmd.icon,
                    text: cmd.name,
                    description: cmd.description
                };
            },
            getUI: () => this.createCombatUI()
        });

        // Tray execution commands
        this.commandBuilders.set('tray', {
            build: (commandId, params = {}) => {
                const tray = params.tray || 0;
                const slot = params.slot || 0;
                
                // Handle backup tray commands
                if (commandId === 'tray_with_backup') {
                    const backupTray = params.backup_tray || 0;
                    const backupSlot = params.backup_slot || 0;
                    const active = params.active || 'on';
                    
                    return {
                        command: `TrayExecByTrayWithBackup ${tray} ${slot} ${backupTray} ${backupSlot} ${active === 'on' ? 1 : 0}`,
                        type: 'tray',
                        icon: '⚡',
                        text: `Execute Tray ${tray + 1} Slot ${slot + 1} (with backup)`,
                        description: `Execute ability in tray ${tray + 1}, slot ${slot + 1} with backup in tray ${backupTray + 1}, slot ${backupSlot + 1}`,
                        parameters: { tray, slot, backup_tray: backupTray, backup_slot: backupSlot, active }
                    };
                }
                
                // Handle tray range commands
                if (commandId === 'tray_range') {
                    const startTray = params.start_tray || 0;
                    const startSlot = params.start_slot || 0;
                    const endTray = params.end_tray || 0;
                    const endSlot = params.end_slot || 0;
                    const commandType = params.command_type || 'STOTrayExecByTray';
                    
                    const commands = this.generateTrayRangeCommands(startTray, startSlot, endTray, endSlot, commandType);
                    
                    // Return an array of individual command objects instead of a single command with $$
                    return commands.map((cmd, index) => ({
                        command: cmd,
                        type: 'tray',
                        icon: '⚡',
                        text: index === 0 ? `Execute Range: Tray ${startTray + 1} Slot ${startSlot + 1} to Tray ${endTray + 1} Slot ${endSlot + 1}` : cmd,
                        description: index === 0 ? `Execute abilities from tray ${startTray + 1} slot ${startSlot + 1} to tray ${endTray + 1} slot ${endSlot + 1}` : cmd,
                        parameters: index === 0 ? { start_tray: startTray, start_slot: startSlot, end_tray: endTray, end_slot: endSlot, command_type: commandType } : undefined
                    }));
                }
                
                // Handle tray range with backup commands
                if (commandId === 'tray_range_with_backup') {
                    const active = params.active || 1;
                    const startTray = params.start_tray || 0;
                    const startSlot = params.start_slot || 0;
                    const endTray = params.end_tray || 0;
                    const endSlot = params.end_slot || 0;
                    const backupStartTray = params.backup_start_tray || 0;
                    const backupStartSlot = params.backup_start_slot || 0;
                    const backupEndTray = params.backup_end_tray || 0;
                    const backupEndSlot = params.backup_end_slot || 0;
                    
                    const commands = this.generateTrayRangeWithBackupCommands(
                        active, startTray, startSlot, endTray, endSlot,
                        backupStartTray, backupStartSlot, backupEndTray, backupEndSlot
                    );
                    
                    // Return an array of individual command objects instead of a single command with $$
                    return commands.map((cmd, index) => ({
                        command: cmd,
                        type: 'tray',
                        icon: '⚡',
                        text: index === 0 ? `Execute Range with Backup: Tray ${startTray + 1}-${endTray + 1}` : cmd,
                        description: index === 0 ? `Execute abilities from tray ${startTray + 1} to ${endTray + 1} with backup range` : cmd,
                        parameters: index === 0 ? { 
                            active, start_tray: startTray, start_slot: startSlot, end_tray: endTray, end_slot: endSlot,
                            backup_start_tray: backupStartTray, backup_start_slot: backupStartSlot,
                            backup_end_tray: backupEndTray, backup_end_slot: backupEndSlot
                        } : undefined
                    }));
                }
                
                // Handle whole tray commands
                if (commandId === 'whole_tray') {
                    const commandType = params.command_type || 'STOTrayExecByTray';
                    const commands = this.generateWholeTrayCommands(tray, commandType);
                    
                    // Return an array of individual command objects instead of a single command with $$
                    return commands.map((cmd, index) => ({
                        command: cmd,
                        type: 'tray',
                        icon: '⚡',
                        text: index === 0 ? `Execute Whole Tray ${tray + 1}` : cmd,
                        description: index === 0 ? `Execute all abilities in tray ${tray + 1}` : cmd,
                        parameters: index === 0 ? { tray, command_type: commandType } : undefined
                    }));
                }
                
                // Handle whole tray with backup commands
                if (commandId === 'whole_tray_with_backup') {
                    const active = params.active || 1;
                    const backupTray = params.backup_tray || 0;
                    
                    const commands = this.generateWholeTrayWithBackupCommands(active, tray, backupTray);
                    
                    // Return an array of individual command objects instead of a single command with $$
                    return commands.map((cmd, index) => ({
                        command: cmd,
                        type: 'tray',
                        icon: '⚡',
                        text: index === 0 ? `Execute Whole Tray ${tray + 1} (with backup Tray ${backupTray + 1})` : cmd,
                        description: index === 0 ? `Execute all abilities in tray ${tray + 1} with backup from tray ${backupTray + 1}` : cmd,
                        parameters: index === 0 ? { active, tray, backup_tray: backupTray } : undefined
                    }));
                }
                
                // Regular tray command
                const commandType = params.command_type || 'STOTrayExecByTray';
                const prefix = '+';
                
                return {
                    command: `${prefix}${commandType} ${tray} ${slot}`,
                    type: 'tray',
                    icon: '⚡',
                    text: `Execute Tray ${tray + 1} Slot ${slot + 1}`,
                    description: `Execute ability in tray ${tray + 1}, slot ${slot + 1}`,
                    parameters: { tray, slot, command_type: commandType }
                };
            },
            getUI: () => this.createTrayUI()
        });

        // Shield management commands
        this.commandBuilders.set('power', {
            build: (commandId, params = {}) => {
                const cmd = STO_DATA.commands.power.commands[commandId];
                if (!cmd) return null;
                
                return {
                    command: cmd.command,
                    type: 'power',
                    icon: cmd.icon,
                    text: cmd.name,
                    description: cmd.description
                };
            },
            getUI: () => this.createPowerUI()
        });

        // Movement commands
        this.commandBuilders.set('movement', {
            build: (commandId, params = {}) => {
                const cmd = STO_DATA.commands.movement.commands[commandId];
                if (!cmd) return null;
                
                let command = cmd.command;
                
                // Handle parameterized movement commands
                if (cmd.customizable && params) {
                    if (commandId === 'throttle_adjust' && params.amount !== undefined) {
                        command = `${cmd.command} ${params.amount}`;
                    } else if (commandId === 'throttle_set' && params.position !== undefined) {
                        command = `${cmd.command} ${params.position}`;
                    }
                }
                
                return {
                    command: command,
                    type: 'movement',
                    icon: cmd.icon,
                    text: cmd.name,
                    description: cmd.description
                };
            },
            getUI: () => this.createMovementUI()
        });

        // Camera commands
        this.commandBuilders.set('camera', {
            build: (commandId, params = {}) => {
                const cmd = STO_DATA.commands.camera.commands[commandId];
                if (!cmd) return null;
                
                let command = cmd.command;
                
                // Handle parameterized camera commands
                if (cmd.customizable && params) {
                    if (commandId === 'cam_distance' && params.distance !== undefined) {
                        command = `${cmd.command} ${params.distance}`;
                    }
                }
                
                return {
                    command: command,
                    type: 'camera',
                    icon: cmd.icon,
                    text: cmd.name,
                    description: cmd.description
                };
            },
            getUI: () => this.createCameraUI()
        });

        // Communication commands
        this.commandBuilders.set('communication', {
            build: (commandId, params = {}) => {
                const cmd = STO_DATA.commands.communication.commands[commandId];
                if (!cmd) return null;
                
                const message = params.message || 'Message text here';
                
                return {
                    command: `${cmd.command} ${message}`,
                    type: 'communication',
                    icon: cmd.icon,
                    text: `${cmd.name}: ${message}`,
                    description: cmd.description,
                    parameters: { message }
                };
            },
            getUI: () => this.createCommunicationUI()
        });

        // System commands
        this.commandBuilders.set('system', {
            build: (commandId, params = {}) => {
                const cmd = STO_DATA.commands.system.commands[commandId];
                if (!cmd) return null;
                
                let command = cmd.command;
                
                // Handle parameterized system commands
                if (cmd.customizable && params) {
                    if ((commandId === 'bind_save_file' || commandId === 'bind_load_file') && params.filename) {
                        command = `${cmd.command} ${params.filename}`;
                    } else if (commandId === 'combat_log' && params.state !== undefined) {
                        command = `${cmd.command} ${params.state}`;
                    }
                }
                
                return {
                    command: command,
                    type: 'system',
                    icon: cmd.icon,
                    text: cmd.name,
                    description: cmd.description
                };
            },
            getUI: () => this.createSystemUI()
        });

        // Alias commands
        this.commandBuilders.set('alias', {
            build: (commandId, params = {}) => {
                const aliasName = params.alias_name || '';
                
                if (!aliasName.trim()) {
                    return null;
                }
                
                return {
                    command: aliasName,
                    type: 'alias',
                    icon: '📝',
                    text: `Alias: ${aliasName}`,
                    description: 'Execute custom alias',
                    parameters: { alias_name: aliasName }
                };
            },
            getUI: () => this.createAliasUI()
        });

        // Custom commands
        this.commandBuilders.set('custom', {
            build: (commandId, params = {}) => {
                const command = params.command || '';
                const text = params.text || 'Custom Command';
                
                return {
                    command: command,
                    type: 'custom',
                    icon: '⚙️',
                    text: text,
                    description: 'Custom command',
                    parameters: { command, text }
                };
            },
            getUI: () => this.createCustomUI()
        });
    }

    // UI Builders for different command types
    createTargetingUI() {
        const commands = STO_DATA.commands.targeting.commands;
        
        return `
            <div class="command-selector">
                <label for="targetingCommand">Targeting Command:</label>
                <select id="targetingCommand">
                    <option value="">Select targeting command...</option>
                    ${Object.entries(commands).map(([id, cmd]) => 
                        `<option value="${id}">${cmd.name}</option>`
                    ).join('')}
                </select>
            </div>
        `;
    }

    createCombatUI() {
        const commands = STO_DATA.commands.combat.commands;
        
        return `
            <div class="command-selector">
                <label for="combatCommand">Combat Command:</label>
                <select id="combatCommand">
                    <option value="">Select combat command...</option>
                    ${Object.entries(commands).map(([id, cmd]) => 
                        `<option value="${id}">${cmd.name}</option>`
                    ).join('')}
                </select>
                <div id="combatCommandWarning" class="command-warning" style="display: none;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span id="combatWarningText"></span>
                </div>
            </div>
        `;
    }

    createTrayUI() {
        return `
            <div class="tray-builder">
                <div class="form-group">
                    <label for="trayCommandType">Command Type:</label>
                    <select id="trayCommandType">
                        <option value="custom_tray">Single Tray Slot</option>
                        <option value="tray_with_backup">Single Tray with Backup</option>
                        <option value="tray_range">Tray Range</option>
                        <option value="tray_range_with_backup">Tray Range with Backup</option>
                        <option value="whole_tray">Whole Tray</option>
                        <option value="whole_tray_with_backup">Whole Tray with Backup</option>
                    </select>
                </div>
                
                <!-- Single Tray Configuration -->
                <div id="singleTrayConfig" class="tray-config-section">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="trayNumber">Tray Number:</label>
                            <select id="trayNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Tray ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="slotNumber">Slot Number:</label>
                            <select id="slotNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Slot ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Backup Configuration -->
                <div id="backupConfig" class="tray-config-section" style="display: none;">
                    <h4>Backup Configuration</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="backupTrayNumber">Backup Tray:</label>
                            <select id="backupTrayNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Tray ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="backupSlotNumber">Backup Slot:</label>
                            <select id="backupSlotNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Slot ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="activeState">Active State:</label>
                        <select id="activeState">
                            <option value="1">Active (1)</option>
                            <option value="0">Inactive (0)</option>
                        </select>
                    </div>
                </div>
                
                <!-- Range Configuration -->
                <div id="rangeConfig" class="tray-config-section" style="display: none;">
                    <h4>Range Configuration</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="startTrayNumber">Start Tray:</label>
                            <select id="startTrayNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Tray ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="startSlotNumber">Start Slot:</label>
                            <select id="startSlotNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Slot ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="endTrayNumber">End Tray:</label>
                            <select id="endTrayNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Tray ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="endSlotNumber">End Slot:</label>
                            <select id="endSlotNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Slot ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Backup Range Configuration -->
                <div id="backupRangeConfig" class="tray-config-section" style="display: none;">
                    <h4>Backup Range Configuration</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="backupStartTrayNumber">Backup Start Tray:</label>
                            <select id="backupStartTrayNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Tray ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="backupStartSlotNumber">Backup Start Slot:</label>
                            <select id="backupStartSlotNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Slot ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="backupEndTrayNumber">Backup End Tray:</label>
                            <select id="backupEndTrayNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Tray ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="backupEndSlotNumber">Backup End Slot:</label>
                            <select id="backupEndSlotNumber">
                                ${Array.from({length: 10}, (_, i) => 
                                    `<option value="${i}">Slot ${i + 1}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Command Type Selection -->
                <div id="commandTypeConfig" class="tray-config-section" style="display: none;">
                    <div class="form-group">
                        <label for="trayCommandVariant">Command Variant:</label>
                        <select id="trayCommandVariant">
                            <option value="STOTrayExecByTray">STOTrayExecByTray (shows key binding on UI)</option>
                            <option value="TrayExecByTray">TrayExecByTray (no UI indication)</option>
                        </select>
                    </div>
                </div>
                
                <div class="tray-visual" id="trayVisual">
                    <!-- Visual tray representation will be generated here -->
                </div>
            </div>
        `;
    }

    createPowerUI() {
        const commands = STO_DATA.commands.power.commands;
        
        return `
            <div class="command-selector">
                <label for="powerCommand">Shield Command:</label>
                <select id="powerCommand">
                    <option value="">Select shield command...</option>
                    ${Object.entries(commands).map(([id, cmd]) => 
                        `<option value="${id}">${cmd.name}</option>`
                    ).join('')}
                </select>
                <div id="powerCommandWarning" class="command-warning" style="display: none;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span id="powerWarningText"></span>
                </div>
            </div>
        `;
    }

    createMovementUI() {
        const commands = STO_DATA.commands.movement.commands;
        
        return `
            <div class="command-selector">
                <label for="movementCommand">Movement Command:</label>
                <select id="movementCommand">
                    <option value="">Select movement command...</option>
                    ${Object.entries(commands).map(([id, cmd]) => 
                        `<option value="${id}">${cmd.name}</option>`
                    ).join('')}
                </select>
                <div id="movementParams" style="display: none;">
                    <div class="form-group">
                        <label for="movementAmount">Amount (-1 to 1):</label>
                        <input type="number" id="movementAmount" min="-1" max="1" step="0.05" value="0.25">
                    </div>
                    <div class="form-group">
                        <label for="movementPosition">Position (-1 to 1):</label>
                        <input type="number" id="movementPosition" min="-1" max="1" step="0.1" value="1">
                    </div>
                </div>
            </div>
        `;
    }

    createCommunicationUI() {
        const commands = STO_DATA.commands.communication.commands;
        
        return `
            <div class="communication-builder">
                <div class="form-group">
                    <label for="commCommand">Communication Type:</label>
                    <select id="commCommand">
                        <option value="">Select communication type...</option>
                        ${Object.entries(commands).map(([id, cmd]) => 
                            `<option value="${id}">${cmd.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="commMessage">Message:</label>
                    <div class="input-with-button">
                        <input type="text" id="commMessage" placeholder="Enter your message" maxlength="100">
                        <button type="button" class="btn btn-small insert-target-btn" title="Insert $Target variable">
                            <i class="fas fa-crosshairs"></i> $Target
                        </button>
                    </div>
                    <small>Maximum 100 characters</small>
                </div>
                <div class="variable-help">
                    <h4><i class="fas fa-info-circle"></i> STO Variables</h4>
                    <div class="variable-info">
                        <strong>$Target</strong> - Replaced with your current target's name<br>
                        <em>Example:</em> <code>team Attacking [$Target]</code> → <code>team Attacking [Borg Cube]</code>
                    </div>
                </div>
            </div>
        `;
    }

    createCameraUI() {
        const commands = STO_DATA.commands.camera.commands;
        
        return `
            <div class="command-selector">
                <label for="cameraCommand">Camera Command:</label>
                <select id="cameraCommand">
                    <option value="">Select camera command...</option>
                    ${Object.entries(commands).map(([id, cmd]) => 
                        `<option value="${id}">${cmd.name}</option>`
                    ).join('')}
                </select>
                <div id="cameraParams" style="display: none;">
                    <div class="form-group">
                        <label for="cameraDistance">Distance:</label>
                        <input type="number" id="cameraDistance" min="1" max="500" value="50">
                    </div>
                </div>
            </div>
        `;
    }

    createSystemUI() {
        const commands = STO_DATA.commands.system.commands;
        
        return `
            <div class="command-selector">
                <label for="systemCommand">System Command:</label>
                <select id="systemCommand">
                    <option value="">Select system command...</option>
                    ${Object.entries(commands).map(([id, cmd]) => 
                        `<option value="${id}">${cmd.name}</option>`
                    ).join('')}
                </select>
                <div id="systemParams" style="display: none;">
                    <div class="form-group">
                        <label for="systemFilename">Filename:</label>
                        <input type="text" id="systemFilename" value="my_binds.txt">
                    </div>
                    <div class="form-group">
                        <label for="systemState">State (0/1):</label>
                        <input type="number" id="systemState" min="0" max="1" value="1">
                    </div>
                </div>
            </div>
        `;
    }

    createAliasUI() {
        // Get available aliases from current profile
        const profile = app?.getCurrentProfile();
        const aliases = profile?.aliases || {};
        const aliasEntries = Object.entries(aliases);
        
        if (aliasEntries.length === 0) {
            return `
                <div class="alias-builder">
                    <div class="empty-state">
                        <i class="fas fa-mask"></i>
                        <h4>No Aliases Available</h4>
                        <p>Create aliases in the Alias Manager first.</p>
                        <button type="button" class="btn btn-primary" id="openAliasManager">
                            <i class="fas fa-plus"></i> Create Alias
                        </button>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="alias-builder">
                <div class="form-group">
                    <label for="aliasSelect">Available Aliases:</label>
                    <select id="aliasSelect">
                        <option value="">Select an alias...</option>
                        ${aliasEntries.map(([name, alias]) => 
                            `<option value="${name}">${name}${alias.description ? ' - ' + alias.description : ''}</option>`
                        ).join('')}
                    </select>
                </div>
                <div id="aliasPreviewSection" style="display: none;">
                    <div class="alias-info">
                        <label>Alias Commands:</label>
                        <div class="command-preview" id="selectedAliasPreview"></div>
                    </div>
                </div>
            </div>
        `;
    }

    createCustomUI() {
        return `
            <div class="custom-builder">
                <div class="form-group">
                    <label for="customCommand">Command:</label>
                    <div class="input-with-button">
                        <input type="text" id="customCommand" placeholder="Enter STO command" autocomplete="off">
                        <button type="button" class="btn btn-small insert-target-btn" title="Insert $Target variable">
                            <i class="fas fa-crosshairs"></i> $Target
                        </button>
                    </div>
                    <small>Enter the exact STO command syntax</small>
                </div>
                <div class="form-group">
                    <label for="customText">Display Text:</label>
                    <input type="text" id="customText" placeholder="Descriptive name for this command" autocomplete="off">
                </div>
                <div class="command-help">
                    <h4>Common Commands:</h4>
                    <div class="command-examples">
                        <button type="button" class="example-cmd" data-cmd="target_nearest_enemy">target_nearest_enemy</button>
                        <button type="button" class="example-cmd" data-cmd="FireAll">FireAll</button>
                        <button type="button" class="example-cmd" data-cmd="+power_exec Distribute_Shields">+power_exec Distribute_Shields</button>
                        <button type="button" class="example-cmd" data-cmd="+STOTrayExecByTray 0 0">+STOTrayExecByTray 0 0</button>
                        <button type="button" class="example-cmd" data-cmd='team Attacking [$Target]'>team Attacking [$Target]</button>
                    </div>
                </div>
                <div class="variable-help">
                    <h4><i class="fas fa-info-circle"></i> STO Variables</h4>
                    <div class="variable-info">
                        <strong>$Target</strong> - Replaced with your current target's name<br>
                        <em>Example:</em> <code>team Focus fire on [$Target]</code>
                    </div>
                </div>
            </div>
        `;
    }

    // Event Listeners
    setupEventListeners() {
        // Command type change handler
        document.addEventListener('change', (e) => {
            if (e.target.id === 'commandType') {
                this.handleCommandTypeChange(e.target.value);
            }
        });

        // Tray visual updates
        document.addEventListener('change', (e) => {
            if (e.target.id === 'trayNumber' || e.target.id === 'slotNumber') {
                this.updateTrayVisual();
                this.updateCommandPreview();
            }
        });

        // Communication message updates
        document.addEventListener('input', (e) => {
            if (e.target.id === 'commMessage') {
                this.updateCommandPreview();
            }
        });

        // Custom command updates
        document.addEventListener('input', (e) => {
            if (e.target.id === 'customCommand' || e.target.id === 'customText') {
                this.updateCommandPreview();
            }
        });

        // Example command buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('example-cmd')) {
                const cmd = e.target.dataset.cmd;
                const input = document.getElementById('customCommand');
                if (input) {
                    input.value = cmd;
                    this.updateCommandPreview();
                }
            }
        });

        // Insert $Target variable buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('insert-target-btn') || e.target.closest('.insert-target-btn')) {
                e.preventDefault();
                const button = e.target.classList.contains('insert-target-btn') ? e.target : e.target.closest('.insert-target-btn');
                const inputContainer = button.closest('.input-with-button');
                const input = inputContainer ? inputContainer.querySelector('input') : null;
                
                if (input) {
                    this.insertTargetVariable(input);
                }
            }
        });

        // Command selection changes
        document.addEventListener('change', (e) => {
            const commandSelectors = [
                'targetingCommand', 'combatCommand', 'powerCommand', 
                'movementCommand', 'cameraCommand', 'systemCommand', 'commCommand', 'aliasSelect'
            ];
            
            if (commandSelectors.includes(e.target.id)) {
                this.updateCommandPreview();
            }
        });
    }

    // Command Type Change Handler
    handleCommandTypeChange(type) {
        const builder = document.getElementById('commandBuilder');
        const preview = document.getElementById('modalCommandPreview');
        const saveBtn = document.getElementById('saveCommandBtn');
        
        if (!builder) return;
        
        if (type && this.commandBuilders.has(type)) {
            const ui = this.commandBuilders.get(type).getUI();
            builder.innerHTML = ui;
            
            // Setup specific event listeners for this type
            this.setupTypeSpecificListeners(type);
            
            // Enable save button
            if (saveBtn) saveBtn.disabled = false;
            
            // Update preview
            this.updateCommandPreview();
        } else {
            builder.innerHTML = '<p class="text-muted">Select a command type to configure options.</p>';
            if (preview) preview.textContent = 'Select a command type to see preview';
            if (saveBtn) saveBtn.disabled = true;
        }
    }

    setupTypeSpecificListeners(type) {
        if (type === 'tray') {
            this.updateTrayVisual();
            
            // Add listener for tray command type selection
            const trayCommandType = document.getElementById('trayCommandType');
            if (trayCommandType) {
                trayCommandType.addEventListener('change', () => {
                    this.updateTrayConfigSections(trayCommandType.value);
                    this.updateCommandPreview();
                });
                
                // Initialize with default selection
                this.updateTrayConfigSections(trayCommandType.value);
            }
            
            // Add listeners for all tray configuration inputs
            const inputs = [
                'trayNumber', 'slotNumber', 'backupTrayNumber', 'backupSlotNumber', 'activeState',
                'startTrayNumber', 'startSlotNumber', 'endTrayNumber', 'endSlotNumber',
                'backupStartTrayNumber', 'backupStartSlotNumber', 'backupEndTrayNumber', 'backupEndSlotNumber',
                'trayCommandVariant'
            ];
            
            inputs.forEach(inputId => {
                const input = document.getElementById(inputId);
                if (input) {
                    input.addEventListener('change', () => {
                        this.updateTrayVisual();
                        this.updateCommandPreview();
                    });
                }
            });
        } else if (type === 'power') {
            // Add power command change listener for warnings
            const powerSelect = document.getElementById('powerCommand');
            if (powerSelect) {
                powerSelect.addEventListener('change', () => {
                    this.showPowerWarning(powerSelect.value);
                });
            }
        } else if (type === 'combat') {
            // Add combat command change listener for warnings
            const combatSelect = document.getElementById('combatCommand');
            if (combatSelect) {
                combatSelect.addEventListener('change', () => {
                    this.showCombatWarning(combatSelect.value);
                });
            }
        } else if (type === 'alias') {
            // Add alias selection listener
            const aliasSelect = document.getElementById('aliasSelect');
            if (aliasSelect) {
                aliasSelect.addEventListener('change', () => {
                    this.updateAliasPreview(aliasSelect.value);
                    this.updateCommandPreview();
                });
            }
            
            // Add create alias button listener
            const createBtn = document.getElementById('openAliasManager');
            if (createBtn) {
                createBtn.addEventListener('click', () => {
                    if (typeof stoAliases !== 'undefined' && stoAliases.showAliasManager) {
                        stoAliases.showAliasManager();
                    } else {
                        stoUI.hideModal('addCommandModal');
                        stoUI.showModal('aliasManagerModal');
                    }
                });
            }
        }
    }

    // Update tray configuration sections based on selected command type
    updateTrayConfigSections(commandType) {
        const sections = {
            singleTrayConfig: document.getElementById('singleTrayConfig'),
            backupConfig: document.getElementById('backupConfig'),
            rangeConfig: document.getElementById('rangeConfig'),
            backupRangeConfig: document.getElementById('backupRangeConfig'),
            commandTypeConfig: document.getElementById('commandTypeConfig')
        };
        
        // Hide all sections first
        Object.values(sections).forEach(section => {
            if (section) section.style.display = 'none';
        });
        
        // Show relevant sections based on command type
        switch (commandType) {
            case 'custom_tray':
                if (sections.singleTrayConfig) sections.singleTrayConfig.style.display = 'block';
                if (sections.commandTypeConfig) sections.commandTypeConfig.style.display = 'block';
                break;
                
            case 'tray_with_backup':
                if (sections.singleTrayConfig) sections.singleTrayConfig.style.display = 'block';
                if (sections.backupConfig) sections.backupConfig.style.display = 'block';
                break;
                
            case 'tray_range':
                if (sections.rangeConfig) sections.rangeConfig.style.display = 'block';
                if (sections.commandTypeConfig) sections.commandTypeConfig.style.display = 'block';
                break;
                
            case 'tray_range_with_backup':
                if (sections.rangeConfig) sections.rangeConfig.style.display = 'block';
                if (sections.backupRangeConfig) sections.backupRangeConfig.style.display = 'block';
                if (sections.backupConfig) sections.backupConfig.style.display = 'block';
                break;
                
            case 'whole_tray':
                if (sections.singleTrayConfig) sections.singleTrayConfig.style.display = 'block';
                if (sections.commandTypeConfig) sections.commandTypeConfig.style.display = 'block';
                break;
                
            case 'whole_tray_with_backup':
                if (sections.singleTrayConfig) sections.singleTrayConfig.style.display = 'block';
                if (sections.backupConfig) sections.backupConfig.style.display = 'block';
                break;
        }
    }

    // Show warning for specific power commands
    showPowerWarning(commandId) {
        const warningDiv = document.getElementById('powerCommandWarning');
        const warningText = document.getElementById('powerWarningText');
        
        if (!warningDiv || !warningText) return;
        
        if (commandId && STO_DATA.commands.power.commands[commandId]) {
            const command = STO_DATA.commands.power.commands[commandId];
            if (command.warning) {
                warningText.textContent = command.warning;
                warningDiv.style.display = 'block';
                return;
            }
        }
        
        // Hide warning if no warning for this command
        warningDiv.style.display = 'none';
    }

    // Show warning for specific combat commands
    showCombatWarning(commandId) {
        const warningDiv = document.getElementById('combatCommandWarning');
        const warningText = document.getElementById('combatWarningText');
        
        if (!warningDiv || !warningText) return;
        
        if (commandId && STO_DATA.commands.combat.commands[commandId]) {
            const command = STO_DATA.commands.combat.commands[commandId];
            if (command.warning) {
                warningText.textContent = command.warning;
                warningDiv.style.display = 'block';
                return;
            }
        }
        
        // Hide warning if no warning for this command
        warningDiv.style.display = 'none';
    }

    updateAliasPreview(aliasName) {
        const previewSection = document.getElementById('aliasPreviewSection');
        const preview = document.getElementById('selectedAliasPreview');
        
        if (!previewSection || !preview) return;
        
        if (aliasName) {
            const profile = app?.getCurrentProfile();
            const alias = profile?.aliases?.[aliasName];
            
            if (alias) {
                preview.textContent = alias.commands;
                previewSection.style.display = 'block';
            } else {
                previewSection.style.display = 'none';
            }
        } else {
            previewSection.style.display = 'none';
        }
    }

    // Update command preview in modal
    updateCommandPreview() {
        const preview = document.getElementById('modalCommandPreview');
        if (!preview) {
            console.log('DEBUG: modalCommandPreview element not found');
            return;
        }
        
        const command = this.buildCurrentCommand();
        console.log('DEBUG: buildCurrentCommand returned:', command);
        
        if (command) {
            // Handle both single commands and arrays of commands
            if (Array.isArray(command)) {
                console.log('DEBUG: Command is array with length:', command.length);
                const commandStrings = command.map(cmd => cmd.command);
                console.log('DEBUG: Command strings:', commandStrings);
                preview.textContent = commandStrings.join(' $$ ');
            } else {
                console.log('DEBUG: Command is single object:', command.command);
                preview.textContent = command.command;
            }
            preview.className = 'command-preview valid';
        } else {
            console.log('DEBUG: No command returned, showing default message');
            preview.textContent = 'Configure command options to see preview';
            preview.className = 'command-preview';
        }
    }

    // Build command from current modal state
    buildCurrentCommand() {
        const typeSelect = document.getElementById('commandType');
        if (!typeSelect || !typeSelect.value) return null;
        
        const type = typeSelect.value;
        const builder = this.commandBuilders.get(type);
        if (!builder) return null;
        
        let commandId = null;
        let params = {};
        
        switch (type) {
            case 'targeting':
                commandId = document.getElementById('targetingCommand')?.value;
                break;
                
            case 'combat':
                commandId = document.getElementById('combatCommand')?.value;
                break;
                
            case 'tray':
                commandId = document.getElementById('trayCommandType')?.value || 'custom_tray';
                
                switch (commandId) {
                    case 'custom_tray':
                        params = {
                            tray: parseInt(document.getElementById('trayNumber')?.value || 0),
                            slot: parseInt(document.getElementById('slotNumber')?.value || 0),
                            command_type: document.getElementById('trayCommandVariant')?.value || 'STOTrayExecByTray'
                        };
                        break;
                        
                    case 'tray_with_backup':
                        params = {
                            tray: parseInt(document.getElementById('trayNumber')?.value || 0),
                            slot: parseInt(document.getElementById('slotNumber')?.value || 0),
                            backup_tray: parseInt(document.getElementById('backupTrayNumber')?.value || 0),
                            backup_slot: parseInt(document.getElementById('backupSlotNumber')?.value || 0),
                            active: parseInt(document.getElementById('activeState')?.value || 1)
                        };
                        break;
                        
                    case 'tray_range':
                        params = {
                            start_tray: parseInt(document.getElementById('startTrayNumber')?.value || 0),
                            start_slot: parseInt(document.getElementById('startSlotNumber')?.value || 0),
                            end_tray: parseInt(document.getElementById('endTrayNumber')?.value || 0),
                            end_slot: parseInt(document.getElementById('endSlotNumber')?.value || 0),
                            command_type: document.getElementById('trayCommandVariant')?.value || 'STOTrayExecByTray'
                        };
                        break;
                        
                    case 'tray_range_with_backup':
                        params = {
                            active: parseInt(document.getElementById('activeState')?.value || 1),
                            start_tray: parseInt(document.getElementById('startTrayNumber')?.value || 0),
                            start_slot: parseInt(document.getElementById('startSlotNumber')?.value || 0),
                            end_tray: parseInt(document.getElementById('endTrayNumber')?.value || 0),
                            end_slot: parseInt(document.getElementById('endSlotNumber')?.value || 0),
                            backup_start_tray: parseInt(document.getElementById('backupStartTrayNumber')?.value || 0),
                            backup_start_slot: parseInt(document.getElementById('backupStartSlotNumber')?.value || 0),
                            backup_end_tray: parseInt(document.getElementById('backupEndTrayNumber')?.value || 0),
                            backup_end_slot: parseInt(document.getElementById('backupEndSlotNumber')?.value || 0)
                        };
                        break;
                        
                    case 'whole_tray':
                        params = {
                            tray: parseInt(document.getElementById('trayNumber')?.value || 0),
                            command_type: document.getElementById('trayCommandVariant')?.value || 'STOTrayExecByTray'
                        };
                        break;
                        
                    case 'whole_tray_with_backup':
                        params = {
                            active: parseInt(document.getElementById('activeState')?.value || 1),
                            tray: parseInt(document.getElementById('trayNumber')?.value || 0),
                            backup_tray: parseInt(document.getElementById('backupTrayNumber')?.value || 0)
                        };
                        break;
                }
                break;
                
            case 'power':
                commandId = document.getElementById('powerCommand')?.value;
                break;
                
            case 'movement':
                commandId = document.getElementById('movementCommand')?.value;
                if (commandId === 'throttle_adjust') {
                    params.amount = parseFloat(document.getElementById('movementAmount')?.value || 0.25);
                } else if (commandId === 'throttle_set') {
                    params.position = parseFloat(document.getElementById('movementPosition')?.value || 1);
                }
                break;
                
            case 'camera':
                commandId = document.getElementById('cameraCommand')?.value;
                if (commandId === 'cam_distance') {
                    params.distance = parseInt(document.getElementById('cameraDistance')?.value || 50);
                }
                break;
                
            case 'communication':
                commandId = document.getElementById('commCommand')?.value;
                params = {
                    message: document.getElementById('commMessage')?.value || 'Message text here'
                };
                break;
                
            case 'system':
                commandId = document.getElementById('systemCommand')?.value;
                if (commandId === 'bind_save_file' || commandId === 'bind_load_file') {
                    params.filename = document.getElementById('systemFilename')?.value || 'my_binds.txt';
                } else if (commandId === 'combat_log') {
                    params.state = parseInt(document.getElementById('systemState')?.value || 1);
                }
                break;
                
            case 'alias':
                commandId = 'alias';
                params = {
                    alias_name: document.getElementById('aliasSelect')?.value || ''
                };
                break;
                
            case 'custom':
                commandId = 'custom';
                params = {
                    command: document.getElementById('customCommand')?.value || '',
                    text: document.getElementById('customText')?.value || 'Custom Command'
                };
                break;
        }
        
        if (!commandId && type !== 'custom') return null;
        
        return builder.build(commandId, params);
    }

    // Update tray visual representation
    updateTrayVisual() {
        const visual = document.getElementById('trayVisual');
        const trayNum = document.getElementById('trayNumber')?.value || 0;
        const slotNum = document.getElementById('slotNumber')?.value || 0;
        
        if (!visual) return;
        
        visual.innerHTML = `
            <div class="tray-grid">
                <div class="tray-label">Tray ${parseInt(trayNum) + 1}</div>
                <div class="slot-grid">
                    ${Array.from({length: 10}, (_, i) => `
                        <div class="slot ${i == slotNum ? 'selected' : ''}" data-slot="${i}">
                            ${i + 1}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        // Add click handlers for slots
        visual.querySelectorAll('.slot').forEach(slot => {
            slot.addEventListener('click', () => {
                const slotSelect = document.getElementById('slotNumber');
                if (slotSelect) {
                    slotSelect.value = slot.dataset.slot;
                    this.updateTrayVisual();
                    this.updateCommandPreview();
                }
            });
        });
    }

    // Helper method to generate tray range commands
    generateTrayRangeCommands(startTray, startSlot, endTray, endSlot, commandType) {
        const commands = [];
        const prefix = commandType === 'STOTrayExecByTray' ? '+' : '';
        
        // If same tray, iterate through slots
        if (startTray === endTray) {
            for (let slot = startSlot; slot <= endSlot; slot++) {
                commands.push(`${prefix}${commandType} ${startTray} ${slot}`);
            }
        } else {
            // Multi-tray range
            // First tray: from startSlot to end of tray (slot 9)
            for (let slot = startSlot; slot <= 9; slot++) {
                commands.push(`${prefix}${commandType} ${startTray} ${slot}`);
            }
            
            // Middle trays: all slots (0-9)
            for (let tray = startTray + 1; tray < endTray; tray++) {
                for (let slot = 0; slot <= 9; slot++) {
                    commands.push(`${prefix}${commandType} ${tray} ${slot}`);
                }
            }
            
            // Last tray: from slot 0 to endSlot
            if (endTray > startTray) {
                for (let slot = 0; slot <= endSlot; slot++) {
                    commands.push(`${prefix}${commandType} ${endTray} ${slot}`);
                }
            }
        }
        
        return commands;
    }

    // Helper method to generate tray range with backup commands
    generateTrayRangeWithBackupCommands(active, startTray, startSlot, endTray, endSlot, backupStartTray, backupStartSlot, backupEndTray, backupEndSlot) {
        const commands = [];
        const primarySlots = this.generateTraySlotList(startTray, startSlot, endTray, endSlot);
        const backupSlots = this.generateTraySlotList(backupStartTray, backupStartSlot, backupEndTray, backupEndSlot);
        
        // Pair primary and backup slots
        for (let i = 0; i < Math.max(primarySlots.length, backupSlots.length); i++) {
            const primary = primarySlots[i] || primarySlots[primarySlots.length - 1];
            const backup = backupSlots[i] || backupSlots[backupSlots.length - 1];
            
            commands.push(`TrayExecByTrayWithBackup ${active} ${primary.tray} ${primary.slot} ${backup.tray} ${backup.slot}`);
        }
        
        return commands;
    }

    // Helper method to generate whole tray commands
    generateWholeTrayCommands(tray, commandType) {
        const commands = [];
        const prefix = commandType === 'STOTrayExecByTray' ? '+' : '';
        
        for (let slot = 0; slot <= 9; slot++) {
            commands.push(`${prefix}${commandType} ${tray} ${slot}`);
        }
        
        return commands;
    }

    // Helper method to generate whole tray with backup commands
    generateWholeTrayWithBackupCommands(active, tray, backupTray) {
        const commands = [];
        
        for (let slot = 0; slot <= 9; slot++) {
            commands.push(`TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${slot}`);
        }
        
        return commands;
    }

    // Helper method to generate list of tray slots from range
    generateTraySlotList(startTray, startSlot, endTray, endSlot) {
        const slots = [];
        
        if (startTray === endTray) {
            for (let slot = startSlot; slot <= endSlot; slot++) {
                slots.push({ tray: startTray, slot });
            }
        } else {
            // First tray
            for (let slot = startSlot; slot <= 9; slot++) {
                slots.push({ tray: startTray, slot });
            }
            
            // Middle trays
            for (let tray = startTray + 1; tray < endTray; tray++) {
                for (let slot = 0; slot <= 9; slot++) {
                    slots.push({ tray, slot });
                }
            }
            
            // Last tray
            if (endTray > startTray) {
                for (let slot = 0; slot <= endSlot; slot++) {
                    slots.push({ tray: endTray, slot });
                }
            }
        }
        
        return slots;
    }

    // Get current command for saving
    getCurrentCommand() {
        return this.buildCurrentCommand();
    }

    // Validate command
    validateCommand(command) {
        // Handle arrays of commands (for tray ranges)
        if (Array.isArray(command)) {
            // Validate each command in the array
            for (let i = 0; i < command.length; i++) {
                const validation = this.validateCommand(command[i]);
                if (!validation.valid) {
                    return { valid: false, error: `Command ${i + 1}: ${validation.error}` };
                }
            }
            return { valid: true };
        }
        
        // Handle both string and object inputs
        let cmdString;
        if (typeof command === 'string') {
            cmdString = command;
        } else if (command && command.command) {
            cmdString = command.command;
        } else {
            return { valid: false, error: 'No command provided' };
        }
        
        if (!cmdString || cmdString.trim().length === 0) {
            return { valid: false, error: 'Command cannot be empty' };
        }
        
        // Basic STO command validation
        const cmd = cmdString.trim();
        
        // Check for dangerous commands
        const dangerousCommands = ['quit', 'exit', 'shutdown'];
        if (dangerousCommands.some(dangerous => cmd.toLowerCase().includes(dangerous))) {
            return { valid: false, error: 'Dangerous command not allowed' };
        }
        
        // Check for invalid characters that could break STO
        // Note: $$ is valid as it's the STO command separator for chaining commands
        // Note: | is invalid UNLESS it's inside quoted strings (for communication commands)
        if (this.hasUnquotedPipeCharacter(cmd)) {
            return { valid: false, error: 'Invalid characters in command (|)' };
        }
        
        return { valid: true };
    }

    // Helper method to check for pipe characters outside of quoted strings
    hasUnquotedPipeCharacter(cmd) {
        let inQuotes = false;
        let quoteChar = null;
        
        for (let i = 0; i < cmd.length; i++) {
            const char = cmd[i];
            
            if (!inQuotes && (char === '"' || char === "'")) {
                // Starting a quoted section
                inQuotes = true;
                quoteChar = char;
            } else if (inQuotes && char === quoteChar) {
                // Check if this quote is escaped
                let backslashCount = 0;
                for (let j = i - 1; j >= 0 && cmd[j] === '\\'; j--) {
                    backslashCount++;
                }
                // If even number of backslashes (including 0), the quote is not escaped
                if (backslashCount % 2 === 0) {
                    inQuotes = false;
                    quoteChar = null;
                }
            } else if (!inQuotes && char === '|') {
                // Found unquoted pipe character
                return true;
            }
        }
        
        return false;
    }

    // Command templates
    getTemplateCommands(category) {
        if (!STO_DATA.templates) return [];
        
        const templates = [];
        
        // Search through all template scenarios for templates containing commands of the specified category
        Object.entries(STO_DATA.templates).forEach(([scenarioId, scenario]) => {
            Object.entries(scenario).forEach(([templateId, template]) => {
                // Check if this template contains commands of the specified category
                const hasCategory = template.commands.some(cmd => {
                    const cmdType = this.detectCommandType(cmd);
                    return cmdType === category;
                });
                
                if (hasCategory) {
                    templates.push({
                        id: `${scenarioId}_${templateId}`,
                        name: template.name,
                        description: template.description,
                        scenario: scenarioId,
                        commands: template.commands.map(cmd => ({
                            command: cmd,
                            type: this.detectCommandType(cmd),
                            icon: this.getCommandIcon(cmd),
                            text: this.getCommandText(cmd)
                        }))
                    });
                }
            });
        });
        
        return templates;
    }

    // Utility methods
    detectCommandType(command) {
        if (!command || typeof command !== 'string') return 'custom';
        
        const cmd = command.toLowerCase().trim();
        
        // Tray commands
        if (cmd.includes('+stotrayexecbytray')) return 'tray';
        
        // Communication commands
        if (cmd.startsWith('say ') || cmd.startsWith('team ') || cmd.startsWith('zone ') || 
            cmd.startsWith('tell ') || cmd.includes('"')) return 'communication';
        
        // Shield management commands
        if (cmd.includes('+power_exec') || cmd.includes('distribute_shields') || 
            cmd.includes('reroute_shields')) return 'power';
        
        // Movement commands
        if (cmd.includes('+fullimpulse') || cmd.includes('+reverse') || 
            cmd.includes('throttle') || cmd.includes('+turn') || cmd.includes('+up') || 
            cmd.includes('+down') || cmd.includes('+left') || cmd.includes('+right') ||
            cmd.includes('+forward') || cmd.includes('+backward') || cmd.includes('follow')) return 'movement';
        
        // Camera commands
        if (cmd.includes('cam') || cmd.includes('look') || cmd.includes('zoom')) return 'camera';
        
        // Combat commands
        if (cmd.includes('fire') || cmd.includes('attack') || cmd === 'fireall' ||
            cmd === 'firephasers' || cmd === 'firetorps' || cmd === 'firephaserstorps') return 'combat';
        
        // Targeting commands
        if (cmd.includes('target') || cmd === 'target_enemy_near' || cmd === 'target_self' ||
            cmd === 'target_friend_near' || cmd === 'target_clear') return 'targeting';
        
        // System commands
        if (cmd.includes('+gentoggle') || cmd === 'screenshot' || cmd.includes('hud') || 
            cmd === 'interactwindow') return 'system';
        
        // Default to custom for unknown commands
        return 'custom';
    }

    getCommandIcon(command) {
        const type = this.detectCommandType(command);
        const iconMap = {
            targeting: '🎯',
            combat: '🔥',
            tray: '⚡',
            power: '🔋',
            communication: '💬',
            movement: '🚀',
            camera: '📹',
            system: '⚙️'
        };
        return iconMap[type] || '⚙️';
    }

    getCommandText(command) {
        // Handle tray commands specially
        if (command.includes('+STOTrayExecByTray')) {
            const match = command.match(/\+STOTrayExecByTray\s+(\d+)\s+(\d+)/);
            if (match) {
                const tray = parseInt(match[1]) + 1; // Convert to 1-based
                const slot = parseInt(match[2]) + 1; // Convert to 1-based
                return `Execute Tray ${tray} Slot ${slot}`;
            }
        }
        
        // Try to find a friendly name for the command
        for (const [categoryId, category] of Object.entries(STO_DATA.commands)) {
            for (const [cmdId, cmd] of Object.entries(category.commands)) {
                if (cmd.command === command) {
                    return cmd.name;
                }
            }
        }
        
        // Generate a friendly name from the command
        return command.replace(/[_+]/g, ' ').replace(/([A-Z])/g, ' $1').trim();
    }

    insertTargetVariable(input) {
        const targetVar = '$Target';
        const cursorPosition = input.selectionStart;
        const value = input.value;
        const newValue = value.slice(0, cursorPosition) + targetVar + value.slice(cursorPosition);
        input.value = newValue;
        input.setSelectionRange(cursorPosition + targetVar.length, cursorPosition + targetVar.length);
        input.focus();
        
        // Trigger input event to update preview
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

// Global command manager instance
