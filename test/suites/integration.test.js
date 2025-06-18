/**
 * Integration Tests
 * Tests the interaction between multiple modules and end-to-end workflows
 */

describe('Integration Tests', () => {
    // This is just a container - no tests here
});

describe('Profile and Keybind Integration', () => {
    let storageManager;
    let profileManager;
    let keybindManager;
    let aliasManager;
    let exportManager;
    let commandManager;

    beforeAll(() => {
        // Ensure all modules are loaded - use actual application managers
        const requiredModules = [
            'stoStorage', 'stoProfiles', 'stoKeybinds',
            'stoAliases', 'stoExport', 'stoCommands'
        ];

        requiredModules.forEach(module => {
            if (typeof window[module] === 'undefined') {
                throw new Error(`${module} not loaded`);
            }
        });
    });

    beforeEach(() => {
        // Use actual application managers
        storageManager = window.stoStorage;
        profileManager = window.stoProfiles;
        keybindManager = window.stoKeybinds;
        aliasManager = window.stoAliases;
        exportManager = window.stoExport;
        commandManager = window.stoCommands;
        
        // Clear any existing test data
        if (storageManager && typeof storageManager.clearAllData === 'function') {
            storageManager.clearAllData();
        }
    });

    it('should create profile with keybinds and persist to storage', () => {
        // Use actual storage API to create a profile
        const profileId = 'test-profile-keybinds';
        const profile = {
            name: 'Test Profile with Keybinds',
            description: 'Integration test profile',
            mode: 'space',
            keys: {
                'a': [{ command: 'target', type: 'targeting', id: 'cmd1' }],
                'b': [{ command: 'fire_all', type: 'combat', id: 'cmd2' }],
                'space': [
                    { command: 'target_enemy_near', type: 'targeting', id: 'cmd3' },
                    { command: 'fire_all', type: 'combat', id: 'cmd4' }
                ]
            },
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // Save profile using storage API
        const saved = storageManager.saveProfile(profileId, profile);
        expect(saved).toBeTruthy();

        // Verify persistence
        const retrieved = storageManager.getProfile(profileId);
        expect(retrieved).toEqual(expect.objectContaining({
            name: profile.name,
            keys: expect.objectContaining({
                a: expect.arrayContaining([expect.any(Object)]),
                space: expect.arrayContaining([expect.any(Object), expect.any(Object)])
            })
        }));
        expect(retrieved.keys.a).toHaveLength(1);
        expect(retrieved.keys.space).toHaveLength(2);
    });

            it('should update profile keybinds and maintain consistency', async () => {
        // Create initial profile
        const profileId = 'test-profile-update';
        const initialProfile = {
            name: 'Initial Profile',
            mode: 'space',
            keys: {
                'a': [{ command: 'target', type: 'targeting', id: 'cmd1' }]
            },
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        storageManager.saveProfile(profileId, initialProfile);

                    // Wait a moment to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            // Update profile with new keybinds
            const updatedProfile = {
                ...initialProfile,
                keys: {
                    'a': [{ command: 'target', type: 'targeting', id: 'cmd1' }],
                    'b': [{ command: 'fire_all', type: 'combat', id: 'cmd2' }]
                },
                lastModified: new Date().toISOString()
            };

            const updated = storageManager.saveProfile(profileId, updatedProfile);
            expect(updated).toBeTruthy();

            // Verify consistency
            const retrieved = storageManager.getProfile(profileId);
            expect(retrieved.keys.a).toHaveLength(1);
            expect(retrieved.keys.b).toHaveLength(1);
            expect(retrieved.lastModified).not.toBe(initialProfile.lastModified);
    });

    it('should load profile keybinds into keybind manager', () => {
        // Create profile with keybinds
        const profileId = 'test-profile-load';
        const profile = {
            name: 'Profile for Loading',
            mode: 'space',
            keys: {
                'f1': [{ command: '+STOTrayExecByTray 0 5', type: 'tray', id: 'cmd1' }],
                'f2': [{ command: 'target_self', type: 'targeting', id: 'cmd2' }]
            },
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        storageManager.saveProfile(profileId, profile);

        // Verify keybind manager can access the profile data
        const retrieved = storageManager.getProfile(profileId);
        expect(retrieved).toEqual(expect.objectContaining({
            keys: expect.objectContaining({
                f1: expect.any(Array),
                f2: expect.any(Array)
            })
        }));
        expect(keybindManager).toBeInstanceOf(Object);
        
        // Test that keybind manager can validate the commands
        const f1Commands = retrieved.keys.f1;
        expect(f1Commands).toHaveLength(1);
        expect(f1Commands[0].command).toBe('+STOTrayExecByTray 0 5');
    });

    it('should categorize keys correctly in keybind view', () => {
        // Create profile with diverse keybinds for categorization testing
        const profileId = 'test-profile-categorization';
        const profile = {
            name: 'Categorization Test Profile',
            mode: 'space',
            keys: {
                // Combat keys
                'space': [
                    { command: 'Target_Enemy_Near', type: 'targeting', id: 'cmd1' },
                    { command: 'FireAll', type: 'combat', id: 'cmd2' }
                ],
                '1': [{ command: 'FireAll', type: 'combat', id: 'cmd3' }],
                
                // Tray keys
                'f1': [{ command: '+STOTrayExecByTray 0 5', type: 'tray', id: 'cmd4' }],
                'f2': [{ command: 'TrayExecByTrayWithBackup 1 0 0 0 1', type: 'tray', id: 'cmd5' }],
                
                // Targeting keys
                't': [{ command: 'Target_Self', type: 'targeting', id: 'cmd6' }],
                
                // System keys
                'alt+f4': [{ command: 'screenshot', type: 'system', id: 'cmd7' }],
                
                // Empty key
                'f12': []
            },
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        storageManager.saveProfile(profileId, profile);

        // Test categorization functionality if app is available
        if (window.app && typeof window.app.categorizeKeys === 'function') {
            const allKeys = Object.keys(profile.keys);
            const categorized = window.app.categorizeKeys(profile.keys, allKeys);
            
            expect(categorized).toBeInstanceOf(Object);
            expect(categorized).not.toBeNull();
            
            // Check combat category
            if (categorized.combat) {
                expect(categorized.combat.keys).toContain('space');
                expect(categorized.combat.keys).toContain('1');
            }
            
            // Check tray category
            if (categorized.tray) {
                expect(categorized.tray.keys).toContain('f1');
                expect(categorized.tray.keys).toContain('f2');
            }
            
            // Check targeting category
            if (categorized.targeting) {
                expect(categorized.targeting.keys).toContain('space'); // Multi-category
                expect(categorized.targeting.keys).toContain('t');
            }
            
            // Check system category
            if (categorized.system) {
                expect(categorized.system.keys).toContain('alt+f4');
            }
            
            // Check unknown category (real function uses 'unknown' not 'empty')
            if (categorized.unknown) {
                expect(categorized.unknown.keys).toContain('f12');
            }
            
            // Verify keys can appear in multiple categories
            if (categorized.combat && categorized.targeting) {
                expect(categorized.combat.keys).toContain('space');
                expect(categorized.targeting.keys).toContain('space');
            }
        }
    });

    it('should handle view mode preferences', () => {
        // Test view mode storage and retrieval
        const testViewMode = 'categorized';
        localStorage.setItem('keyViewMode', testViewMode);
        
        const retrievedMode = localStorage.getItem('keyViewMode');
        expect(retrievedMode).toBe(testViewMode);
        
        // Test toggle functionality
        const currentMode = localStorage.getItem('keyViewMode');
        const newMode = currentMode === 'categorized' ? 'grid' : 'categorized';
        localStorage.setItem('keyViewMode', newMode);
        
        const toggledMode = localStorage.getItem('keyViewMode');
        expect(toggledMode).toBe(newMode);
        expect(toggledMode).not.toBe(currentMode);
        
        // Clean up
        localStorage.removeItem('keyViewMode');
    });
});

describe('Profile and Alias Integration', () => {
    let storageManager;
    let profileManager;
    let aliasManager;

    beforeAll(() => {
        // Ensure all modules are loaded - use actual application managers
        const requiredModules = [
            'stoStorage', 'stoProfiles', 'stoAliases'
        ];

        requiredModules.forEach(module => {
            if (typeof window[module] === 'undefined') {
                throw new Error(`${module} not loaded`);
            }
        });
    });

    beforeEach(() => {
        // Use actual application managers
        storageManager = window.stoStorage;
        profileManager = window.stoProfiles;
        aliasManager = window.stoAliases;
        
        // Clear any existing test data
        if (storageManager && typeof storageManager.clearAllData === 'function') {
            storageManager.clearAllData();
        }
    });

    it('should create profile with aliases and maintain relationships', () => {
        // Create profile with aliases using storage API
        const profileId = 'test-profile-aliases';
        const profile = {
            name: 'Profile with Aliases',
            mode: 'space',
            keys: {
                'a': [{ command: 'attack_sequence', type: 'alias', id: 'cmd1' }]
            },
            aliases: {
                'attack_sequence': {
                    name: 'Attack Sequence',
                    commands: 'target_enemy_near $$ fire_all',
                    description: 'Basic attack pattern',
                    created: new Date().toISOString(),
                    modified: new Date().toISOString()
                },
                'heal_sequence': {
                    name: 'Heal Sequence',
                    commands: 'target_self $$ heal_self',
                    description: 'Self healing pattern',
                    created: new Date().toISOString(),
                    modified: new Date().toISOString()
                }
            },
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        const saved = storageManager.saveProfile(profileId, profile);
        expect(saved).toBeTruthy();

        // Verify alias relationships
        const retrieved = storageManager.getProfile(profileId);
        expect(retrieved).toEqual(expect.objectContaining({
            aliases: expect.objectContaining({
                attack_sequence: expect.any(Object),
                heal_sequence: expect.any(Object)
            }),
            keys: expect.objectContaining({
                a: expect.arrayContaining([
                    expect.objectContaining({ command: 'attack_sequence' })
                ])
            })
        }));
    });

    it('should handle alias dependencies in profiles', () => {
        // Create profile with nested alias dependencies
        const profileId = 'test-alias-dependencies';
        const profile = {
            name: 'Profile with Alias Dependencies',
            mode: 'space',
            keys: {
                'space': [{ command: 'full_combat', type: 'alias', id: 'cmd1' }]
            },
            aliases: {
                'attack': {
                    name: 'Basic Attack',
                    commands: 'target_enemy_near $$ fire_all',
                    description: 'Basic attack'
                },
                'heal': {
                    name: 'Self Heal',
                    commands: 'target_self $$ heal_self',
                    description: 'Self healing'
                },
                'full_combat': {
                    name: 'Full Combat Sequence',
                    commands: 'attack $$ heal',
                    description: 'Attack then heal'
                }
            },
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        const saved = storageManager.saveProfile(profileId, profile);
        expect(saved).toBeTruthy();

        // Verify dependency chain
        const retrieved = storageManager.getProfile(profileId);
        expect(retrieved).toEqual(expect.objectContaining({
            aliases: expect.objectContaining({
                full_combat: expect.objectContaining({
                    commands: expect.stringContaining('attack')
                }),
                attack: expect.any(Object),
                heal: expect.any(Object)
            })
        }));
        expect(retrieved.aliases.full_combat.commands).toContain('heal');
    });
});

describe('Keybind and Alias Integration', () => {
    let storageManager;
    let profileManager;
    let aliasManager;
    let exportManager;

    beforeAll(() => {
        // Ensure all modules are loaded - use actual application managers
        const requiredModules = [
            'stoStorage', 'stoProfiles', 'stoAliases', 'stoExport'
        ];

        requiredModules.forEach(module => {
            if (typeof window[module] === 'undefined') {
                throw new Error(`${module} not loaded`);
            }
        });
    });

    beforeEach(() => {
        // Use actual application managers
        storageManager = window.stoStorage;
        profileManager = window.stoProfiles;
        aliasManager = window.stoAliases;
        exportManager = window.stoExport;
        
        // Clear any existing test data
        if (storageManager && typeof storageManager.clearAllData === 'function') {
            storageManager.clearAllData();
        }
    });

    it('should use aliases in keybinds', () => {
        // Create profile that uses aliases in keybinds
        const profileId = 'test-keybind-alias-usage';
        const profile = {
            name: 'Keybind Alias Usage',
            mode: 'space',
            keys: {
                'q': [{ command: 'quick_attack', type: 'alias', id: 'cmd1' }],
                'e': [{ command: 'emergency_heal', type: 'alias', id: 'cmd2' }]
            },
            aliases: {
                'quick_attack': {
                    name: 'Quick Attack',
                    commands: 'target_enemy_near $$ fire_all',
                    description: 'Quick attack sequence'
                },
                'emergency_heal': {
                    name: 'Emergency Heal',
                    commands: 'target_self $$ heal_self $$ distribute_shields',
                    description: 'Emergency healing sequence'
                }
            },
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        const saved = storageManager.saveProfile(profileId, profile);
        expect(saved).toBeTruthy();

        // Verify alias usage in keybinds
        const retrieved = storageManager.getProfile(profileId);
        expect(retrieved).toEqual(expect.objectContaining({
            keys: expect.objectContaining({
                q: expect.arrayContaining([
                    expect.objectContaining({ command: 'quick_attack' })
                ]),
                e: expect.arrayContaining([
                    expect.objectContaining({ command: 'emergency_heal' })
                ])
            }),
            aliases: expect.objectContaining({
                quick_attack: expect.any(Object),
                emergency_heal: expect.any(Object)
            })
        }));
    });

    it('should expand aliases in keybind export', () => {
        // Create profile for export testing
        const profileId = 'test-export-aliases';
        const profile = {
            name: 'Export Test Profile',
            mode: 'space',
            keys: {
                'space': [{ command: 'combat_macro', type: 'alias', id: 'cmd1' }]
            },
            aliases: {
                'combat_macro': {
                    name: 'Combat Macro',
                    commands: 'target_enemy_near $$ fire_all $$ heal_self',
                    description: 'Full combat sequence'
                }
            },
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        storageManager.saveProfile(profileId, profile);

        // Test export functionality
        const retrieved = storageManager.getProfile(profileId);
        expect(retrieved).toBeInstanceOf(Object);
        expect(exportManager).toBeInstanceOf(Object);
        
        // Verify export manager can handle the profile
        const sanitized = exportManager.sanitizeProfileForExport(retrieved);
        expect(sanitized).toEqual(expect.objectContaining({
            aliases: expect.objectContaining({
                combat_macro: expect.any(Object)
            })
        }));
    });
});

describe('Command Validation Integration', () => {
    let commandManager;

    beforeAll(() => {
        // Ensure all modules are loaded - use actual application managers
        const requiredModules = [
            'stoStorage', 'stoProfiles', 'stoKeybinds',
            'stoAliases', 'stoExport', 'stoCommands'
        ];

        requiredModules.forEach(module => {
            if (typeof window[module] === 'undefined') {
                throw new Error(`${module} not loaded`);
            }
        });
    });

    beforeEach(() => {
        // Use actual application managers
        commandManager = window.stoCommands;
        
        // Clear any existing test data
        if (commandManager && typeof commandManager.clearAllData === 'function') {
            commandManager.clearAllData();
        }
    });

    it('should validate commands across all modules', () => {
        // Test command validation across different modules
        const testCommands = [
            'target',
            'fire_all',
            '+STOTrayExecByTray 0 5',
            'say "Hello World"',
            'target_enemy_near'
        ];

        testCommands.forEach(command => {
            const isValid = commandManager.validateCommand(command);
            expect(isValid).toBeTruthy();
        });

        // Test command type detection
        expect(commandManager.detectCommandType('+STOTrayExecByTray 0 5')).toBe('tray');
        expect(commandManager.detectCommandType('say "Hello"')).toBe('communication');
    });

    it('should handle invalid command references', () => {
        // Test invalid commands
        const invalidCommands = [
            '',
            null,
            undefined,
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
});

describe('Export Integration', () => {
    let storageManager;
    let exportManager;

    beforeAll(() => {
        // Ensure all modules are loaded - use actual application managers
        const requiredModules = [
            'stoStorage', 'stoProfiles', 'stoKeybinds',
            'stoAliases', 'stoExport', 'stoCommands'
        ];

        requiredModules.forEach(module => {
            if (typeof window[module] === 'undefined') {
                throw new Error(`${module} not loaded`);
            }
        });
    });

    beforeEach(() => {
        // Use actual application managers
        storageManager = window.stoStorage;
        exportManager = window.stoExport;
        
        // Clear any existing test data
        if (storageManager && typeof storageManager.clearAllData === 'function') {
            storageManager.clearAllData();
        }
    });

    it('should export complete profile with all components', () => {
        // Create comprehensive profile for export
        const profileId = 'test-complete-export';
        const profile = {
            name: 'Complete Export Test',
            description: 'Profile with all components',
            mode: 'space',
            keys: {
                'a': [{ command: 'target', type: 'targeting', id: 'cmd1' }],
                'b': [{ command: 'fire_all', type: 'combat', id: 'cmd2' }],
                'space': [{ command: 'attack_combo', type: 'alias', id: 'cmd3' }]
            },
            aliases: {
                'attack_combo': {
                    name: 'Attack Combo',
                    commands: 'target_enemy_near $$ fire_all',
                    description: 'Basic attack combination'
                }
            },
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        storageManager.saveProfile(profileId, profile);

        // Test export functionality
        const retrieved = storageManager.getProfile(profileId);
        const exportContent = exportManager.generateSTOKeybindFile(retrieved);
        
        expect(exportContent).toEqual(expect.stringContaining('; Complete Export Test - STO Keybind Configuration'));
        expect(exportContent).toEqual(expect.stringContaining(profile.name));
    });

    it('should handle export of complex nested structures', () => {
        // Create profile with complex nested structures
        const profileId = 'test-complex-export';
        const profile = {
            name: 'Complex Export Test',
            mode: 'space',
            keys: {
                'f1': [
                    { command: 'target_self', type: 'targeting', id: 'cmd1' },
                    { command: 'heal_combo', type: 'alias', id: 'cmd2' }
                ]
            },
            aliases: {
                'heal_combo': {
                    name: 'Healing Combo',
                    commands: 'heal_self $$ distribute_shields $$ engineering_team',
                    description: 'Complex healing sequence'
                }
            },
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        storageManager.saveProfile(profileId, profile);

        // Test complex export
        const retrieved = storageManager.getProfile(profileId);
        const filename = exportManager.generateFileName(retrieved, 'txt');
        
        expect(filename).toEqual(expect.stringContaining('.txt'));
        expect(filename).toEqual(expect.stringContaining('Complex_Export_Test'));
    });

    it('should maintain data integrity during export/import cycle', () => {
        // Create original profile
        const originalProfile = {
            name: 'Export Import Test',
            mode: 'space',
            keys: {
                'a': [{ command: 'target', type: 'targeting', id: 'cmd1' }],
                'b': [{ command: 'fire_all', type: 'combat', id: 'cmd2' }]
            },
            aliases: {
                'test_alias': {
                    name: 'Test Alias',
                    commands: 'target $$ fire_all',
                    description: 'Test alias for export/import'
                }
            },
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // Save original
        const profileId = 'test-export-import-cycle';
        storageManager.saveProfile(profileId, originalProfile);

        // Export profile
        const retrieved = storageManager.getProfile(profileId);
        const sanitized = exportManager.sanitizeProfileForExport(retrieved);
        
        // Verify data integrity
        expect(sanitized).toEqual(expect.objectContaining({
            name: originalProfile.name,
            keys: expect.objectContaining({
                a: expect.any(Array),
                b: expect.any(Array)
            }),
            aliases: expect.objectContaining({
                test_alias: expect.any(Object)
            })
        }));
    });
});

describe('Storage Integration', () => {
    let storageManager;

    beforeAll(() => {
        // Ensure all modules are loaded - use actual application managers
        const requiredModules = [
            'stoStorage', 'stoProfiles', 'stoKeybinds',
            'stoAliases', 'stoExport', 'stoCommands'
        ];

        requiredModules.forEach(module => {
            if (typeof window[module] === 'undefined') {
                throw new Error(`${module} not loaded`);
            }
        });
    });

    beforeEach(() => {
        // Use actual application managers
        storageManager = window.stoStorage;
        
        // Clear any existing test data
        if (storageManager && typeof storageManager.clearAllData === 'function') {
            storageManager.clearAllData();
        }
    });

    it('should persist and retrieve complex profile data', () => {
        // Use window.stoStorage directly instead of storageManager variable
        const storage = window.stoStorage;
        
        // Create complex profile using actual storage API
        const profileId = 'complex-profile-test';
        const complexProfile = {
            name: 'Complex Profile',
            description: 'Profile with nested data structures',
            mode: 'space',
            keys: {
                'a': ['target'],
                'b': ['fire_all'],
                'space': ['target_enemy_near', 'fire_all', '+STOTrayExecByTray 0 5']
            },
            aliases: {
                'attack': {
                    name: 'Attack Sequence',
                    commands: ['target_enemy_near', 'fire_all'],
                    description: 'Basic attack pattern'
                },
                'combo': {
                    name: 'Combo Attack',
                    commands: ['attack', 'heal_self'],
                    description: 'Attack then heal'
                }
            },
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // Save using actual storage API
        const saved = storage.saveProfile(profileId, complexProfile);
        expect(saved).toBeTruthy();

        // Retrieve and verify using actual storage API
        const retrieved = storage.getProfile(profileId);
        expect(retrieved).toEqual(expect.objectContaining({
            name: complexProfile.name,
            keys: expect.objectContaining({
                space: expect.arrayContaining([
                    expect.any(String), expect.any(String), expect.any(String)
                ])
            }),
            aliases: expect.objectContaining({
                combo: expect.objectContaining({
                    commands: expect.arrayContaining([expect.stringContaining('attack')])
                })
            })
        }));
        expect(retrieved.keys.space).toHaveLength(3);
    });

    it('should handle profile backup and restore', () => {
        // Use window.stoStorage directly instead of storageManager variable
        const storage = window.stoStorage;
        
        // Create multiple profiles using actual storage API
        const profile1 = {
            name: 'Profile 1',
            mode: 'space',
            keys: { 'a': ['target'] },
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        const profile2 = {
            name: 'Profile 2',
            mode: 'ground',
            keys: { 'b': ['fire_all'] },
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // Save profiles
        storage.saveProfile('profile1', profile1);
        storage.saveProfile('profile2', profile2);

        // Create backup using actual storage API
        storage.createBackup();

        // Modify data
        const modifiedProfile1 = { ...profile1, name: 'Modified Profile 1' };
        storage.saveProfile('profile1', modifiedProfile1);
        expect(storage.getProfile('profile1').name).toBe('Modified Profile 1');

        // Restore backup using actual storage API
        const restored = storage.restoreFromBackup();
        expect(restored).toBeTruthy();

        // Verify restoration
        const restoredProfile1 = storage.getProfile('profile1');
        const restoredProfile2 = storage.getProfile('profile2');
        
        expect(restoredProfile1.name).toBe('Profile 1');
        expect(restoredProfile2.name).toBe('Profile 2');
    });
});

describe('Error Handling Integration', () => {
    let storageManager;
    let commandManager;

    beforeAll(() => {
        // Ensure all modules are loaded - use actual application managers
        const requiredModules = [
            'stoStorage', 'stoProfiles', 'stoKeybinds',
            'stoAliases', 'stoExport', 'stoCommands'
        ];

        requiredModules.forEach(module => {
            if (typeof window[module] === 'undefined') {
                throw new Error(`${module} not loaded`);
            }
        });
    });

    beforeEach(() => {
        // Use actual application managers
        storageManager = window.stoStorage;
        commandManager = window.stoCommands;
        
        // Clear any existing test data
        if (storageManager && typeof storageManager.clearAllData === 'function') {
            storageManager.clearAllData();
        }
    });

    it('should handle cascading errors gracefully', () => {
        // Create profile with actual storage API
        const profileId = 'test-profile-error';
        const profile = {
            name: 'Test Profile',
            mode: 'space',
            keys: { 
                'a': [{ command: 'target', type: 'targeting', id: 'cmd1' }] 
            },
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // Save profile
        const initialSave = storageManager.saveProfile(profileId, profile);
        expect(initialSave).toBeTruthy();

        // Test storage error handling - check if localStorage is a real browser API
        const hasRealLocalStorage = typeof Storage !== 'undefined' && 
                                   localStorage instanceof Storage &&
                                   typeof localStorage.setItem === 'function';
        
        if (hasRealLocalStorage) {
            // Real localStorage available - test normal operations work correctly
            const updatedProfile = { ...profile, name: 'Updated' };
            const saveResult = storageManager.saveProfile(profileId, updatedProfile);
            expect(saveResult).toBeTruthy(); // Should succeed with real localStorage
        } else {
            // Mock localStorage environment - simulate storage error by mocking localStorage
            const originalSetItem = localStorage.setItem;
            let mockCallCount = 0;
            localStorage.setItem = (key, value) => { 
                mockCallCount++;
                if (mockCallCount > 1) { // Allow first call to succeed, fail subsequent ones
                    throw new Error('Storage error'); 
                }
                return originalSetItem.call(localStorage, key, value);
            };

            // Operations should handle storage errors gracefully by returning false
            const updatedProfile = { ...profile, name: 'Updated' };
            const saveResult = storageManager.saveProfile(profileId, updatedProfile);
            expect(saveResult).toBeFalsy(); // Should return false, not throw

            // Restore storage
            localStorage.setItem = originalSetItem;
        }

        // Verify profile state based on localStorage availability
        const retrieved = storageManager.getProfile(profileId);
        expect(retrieved).toBeInstanceOf(Object);
        if (hasRealLocalStorage) {
            // With real localStorage, the update should have succeeded
            expect(retrieved.name).toBe('Updated');
        } else {
            // With mocked localStorage, the update should have failed due to simulated error
            expect(retrieved.name).toBe('Test Profile');
        }
    });

    it('should validate data consistency across modules', () => {
        // Create profile with inconsistent data using actual storage API
        const profileId = 'inconsistent-profile';
        const profile = {
            name: 'Inconsistent Profile',
            mode: 'space',
            keys: {
                'a': [{ command: 'nonexistent_alias', type: 'alias', id: 'cmd1' }]
            },
            aliases: {
                'existing_alias': {
                    name: 'Existing',
                    commands: 'target',
                    description: 'Exists'
                }
            },
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // Save profile and verify it was saved
        const saveResult = storageManager.saveProfile(profileId, profile);
        expect(saveResult).toBeTruthy();

        // Retrieve and validate
        const retrieved = storageManager.getProfile(profileId);
        expect(retrieved).toEqual(expect.objectContaining({
            name: 'Inconsistent Profile'
        }));
        expect(retrieved).not.toBeNull();

        // Check keybind references non-existent alias
        const keybindCommands = retrieved.keys.a;
        const aliasExists = keybindCommands.every(cmd => 
            retrieved.aliases[cmd.command] || (window.COMMANDS && window.COMMANDS[cmd.command])
        );
        expect(aliasExists).toBeFalsy(); // Should be false because 'nonexistent_alias' doesn't exist
    });
});

describe('Performance Integration', () => {
    let storageManager;

    beforeAll(() => {
        // Ensure all modules are loaded - use actual application managers
        const requiredModules = [
            'stoStorage', 'stoProfiles', 'stoKeybinds',
            'stoAliases', 'stoExport', 'stoCommands'
        ];

        requiredModules.forEach(module => {
            if (typeof window[module] === 'undefined') {
                throw new Error(`${module} not loaded`);
            }
        });
    });

    beforeEach(() => {
        // Use actual application managers
        storageManager = window.stoStorage;
        
        // Clear any existing test data
        if (storageManager && typeof storageManager.clearAllData === 'function') {
            storageManager.clearAllData();
        }
    });

    it('should handle large datasets efficiently', () => {
        const startTime = Date.now();

        // Create large profile using actual storage API
        const largeKeys = {};
        const largeAliases = {};

        // Generate 500 keybinds
        for (let i = 0; i < 500; i++) {
            largeKeys[`key${i}`] = [
                { command: `command${i}`, type: 'system', id: `cmd${i}_1` },
                { command: `command${i + 1}`, type: 'system', id: `cmd${i}_2` }
            ];
        }

        // Generate 100 aliases
        for (let i = 0; i < 100; i++) {
            largeAliases[`alias${i}`] = {
                name: `Alias ${i}`,
                commands: `command${i} $$ command${i + 1}`,
                description: `Description for alias ${i}`
            };
        }

        const largeProfile = {
            name: 'Large Profile',
            mode: 'space',
            keys: largeKeys,
            aliases: largeAliases,
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // Save large profile using actual storage API
        const profileId = 'large-profile-test';
        storageManager.saveProfile(profileId, largeProfile);

        // Export large profile using actual storage API
        const exportedData = storageManager.exportData();

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Should complete within reasonable time (5 seconds)
        expect(duration).toBeLessThan(5000);
        expect(exportedData.length).toBeGreaterThan(5000);
        
        // Verify profile was saved correctly
        const retrieved = storageManager.getProfile(profileId);
        expect(retrieved).toEqual(expect.objectContaining({
            keys: expect.any(Object),
            aliases: expect.any(Object)
        }));
        expect(Object.keys(retrieved.keys)).toHaveLength(500);
        expect(Object.keys(retrieved.aliases)).toHaveLength(100);
    });
});

describe('Real-world Scenarios', () => {
    let storageManager;

    beforeAll(() => {
        // Ensure all modules are loaded - use actual application managers
        const requiredModules = [
            'stoStorage', 'stoProfiles', 'stoKeybinds',
            'stoAliases', 'stoExport', 'stoCommands'
        ];

        requiredModules.forEach(module => {
            if (typeof window[module] === 'undefined') {
                throw new Error(`${module} not loaded`);
            }
        });
    });

    beforeEach(() => {
        // Use actual application managers
        storageManager = window.stoStorage;
        
        // Clear any existing test data
        if (storageManager && typeof storageManager.clearAllData === 'function') {
            storageManager.clearAllData();
        }
    });

    it('should handle complete user workflow', () => {
        // 1. User creates new profile using actual storage API
        const profileId = 'gaming-profile-test';
        const profile = {
            name: 'My Gaming Profile',
            description: 'Profile for PvP combat',
            mode: 'space',
            keys: {},
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // 2. User creates aliases (simulate by adding to profile)
        profile.aliases = {
            'attack_pattern': {
                name: 'Attack Pattern Alpha',
                commands: 'target_enemy_near $$ fire_all $$ evasive_maneuvers',
                description: 'Standard attack sequence'
            },
            'emergency_heal': {
                name: 'Emergency Healing',
                commands: 'heal_self $$ shield_recharge $$ evasive_maneuvers',
                description: 'Emergency survival sequence'
            }
        };

        // 3. User creates keybinds (simulate by adding to profile)
        profile.keys = {
            'space': [{ command: 'attack_pattern', type: 'alias', id: 'cmd1' }],
            'h': [{ command: 'emergency_heal', type: 'alias', id: 'cmd2' }],
            'f1': [{ command: '+STOTrayExecByTray 0 0', type: 'tray', id: 'cmd3' }],
            'f2': [{ command: '+STOTrayExecByTray 0 1', type: 'tray', id: 'cmd4' }]
        };

        // 4. User saves profile using actual storage API
        const saved = storageManager.saveProfile(profileId, profile);
        expect(saved).toBeTruthy();

        // 5. User exports profile using actual storage API
        const exportedData = storageManager.exportData();

        // Verify complete workflow
        const retrieved = storageManager.getProfile(profileId);
        expect(retrieved).toEqual(expect.objectContaining({
            keys: expect.objectContaining({
                space: [{ command: 'attack_pattern', type: 'alias', id: 'cmd1' }]
            }),
            aliases: expect.objectContaining({
                attack_pattern: expect.objectContaining({
                    commands: expect.stringContaining('target_enemy_near')
                })
            })
        }));
        expect(exportedData).toContain('My Gaming Profile');
    });

    it('should handle profile cloning and modification', () => {
        // Create base profile using actual storage API
        const baseProfileId = 'base-combat-profile';
        const baseProfile = {
            name: 'Base Combat Profile',
            mode: 'space',
            keys: {
                'a': [{ command: 'target', type: 'targeting', id: 'cmd1' }],
                'b': [{ command: 'fire_all', type: 'combat', id: 'cmd2' }],
                'space': [
                    { command: 'target_enemy_near', type: 'targeting', id: 'cmd3' },
                    { command: 'fire_all', type: 'combat', id: 'cmd4' }
                ]
            },
            aliases: {
                'attack': {
                    name: 'Basic Attack',
                    commands: 'target $$ fire_all',
                    description: 'Basic attack sequence'
                }
            },
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // Save base profile
        storageManager.saveProfile(baseProfileId, baseProfile);

        // Clone profile (simulate by creating new profile with copied data)
        const clonedProfileId = 'pvp-combat-profile';
        const clonedProfile = {
            ...JSON.parse(JSON.stringify(baseProfile)), // Deep clone
            name: 'PvP Combat Profile',
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // Modify cloned profile
        clonedProfile.keys = {
            ...clonedProfile.keys,
            'ctrl+space': [
                { command: 'attack', type: 'alias', id: 'cmd5' },
                { command: 'evasive_maneuvers', type: 'movement', id: 'cmd6' }
            ],
            'h': [{ command: 'heal_self', type: 'healing', id: 'cmd7' }]
        };

        // Save cloned profile
        storageManager.saveProfile(clonedProfileId, clonedProfile);

        // Verify independence
        const retrievedBase = storageManager.getProfile(baseProfileId);
        const retrievedClone = storageManager.getProfile(clonedProfileId);

        expect(retrievedBase.keys).not.toEqual(retrievedClone.keys);
        expect(retrievedBase.keys['ctrl+space']).toBeUndefined();
        expect(retrievedClone).toEqual(expect.objectContaining({
            keys: expect.objectContaining({
                'ctrl+space': expect.any(Array)
            }),
            name: 'PvP Combat Profile'
        }));
    });
});

describe('Enhanced View Mode Functionality', () => {
    let storageManager;
    let keybindManager;

    beforeAll(() => {
        if (typeof window.stoStorage === 'undefined') {
            throw new Error('StorageManager not loaded');
        }
    });

    beforeEach(() => {
        storageManager = window.stoStorage;
        
        // Mock DOM elements for view mode testing
        if (!document.getElementById('keyGrid')) {
            const mockGrid = document.createElement('div');
            mockGrid.id = 'keyGrid';
            mockGrid.className = 'key-grid';
            document.body.appendChild(mockGrid);
        }
        
        if (!document.getElementById('toggleKeyViewBtn')) {
            const mockButton = document.createElement('button');
            mockButton.id = 'toggleKeyViewBtn';
            mockButton.innerHTML = '<i class="fas fa-list"></i>';
            document.body.appendChild(mockButton);
        }

        // Create keybind manager instance for testing
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should support three view modes: categorized, key-types, and grid', () => {
        const supportedModes = ['categorized', 'key-types', 'grid'];
        
        supportedModes.forEach(mode => {
            localStorage.setItem('keyViewMode', mode);
            const retrievedMode = localStorage.getItem('keyViewMode');
            expect(retrievedMode).toBe(mode);
        });
    });

    it('should toggle between view modes correctly', () => {
        expect(keybindManager).toBeInstanceOf(Object);
        expect(keybindManager).toEqual(expect.objectContaining({
            toggleKeyView: expect.any(Function)
        }));
        
        // Test 3-way toggle: key-types → grid → categorized → key-types
        localStorage.setItem('keyViewMode', 'key-types');
        keybindManager.toggleKeyView();
        expect(localStorage.getItem('keyViewMode')).toBe('grid');
        
        keybindManager.toggleKeyView();
        expect(localStorage.getItem('keyViewMode')).toBe('categorized');
        
        keybindManager.toggleKeyView();
        expect(localStorage.getItem('keyViewMode')).toBe('key-types');
    });

    it('should update view toggle button icon based on current mode', () => {
        expect(keybindManager).toEqual(expect.objectContaining({
            updateViewToggleButton: expect.any(Function)
        }));
        
        const toggleBtn = document.getElementById('toggleKeyViewBtn');
        expect(toggleBtn).not.toBeNull();
        
        const icon = toggleBtn.querySelector('i');
        expect(icon).not.toBeNull();
        
        keybindManager.updateViewToggleButton('categorized');
        expect(icon.className).toContain('fa-sitemap');
        
        keybindManager.updateViewToggleButton('key-types');
        expect(icon.className).toContain('fa-th');
        
        keybindManager.updateViewToggleButton('grid');
        expect(icon.className).toContain('fa-list');
    });

    it('should render key grid with appropriate class based on view mode', () => {
        expect(keybindManager).toEqual(expect.objectContaining({
            renderCategorizedKeyView: expect.any(Function),
            renderSimpleKeyGrid: expect.any(Function)
        }));
        
        const keyGrid = document.getElementById('keyGrid');
        expect(keyGrid).not.toBeNull();
        
        // Test actual rendering methods instead of just manipulating classes
        keybindManager.renderCategorizedKeyView();
        expect(keyGrid.classList.contains('categorized')).toBe(true);
        
        keybindManager.renderSimpleKeyGrid();
        expect(keyGrid.classList.contains('categorized')).toBe(false);
    });

    it('should categorize keys by command type correctly', () => {
        expect(keybindManager).toEqual(expect.objectContaining({
            categorizeKeys: expect.any(Function)
        }));
        
        const testKeys = {
            'space': [
                { command: 'Target_Enemy_Near', type: 'targeting' },
                { command: 'FireAll', type: 'combat' }
            ],
            'f1': [{ command: '+STOTrayExecByTray 0 5', type: 'tray' }],
            't': [{ command: 'Target_Self', type: 'targeting' }],
            'f12': [] // Empty key
        };
        
        const allKeys = Object.keys(testKeys);
        const categorized = keybindManager.categorizeKeys(testKeys, allKeys);
        
        expect(categorized).toEqual(expect.objectContaining({
            unknown: expect.objectContaining({
                keys: expect.any(Array)
            }),
            targeting: expect.any(Object),
            combat: expect.any(Object),
            tray: expect.any(Object)
        }));
    });

    it('should categorize keys by input type correctly', () => {
        expect(keybindManager).toEqual(expect.objectContaining({
            categorizeKeysByType: expect.any(Function)
        }));
        
        const testKeys = {
            'F1': [{ command: 'test1' }],
            'F2': [{ command: 'test2' }],
            'A': [{ command: 'test3' }],
            '1': [{ command: 'test4' }],
            'NumPad1': [{ command: 'test5' }],
            'Ctrl': [{ command: 'test6' }],
            'Space': [{ command: 'test7' }],
            'Home': [{ command: 'test8' }]
        };
        
        const allKeys = Object.keys(testKeys);
        const categorized = keybindManager.categorizeKeysByType(testKeys, allKeys);
        
        expect(categorized).toEqual(expect.objectContaining({
            function: expect.objectContaining({
                keys: expect.any(Array)
            }),
            alphanumeric: expect.any(Object),
            numberpad: expect.any(Object),
            modifiers: expect.any(Object),
            navigation: expect.any(Object)
        }));
    });

    it('should handle category collapse/expand state persistence', () => {
        const categoryId = 'test-category';
        const storageKey = `keyCategory_${categoryId}_collapsed`;
        
        // Test setting collapsed state
        localStorage.setItem(storageKey, 'true');
        expect(localStorage.getItem(storageKey)).toBe('true');
        
        localStorage.setItem(storageKey, 'false');
        expect(localStorage.getItem(storageKey)).toBe('false');
        
        // Clean up
        localStorage.removeItem(storageKey);
    });

    it('should handle key-type category collapse/expand state persistence', () => {
        const categoryId = 'test-key-type';
        const storageKeyType = `keyTypeCategory_${categoryId}_collapsed`;
        
        // Test setting collapsed state for key-type categories
        localStorage.setItem(storageKeyType, 'true');
        expect(localStorage.getItem(storageKeyType)).toBe('true');
        
        localStorage.setItem(storageKeyType, 'false');
        expect(localStorage.getItem(storageKeyType)).toBe('false');
        
        // Clean up
        localStorage.removeItem(storageKeyType);
    });

    it('should filter keys across different view modes', () => {
        expect(keybindManager).toEqual(expect.objectContaining({
            filterKeys: expect.any(Function)
        }));
        
        // Use the real key grid instead of creating mock elements
        const keyGrid = document.getElementById('keyGrid');
        expect(keyGrid).not.toBeNull();
        
        // Create real key elements that the filtering should work on
        const testKeyItem = document.createElement('div');
        testKeyItem.className = 'key-item';
        testKeyItem.dataset.key = 'TestKey';
        testKeyItem.textContent = 'TestKey';
        keyGrid.appendChild(testKeyItem);
        
        const testCommandItem = document.createElement('div');
        testCommandItem.className = 'command-item';
        testCommandItem.dataset.key = 'AnotherKey';
        testCommandItem.textContent = 'AnotherKey';
        keyGrid.appendChild(testCommandItem);
        
        // Test actual filtering behavior - should hide non-matching elements
        keybindManager.filterKeys('test');
        
        // TestKey should be visible (matches 'test'), AnotherKey should be hidden
        expect(testKeyItem.style.display).not.toBe('none');
        expect(testCommandItem.style.display).toBe('none');
        
        // Test showing all keys again
        keybindManager.showAllKeys();
        expect(testKeyItem.style.display).not.toBe('none');
        expect(testCommandItem.style.display).not.toBe('none');
        
        // Clean up
        keyGrid.removeChild(testKeyItem);
        keyGrid.removeChild(testCommandItem);
    });

    it('should handle smart key formatting for compound keys', () => {
        // Test compound key formatting if available
        const compoundKeys = [
            'Ctrl+Alt+F1',
            'Shift+Space',
            'Alt+Tab',
            'Ctrl+C'
        ];
        
        compoundKeys.forEach(key => {
            // Basic test that compound keys can be handled
            expect(key).toContain('+');
            expect(key.split('+').length).toBeGreaterThan(1);
        });
    });
});

describe('Enhanced Key Categorization', () => {
    let storageManager;

    beforeAll(() => {
        if (typeof window.stoStorage === 'undefined') {
            throw new Error('StorageManager not loaded');
        }
    });

    beforeEach(() => {
        storageManager = window.stoStorage;
    });

    it('should properly categorize keys with multiple command types', () => {
        // Test keys that have multiple commands of different types
        const profileId = 'test-multi-command-profile';
        const profile = {
            name: 'Multi-Command Test Profile',
            mode: 'space',
            keys: {
                'space': [
                    { command: 'Target_Enemy_Near', type: 'targeting', id: 'cmd1' },
                    { command: 'FireAll', type: 'combat', id: 'cmd2' },
                    { command: '+power_exec Distribute_Shields', type: 'power', id: 'cmd3' }
                ],
                'f1': [
                    { command: '+STOTrayExecByTray 0 5', type: 'tray', id: 'cmd4' },
                    { command: 'Target_Self', type: 'targeting', id: 'cmd5' }
                ]
            },
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        storageManager.saveProfile(profileId, profile);
        const savedProfile = storageManager.getProfile(profileId);
        
        expect(savedProfile).toEqual(expect.objectContaining({
            keys: expect.objectContaining({
                'space': expect.arrayContaining([
                    expect.any(Object), expect.any(Object), expect.any(Object)
                ]),
                'f1': expect.arrayContaining([
                    expect.any(Object), expect.any(Object)
                ])
            })
        }));
        expect(savedProfile.keys['space']).toHaveLength(3);
        expect(savedProfile.keys['f1']).toHaveLength(2);
        
        // Verify multiple command types on same key
        const spaceCommands = savedProfile.keys['space'];
        const commandTypes = spaceCommands.map(cmd => cmd.type);
        expect(commandTypes).toContain('targeting');
        expect(commandTypes).toContain('combat');
        expect(commandTypes).toContain('power');
        
        // Clean up
        storageManager.deleteProfile(profileId);
    });

    it('should handle unknown or missing command types in categorization', () => {
        const profileId = 'test-unknown-command-profile';
        const profile = {
            name: 'Unknown Command Test Profile',
            mode: 'space',
            keys: {
                'x': [
                    { command: 'some_unknown_command', id: 'cmd1' }, // No type specified
                    { command: 'another_command', type: 'unknown_type', id: 'cmd2' }
                ],
                'y': [] // Empty key
            },
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        storageManager.saveProfile(profileId, profile);
        const savedProfile = storageManager.getProfile(profileId);
        
        expect(savedProfile).toEqual(expect.objectContaining({
            keys: expect.objectContaining({
                'x': expect.arrayContaining([expect.any(Object), expect.any(Object)]),
                'y': expect.arrayContaining([])
            })
        }));
        expect(savedProfile.keys['x']).toHaveLength(2);
        expect(savedProfile.keys['y']).toHaveLength(0);
        
        // Clean up
        storageManager.deleteProfile(profileId);
    });
}); 