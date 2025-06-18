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
            expect(Array.isArray(window.COMMAND_CATEGORIES)).toBe(true);
        expect(window.COMMAND_CATEGORIES.length).toBeGreaterThan(0);
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
                expect(typeof category.name).toBe('string');
                expect(category.name.length).toBeGreaterThan(0);
                expect(typeof category.icon).toBe('string');
                expect(typeof category.icon).toBe('string');
                expect(typeof category.description).toBe('string');
                expect(category.description.length).toBeGreaterThan(0);
            });
        });
    });

    describe('Commands', () => {
        it('should have commands defined', () => {
                    expect(window.COMMANDS).toBeInstanceOf(Object);
        expect(Object.keys(window.COMMANDS).length).toBeGreaterThan(0);
        });

        it('should have valid command structures', () => {
            Object.entries(window.COMMANDS).forEach(([key, command]) => {
                expect(command).toBeInstanceOf(Object);
                expect(command).toEqual(expect.objectContaining({
                    name: expect.any(String),
                    category: expect.any(String),
                    description: expect.any(String),
                    syntax: expect.any(String)
                }));
                expect(window.COMMAND_CATEGORIES[command.category]).not.toBeUndefined();
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
                    expect(window.KEY_LAYOUTS).toBeInstanceOf(Object);
        expect(Object.keys(window.KEY_LAYOUTS).length).toBeGreaterThan(0);
        });

        it('should have standard QWERTY layout', () => {
                    expect(window.KEY_LAYOUTS.qwerty).toEqual(expect.objectContaining({
            name: 'QWERTY',
            rows: expect.any(Array)
        }));
        expect(window.KEY_LAYOUTS.qwerty.rows.length).toBeGreaterThan(0);
        });

        it('should have valid key layout structures', () => {
            Object.entries(window.KEY_LAYOUTS).forEach(([key, layout]) => {
                expect(layout).toBeInstanceOf(Object);
                expect(typeof layout.name).toBe('string');
                expect(layout.name.length).toBeGreaterThan(0);
                expect(layout.rows).toBeInstanceOf(Array);
                
                layout.rows.forEach(row => {
                    expect(row).toBeInstanceOf(Array);
                    row.forEach(keyData => {
                        expect(keyData).toEqual(expect.objectContaining({
                            key: expect.any(String),
                            display: expect.any(String)
                        }));
                    });
                });
            });
        });
    });

    describe('Default Settings', () => {
        it('should have default settings defined', () => {
                    expect(window.DEFAULT_SETTINGS).toBeInstanceOf(Object);
        expect(window.DEFAULT_SETTINGS).not.toBeNull();
        });

        it('should have valid default settings structure', () => {
            const settings = window.DEFAULT_SETTINGS;
            
            expect(settings).toEqual(expect.objectContaining({
                keyLayout: expect.any(String),
                autoSave: expect.any(Boolean),
                showTooltips: expect.any(Boolean),
                exportFormat: expect.any(String)
            }));
            expect(window.KEY_LAYOUTS[settings.keyLayout]).not.toBeUndefined();
        });
    });

    describe('Sample Data', () => {
        it('should have sample profiles defined', () => {
                    expect(Array.isArray(window.SAMPLE_PROFILES)).toBe(true);
        expect(window.SAMPLE_PROFILES.length).toBeGreaterThan(0);
        });

        it('should have valid sample profile structures', () => {
            window.SAMPLE_PROFILES.forEach(profile => {
                expect(profile).toEqual(expect.objectContaining({
                    id: expect.any(String),
                    name: expect.any(String),
                    description: expect.any(String),
                    keybinds: expect.any(Object),
                    aliases: expect.any(Object),
                    created: expect.anything(),
                    modified: expect.anything()
                }));
            });
        });

        it('should have sample aliases defined', () => {
                    expect(window.SAMPLE_ALIASES).toBeInstanceOf(Object);
        expect(Object.keys(window.SAMPLE_ALIASES).length).toBeGreaterThan(0);
        });

        it('should have valid sample alias structures', () => {
            Object.entries(window.SAMPLE_ALIASES).forEach(([key, alias]) => {
                expect(alias).toEqual(expect.objectContaining({
                    name: expect.any(String),
                    commands: expect.any(Array),
                    description: expect.any(String)
                }));
                expect(alias.commands.length).toBeGreaterThan(0);
            });
        });
    });

describe('Camera Commands Category', () => {
    it('should have camera commands category', () => {
        if (window.STO_DATA && window.STO_DATA.commands) {
            expect(window.STO_DATA.commands.camera).toEqual(expect.objectContaining({
                name: 'Camera',
                icon: expect.any(String),
                description: expect.any(String),
                commands: expect.any(Object)
            }));
        }
    });

    it('should have essential camera commands', () => {
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.camera) {
            const cameraCommands = window.STO_DATA.commands.camera.commands;
            
            // Check for basic camera commands
            expect(cameraCommands).toEqual(expect.objectContaining({
                zoom_in: expect.any(Object),
                zoom_out: expect.any(Object),
                cam_reset: expect.any(Object)
            }));
            
            // Verify command structure
            if (cameraCommands.zoom_in) {
                expect(cameraCommands.zoom_in).toEqual(expect.objectContaining({
                    name: expect.any(String),
                    command: expect.any(String),
                    description: expect.any(String),
                    icon: expect.any(String)
                }));
            }
        }
    });

    it('should have parameterized camera commands', () => {
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.camera) {
            const cameraCommands = window.STO_DATA.commands.camera.commands;
            
            // Check for parameterized camera distance command
            if (cameraCommands.cam_distance) {
                expect(cameraCommands.cam_distance).toEqual(expect.objectContaining({
                    customizable: true,
                    parameters: expect.objectContaining({
                        distance: expect.objectContaining({
                            type: 'number',
                            min: expect.any(Number),
                            max: expect.any(Number),
                            default: expect.any(Number)
                        })
                    })
                }));
            }
        }
    });
});

describe('Shield Management Category Updates', () => {
    it('should rename power category to Shield Management', () => {
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.power) {
            expect(window.STO_DATA.commands.power.name).toBe('Shield Management');
            expect(window.STO_DATA.commands.power.icon).toContain('shield');
        }
    });

    it('should have shield management commands with warnings', () => {
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.power) {
            const powerCommands = window.STO_DATA.commands.power.commands;
            
            // Check distribute shields command
            if (powerCommands.distribute_shields) {
                expect(powerCommands.distribute_shields).toEqual(expect.objectContaining({
                    name: 'Distribute Shields',
                    warning: expect.stringContaining('Not recommended on spam bars')
                }));
            }
            
            // Check shield rerouting commands
            expect(powerCommands).toEqual(expect.objectContaining({
                reroute_shields_rear: expect.any(Object),
                reroute_shields_left: expect.any(Object),
                reroute_shields_right: expect.any(Object)
            }));
        }
    });
});

describe('Command Warning System Data', () => {
    it('should have warnings for combat commands', () => {
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.combat) {
            const combatCommands = window.STO_DATA.commands.combat.commands;
            
            // Check that combat commands have appropriate warnings
            const warningCommands = ['fire_all', 'fire_phasers', 'fire_torps', 'fire_mines', 'fire_phasers_torps', 'fire_projectiles'];
            
            warningCommands.forEach(commandKey => {
                if (combatCommands[commandKey]) {
                    expect(combatCommands[commandKey]).toEqual(expect.objectContaining({
                        warning: expect.stringContaining('Not recommended on spam bars')
                    }));
                }
            });
        }
    });

    it('should have warnings for shield management commands', () => {
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.power) {
            const powerCommands = window.STO_DATA.commands.power.commands;
            
            // Check that distribute shields has warning
            if (powerCommands.distribute_shields) {
                expect(powerCommands.distribute_shields).toEqual(expect.objectContaining({
                    warning: expect.stringContaining('Not recommended on spam bars')
                }));
            }
        }
    });

    it('should not have warnings for safe commands', () => {
        if (window.STO_DATA && window.STO_DATA.commands) {
            // Targeting commands should generally not have warnings
            if (window.STO_DATA.commands.targeting) {
                const targetingCommands = window.STO_DATA.commands.targeting.commands;
                
                Object.values(targetingCommands).forEach(command => {
                    if (command) {
                        expect(command.warning).toBeUndefined();
                    }
                });
            }
        }
    });
});

describe('Parameterized Command Data Structure', () => {
    it('should have proper parameterized command definitions', () => {
        if (window.STO_DATA && window.STO_DATA.commands) {
            const categories = window.STO_DATA.commands;
            
            // Look for parameterized commands across categories
            Object.entries(categories).forEach(([categoryId, category]) => {
                if (category.commands) {
                    Object.entries(category.commands).forEach(([commandId, command]) => {
                        if (command.customizable) {
                            expect(command).toEqual(expect.objectContaining({
                                parameters: expect.any(Object)
                            }));
                            
                            // Verify parameter structure
                            Object.entries(command.parameters).forEach(([paramName, paramDef]) => {
                                expect(paramDef).toEqual(expect.objectContaining({
                                    type: expect.stringMatching(/^(text|number|boolean)$/),
                                    default: expect.anything()
                                }));
                                
                                if (paramDef.type === 'number') {
                                    expect(paramDef).toEqual(expect.objectContaining({
                                        min: expect.any(Number),
                                        max: expect.any(Number)
                                    }));
                                }
                            });
                        }
                    });
                }
            });
        }
    });

    it('should have movement command parameters', () => {
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.movement) {
            const movementCommands = window.STO_DATA.commands.movement.commands;
            
            // Check for throttle adjustment parameters
            if (movementCommands.throttle_adjust) {
                expect(movementCommands.throttle_adjust).toEqual(expect.objectContaining({
                    customizable: true,
                    parameters: expect.objectContaining({
                        amount: expect.objectContaining({
                            type: 'number',
                            min: -1,
                            max: 1
                        })
                    })
                }));
            }
            
            // Check for throttle set parameters
            if (movementCommands.throttle_set) {
                expect(movementCommands.throttle_set).toEqual(expect.objectContaining({
                    customizable: true,
                    parameters: expect.objectContaining({
                        position: expect.any(Object)
                    })
                }));
            }
        }
    });

    it('should have system command parameters', () => {
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.system) {
            const systemCommands = window.STO_DATA.commands.system.commands;
            
            // Check for bind file parameters
            if (systemCommands.bind_save_file) {
                expect(systemCommands.bind_save_file).toEqual(expect.objectContaining({
                    customizable: true,
                    parameters: expect.objectContaining({
                        filename: expect.any(Object)
                    })
                }));
            }
            
            if (systemCommands.bind_load_file) {
                expect(systemCommands.bind_load_file).toEqual(expect.objectContaining({
                    customizable: true,
                    parameters: expect.objectContaining({
                        filename: expect.any(Object)
                    })
                }));
            }
            
            // Check for combat log parameters
            if (systemCommands.combat_log) {
                expect(systemCommands.combat_log).toEqual(expect.objectContaining({
                    customizable: true,
                    parameters: expect.objectContaining({
                        state: expect.any(Object)
                    })
                }));
                
                const stateParam = systemCommands.combat_log.parameters.state;
                expect(stateParam.type).toBe('number');
                expect(stateParam.min).toBe(0);
                expect(stateParam.max).toBe(1);
            }
        }
    });
});

describe('Communication Command Structure', () => {
    it('should have communication commands with message parameters', () => {
        if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.communication) {
            const commCommands = window.STO_DATA.commands.communication.commands;
            
            // Check for message-based commands
            Object.values(commCommands).forEach(command => {
                if (command && command.customizable) {
                    expect(command).toEqual(expect.objectContaining({
                        parameters: expect.objectContaining({
                            message: expect.objectContaining({
                                type: 'string'
                            })
                        })
                    }));
                }
            });
        }
    });
});

    describe('Tray Configuration', () => {
        it('should have tray configuration defined', () => {
                    expect(window.TRAY_CONFIG).toBeInstanceOf(Object);
        expect(window.TRAY_CONFIG).not.toBeNull();
        });

        it('should have valid tray configuration structure', () => {
            const config = window.TRAY_CONFIG;
            
            expect(config).toEqual(expect.objectContaining({
                maxTrays: expect.any(Number),
                slotsPerTray: expect.any(Number),
                defaultTray: expect.any(Number)
            }));
            
            expect(config.maxTrays).toBeGreaterThan(0);
            expect(config.slotsPerTray).toBeGreaterThan(0);
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

    describe('Camera Commands Category', () => {
        it('should have camera commands category', () => {
            if (window.STO_DATA && window.STO_DATA.commands) {
                expect(window.STO_DATA.commands.camera).toEqual(expect.objectContaining({
                    name: 'Camera',
                    icon: expect.any(String),
                    description: expect.any(String),
                    commands: expect.any(Object)
                }));
            }
        });

        it('should have essential camera commands', () => {
            if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.camera) {
                const cameraCommands = window.STO_DATA.commands.camera.commands;
                
                // Check for basic camera commands
                expect(cameraCommands).toEqual(expect.objectContaining({
                    zoom_in: expect.any(Object),
                    zoom_out: expect.any(Object),
                    cam_reset: expect.any(Object)
                }));
                
                // Verify command structure
                if (cameraCommands.zoom_in) {
                    expect(cameraCommands.zoom_in).toEqual(expect.objectContaining({
                        name: expect.any(String),
                        command: expect.any(String),
                        description: expect.any(String),
                        icon: expect.any(String)
                    }));
                }
            }
        });

        it('should have parameterized camera commands', () => {
            if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.camera) {
                const cameraCommands = window.STO_DATA.commands.camera.commands;
                
                // Check for parameterized camera distance command
                if (cameraCommands.cam_distance) {
                    expect(cameraCommands.cam_distance).toEqual(expect.objectContaining({
                        customizable: true,
                        parameters: expect.objectContaining({
                            distance: expect.objectContaining({
                                type: 'number',
                                min: expect.any(Number),
                                max: expect.any(Number),
                                default: expect.any(Number)
                            })
                        })
                    }));
                }
            }
        });
    });

    describe('Shield Management Category Updates', () => {
        it('should rename power category to Shield Management', () => {
            if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.power) {
                expect(window.STO_DATA.commands.power.name).toBe('Shield Management');
                expect(window.STO_DATA.commands.power.icon).toContain('shield');
            }
        });

        it('should have shield management commands with warnings', () => {
            if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.power) {
                const powerCommands = window.STO_DATA.commands.power.commands;
                
                // Check distribute shields command
                if (powerCommands.distribute_shields) {
                    expect(powerCommands.distribute_shields).toEqual(expect.objectContaining({
                        name: 'Distribute Shields',
                        warning: expect.stringContaining('Not recommended on spam bars')
                    }));
                }
                
                // Check shield rerouting commands
                expect(powerCommands).toEqual(expect.objectContaining({
                    reroute_shields_rear: expect.any(Object),
                    reroute_shields_left: expect.any(Object),
                    reroute_shields_right: expect.any(Object)
                }));
            }
        });
    });

    describe('Command Warning System Data', () => {
        it('should have warnings for combat commands', () => {
            if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.combat) {
                const combatCommands = window.STO_DATA.commands.combat.commands;
                
                // Check that combat commands have appropriate warnings
                const warningCommands = ['fire_all', 'fire_phasers', 'fire_torps', 'fire_mines', 'fire_phasers_torps', 'fire_projectiles'];
                
                warningCommands.forEach(commandKey => {
                    if (combatCommands[commandKey]) {
                        expect(combatCommands[commandKey]).toEqual(expect.objectContaining({
                            warning: expect.stringContaining('Not recommended on spam bars')
                        }));
                    }
                });
            }
        });

        it('should have warnings for shield management commands', () => {
            if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.power) {
                const powerCommands = window.STO_DATA.commands.power.commands;
                
                // Check that distribute shields has warning
                if (powerCommands.distribute_shields) {
                    expect(powerCommands.distribute_shields).toEqual(expect.objectContaining({
                        warning: expect.stringContaining('Not recommended on spam bars')
                    }));
                }
            }
        });

        it('should not have warnings for safe commands', () => {
            if (window.STO_DATA && window.STO_DATA.commands) {
                // Targeting commands should generally not have warnings
                if (window.STO_DATA.commands.targeting) {
                    const targetingCommands = window.STO_DATA.commands.targeting.commands;
                    
                    Object.values(targetingCommands).forEach(command => {
                        if (command) {
                            expect(command.warning).toBeUndefined();
                        }
                    });
                }
            }
        });
    });

    describe('Parameterized Command Data Structure', () => {
        it('should have proper parameterized command definitions', () => {
            if (window.STO_DATA && window.STO_DATA.commands) {
                const categories = window.STO_DATA.commands;
                
                // Look for parameterized commands across categories
                Object.entries(categories).forEach(([categoryId, category]) => {
                    if (category.commands) {
                                            Object.entries(category.commands).forEach(([commandId, command]) => {
                        if (command.customizable) {
                            expect(command).toEqual(expect.objectContaining({
                                parameters: expect.any(Object)
                            }));
                            
                            // Verify parameter structure
                            Object.entries(command.parameters).forEach(([paramName, paramDef]) => {
                                expect(paramDef).toEqual(expect.objectContaining({
                                    type: expect.stringMatching(/^(text|number|boolean)$/),
                                    default: expect.anything()
                                }));
                                
                                if (paramDef.type === 'number') {
                                    expect(paramDef).toEqual(expect.objectContaining({
                                        min: expect.any(Number),
                                        max: expect.any(Number)
                                    }));
                                }
                            });
                        }
                    });
                    }
                });
            }
        });

        it('should have movement command parameters', () => {
            if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.movement) {
                const movementCommands = window.STO_DATA.commands.movement.commands;
                
                // Check for throttle adjustment parameters
                if (movementCommands.throttle_adjust) {
                    expect(movementCommands.throttle_adjust).toEqual(expect.objectContaining({
                        customizable: true,
                        parameters: expect.objectContaining({
                            amount: expect.objectContaining({
                                type: 'number',
                                min: -1,
                                max: 1
                            })
                        })
                    }));
                }
                
                // Check for throttle set parameters
                if (movementCommands.throttle_set) {
                    expect(movementCommands.throttle_set).toEqual(expect.objectContaining({
                        customizable: true,
                        parameters: expect.objectContaining({
                            position: expect.any(Object)
                        })
                    }));
                }
            }
        });

        it('should have system command parameters', () => {
            if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.system) {
                const systemCommands = window.STO_DATA.commands.system.commands;
                
                // Check for bind file parameters
                if (systemCommands.bind_save_file) {
                    expect(systemCommands.bind_save_file).toEqual(expect.objectContaining({
                        customizable: true,
                        parameters: expect.objectContaining({
                            filename: expect.any(Object)
                        })
                    }));
                }
                
                if (systemCommands.bind_load_file) {
                    expect(systemCommands.bind_load_file).toEqual(expect.objectContaining({
                        customizable: true,
                        parameters: expect.objectContaining({
                            filename: expect.any(Object)
                        })
                    }));
                }
                
                // Check for combat log parameters
                if (systemCommands.combat_log) {
                    expect(systemCommands.combat_log).toEqual(expect.objectContaining({
                        customizable: true,
                        parameters: expect.objectContaining({
                            state: expect.objectContaining({
                                type: 'number',
                                min: 0,
                                max: 1
                            })
                        })
                    }));
                }
            }
        });
    });

    describe('Communication Command Structure', () => {
        it('should have communication commands with message parameters', () => {
            if (window.STO_DATA && window.STO_DATA.commands && window.STO_DATA.commands.communication) {
                const commCommands = window.STO_DATA.commands.communication.commands;
                
                // Check for message-based commands
                Object.values(commCommands).forEach(command => {
                    if (command && command.customizable) {
                        expect(command).toEqual(expect.objectContaining({
                            parameters: expect.objectContaining({
                                message: expect.objectContaining({
                                    type: 'text'
                                })
                            })
                        }));
                    }
                });
            }
        });
    });
}); 