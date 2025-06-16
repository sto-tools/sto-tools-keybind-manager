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

        // Power management commands
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
                
                return {
                    command: cmd.command,
                    type: 'movement',
                    icon: cmd.icon,
                    text: cmd.name,
                    description: cmd.description
                };
            },
            getUI: () => this.createMovementUI()
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
                
                return {
                    command: cmd.command,
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
                <label for="powerCommand">Power Command:</label>
                <select id="powerCommand">
                    <option value="">Select power command...</option>
                    ${Object.entries(commands).map(([id, cmd]) => 
                        `<option value="${id}">${cmd.name}</option>`
                    ).join('')}
                </select>
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
                'movementCommand', 'systemCommand', 'commCommand'
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
        }
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
                break;
                
            case 'communication':
                commandId = document.getElementById('commCommand')?.value;
                params = {
                    message: document.getElementById('commMessage')?.value || 'Message text here'
                };
                break;
                
            case 'system':
                commandId = document.getElementById('systemCommand')?.value;
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
        if (cmd.includes('$$') || cmd.includes('|')) {
            return { valid: false, error: 'Invalid characters in command ($$, |)' };
        }
        
        return { valid: true };
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
        
        // Power management commands
        if (cmd.includes('+power_exec') || cmd.includes('distribute_shields') || 
            cmd.includes('emergency_power') || cmd.includes('tactical_team') ||
            cmd.includes('engineering_team') || cmd.includes('science_team')) return 'power';
        
        // Movement commands
        if (cmd.includes('+fullimpulse') || cmd.includes('+reverse') || 
            cmd.includes('evasive_maneuvers')) return 'movement';
        
        // Combat commands
        if (cmd.includes('fire') || cmd.includes('attack') || cmd === 'fireall' ||
            cmd === 'firephasers' || cmd === 'firetorps' || cmd === 'firephaserstorps') return 'combat';
        
        // Targeting commands
        if (cmd.includes('target') || cmd === 'target_enemy_near' || cmd === 'target_self' ||
            cmd === 'target_friend_near' || cmd === 'target_clear') return 'targeting';
        
        // System commands
        if (cmd.includes('+gentoggle') || cmd === 'screenshot' || cmd.includes('hud')) return 'system';
        
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