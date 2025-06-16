// STO Tools Keybind Manager - Data Layer
// Contains all command definitions, templates, and default configurations

const STO_DATA = {
    // Command categories and definitions
    commands: {
        targeting: {
            name: "Targeting",
            icon: "fas fa-crosshairs",
            description: "Target selection and management",
            commands: {
                target: {
                    name: "Target by Name",
                    command: "Target",
                    description: "Target entity by name (requires quotes)",
                    syntax: "Target \"EntityName\"",
                    icon: "🎯"
                },
                target_enemy_near: {
                    name: "Target Nearest Enemy",
                    command: "Target_Enemy_Near",
                    description: "Target the nearest enemy in view",
                    syntax: "Target_Enemy_Near",
                    icon: "🎯"
                },
                target_friend_near: {
                    name: "Target Nearest Friend",
                    command: "Target_Friend_Near", 
                    description: "Target the nearest friendly entity",
                    syntax: "Target_Friend_Near",
                    icon: "🤝"
                },
                target_self: {
                    name: "Target Self",
                    command: "Target_Self",
                    description: "Target your own ship/character",
                    syntax: "Target_Self",
                    icon: "👤"
                },
                target_clear: {
                    name: "Clear Target",
                    command: "Target_Clear",
                    description: "Remove current target lock",
                    syntax: "Target_Clear",
                    icon: "❌"
                },
                target_teammate_1: {
                    name: "Target Teammate 1",
                    command: "Target_Teammate 1",
                    description: "Target first team member",
                    syntax: "Target_Teammate 1",
                    icon: "👥"
                },
                target_teammate_2: {
                    name: "Target Teammate 2", 
                    command: "Target_Teammate 2",
                    description: "Target second team member",
                    syntax: "Target_Teammate 2",
                    icon: "👥"
                },
                target_teammate_3: {
                    name: "Target Teammate 3",
                    command: "Target_Teammate 3", 
                    description: "Target third team member",
                    syntax: "Target_Teammate 3",
                    icon: "👥"
                },
                target_teammate_4: {
                    name: "Target Teammate 4",
                    command: "Target_Teammate 4",
                    description: "Target fourth team member",
                    syntax: "Target_Teammate 4", 
                    icon: "👥"
                }
            }
        },

        combat: {
            name: "Combat",
            icon: "fas fa-fire",
            description: "Weapon firing and combat actions",
            commands: {
                fire_all: {
                    name: "Fire All Weapons",
                    command: "FireAll",
                    description: "Fire all equipped weapons",
                    syntax: "FireAll",
                    icon: "🔥"
                },
                fire_phasers: {
                    name: "Fire Energy Weapons",
                    command: "FirePhasers",
                    description: "Fire energy weapons only",
                    syntax: "FirePhasers",
                    icon: "⚡"
                },
                fire_torps: {
                    name: "Fire Torpedoes",
                    command: "FireTorps", 
                    description: "Fire torpedo weapons only",
                    syntax: "FireTorps",
                    icon: "🚀"
                },
                fire_phasers_torps: {
                    name: "Fire Phasers & Torpedoes",
                    command: "FirePhasersTorps",
                    description: "Fire energy weapons and torpedoes",
                    syntax: "FirePhasersTorps",
                    icon: "💥"
                }
            }
        },

        tray: {
            name: "Tray Execution",
            icon: "fas fa-th",
            description: "Execute abilities from action trays",
            commands: {
                custom_tray: {
                    name: "Custom Tray Execution",
                    command: "+STOTrayExecByTray 0 0",
                    description: "Execute specific tray slot",
                    syntax: "+STOTrayExecByTray <tray> <slot>",
                    icon: "⚡",
                    customizable: true,
                    parameters: {
                        tray: { type: "number", min: 0, max: 9, default: 0 },
                        slot: { type: "number", min: 0, max: 9, default: 0 }
                    }
                }
            }
        },

        power: {
            name: "Power Management", 
            icon: "fas fa-battery-three-quarters",
            description: "Ship power and system management",
            commands: {
                distribute_shields: {
                    name: "Distribute Shields",
                    command: "+power_exec Distribute_Shields",
                    description: "Distribute shield power evenly",
                    syntax: "+power_exec Distribute_Shields",
                    icon: "🛡️"
                },
                emergency_power_shields: {
                    name: "Emergency to Shields",
                    command: "+power_exec Emergency_Power_to_Shields",
                    description: "Emergency power to shield systems",
                    syntax: "+power_exec Emergency_Power_to_Shields",
                    icon: "🔋"
                },
                emergency_power_weapons: {
                    name: "Emergency to Weapons",
                    command: "+power_exec Emergency_Power_to_Weapons", 
                    description: "Emergency power to weapon systems",
                    syntax: "+power_exec Emergency_Power_to_Weapons",
                    icon: "⚡"
                },
                emergency_power_engines: {
                    name: "Emergency to Engines",
                    command: "+power_exec Emergency_Power_to_Engines",
                    description: "Emergency power to engine systems",
                    syntax: "+power_exec Emergency_Power_to_Engines", 
                    icon: "🚀"
                },
                emergency_power_aux: {
                    name: "Emergency to Auxiliary",
                    command: "+power_exec Emergency_Power_to_Aux",
                    description: "Emergency power to auxiliary systems",
                    syntax: "+power_exec Emergency_Power_to_Aux",
                    icon: "🔧"
                },
                tactical_team: {
                    name: "Tactical Team",
                    command: "+power_exec Tactical_Team",
                    description: "Activate tactical team ability",
                    syntax: "+power_exec Tactical_Team",
                    icon: "⚔️"
                },
                engineering_team: {
                    name: "Engineering Team", 
                    command: "+power_exec Engineering_Team",
                    description: "Activate engineering team ability",
                    syntax: "+power_exec Engineering_Team",
                    icon: "🔧"
                },
                science_team: {
                    name: "Science Team",
                    command: "+power_exec Science_Team", 
                    description: "Activate science team ability",
                    syntax: "+power_exec Science_Team",
                    icon: "🔬"
                }
            }
        },

        movement: {
            name: "Movement",
            icon: "fas fa-arrows-alt",
            description: "Ship movement and navigation",
            commands: {
                full_impulse: {
                    name: "Full Impulse",
                    command: "+fullimpulse",
                    description: "Engage full impulse drive",
                    syntax: "+fullimpulse",
                    icon: "🚀"
                },
                reverse: {
                    name: "Reverse",
                    command: "+reverse",
                    description: "Reverse engines",
                    syntax: "+reverse",
                    icon: "⬅️"
                },
                evasive_maneuvers: {
                    name: "Evasive Maneuvers",
                    command: "+power_exec Evasive_Maneuvers",
                    description: "Execute evasive maneuvers",
                    syntax: "+power_exec Evasive_Maneuvers",
                    icon: "💨"
                }
            }
        },

        communication: {
            name: "Communication",
            icon: "fas fa-comments",
            description: "Chat and team communication",
            commands: {
                team_message: {
                    name: "Team Message",
                    command: "team",
                    description: "Send message to team",
                    syntax: "team \"message\"",
                    icon: "💬",
                    customizable: true,
                    parameters: {
                        message: { type: "text", default: "Message text here" }
                    }
                },
                local_message: {
                    name: "Local Message",
                    command: "say",
                    description: "Send message to local area",
                    syntax: "say \"message\"",
                    icon: "📢",
                    customizable: true,
                    parameters: {
                        message: { type: "text", default: "Message text here" }
                    }
                },
                zone_message: {
                    name: "Zone Message", 
                    command: "zone",
                    description: "Send message to zone",
                    syntax: "zone \"message\"",
                    icon: "📡",
                    customizable: true,
                    parameters: {
                        message: { type: "text", default: "Message text here" }
                    }
                }
            }
        },

        system: {
            name: "System",
            icon: "fas fa-cog",
            description: "UI and system commands",
            commands: {
                toggle_hud: {
                    name: "Toggle HUD",
                    command: "+GenToggleHUD",
                    description: "Toggle HUD visibility",
                    syntax: "+GenToggleHUD",
                    icon: "👁️"
                },
                screenshot: {
                    name: "Screenshot",
                    command: "screenshot",
                    description: "Take a screenshot",
                    syntax: "screenshot",
                    icon: "📷"
                },
                autofire_toggle: {
                    name: "Toggle Autofire",
                    command: "+GenToggleAutofire",
                    description: "Toggle weapon autofire",
                    syntax: "+GenToggleAutofire",
                    icon: "🔁"
                }
            }
        }
    },

    // Command templates for common scenarios
    templates: {
        space_combat: {
            basic_attack: {
                name: "Basic Attack Sequence",
                description: "Target enemy and fire all weapons",
                commands: [
                    "Target_Enemy_Near",
                    "FireAll"
                ]
            },
            defensive_sequence: {
                name: "Defensive Sequence", 
                description: "Target self and activate defensive abilities",
                commands: [
                    "Target_Self",
                    "+power_exec Tactical_Team",
                    "+power_exec Distribute_Shields"
                ]
            },
            alpha_strike: {
                name: "Alpha Strike",
                description: "Full offensive sequence with buffs",
                commands: [
                    "Target_Enemy_Near",
                    "+power_exec Attack_Pattern_Alpha",
                    "+power_exec Emergency_Power_to_Weapons",
                    "FireAll"
                ]
            },
            healing_sequence: {
                name: "Emergency Healing",
                description: "Self-healing and damage control",
                commands: [
                    "Target_Self",
                    "+power_exec Engineering_Team",
                    "+power_exec Science_Team", 
                    "+power_exec Emergency_Power_to_Shields"
                ]
            }
        },
        ground_combat: {
            basic_ground_attack: {
                name: "Basic Ground Attack",
                description: "Target and attack sequence for ground combat",
                commands: [
                    "Target_Enemy_Near",
                    "+STOTrayExecByTray 0 0"
                ]
            }
        }
    },

    // Default profiles
    defaultProfiles: {
        default_space: {
            name: "Default Space",
            description: "Basic space combat configuration",
            mode: "space",
            keys: {
                Space: [
                    {
                        command: "Target_Enemy_Near",
                        type: "targeting", 
                        icon: "🎯",
                        text: "Target nearest enemy",
                        id: "cmd_1"
                    },
                    {
                        command: "FireAll", 
                        type: "combat",
                        icon: "🔥",
                        text: "Fire all weapons",
                        id: "cmd_2"
                    }
                ]
            },
            aliases: {}
        },
        tactical_space: {
            name: "Tactical Space",
            description: "Aggressive DPS-focused space build",
            mode: "space", 
            keys: {
                Space: [
                    {
                        command: "Target_Enemy_Near",
                        type: "targeting", 
                        icon: "🎯",
                        text: "Target nearest enemy",
                        id: "cmd_1"
                    },
                    {
                        command: "+STOTrayExecByTray 0 0",
                        type: "tray",
                        icon: "⚡", 
                        text: "Execute Tray 1 Slot 1",
                        id: "cmd_2"
                    },
                    {
                        command: "FireAll",
                        type: "combat",
                        icon: "🔥",
                        text: "Fire all weapons", 
                        id: "cmd_3"
                    },
                    {
                        command: "+power_exec Distribute_Shields",
                        type: "power",
                        icon: "🛡️",
                        text: "Distribute shields",
                        id: "cmd_4"
                    }
                ],
                "1": [
                    {
                        command: "+STOTrayExecByTray 1 0",
                        type: "tray",
                        icon: "⚡",
                        text: "Execute Tray 2 Slot 1",
                        id: "cmd_5"
                    }
                ],
                F1: [
                    {
                        command: "Target_Self",
                        type: "targeting",
                        icon: "👤", 
                        text: "Target self",
                        id: "cmd_6"
                    },
                    {
                        command: "+power_exec Engineering_Team",
                        type: "power",
                        icon: "🔧",
                        text: "Engineering team",
                        id: "cmd_7"
                    }
                ]
            },
            aliases: {}
        }
    },

    // Validation rules
    validation: {
        keyNamePattern: /^[a-zA-Z0-9_+\-\s]+$/,
        aliasNamePattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
        maxCommandsPerKey: 20,
        maxKeysPerProfile: 100
    },

    // Application settings
    settings: {
        version: "1.0.0",
        autoSave: true,
        maxUndoSteps: 50,
        defaultMode: "space"
    }
};

// Make available globally
window.STO_DATA = STO_DATA;

// Create flattened data structures for backward compatibility and testing
window.COMMAND_CATEGORIES = STO_DATA.commands;

// Flatten all commands into a single object
window.COMMANDS = {};
Object.entries(STO_DATA.commands).forEach(([categoryKey, category]) => {
    Object.entries(category.commands).forEach(([commandKey, command]) => {
        window.COMMANDS[commandKey] = {
            ...command,
            category: categoryKey,
            key: commandKey
        };
    });
});

// Key layouts (if they exist in STO_DATA, otherwise create basic structure)
window.KEY_LAYOUTS = STO_DATA.keyLayouts || {
    qwerty: {
        name: "QWERTY",
        rows: [
            [
                { key: "Escape", display: "Esc" },
                { key: "F1", display: "F1" },
                { key: "F2", display: "F2" },
                { key: "F3", display: "F3" },
                { key: "F4", display: "F4" },
                { key: "F5", display: "F5" },
                { key: "F6", display: "F6" },
                { key: "F7", display: "F7" },
                { key: "F8", display: "F8" },
                { key: "F9", display: "F9" },
                { key: "F10", display: "F10" },
                { key: "F11", display: "F11" },
                { key: "F12", display: "F12" }
            ],
            [
                { key: "`", display: "`" },
                { key: "1", display: "1" },
                { key: "2", display: "2" },
                { key: "3", display: "3" },
                { key: "4", display: "4" },
                { key: "5", display: "5" },
                { key: "6", display: "6" },
                { key: "7", display: "7" },
                { key: "8", display: "8" },
                { key: "9", display: "9" },
                { key: "0", display: "0" },
                { key: "-", display: "-" },
                { key: "=", display: "=" },
                { key: "Backspace", display: "Backspace" }
            ],
            [
                { key: "Tab", display: "Tab" },
                { key: "Q", display: "Q" },
                { key: "W", display: "W" },
                { key: "E", display: "E" },
                { key: "R", display: "R" },
                { key: "T", display: "T" },
                { key: "Y", display: "Y" },
                { key: "U", display: "U" },
                { key: "I", display: "I" },
                { key: "O", display: "O" },
                { key: "P", display: "P" },
                { key: "[", display: "[" },
                { key: "]", display: "]" },
                { key: "\\", display: "\\" }
            ],
            [
                { key: "CapsLock", display: "Caps" },
                { key: "A", display: "A" },
                { key: "S", display: "S" },
                { key: "D", display: "D" },
                { key: "F", display: "F" },
                { key: "G", display: "G" },
                { key: "H", display: "H" },
                { key: "J", display: "J" },
                { key: "K", display: "K" },
                { key: "L", display: "L" },
                { key: ";", display: ";" },
                { key: "'", display: "'" },
                { key: "Enter", display: "Enter" }
            ],
            [
                { key: "Shift", display: "Shift" },
                { key: "Z", display: "Z" },
                { key: "X", display: "X" },
                { key: "C", display: "C" },
                { key: "V", display: "V" },
                { key: "B", display: "B" },
                { key: "N", display: "N" },
                { key: "M", display: "M" },
                { key: ",", display: "," },
                { key: ".", display: "." },
                { key: "/", display: "/" },
                { key: "Shift", display: "Shift" }
            ],
            [
                { key: "Ctrl", display: "Ctrl" },
                { key: "Alt", display: "Alt" },
                { key: "Space", display: "Space" },
                { key: "Alt", display: "Alt" },
                { key: "Ctrl", display: "Ctrl" }
            ]
        ]
    }
};

// Default settings
window.DEFAULT_SETTINGS = {
    keyLayout: "qwerty",
    autoSave: STO_DATA.settings?.autoSave || true,
    showTooltips: true,
    exportFormat: "txt",
    maxUndoSteps: STO_DATA.settings?.maxUndoSteps || 50,
    defaultMode: STO_DATA.settings?.defaultMode || "space"
};

// Sample profiles
window.SAMPLE_PROFILES = Object.values(STO_DATA.defaultProfiles).map(profile => ({
    id: profile.name.toLowerCase().replace(/\s+/g, '_'),
    name: profile.name,
    description: profile.description,
    mode: profile.mode,
    keybinds: profile.keys || {},
    aliases: profile.aliases || {},
    created: new Date().toISOString(),
    modified: new Date().toISOString()
}));

// Sample aliases
window.SAMPLE_ALIASES = {
    attack_sequence: {
        name: "Attack Sequence",
        commands: ["Target_Enemy_Near", "FireAll"],
        description: "Target and attack nearest enemy"
    },
    defensive_sequence: {
        name: "Defensive Sequence", 
        commands: ["Target_Self", "+power_exec Tactical_Team", "+power_exec Distribute_Shields"],
        description: "Self-target and activate defensive abilities"
    },
    heal_sequence: {
        name: "Healing Sequence",
        commands: ["Target_Self", "+power_exec Engineering_Team", "+power_exec Science_Team"],
        description: "Emergency healing and repair sequence"
    }
};

// Tray configuration
window.TRAY_CONFIG = {
    maxTrays: 10,
    slotsPerTray: 10,
    defaultTray: 0,
    maxCommandsPerSlot: 1
};

// Utility functions for data access
window.getCommandsByCategory = function(category) {
    if (!category || !STO_DATA.commands[category]) {
        return [];
    }
    return Object.values(STO_DATA.commands[category].commands);
};

// Export for other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = STO_DATA;
} 