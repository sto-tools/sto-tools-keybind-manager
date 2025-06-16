/**
 * Unit Tests for keybinds.js
 * Tests keybind file parsing, validation, and import/export operations
 */

describe('Keybinds Module', () => {
    // This is just a container - no tests here
});

describe('STOKeybindManager Class', () => {
    let keybindManager;

    beforeAll(() => {
        // Ensure keybinds module is loaded
        if (typeof window.stoKeybinds === 'undefined') {
            throw new Error('Keybinds module not loaded');
        }
    });

    beforeEach(() => {
        keybindManager = window.stoKeybinds;
    });

    it('should create STOKeybindManager instance', () => {
        expect(keybindManager).toBeDefined();
        expect(keybindManager.constructor.name).toBe('STOKeybindFileManager');
    });

    it('should have required methods', () => {
        expect(typeof keybindManager.parseKeybindFile).toBe('function');
        expect(typeof keybindManager.parseCommandString).toBe('function');
        expect(typeof keybindManager.importKeybindFile).toBe('function');
        expect(typeof keybindManager.exportProfile).toBe('function');
        expect(typeof keybindManager.isValidKey).toBe('function');
        expect(typeof keybindManager.validateKeybind).toBe('function');
    });

    it('should have valid key patterns', () => {
        expect(keybindManager.keybindPatterns).toBeDefined();
        expect(keybindManager.keybindPatterns.standard).toBeDefined();
        expect(keybindManager.keybindPatterns.alias).toBeDefined();
        expect(keybindManager.keybindPatterns.comment).toBeDefined();
        
        // Check that they have RegExp-like properties instead of using instanceof
        expect(typeof keybindManager.keybindPatterns.standard.test).toBe('function');
        expect(typeof keybindManager.keybindPatterns.alias.test).toBe('function');
        expect(typeof keybindManager.keybindPatterns.comment.test).toBe('function');
    });
});

describe('File Parsing Operations', () => {
    let keybindManager;

    beforeAll(() => {
        if (typeof window.stoKeybinds === 'undefined') {
            throw new Error('Keybinds module not loaded');
        }
    });

    beforeEach(() => {
        keybindManager = window.stoKeybinds;
    });

    it('should parse simple keybind file', () => {
        const content = `# Test keybind file
a "Target"
b "FireAll"
space "Target_Enemy_Near"`;

        const result = keybindManager.parseKeybindFile(content);
        
        expect(result.keybinds.a).toBeDefined();
        expect(result.keybinds.a.commands).toHaveLength(1);
        expect(result.keybinds.a.commands[0].command).toBe('Target');
        
        expect(result.keybinds.b).toBeDefined();
        expect(result.keybinds.b.commands[0].command).toBe('FireAll');
        
        expect(result.keybinds.space).toBeDefined();
        expect(result.keybinds.space.commands[0].command).toBe('Target_Enemy_Near');
    });

    it('should parse command chains', () => {
        const content = `f1 "Target_Enemy_Near $$ FireAll $$ +STOTrayExecByTray 0 5"`;
        
        const result = keybindManager.parseKeybindFile(content);
        
        expect(result.keybinds.f1).toBeDefined();
        expect(result.keybinds.f1.commands).toHaveLength(3);
        expect(result.keybinds.f1.commands[0].command).toBe('Target_Enemy_Near');
        expect(result.keybinds.f1.commands[1].command).toBe('FireAll');
        expect(result.keybinds.f1.commands[2].command).toBe('+STOTrayExecByTray 0 5');
    });

    it('should parse aliases', () => {
        const content = `alias attack_sequence "Target_Enemy_Near $$ FireAll"
alias heal_self "Target_Self $$ heal_self"`;
        
        const result = keybindManager.parseKeybindFile(content);
        
        expect(result.aliases.attack_sequence).toBeDefined();
        expect(result.aliases.attack_sequence.commands).toBe('Target_Enemy_Near $$ FireAll');
        
        expect(result.aliases.heal_self).toBeDefined();
        expect(result.aliases.heal_self.commands).toBe('Target_Self $$ heal_self');
    });

    it('should handle comments', () => {
        const content = `# This is a comment
# Another comment
a "Target"
# More comments`;
        
        const result = keybindManager.parseKeybindFile(content);
        
        expect(result.comments).toHaveLength(3);
        expect(result.keybinds.a).toBeDefined();
    });

    it('should handle malformed lines', () => {
        const content = `a "Target"
invalid line without quotes
b "FireAll"
another invalid line`;
        
        const result = keybindManager.parseKeybindFile(content);
        
        expect(result.keybinds.a).toBeDefined();
        expect(result.keybinds.b).toBeDefined();
        expect(result.errors).toHaveLength(2);
    });

    it('should export profile to STO format', () => {
        const profile = {
            name: 'Test Profile',
            mode: 'space',
            keys: {
                'a': [{ command: 'Target', type: 'targeting' }],
                'b': [{ command: 'FireAll', type: 'combat' }]
            },
            aliases: {
                'attack': {
                    commands: 'Target_Enemy_Near $$ FireAll'
                }
            }
        };
        
        const result = keybindManager.exportProfile(profile);
        
        expect(result).toContain('Test Profile');
        expect(result).toContain('a "Target"');
        expect(result).toContain('b "FireAll"');
        expect(result).toContain('alias attack "Target_Enemy_Near $$ FireAll"');
    });

    it('should generate keybind IDs', () => {
        const id1 = keybindManager.generateKeybindId();
        const id2 = keybindManager.generateKeybindId();
        
        expect(id1).toBeDefined();
        expect(id2).toBeDefined();
        expect(id1).not.toBe(id2);
    });
});

describe('Key Validation', () => {
    let keybindManager;

    beforeAll(() => {
        if (typeof window.stoKeybinds === 'undefined') {
            throw new Error('Keybinds module not loaded');
        }
    });

    beforeEach(() => {
        keybindManager = window.stoKeybinds;
    });

    it('should validate standard keys', () => {
        const validKeys = [
            'A', 'B', 'C', 'Z',
            '1', '2', '9', '0',
            'Space', 'Enter', 'Tab',
            'F1', 'F12'
        ];

        validKeys.forEach(key => {
            expect(keybindManager.isValidKey(key)).toBeTruthy();
        });
    });

    it('should reject invalid keys', () => {
        const invalidKeys = [
            '', '   ', null, undefined,
            'invalid-key', 'super+long+key'
        ];

        invalidKeys.forEach(key => {
            expect(keybindManager.isValidKey(key)).toBeFalsy();
        });
    });

    it('should validate modifier combinations', () => {
        const modifierCombos = [
            'Ctrl+A', 'Shift+A', 'Alt+A',
            'Ctrl+Shift+A', 'Ctrl+Alt+A', 'Alt+Shift+A'
        ];

        modifierCombos.forEach(key => {
            expect(keybindManager.isValidKey(key)).toBeTruthy();
        });
    });

    it('should validate alias names', () => {
        expect(keybindManager.isValidAliasName('attack_sequence')).toBeTruthy();
        expect(keybindManager.isValidAliasName('heal_self')).toBeTruthy();
        expect(keybindManager.isValidAliasName('123invalid')).toBeFalsy();
        expect(keybindManager.isValidAliasName('invalid-name')).toBeFalsy();
    });
});

describe('Keybind Validation', () => {
    let keybindManager;

    beforeAll(() => {
        if (typeof window.stoKeybinds === 'undefined') {
            throw new Error('Keybinds module not loaded');
        }
    });

    beforeEach(() => {
        keybindManager = window.stoKeybinds;
    });

    it('should validate correct keybind structure', () => {
        const commands = [{ command: 'Target_Enemy_Near' }];
        const validation = keybindManager.validateKeybind('A', commands);
        expect(validation.valid).toBeTruthy();
    });

    it('should reject invalid keys', () => {
        const commands = [{ command: 'Target_Enemy_Near' }];
        const validation = keybindManager.validateKeybind('invalid-key', commands);
        expect(validation.valid).toBeFalsy();
        expect(validation.errors.join(' ')).toContain('Invalid key');
    });

    it('should reject empty command arrays', () => {
        const validation = keybindManager.validateKeybind('A', []);
        expect(validation.valid).toBeFalsy();
        expect(validation.errors.join(' ')).toContain('At least one command is required');
    });

    it('should reject too many commands', () => {
        const tooManyCommands = Array(25).fill({ command: 'Target_Enemy_Near' });
        const validation = keybindManager.validateKeybind('A', tooManyCommands);
        expect(validation.valid).toBeFalsy();
        expect(validation.errors.join(' ')).toContain('Too many commands');
    });
});

describe('Utility Functions', () => {
    let keybindManager;

    beforeAll(() => {
        if (typeof window.stoKeybinds === 'undefined') {
            throw new Error('Keybinds module not loaded');
        }
    });

    beforeEach(() => {
        keybindManager = window.stoKeybinds;
    });

    it('should generate valid keys list', () => {
        expect(keybindManager.validKeys).toBeDefined();
        expect(Array.isArray(keybindManager.validKeys)).toBeTruthy();
        expect(keybindManager.validKeys.length).toBeGreaterThan(0);
        expect(keybindManager.validKeys).toContain('A');
        expect(keybindManager.validKeys).toContain('Space');
        expect(keybindManager.validKeys).toContain('F1');
    });

    it('should suggest keys based on filter', () => {
        const suggestions = keybindManager.suggestKeys('f');
        expect(Array.isArray(suggestions)).toBeTruthy();
        expect(suggestions.some(key => key.toLowerCase().includes('f'))).toBeTruthy();
    });

    it('should provide common keys', () => {
        const commonKeys = keybindManager.getCommonKeys();
        expect(Array.isArray(commonKeys)).toBeTruthy();
        expect(commonKeys.length).toBeGreaterThan(0);
        expect(commonKeys).toContain('Space');
    });

    it('should compare keys correctly', () => {
        expect(keybindManager.compareKeys('a', 'b')).toBeLessThan(0);
        expect(keybindManager.compareKeys('b', 'a')).toBeGreaterThan(0);
        expect(keybindManager.compareKeys('a', 'a')).toBe(0);
    });
});

describe('File Import/Export', () => {
    let keybindManager;

    beforeAll(() => {
        if (typeof window.stoKeybinds === 'undefined') {
            throw new Error('Keybinds module not loaded');
        }
    });

    beforeEach(() => {
        keybindManager = window.stoKeybinds;
    });

    it('should export profile to STO format', () => {
        const profile = {
            name: 'Test Profile',
            mode: 'space',
            keys: {
                'a': [{ command: 'Target_Enemy_Near', type: 'targeting' }],
                'b': [{ command: 'FireAll', type: 'combat' }],
                'space': [
                    { command: 'Target_Enemy_Near', type: 'targeting' },
                    { command: 'FireAll', type: 'combat' }
                ]
            },
            aliases: {}
        };

        const exported = keybindManager.exportProfile(profile);
        
        expect(typeof exported).toBe('string');
        expect(exported).toContain('a "Target_Enemy_Near"');
        expect(exported).toContain('b "FireAll"');
        expect(exported).toContain('space "Target_Enemy_Near $$ FireAll"');
    });

    it('should parse keybind file content', () => {
        const fileContent = `
            a "Target_Enemy_Near"
            b "FireAll"
            space "Target_Enemy_Near $$ FireAll"
            f1 "+STOTrayExecByTray 0 5"
        `;

        const result = keybindManager.parseKeybindFile(fileContent);

        expect(result.keybinds).toBeDefined();
        expect(result.keybinds['a']).toBeDefined();
        expect(result.keybinds['b']).toBeDefined();
        expect(result.keybinds['space']).toBeDefined();
        expect(result.keybinds['f1']).toBeDefined();
        expect(result.keybinds['space'].commands).toHaveLength(2);
    });

    it('should handle bind command format', () => {
        const bindContent = `
            /bind a Target_Enemy_Near
            /bind b FireAll
            /bind space "Target_Enemy_Near $$ FireAll"
        `;

        const result = keybindManager.parseKeybindFile(bindContent);

        expect(result.keybinds['a']).toBeDefined();
        expect(result.keybinds['b']).toBeDefined();
        expect(result.keybinds['space']).toBeDefined();
        expect(result.keybinds['a'].commands[0].command).toBe('Target_Enemy_Near');
    });

    it('should handle mixed formats', () => {
        const mixedContent = `
            a "Target_Enemy_Near"
            /bind b FireAll
            space "Target_Enemy_Near $$ FireAll"
            /bind f1 "+STOTrayExecByTray 0 5"
        `;

        const result = keybindManager.parseKeybindFile(mixedContent);

        expect(result.keybinds['a']).toBeDefined();
        expect(result.keybinds['b']).toBeDefined();
        expect(result.keybinds['space']).toBeDefined();
        expect(result.keybinds['f1']).toBeDefined();
    });

    it('should handle malformed import gracefully', () => {
        const malformedContent = `
            a "Target_Enemy_Near
            b FireAll"
            invalid line
            c "Target_Self"
        `;

        const result = keybindManager.parseKeybindFile(malformedContent);

        expect(result.errors.length).toBeGreaterThan(0);
        // Should still parse valid lines
        expect(result.keybinds['c']).toBeDefined();
        expect(result.keybinds['c'].commands[0].command).toBe('Target_Self');
    });
});

describe('Integration Tests', () => {
    let keybindManager;

    beforeAll(() => {
        if (typeof window.stoKeybinds === 'undefined') {
            throw new Error('Keybinds module not loaded');
        }
    });

    beforeEach(() => {
        keybindManager = window.stoKeybinds;
    });

    it('should handle complete keybind file workflow', () => {
        const originalContent = `
            # Combat keybinds
            a "Target_Enemy_Near"
            b "FireAll"
            space "Target_Enemy_Near $$ FireAll"
            
            # Tray commands
            f1 "+STOTrayExecByTray 0 5"
            f2 "+STOTrayExecByTray 0 6"
            
            # Aliases
            alias attack_sequence "Target_Enemy_Near $$ FireAll"
            alias heal_self "Target_Self $$ +power_exec Engineering_Team"
        `;

        // Import the file
        const importResult = keybindManager.importKeybindFile(originalContent, 'complete.txt');
        expect(importResult.success).toBeTruthy();

        // Export it back
        const exported = keybindManager.exportProfile(importResult.profile);
        expect(typeof exported).toBe('string');

        // Re-import the exported content
        const reimportResult = keybindManager.importKeybindFile(exported, 'exported.txt');
        expect(reimportResult.success).toBeTruthy();

        // Should have same keybinds
        const originalKeys = Object.keys(importResult.profile.keybinds);
        const reimportedKeys = Object.keys(reimportResult.profile.keybinds);
        expect(reimportedKeys.sort()).toEqual(originalKeys.sort());
    });

    it('should preserve command order in chains', () => {
        const content = 'space "Target_Enemy_Near $$ FireAll $$ +power_exec Distribute_Shields"';
        
        const parseResult = keybindManager.parseKeybindFile(content);
        const commands = parseResult.keybinds['space'].commands;
        
        expect(commands).toHaveLength(3);
        expect(commands[0].command).toBe('Target_Enemy_Near');
        expect(commands[1].command).toBe('FireAll');
        expect(commands[2].command).toBe('+power_exec Distribute_Shields');
    });

    it('should handle large keybind files efficiently', () => {
        let largeContent = '';
        for (let i = 0; i < 100; i++) {
            largeContent += `key${i} "Target_Enemy_Near $$ FireAll"\n`;
        }

        const startTime = Date.now();
        const result = keybindManager.parseKeybindFile(largeContent);
        const endTime = Date.now();

        expect(result.keybinds).toBeDefined();
        expect(Object.keys(result.keybinds)).toHaveLength(100);
        expect(endTime - startTime).toBeLessThan(1000); // Should parse in under 1 second
    });
}); 