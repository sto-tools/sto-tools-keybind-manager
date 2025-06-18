import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load the real HTML content
const htmlContent = readFileSync(resolve(__dirname, '../../src/index.html'), 'utf-8');

// Import real data module
let STO_DATA;

/**
 * High-Value Data Validation Tests
 * Tests critical data structure integrity to prevent runtime errors
 * Focuses on business logic validation rather than granular data checking
 */

describe('STO Data Module - Critical Validation', () => {
    beforeEach(async () => {
        // Set up DOM with real HTML content
        document.documentElement.innerHTML = htmlContent;
        
        // Import the real data module
        await import('../../src/js/data.js');
        STO_DATA = window.STO_DATA;
        
        // Ensure data module loaded
        if (!STO_DATA) {
            throw new Error('STO_DATA not loaded');
        }
    });

    describe('Core Data Structure Integrity', () => {
        it('should have commands object with valid structure', () => {
            expect(STO_DATA.commands).toBeDefined();
            expect(typeof STO_DATA.commands).toBe('object');
            expect(Object.keys(STO_DATA.commands).length).toBeGreaterThan(0);
        });

        it('should have all command categories with required fields', () => {
            Object.entries(STO_DATA.commands).forEach(([categoryKey, category]) => {
                expect(category.name).toBeDefined();
                expect(typeof category.name).toBe('string');
                expect(category.icon).toBeDefined();
                expect(category.description).toBeDefined();
                expect(category.commands).toBeDefined();
                expect(typeof category.commands).toBe('object');
            });
        });

        it('should have all commands with critical required fields', () => {
            Object.entries(STO_DATA.commands).forEach(([categoryKey, category]) => {
                Object.entries(category.commands).forEach(([commandKey, command]) => {
                    // Critical fields that prevent runtime errors
                    expect(command.name, `${categoryKey}.${commandKey} missing name`).toBeDefined();
                    expect(command.command, `${categoryKey}.${commandKey} missing command`).toBeDefined();
                    expect(command.description, `${categoryKey}.${commandKey} missing description`).toBeDefined();
                    expect(command.syntax, `${categoryKey}.${commandKey} missing syntax`).toBeDefined();
                    expect(command.icon, `${categoryKey}.${commandKey} missing icon`).toBeDefined();
                });
            });
        });

        it('should have unique command keys within categories', () => {
            Object.entries(STO_DATA.commands).forEach(([categoryKey, category]) => {
                const commandKeys = Object.keys(category.commands);
                const uniqueKeys = new Set(commandKeys);
                expect(uniqueKeys.size).toBe(commandKeys.length);
            });
        });
    });

    describe('Business Logic Validation', () => {
        it('should have warnings for combat commands that affect firing cycles', () => {
            const combatCommands = STO_DATA.commands.combat?.commands || {};
            const fireCommands = ['fire_all', 'fire_phasers', 'fire_torps', 'fire_mines'];
            
            fireCommands.forEach(commandKey => {
                if (combatCommands[commandKey]) {
                    expect(combatCommands[commandKey].warning, 
                        `${commandKey} should have firing cycle warning`).toBeDefined();
                    expect(combatCommands[commandKey].warning).toContain('firing cycles');
                }
            });
        });

        it('should have warnings for shield distribution commands', () => {
            const powerCommands = STO_DATA.commands.power?.commands || {};
            
            if (powerCommands.distribute_shields) {
                expect(powerCommands.distribute_shields.warning).toBeDefined();
                expect(powerCommands.distribute_shields.warning).toContain('firing cycles');
            }
        });

        it('should properly mark space-only commands', () => {
            const combatCommands = STO_DATA.commands.combat?.commands || {};
            
            Object.entries(combatCommands).forEach(([commandKey, command]) => {
                if (command.environment) {
                    expect(['space', 'ground', 'both']).toContain(command.environment);
                }
            });
        });

        it('should have valid STO command syntax patterns', () => {
            Object.entries(STO_DATA.commands).forEach(([categoryKey, category]) => {
                Object.entries(category.commands).forEach(([commandKey, command]) => {
                    // Basic STO command validation
                    expect(command.command).toBeTruthy();
                    expect(typeof command.command).toBe('string');
                    
                    // Should not contain obvious syntax errors
                    expect(command.command).not.toMatch(/\s{2,}/); // No double spaces
                    expect(command.command).not.toMatch(/^\s|\s$/); // No leading/trailing spaces
                });
            });
        });
    });

    describe('Parameterized Commands Validation', () => {
        it('should have valid parameter definitions for customizable commands', () => {
            Object.entries(STO_DATA.commands).forEach(([categoryKey, category]) => {
                Object.entries(category.commands).forEach(([commandKey, command]) => {
                    if (command.customizable) {
                        expect(command.parameters, 
                            `${categoryKey}.${commandKey} marked customizable but missing parameters`).toBeDefined();
                        expect(typeof command.parameters).toBe('object');
                        
                        // Each parameter should have type and default
                        Object.entries(command.parameters).forEach(([paramKey, param]) => {
                            expect(param.type, `${commandKey}.${paramKey} missing type`).toBeDefined();
                            expect(['text', 'number', 'boolean']).toContain(param.type);
                            expect(param.default, `${commandKey}.${paramKey} missing default`).toBeDefined();
                        });
                    }
                });
            });
        });

        it('should have valid tray parameter ranges', () => {
            Object.entries(STO_DATA.commands).forEach(([categoryKey, category]) => {
                Object.entries(category.commands).forEach(([commandKey, command]) => {
                    if (command.parameters) {
                        Object.entries(command.parameters).forEach(([paramKey, param]) => {
                            if (paramKey.includes('tray') || paramKey.includes('slot')) {
                                if (param.type === 'number') {
                                    expect(param.min).toBeGreaterThanOrEqual(0);
                                    expect(param.max).toBeLessThanOrEqual(9);
                                    expect(param.min).toBeLessThanOrEqual(param.max);
                                }
                            }
                        });
                    }
                });
            });
        });
    });

    describe('Configuration Data Validation', () => {
        it('should have valid default settings structure', () => {
            if (STO_DATA.DEFAULT_SETTINGS) {
                expect(typeof STO_DATA.DEFAULT_SETTINGS).toBe('object');
                
                // Check for critical settings that prevent errors
                if (STO_DATA.DEFAULT_SETTINGS.keyLayout) {
                    expect(typeof STO_DATA.DEFAULT_SETTINGS.keyLayout).toBe('string');
                }
            }
        });

        it('should have valid key layouts if defined', () => {
            if (STO_DATA.KEY_LAYOUTS) {
                expect(typeof STO_DATA.KEY_LAYOUTS).toBe('object');
                
                Object.entries(STO_DATA.KEY_LAYOUTS).forEach(([layoutKey, layout]) => {
                    expect(layout.name).toBeDefined();
                    expect(Array.isArray(layout.rows)).toBe(true);
                    
                    // Each row should have valid key definitions
                    layout.rows.forEach((row, rowIndex) => {
                        expect(Array.isArray(row), `Layout ${layoutKey} row ${rowIndex} should be array`).toBe(true);
                        
                        row.forEach((key, keyIndex) => {
                            expect(key.key, `Layout ${layoutKey} row ${rowIndex} key ${keyIndex} missing key`).toBeDefined();
                            expect(key.display, `Layout ${layoutKey} row ${rowIndex} key ${keyIndex} missing display`).toBeDefined();
                        });
                    });
                });
            }
        });

        it('should have valid tray configuration limits', () => {
            if (STO_DATA.TRAY_CONFIG) {
                expect(typeof STO_DATA.TRAY_CONFIG).toBe('object');
                
                if (STO_DATA.TRAY_CONFIG.maxTrays) {
                    expect(STO_DATA.TRAY_CONFIG.maxTrays).toBeGreaterThan(0);
                    expect(STO_DATA.TRAY_CONFIG.maxTrays).toBeLessThanOrEqual(10); // STO limit
                }
                
                if (STO_DATA.TRAY_CONFIG.slotsPerTray) {
                    expect(STO_DATA.TRAY_CONFIG.slotsPerTray).toBeGreaterThan(0);
                    expect(STO_DATA.TRAY_CONFIG.slotsPerTray).toBeLessThanOrEqual(10); // STO limit
                }
            }
        });
    });

    describe('Sample Data Validation', () => {
        it('should have valid sample profiles structure', () => {
            if (STO_DATA.SAMPLE_PROFILES) {
                expect(Array.isArray(STO_DATA.SAMPLE_PROFILES)).toBe(true);
                
                STO_DATA.SAMPLE_PROFILES.forEach((profile, index) => {
                    expect(profile.name, `Sample profile ${index} missing name`).toBeDefined();
                    expect(profile.description, `Sample profile ${index} missing description`).toBeDefined();
                    
                    if (profile.keys) {
                        expect(typeof profile.keys).toBe('object');
                    }
                    
                    if (profile.aliases) {
                        expect(typeof profile.aliases).toBe('object');
                    }
                });
            }
        });

        it('should have valid sample aliases structure', () => {
            if (STO_DATA.SAMPLE_ALIASES) {
                expect(Array.isArray(STO_DATA.SAMPLE_ALIASES)).toBe(true);
                
                STO_DATA.SAMPLE_ALIASES.forEach((alias, index) => {
                    expect(alias.name, `Sample alias ${index} missing name`).toBeDefined();
                    expect(alias.commands, `Sample alias ${index} missing commands`).toBeDefined();
                    expect(alias.description, `Sample alias ${index} missing description`).toBeDefined();
                });
            }
        });
    });

    describe('Integration Compatibility', () => {
        it('should provide data compatible with command filtering', () => {
            // Test that data structure supports common filtering operations
            const categories = Object.keys(STO_DATA.commands);
            expect(categories.length).toBeGreaterThan(0);
            
            // Should be able to filter by environment
            let spaceCommands = 0;
            Object.values(STO_DATA.commands).forEach(category => {
                Object.values(category.commands).forEach(command => {
                    if (command.environment === 'space') {
                        spaceCommands++;
                    }
                });
            });
            
            // Should have some space commands for filtering
            expect(spaceCommands).toBeGreaterThan(0);
        });

        it('should support parameter substitution for exports', () => {
            let customizableCommands = 0;
            
            Object.entries(STO_DATA.commands).forEach(([categoryKey, category]) => {
                Object.entries(category.commands).forEach(([commandKey, command]) => {
                    if (command.customizable && command.parameters) {
                        customizableCommands++;
                        
                        // Should have valid syntax template for substitution
                        expect(command.syntax).toBeDefined();
                        expect(typeof command.syntax).toBe('string');
                    }
                });
            });
            
            // Should have some customizable commands
            expect(customizableCommands).toBeGreaterThan(0);
        });

        it('should provide UI-compatible metadata', () => {
            let commandsWithIcons = 0;
            
            Object.values(STO_DATA.commands).forEach(category => {
                Object.values(category.commands).forEach(command => {
                    if (command.icon && command.description) {
                        commandsWithIcons++;
                    }
                });
            });
            
            // Should have commands with UI metadata
            expect(commandsWithIcons).toBeGreaterThan(0);
        });
    });

    describe('Data Consistency', () => {
        it('should have consistent command naming patterns', () => {
            const commandNames = [];
            
            Object.values(STO_DATA.commands).forEach(category => {
                Object.values(category.commands).forEach(command => {
                    commandNames.push(command.command);
                });
            });
            
            // Basic consistency checks
            commandNames.forEach(commandName => {
                // Should not have obvious typos or inconsistencies
                expect(commandName).not.toMatch(/\s{2,}/); // No double spaces
                expect(commandName.trim()).toBe(commandName); // No leading/trailing spaces
            });
        });

        it('should maintain valid cross-references', () => {
            // If default settings reference key layouts, they should exist
            if (STO_DATA.DEFAULT_SETTINGS?.keyLayout && STO_DATA.KEY_LAYOUTS) {
                const referencedLayout = STO_DATA.DEFAULT_SETTINGS.keyLayout;
                expect(STO_DATA.KEY_LAYOUTS[referencedLayout], 
                    `Default keyLayout '${referencedLayout}' not found in KEY_LAYOUTS`).toBeDefined();
            }
        });
    });
}); 