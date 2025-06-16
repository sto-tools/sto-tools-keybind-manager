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
        expect(commandManager).toBeDefined();
        expect(commandManager.constructor.name).toBe('STOCommandManager');
    });

    it('should have required methods', () => {
        expect(typeof commandManager.setupCommandBuilders).toBe('function');
        expect(typeof commandManager.buildCurrentCommand).toBe('function');
        expect(typeof commandManager.validateCommand).toBe('function');
        expect(typeof commandManager.detectCommandType).toBe('function');
        expect(typeof commandManager.getCommandIcon).toBe('function');
        expect(typeof commandManager.getCommandText).toBe('function');
    });

    it('should have command builders initialized', () => {
        expect(commandManager.commandBuilders).toBeDefined();
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
        expect(builder).toBeDefined();
        
        const command = builder.build('target_enemy_near');
        expect(command).toBeDefined();
        expect(command.type).toBe('targeting');
        expect(command.command).toBeDefined();
    });

    it('should build tray execution commands', () => {
        const builder = commandManager.commandBuilders.get('tray');
        expect(builder).toBeDefined();
        
        const command = builder.build('tray_exec', { tray: 0, slot: 5 });
        expect(command).toBeDefined();
        expect(command.type).toBe('tray');
        expect(command.command).toBe('+STOTrayExecByTray 0 5');
        expect(command.parameters).toEqual({ tray: 0, slot: 5 });
    });

    it('should build custom commands', () => {
        const builder = commandManager.commandBuilders.get('custom');
        expect(builder).toBeDefined();
        
        const command = builder.build('custom', { 
            command: 'my_custom_command', 
            text: 'My Custom Command' 
        });
        expect(command).toBeDefined();
        expect(command.type).toBe('custom');
        expect(command.command).toBe('my_custom_command');
        expect(command.text).toBe('My Custom Command');
    });

    it('should handle missing command IDs gracefully', () => {
        const builder = commandManager.commandBuilders.get('targeting');
        const command = builder.build('nonexistent_command');
        expect(command).toBeNull();
    });

    it('should build communication commands with parameters', () => {
        const builder = commandManager.commandBuilders.get('communication');
        expect(builder).toBeDefined();
        
        const command = builder.build('local_message', { message: 'Hello World' });
        expect(command).toBeDefined();
        expect(command.type).toBe('communication');
        expect(command.command).toContain('Hello World');
        expect(command.parameters.message).toBe('Hello World');
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
            expect(result).toBeDefined();
            expect(result.valid).toBe(true);
        });
    });

    it('should reject invalid commands', () => {
        const invalidCommands = [
            '',
            null,
            undefined,
            '   ',
            'invalid$$command',
            'command with | pipe'
        ];

        invalidCommands.forEach(command => {
            const result = commandManager.validateCommand(command);
            expect(result).toBeDefined();
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
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
            expect(result).toBeDefined();
            expect(result.valid).toBe(true);
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