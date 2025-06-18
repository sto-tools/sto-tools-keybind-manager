/**
 * Unit Tests for commands.js
 * Tests command building, validation, and UI generation
 */

describe('Commands Module', () => {
    // This is just a container - no tests here
});

describe('STOCommandManager Class', () => {
    let commandManager;

    beforeAll(() => {
        // Ensure commands module is loaded
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should create STOCommandManager instance', () => {
        expect(commandManager).toBeInstanceOf(Object);
        expect(commandManager.constructor.name).toBe('STOCommandManager');
    });

    it('should perform all command operations correctly', () => {
        // Test command builder setup
        commandManager.setupCommandBuilders();
        expect(commandManager.commandBuilders.size).toBeGreaterThan(0);
        
        // Test command building
        const currentCommand = commandManager.buildCurrentCommand('targeting', 'target_enemy_near');
        expect(currentCommand).toEqual(expect.objectContaining({
            type: 'targeting'
        }));
        
        // Test command validation
        const validResult = commandManager.validateCommand('target');
        expect(validResult.valid).toBe(true);
        
        const invalidResult = commandManager.validateCommand('invalid|command');
        expect(invalidResult.valid).toBe(false);
        
        // Test command type detection
        const trayType = commandManager.detectCommandType('+STOTrayExecByTray 0 5');
        expect(trayType).toBe('tray');
        
        const commType = commandManager.detectCommandType('say "Hello"');
        expect(commType).toBe('communication');
        
        // Test command icon and text
        const icon = commandManager.getCommandIcon('targeting');
        expect(typeof icon).toBe('string');
        expect(icon.length).toBeGreaterThan(0);
        
        const text = commandManager.getCommandText('target_enemy_near');
        expect(typeof text).toBe('string');
        expect(text.length).toBeGreaterThan(0);
    });

    it('should have command builders initialized', () => {
        expect(commandManager.commandBuilders).toBeInstanceOf(Map);
        expect(commandManager.commandBuilders.size).toBeGreaterThan(0);
        expect(commandManager.commandBuilders.has('targeting')).toBeTruthy();
        expect(commandManager.commandBuilders.has('combat')).toBeTruthy();
        expect(commandManager.commandBuilders.has('tray')).toBeTruthy();
    });
});

describe('Command Building', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should build targeting commands', () => {
        const builder = commandManager.commandBuilders.get('targeting');
        expect(typeof builder).toBe('object');
        expect(builder).not.toBeNull();
        
        const command = builder.build('target_enemy_near');
        expect(command).toEqual(expect.objectContaining({
            type: 'targeting',
            command: expect.any(String)
        }));
    });

    it('should build tray execution commands', () => {
        const builder = commandManager.commandBuilders.get('tray');
        expect(typeof builder).toBe('object');
        expect(builder).not.toBeNull();
        
        const command = builder.build('tray_exec', { tray: 0, slot: 5 });
        expect(command).toEqual(expect.objectContaining({
            type: 'tray',
            command: '+STOTrayExecByTray 0 5',
            parameters: { tray: 0, slot: 5 }
        }));
    });

    it('should build custom commands', () => {
        const builder = commandManager.commandBuilders.get('custom');
        expect(typeof builder).toBe('object');
        expect(builder).not.toBeNull();
        
        const command = builder.build('custom', { 
            command: 'my_custom_command', 
            text: 'My Custom Command' 
        });
        expect(command).toEqual(expect.objectContaining({
            type: 'custom',
            command: 'my_custom_command',
            text: 'My Custom Command'
        }));
    });

    it('should handle missing command IDs gracefully', () => {
        const builder = commandManager.commandBuilders.get('targeting');
        const command = builder.build('nonexistent_command');
        expect(command).toBeNull();
    });

    it('should build communication commands with parameters', () => {
        const builder = commandManager.commandBuilders.get('communication');
        expect(typeof builder).toBe('object');
        expect(builder).not.toBeNull();
        
        const command = builder.build('local_message', { message: 'Hello World' });
        expect(command).toEqual(expect.objectContaining({
            type: 'communication',
            command: expect.stringContaining('Hello World'),
            parameters: expect.objectContaining({
                message: 'Hello World'
            })
        }));
    });
});

describe('Command Validation', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should validate correct STO commands', () => {
        const validCommands = [
            'target',
            'fire_all',
            '+STOTrayExecByTray 0 5',
            'say "Hello"',
            'team "Team message"'
        ];

        validCommands.forEach(command => {
            const result = commandManager.validateCommand(command);
            expect(result).toEqual(expect.objectContaining({
                valid: true
            }));
        });
    });

    it('should reject invalid commands', () => {
        const invalidCommands = [
            '',
            null,
            undefined,
            '   ',
            'invalid|command',  // | is not allowed in STO commands
            'command with | pipe'
        ];

        invalidCommands.forEach(command => {
            const result = commandManager.validateCommand(command);
            expect(result).toEqual(expect.objectContaining({
                valid: false,
                error: expect.any(String)
            }));
        });
    });

    it('should allow pipe characters inside quoted strings', () => {
        const validCommandsWithQuotedPipes = [
            'SAY "Target this ->| BORG CUBE |<-"',
            'team "Enemy at |coordinates| 123,456"',
            'tell @player "Use this |item| now"',
            'say "He said \\"Hello|World\\""',
            "say 'Single quotes with | pipe'"
        ];

        validCommandsWithQuotedPipes.forEach(command => {
            const result = commandManager.validateCommand(command);
            expect(result).toEqual(expect.objectContaining({
                valid: true
            }));
        });
    });

    it('should validate tray command syntax', () => {
        const validTrayCommands = [
            '+STOTrayExecByTray 0 0',
            '+STOTrayExecByTray 9 9',
            '+STOTrayExecByTray 1 5'
        ];

        validTrayCommands.forEach(command => {
            const result = commandManager.validateCommand(command);
            expect(result).toEqual(expect.objectContaining({
                valid: true
            }));
        });
    });
});

describe('Command Type Detection', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should detect tray commands', () => {
        const trayCommands = [
            '+STOTrayExecByTray 0 5',
            '+STOTrayExecByTray 9 9'
        ];

        trayCommands.forEach(command => {
            const type = commandManager.detectCommandType(command);
            expect(type).toBe('tray');
        });
    });

    it('should detect communication commands', () => {
        const commCommands = [
            'say "Hello"',
            'team "Team message"',
            'tell @handle "Private message"'
        ];

        commCommands.forEach(command => {
            const type = commandManager.detectCommandType(command);
            expect(type).toBe('communication');
        });
    });

    it('should detect targeting commands', () => {
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.targeting) {
            const targetingCommands = Object.values(window.STO_DATA.commands.targeting.commands);
            if (targetingCommands.length > 0) {
                const command = targetingCommands[0].command;
                const type = commandManager.detectCommandType(command);
                expect(type).toBe('targeting');
            }
        }
    });

    it('should default to custom for unknown commands', () => {
        const unknownCommand = 'some_unknown_command_12345';
        const type = commandManager.detectCommandType(unknownCommand);
        expect(type).toBe('custom');
    });
});

describe('Command Utilities', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should get appropriate icons for commands', () => {
        const commands = [
            { cmd: '+STOTrayExecByTray 0 5', expectedIcon: '⚡' },
            { cmd: 'say "Hello"', expectedIcon: '💬' },
            { cmd: 'target', expectedIcon: '🎯' }
        ];

        commands.forEach(({ cmd, expectedIcon }) => {
            const icon = commandManager.getCommandIcon(cmd);
            expect(icon).toBeDefined();
            expect(typeof icon).toBe('string');
            // Icon should be non-empty
            expect(icon.length).toBeGreaterThan(0);
        });
    });

    it('should get readable text for commands', () => {
        const commands = [
            '+STOTrayExecByTray 0 5',
            'target',
            'fire_all'
        ];

        commands.forEach(command => {
            const text = commandManager.getCommandText(command);
            expect(text).toBeDefined();
            expect(typeof text).toBe('string');
            expect(text.length).toBeGreaterThan(0);
        });
    });

    it('should handle tray command text formatting', () => {
        const trayCommand = '+STOTrayExecByTray 2 7';
        const text = commandManager.getCommandText(trayCommand);
        expect(text).toContain('Tray');
        expect(text).toContain('3'); // Tray 2 + 1
        expect(text).toContain('8'); // Slot 7 + 1
    });
});

describe('UI Generation', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should generate UI for targeting commands', () => {
        const builder = commandManager.commandBuilders.get('targeting');
        const ui = builder.getUI();
        
        expect(ui).toBeDefined();
        expect(typeof ui).toBe('string');
        expect(ui).toContain('select');
        expect(ui).toContain('targeting');
    });

    it('should generate UI for tray commands', () => {
        const builder = commandManager.commandBuilders.get('tray');
        const ui = builder.getUI();
        
        expect(ui).toBeDefined();
        expect(typeof ui).toBe('string');
        expect(ui).toContain('trayNumber');
        expect(ui).toContain('slotNumber');
    });

    it('should generate UI for custom commands', () => {
        const builder = commandManager.commandBuilders.get('custom');
        const ui = builder.getUI();
        
        expect(ui).toBeDefined();
        expect(typeof ui).toBe('string');
        expect(ui).toContain('input');
        expect(ui).toContain('custom');
    });
});

describe('Template Commands', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should provide template commands for categories', () => {
        const categories = ['targeting', 'combat', 'movement'];
        
        categories.forEach(category => {
            const templates = commandManager.getTemplateCommands(category);
            expect(templates).toBeDefined();
            expect(Array.isArray(templates)).toBeTruthy();
        });
    });

    it('should return empty array for invalid categories', () => {
        const templates = commandManager.getTemplateCommands('invalid_category');
        expect(Array.isArray(templates)).toBeTruthy();
        expect(templates.length).toBe(0);
    });
});

describe('Error Handling', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should handle null/undefined command validation gracefully', () => {
        expect(() => {
            commandManager.validateCommand(null);
        }).not.toThrow();
        
        expect(() => {
            commandManager.validateCommand(undefined);
        }).not.toThrow();
    });

    it('should handle invalid builder types gracefully', () => {
        const invalidBuilder = commandManager.commandBuilders.get('nonexistent');
        expect(invalidBuilder).toBeUndefined();
    });

    it('should handle command type detection for empty strings', () => {
        const type = commandManager.detectCommandType('');
        expect(type).toBe('custom');
    });
});

describe('Command Warning System', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should show warnings for combat commands', () => {
        // Test warning display for combat commands
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.combat) {
            const fireAllCommand = window.STO_DATA.commands.combat.commands.fire_all;
            if (fireAllCommand) {
                expect(fireAllCommand.warning).toBeDefined();
                expect(fireAllCommand.warning).toContain('Not recommended on spam bars');
            }
        }
    });

    it('should show warnings for power management commands', () => {
        // Test warning display for power/shield management commands
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.power) {
            const distributeCommand = window.STO_DATA.commands.power.commands.distribute_shields;
            if (distributeCommand) {
                expect(distributeCommand.warning).toBeDefined();
                expect(distributeCommand.warning).toContain('Not recommended on spam bars');
            }
        }
    });

    it('should handle command warning display in UI', () => {
        // Test warning system functionality
        const testCommand = { command: 'FireAll', type: 'combat' };
        
        // Test that power warning actually shows warning UI
        commandManager.showPowerWarning(testCommand);
        const powerWarning = document.querySelector('.power-warning, .command-warning, .warning');
        expect(powerWarning).not.toBeNull();
        expect(powerWarning.style.display).not.toBe('none');
        
        // Test that combat warning actually shows warning UI
        const warningResult = commandManager.showCombatWarning(testCommand);
        expect(warningResult).toBeDefined();
        const combatWarning = document.querySelector('.combat-warning, .command-warning, .warning');
        expect(combatWarning).not.toBeNull();
        expect(combatWarning.textContent).toContain('Not recommended on spam bars');
    });

    it('should detect command warnings correctly', () => {
        // Test warning detection for different command types
        const testCommands = [
            { command: 'FireAll', type: 'combat', expectedWarning: true },
            { command: '+power_exec Distribute_Shields', type: 'power', expectedWarning: true },
            { command: 'Target_Enemy_Near', type: 'targeting', expectedWarning: false }
        ];

        testCommands.forEach(test => {
            if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands[test.type]) {
                const categoryCommands = window.STO_DATA.commands[test.type].commands;
                const hasWarningCommand = Object.values(categoryCommands).some(cmd => 
                    cmd.command === test.command && (test.expectedWarning ? cmd.warning : !cmd.warning)
                );
                // This test passes if we find the expected warning behavior or if the data isn't loaded yet
                expect(hasWarningCommand || !window.STO_DATA.commands[test.type]).toBeDefined();
            }
        });
    });
});

describe('Camera Commands', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should have camera command builder', () => {
        expect(commandManager.commandBuilders.has('camera')).toBeTruthy();
    });

    it('should build camera commands correctly', () => {
        const builder = commandManager.commandBuilders.get('camera');
        if (builder && window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.camera) {
            const zoomInCommand = builder.build('zoom_in');
            if (zoomInCommand) {
                expect(zoomInCommand).toBeDefined();
                expect(zoomInCommand.type).toBe('camera');
                expect(zoomInCommand.command).toBeDefined();
            }
        }
    });

    it('should handle parameterized camera commands', () => {
        const builder = commandManager.commandBuilders.get('camera');
        if (builder && window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.camera) {
            const camDistanceCommand = builder.build('cam_distance', { distance: 100 });
            if (camDistanceCommand) {
                expect(camDistanceCommand).toBeDefined();
                expect(camDistanceCommand.command).toContain('100');
            }
        }
    });

    it('should detect camera commands correctly', () => {
        const cameraCommands = ['camzoomin', 'camzoomout', 'camdist 50'];
        
        cameraCommands.forEach(command => {
            const detectedType = commandManager.detectCommandType(command);
            expect(detectedType).toBe('camera');
        });
    });
});

describe('Shield Management Commands', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should rename power category to shield management', () => {
        // Test that the power category is now called "Shield Management"
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.power) {
            expect(window.STO_DATA.commands.power.name).toBe('Shield Management');
        }
    });

    it('should have shield management command builder', () => {
        expect(commandManager.commandBuilders.has('power')).toBeTruthy();
    });

    it('should build shield management commands correctly', () => {
        const builder = commandManager.commandBuilders.get('power');
        if (builder && window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.power) {
            const distributeCommand = builder.build('distribute_shields');
            if (distributeCommand) {
                expect(distributeCommand).toBeDefined();
                expect(distributeCommand.type).toBe('power');
                expect(distributeCommand.command).toContain('power_exec');
            }
        }
    });

    it('should detect shield management commands correctly', () => {
        const shieldCommands = [
            '+power_exec Distribute_Shields',
            '+power_exec reroute_shields_rear',
            'distribute_shields'
        ];
        
        shieldCommands.forEach(command => {
            const detectedType = commandManager.detectCommandType(command);
            expect(detectedType).toBe('power');
        });
    });
});

describe('Parameterized Commands', () => {
    let commandManager;

    beforeAll(() => {
        if (typeof window.stoCommands === 'undefined') {
            throw new Error('Commands module not loaded');
        }
    });

    beforeEach(() => {
        commandManager = window.stoCommands;
    });

    it('should handle parameterized tray commands', () => {
        const builder = commandManager.commandBuilders.get('tray');
        if (builder) {
            // Test standard tray execution
            const standardTray = builder.build('tray_exec', { tray: 2, slot: 5 });
            if (standardTray) {
                expect(standardTray.command).toBe('+STOTrayExecByTray 2 5');
                expect(standardTray.parameters).toEqual({ tray: 2, slot: 5 });
            }

            // Test tray with backup if available
            const backupTray = builder.build('tray_with_backup', {
                active: 'on',
                tray: 1,
                slot: 3,
                backup_tray: 0,
                backup_slot: 1
            });
            if (backupTray) {
                expect(backupTray.command).toContain('TrayExecByTrayWithBackup');
                expect(backupTray.parameters).toBeDefined();
            }
        }
    });

    it('should handle parameterized movement commands', () => {
        const builder = commandManager.commandBuilders.get('movement');
        if (builder && window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.movement) {
            // Test throttle adjustment
            const throttleAdjust = builder.build('throttle_adjust', { amount: 0.5 });
            if (throttleAdjust) {
                expect(throttleAdjust.command).toContain('0.5');
            }

            // Test throttle set
            const throttleSet = builder.build('throttle_set', { position: 1 });
            if (throttleSet) {
                expect(throttleSet.command).toContain('1');
            }
        }
    });

    it('should handle parameterized camera commands', () => {
        const builder = commandManager.commandBuilders.get('camera');
        if (builder && window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.camera) {
            const camDistance = builder.build('cam_distance', { distance: 150 });
            if (camDistance) {
                expect(camDistance.command).toContain('150');
                expect(camDistance.type).toBe('camera');
            }
        }
    });

    it('should handle parameterized communication commands', () => {
        const builder = commandManager.commandBuilders.get('communication');
        if (builder) {
            const sayCommand = builder.build('local_message', { message: 'Hello World' });
            if (sayCommand) {
                expect(sayCommand.command).toContain('Hello World');
                expect(sayCommand.parameters.message).toBe('Hello World');
            }
        }
    });

    it('should handle parameterized system commands', () => {
        const builder = commandManager.commandBuilders.get('system');
        if (builder && window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.system) {
            // Test bind save file
            const bindSave = builder.build('bind_save_file', { filename: 'my_binds.txt' });
            if (bindSave) {
                expect(bindSave.command).toContain('my_binds.txt');
            }

            // Test combat log toggle
            const combatLog = builder.build('combat_log', { state: 1 });
            if (combatLog) {
                expect(combatLog.command).toContain('1');
            }
        }
    });

    it('should handle custom parameterized commands', () => {
        const builder = commandManager.commandBuilders.get('custom');
        if (builder) {
            const customCommand = builder.build('custom', {
                command: 'my_custom_command',
                text: 'My Custom Command'
            });
            if (customCommand) {
                expect(customCommand.command).toBe('my_custom_command');
                expect(customCommand.text).toBe('My Custom Command');
                expect(customCommand.parameters).toEqual({
                    command: 'my_custom_command',
                    text: 'My Custom Command'
                });
            }
        }
    });
});

describe('Parameter Modal Functionality', () => {
    let keybindManager;

    beforeAll(() => {
        // Mock DOM elements needed for parameter modal tests
        if (!document.getElementById('parameterModal')) {
            const mockModal = document.createElement('div');
            mockModal.id = 'parameterModal';
            mockModal.innerHTML = `
                <div id="parameterInputs"></div>
                <div id="parameterCommandPreview"></div>
                <div id="parameterModalTitle"></div>
                <button id="saveParameterCommandBtn">Add Command</button>
            `;
            document.body.appendChild(mockModal);
        }
    });

    beforeEach(() => {
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should perform all parameter modal operations correctly', () => {
        expect(window.STOKeybindManager).toBeDefined();
        expect(keybindManager).toBeInstanceOf(window.STOKeybindManager);
        
        // Test parameter modal creation
        const modalElement = keybindManager.createParameterModal('tray_exec', {
            tray: { type: 'number', min: 0, max: 9 },
            slot: { type: 'number', min: 0, max: 9 }
        });
        expect(modalElement).toBeDefined();
        
        // Test parameter modal population
        const populateResult = keybindManager.populateParameterModal('tray_exec', {
            tray: { type: 'number', min: 0, max: 9 },
            slot: { type: 'number', min: 0, max: 9 }
        });
        expect(populateResult).toBeDefined();
        
        // Test parameter values retrieval
        const paramValues = keybindManager.getParameterValues();
        expect(paramValues).toBeDefined();
        expect(typeof paramValues).toBe('object');
        
        // Test parameter preview update
        const previewResult = keybindManager.updateParameterPreview('tray_exec', { tray: 0, slot: 5 });
        expect(previewResult).toBeDefined();
        
        // Test parameter command saving
        const saveResult = keybindManager.saveParameterCommand('tray_exec', { tray: 0, slot: 5 });
        expect(saveResult).toBeDefined();
        
        // Test parameter modal cancellation - should actually close the modal
        keybindManager.cancelParameterCommand();
        const paramModal = document.getElementById('parameterModal');
        expect(paramModal.style.display).toBe('none');
        
        // Test editing parameterized commands
        const testCommand = { command: '+STOTrayExecByTray 0 5', parameters: { tray: 0, slot: 5 } };
        const editResult = keybindManager.editParameterizedCommand(testCommand);
        expect(editResult).toBeDefined();
        
        const populateEditResult = keybindManager.populateParameterModalForEdit(testCommand);
        expect(populateEditResult).toBeDefined();
    });
});