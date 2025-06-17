// STO Tools Keybind Manager - Command Management
// Handles command building, editing, and validation

class STOCommandManager {
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
                
                // Regular tray command
                return {
                    command: `+STOTrayExecByTray ${tray} ${slot}`,
                    type: 'tray',
                    icon: '⚡',
                    text: `Execute Tray ${tray + 1} Slot ${slot + 1}`,
                    description: `Execute ability in tray ${tray + 1}, slot ${slot + 1}`,
                    parameters: { tray, slot }
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
                    command: `${cmd.command} "${message}"`,
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
                    <input type="text" id="commMessage" placeholder="Enter your message" maxlength="100">
                    <small>Maximum 100 characters</small>
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

    createCustomUI() {
        return `
            <div class="custom-builder">
                <div class="form-group">
                    <label for="customCommand">Command:</label>
                    <input type="text" id="customCommand" placeholder="Enter STO command" autocomplete="off">
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

        // Command selection changes
        document.addEventListener('change', (e) => {
            const commandSelectors = [
                'targetingCommand', 'combatCommand', 'powerCommand', 
                'movementCommand', 'cameraCommand', 'systemCommand', 'commCommand'
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

    // Update command preview in modal
    updateCommandPreview() {
        const preview = document.getElementById('modalCommandPreview');
        if (!preview) return;
        
        const command = this.buildCurrentCommand();
        if (command) {
            preview.textContent = command.command;
            preview.className = 'command-preview valid';
        } else {
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
                commandId = 'custom_tray';
                params = {
                    tray: parseInt(document.getElementById('trayNumber')?.value || 0),
                    slot: parseInt(document.getElementById('slotNumber')?.value || 0)
                };
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

    // Get current command for saving
    getCurrentCommand() {
        return this.buildCurrentCommand();
    }

    // Validate command
    validateCommand(command) {
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
}

// Global command manager instance
window.stoCommands = new STOCommandManager(); 