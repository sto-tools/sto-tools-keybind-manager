/**
 * Unit Tests for data.js
 * Tests command definitions, configurations, and data structures
 */

describe('Data Module', () => {
    beforeAll(() => {
        // Ensure data module is loaded
        if (typeof window.COMMAND_CATEGORIES === 'undefined') {
            throw new Error('Data module not loaded');
        }
    });

    describe('Command Categories', () => {
        it('should have all required command categories', () => {
            expect(window.COMMAND_CATEGORIES).toBeDefined();
            expect(window.COMMAND_CATEGORIES).toBeInstanceOf(Object);
            
            const expectedCategories = [
                'targeting', 'combat', 'tray', 'power', 
                'movement', 'communication', 'system'
            ];
            
            expectedCategories.forEach(category => {
                expect(window.COMMAND_CATEGORIES).toContain(category);
            });
        });

        it('should have valid category structures', () => {
            Object.entries(window.COMMAND_CATEGORIES).forEach(([key, category]) => {
                expect(category).toBeInstanceOf(Object);
                expect(category.name).toBeDefined();
                expect(typeof category.name).toBe('string');
                expect(category.icon).toBeDefined();
                expect(typeof category.icon).toBe('string');
                expect(category.description).toBeDefined();
                expect(typeof category.description).toBe('string');
            });
        });
    });

    describe('Commands', () => {
        it('should have commands defined', () => {
            expect(window.COMMANDS).toBeDefined();
            expect(window.COMMANDS).toBeInstanceOf(Object);
            expect(Object.keys(window.COMMANDS).length).toBeGreaterThan(0);
        });

        it('should have valid command structures', () => {
            Object.entries(window.COMMANDS).forEach(([key, command]) => {
                expect(command).toBeInstanceOf(Object);
                expect(command.name).toBeDefined();
                expect(typeof command.name).toBe('string');
                expect(command.category).toBeDefined();
                expect(window.COMMAND_CATEGORIES[command.category]).toBeDefined();
                expect(command.description).toBeDefined();
                expect(typeof command.description).toBe('string');
                expect(command.syntax).toBeDefined();
                expect(typeof command.syntax).toBe('string');
            });
        });

        it('should have targeting commands', () => {
            const targetingCommands = Object.values(window.COMMANDS)
                .filter(cmd => cmd.category === 'targeting');
            
            expect(targetingCommands.length).toBeGreaterThan(0);
            
            // Check for essential targeting commands that actually exist in STO
            const targetCommands = targetingCommands.map(cmd => cmd.key);
            expect(targetCommands).toContain('target');
            expect(targetCommands).toContain('target_enemy_near');
            expect(targetCommands).toContain('target_self');
        });

        it('should have combat commands', () => {
            const combatCommands = Object.values(window.COMMANDS)
                .filter(cmd => cmd.category === 'combat');
            
            expect(combatCommands.length).toBeGreaterThan(0);
            
            // Check for essential combat commands that actually exist
            const commandKeys = combatCommands.map(cmd => cmd.key);
            expect(commandKeys).toContain('fire_all');
        });

        it('should have movement commands', () => {
            const movementCommands = Object.values(window.COMMANDS)
                .filter(cmd => cmd.category === 'movement');
            
            expect(movementCommands.length).toBeGreaterThan(0);
            
            // Check for essential movement commands that actually exist
            const commandKeys = movementCommands.map(cmd => cmd.key);
            expect(commandKeys).toContain('full_impulse');
        });
    });

    describe('Key Layouts', () => {
        it('should have key layouts defined', () => {
            expect(window.KEY_LAYOUTS).toBeDefined();
            expect(window.KEY_LAYOUTS).toBeInstanceOf(Object);
            expect(Object.keys(window.KEY_LAYOUTS).length).toBeGreaterThan(0);
        });

        it('should have standard QWERTY layout', () => {
            expect(window.KEY_LAYOUTS.qwerty).toBeDefined();
            expect(window.KEY_LAYOUTS.qwerty.name).toBe('QWERTY');
            expect(window.KEY_LAYOUTS.qwerty.rows).toBeInstanceOf(Array);
            expect(window.KEY_LAYOUTS.qwerty.rows.length).toBeGreaterThan(0);
        });

        it('should have valid key layout structures', () => {
            Object.entries(window.KEY_LAYOUTS).forEach(([key, layout]) => {
                expect(layout).toBeInstanceOf(Object);
                expect(layout.name).toBeDefined();
                expect(typeof layout.name).toBe('string');
                expect(layout.rows).toBeInstanceOf(Array);
                
                layout.rows.forEach(row => {
                    expect(row).toBeInstanceOf(Array);
                    row.forEach(keyData => {
                        expect(keyData).toBeInstanceOf(Object);
                        expect(keyData.key).toBeDefined();
                        expect(typeof keyData.key).toBe('string');
                        expect(keyData.display).toBeDefined();
                        expect(typeof keyData.display).toBe('string');
                    });
                });
            });
        });
    });

    describe('Default Settings', () => {
        it('should have default settings defined', () => {
            expect(window.DEFAULT_SETTINGS).toBeDefined();
            expect(window.DEFAULT_SETTINGS).toBeInstanceOf(Object);
        });

        it('should have valid default settings structure', () => {
            const settings = window.DEFAULT_SETTINGS;
            
            expect(settings.keyLayout).toBeDefined();
            expect(typeof settings.keyLayout).toBe('string');
            expect(window.KEY_LAYOUTS[settings.keyLayout]).toBeDefined();
            
            expect(settings.autoSave).toBeDefined();
            expect(typeof settings.autoSave).toBe('boolean');
            
            expect(settings.showTooltips).toBeDefined();
            expect(typeof settings.showTooltips).toBe('boolean');
            
            expect(settings.exportFormat).toBeDefined();
            expect(typeof settings.exportFormat).toBe('string');
        });
    });

    describe('Sample Data', () => {
        it('should have sample profiles defined', () => {
            expect(window.SAMPLE_PROFILES).toBeDefined();
            expect(window.SAMPLE_PROFILES).toBeInstanceOf(Array);
            expect(window.SAMPLE_PROFILES.length).toBeGreaterThan(0);
        });

        it('should have valid sample profile structures', () => {
            window.SAMPLE_PROFILES.forEach(profile => {
                expect(profile).toBeInstanceOf(Object);
                expect(profile.id).toBeDefined();
                expect(typeof profile.id).toBe('string');
                expect(profile.name).toBeDefined();
                expect(typeof profile.name).toBe('string');
                expect(profile.description).toBeDefined();
                expect(typeof profile.description).toBe('string');
                expect(profile.keybinds).toBeInstanceOf(Object);
                expect(profile.aliases).toBeInstanceOf(Object);
                expect(profile.created).toBeDefined();
                expect(profile.modified).toBeDefined();
            });
        });

        it('should have sample aliases defined', () => {
            expect(window.SAMPLE_ALIASES).toBeDefined();
            expect(window.SAMPLE_ALIASES).toBeInstanceOf(Object);
            expect(Object.keys(window.SAMPLE_ALIASES).length).toBeGreaterThan(0);
        });

        it('should have valid sample alias structures', () => {
            Object.entries(window.SAMPLE_ALIASES).forEach(([key, alias]) => {
                expect(alias).toBeInstanceOf(Object);
                expect(alias.name).toBeDefined();
                expect(typeof alias.name).toBe('string');
                expect(alias.commands).toBeInstanceOf(Array);
                expect(alias.commands.length).toBeGreaterThan(0);
                expect(alias.description).toBeDefined();
                expect(typeof alias.description).toBe('string');
            });
        });
    });

    describe('Tray Configuration', () => {
        it('should have tray configuration defined', () => {
            expect(window.TRAY_CONFIG).toBeDefined();
            expect(window.TRAY_CONFIG).toBeInstanceOf(Object);
        });

        it('should have valid tray configuration structure', () => {
            const config = window.TRAY_CONFIG;
            
            expect(config.maxTrays).toBeDefined();
            expect(typeof config.maxTrays).toBe('number');
            expect(config.maxTrays).toBeGreaterThan(0);
            
            expect(config.slotsPerTray).toBeDefined();
            expect(typeof config.slotsPerTray).toBe('number');
            expect(config.slotsPerTray).toBeGreaterThan(0);
            
            expect(config.defaultTray).toBeDefined();
            expect(typeof config.defaultTray).toBe('number');
            expect(config.defaultTray).toBeGreaterThanOrEqual(0);
            expect(config.defaultTray).toBeLessThan(config.maxTrays);
        });
    });

    describe('Data Validation', () => {
        it('should have consistent command categories', () => {
            const categoryKeys = Object.keys(window.COMMAND_CATEGORIES);
            const usedCategories = [...new Set(Object.values(window.COMMANDS).map(cmd => cmd.category))];
            
            usedCategories.forEach(category => {
                expect(categoryKeys).toContain(category);
            });
        });

        it('should have unique command keys', () => {
            const commandKeys = Object.keys(window.COMMANDS);
            const uniqueKeys = [...new Set(commandKeys)];
            
            expect(commandKeys.length).toBe(uniqueKeys.length);
        });

        it('should have valid sample profile keybinds', () => {
            window.SAMPLE_PROFILES.forEach(profile => {
                Object.entries(profile.keybinds).forEach(([key, commands]) => {
                    expect(typeof key).toBe('string');
                    expect(key.length).toBeGreaterThan(0);
                    expect(commands).toBeInstanceOf(Array);
                    
                    commands.forEach(command => {
                        expect(typeof command).toBe('string');
                        expect(command.length).toBeGreaterThan(0);
                    });
                });
            });
        });
    });
}); 