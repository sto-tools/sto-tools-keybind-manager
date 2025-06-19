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
                    icon: "🎯",
                    customizable: true,
                    parameters: {
                        entityName: { type: "text", default: "EntityName", placeholder: "Enter entity name" }
                    }
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
                    description: "Fire all weapons",
                    syntax: "FireAll",
                    environment: "space",
                    icon: "🔥",
                    warning: "Not recommended on spam bars as it interferes with firing cycles"
                },
                fire_phasers: {
                    name: "Fire Energy Weapons",
                    command: "FirePhasers",
                    description: "Fire all Energy Weapons",
                    syntax: "FirePhasers",
                    environment: "space",
                    icon: "⚡",
                    warning: "Not recommended on spam bars as it interferes with firing cycles"
                },
                fire_torps: {
                    name: "Fire Torpedoes",
                    command: "FireTorps", 
                    description: "Fire all Torpedos",
                    syntax: "FireTorps",
                    environment: "space",
                    icon: "🚀",
                    warning: "Not recommended on spam bars as it interferes with firing cycles"
                },
                fire_mines: {
                    name: "Fire Mines",
                    command: "FireMines",
                    description: "Fire all Mines",
                    syntax: "FireMines",
                    environment: "space",
                    icon: "💣",
                    warning: "Not recommended on spam bars as it interferes with firing cycles"
                },
                fire_phasers_torps: {
                    name: "Fire Phasers & Torpedoes",
                    command: "FirePhasersTorps",
                    description: "Fire phasers & torpedos",
                    syntax: "FirePhasersTorps",
                    environment: "space",
                    icon: "💥",
                    warning: "Not recommended on spam bars as it interferes with firing cycles"
                },
                fire_projectiles: {
                    name: "Fire Projectiles",
                    command: "FireProjectiles",
                    description: "Fire torpedos & mines",
                    syntax: "FireProjectiles",
                    environment: "space",
                    icon: "🎯",
                    warning: "Not recommended on spam bars as it interferes with firing cycles"
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
                },
                tray_with_backup: {
                    name: "Tray Execution with Backup",
                    command: "TrayExecByTrayWithBackup 1 0 0 0 0",
                    description: "Execute specific tray slot with backup ability",
                    syntax: "TrayExecByTrayWithBackup <active> <tray> <slot> <backup_tray> <backup_slot>",
                    icon: "⚡",
                    customizable: true,
                    parameters: {
                        active: { type: "number", min: 0, max: 1, default: 1 },
                        tray: { type: "number", min: 0, max: 9, default: 0 },
                        slot: { type: "number", min: 0, max: 9, default: 0 },
                        backup_tray: { type: "number", min: 0, max: 9, default: 0 },
                        backup_slot: { type: "number", min: 0, max: 9, default: 0 }
                    }
                }
            }
        },

        power: {
            name: "Shield Management", 
            icon: "fas fa-shield-alt",
            description: "Shield power and distribution management",
            commands: {
                distribute_shields: {
                    name: "Distribute Shields",
                    command: "+power_exec Distribute_Shields",
                    description: "Evenly distributes shields as if clicking in the middle of the ship and shields icon",
                    syntax: "+power_exec Distribute_Shields",
                    environment: "space",
                    icon: "🛡️",
                    warning: "Not recommended on spam bars as it interferes with firing cycles"
                },
                reroute_shields_rear: {
                    name: "Reroute Shields Rear",
                    command: "+power_exec reroute_shields_rear",
                    description: "Route shield power to rear facing",
                    syntax: "+power_exec reroute_shields_rear",
                    environment: "space",
                    icon: "🛡️"
                },
                reroute_shields_left: {
                    name: "Reroute Shields Left",
                    command: "+power_exec reroute_shields_left",
                    description: "Route shield power to left side",
                    syntax: "+power_exec reroute_shields_left",
                    environment: "space",
                    icon: "🛡️"
                },
                reroute_shields_right: {
                    name: "Reroute Shields Right",
                    command: "+power_exec reroute_shields_right",
                    description: "Route shield power to right side",
                    syntax: "+power_exec reroute_shields_right",
                    environment: "space",
                    icon: "🛡️"
                },
                reroute_shields_forward: {
                    name: "Reroute Shields Forward",
                    command: "+power_exec reroute_shields_forward",
                    description: "Route shield power to forward facing",
                    syntax: "+power_exec reroute_shields_forward",
                    environment: "space",
                    icon: "🛡️"
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
                    environment: "space",
                    icon: "🚀"
                },
                reverse: {
                    name: "Reverse",
                    command: "+reverse",
                    description: "Reverse engines",
                    syntax: "+reverse",
                    icon: "⬅️"
                },
                throttle_adjust: {
                    name: "Throttle Adjust",
                    command: "ThrottleAdjust",
                    description: "Increase or decrease the throttle by amount",
                    syntax: "ThrottleAdjust <amount>",
                    icon: "⚡",
                    customizable: true,
                    parameters: {
                        amount: { type: "number", min: -1, max: 1, default: 0.25, step: 0.05 }
                    }
                },
                throttle_set: {
                    name: "Throttle Set",
                    command: "ThrottleSet",
                    description: "Set the throttle to a specific position (negative = reverse, 0 = stop)",
                    syntax: "ThrottleSet <position>",
                    icon: "🎛️",
                    customizable: true,
                    parameters: {
                        position: { type: "number", min: -1, max: 1, default: 1, step: 0.1 }
                    }
                },
                throttle_toggle: {
                    name: "Throttle Toggle",
                    command: "ThrottleToggle",
                    description: "Alternates between full throttle and full stop",
                    syntax: "ThrottleToggle",
                    icon: "🔄"
                },
                turn_left: {
                    name: "Turn Left",
                    command: "+turnleft",
                    description: "Turn ship left (continuous while held)",
                    syntax: "+turnleft",
                    icon: "↪️"
                },
                turn_right: {
                    name: "Turn Right",
                    command: "+turnright",
                    description: "Turn ship right (continuous while held)",
                    syntax: "+turnright",
                    icon: "↩️"
                },
                pitch_up: {
                    name: "Pitch Up",
                    command: "+up",
                    description: "Pitch ship nose up (space altitude change)",
                    syntax: "+up",
                    icon: "⬆️"
                },
                pitch_down: {
                    name: "Pitch Down", 
                    command: "+down",
                    description: "Pitch ship nose down (space altitude change)",
                    syntax: "+down",
                    icon: "⬇️"
                },
                strafe_left: {
                    name: "Strafe Left",
                    command: "+left",
                    description: "Strafe ship left",
                    syntax: "+left",
                    icon: "⬅️"
                },
                strafe_right: {
                    name: "Strafe Right",
                    command: "+right",
                    description: "Strafe ship right",
                    syntax: "+right",
                    icon: "➡️"
                },
                forward: {
                    name: "Forward",
                    command: "+forward",
                    description: "Move forward",
                    syntax: "+forward",
                    icon: "⬆️"
                },
                backward: {
                    name: "Backward",
                    command: "+backward",
                    description: "Move backward",
                    syntax: "+backward",
                    icon: "⬇️"
                },
                auto_forward: {
                    name: "Auto Forward",
                    command: "autoForward",
                    description: "Character moves forward until given new movement commands",
                    syntax: "autoForward",
                    environment: "ground",
                    icon: "🏃"
                },
                follow: {
                    name: "Follow Target",
                    command: "Follow",
                    description: "Follow the targeted entity",
                    syntax: "Follow",
                    icon: "👥"
                },
                follow_cancel: {
                    name: "Cancel Follow",
                    command: "Follow_Cancel",
                    description: "Stop following and forget about the target",
                    syntax: "Follow_Cancel",
                    icon: "❌"
                }
            }
        },

        camera: {
            name: "Camera",
            icon: "fas fa-video",
            description: "Camera control and view management",
            commands: {
                zoom_in: {
                    name: "Zoom In",
                    command: "Camzoomin",
                    description: "Zoom the camera in",
                    syntax: "Camzoomin",
                    icon: "🔍"
                },
                zoom_out: {
                    name: "Zoom Out",
                    command: "Camzoomout",
                    description: "Zoom the camera out",
                    syntax: "Camzoomout",
                    icon: "🔎"
                },
                zoom_in_small: {
                    name: "Zoom In Small",
                    command: "Camzoominsmall",
                    description: "Zoom the camera in slightly",
                    syntax: "Camzoominsmall",
                    icon: "🔍"
                },
                zoom_out_small: {
                    name: "Zoom Out Small",
                    command: "Camzoomoutsmall",
                    description: "Zoom the camera out slightly",
                    syntax: "Camzoomoutsmall",
                    icon: "🔎"
                },
                cam_distance: {
                    name: "Set Camera Distance",
                    command: "camdist",
                    description: "Sets the camera distance from the player",
                    syntax: "camdist <distance>",
                    icon: "📏",
                    customizable: true,
                    parameters: {
                        distance: { type: "number", min: 1, max: 500, default: 50 }
                    }
                },
                cam_reset: {
                    name: "Reset Camera",
                    command: "CamReset",
                    description: "Reset the camera position to default",
                    syntax: "CamReset",
                    icon: "🔄"
                },
                cam_target_lock: {
                    name: "Lock Camera to Target",
                    command: "Camsetlocktotarget",
                    description: "Lock or unlock the camera to the target",
                    syntax: "Camsetlocktotarget",
                    icon: "🎯"
                },
                cam_cycle_distance: {
                    name: "Cycle Camera Distance",
                    command: "camCycleDist",
                    description: "Cycle the camera distance between several preset values",
                    syntax: "camCycleDist",
                    icon: "🔄"
                },
                cam_mouse_look: {
                    name: "Mouse Look",
                    command: "+camMouseLook",
                    description: "Enable mouse look camera control",
                    syntax: "+camMouseLook",
                    icon: "🖱️"
                },
                cam_turn_to_face: {
                    name: "Turn to Face Camera",
                    command: "+camTurnToFace",
                    description: "Turn ship to face camera direction",
                    syntax: "+camTurnToFace",
                    icon: "↪️"
                },
                look_up: {
                    name: "Look Up",
                    command: "lookUp",
                    description: "Change point of view to look straight up",
                    syntax: "lookUp",
                    icon: "⬆️"
                },
                look_down: {
                    name: "Look Down",
                    command: "lookDown",
                    description: "Change point of view to look straight down",
                    syntax: "lookDown",
                    icon: "⬇️"
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
                    syntax: "team message",
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
                    syntax: "say message",
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
                    syntax: "zone message",
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
                screenshot_jpg: {
                    name: "Screenshot JPG",
                    command: "screenshot_jpg",
                    description: "Save a screenshot as JPG",
                    syntax: "screenshot_jpg",
                    icon: "📷"
                },
                autofire_toggle: {
                    name: "Toggle Autofire",
                    command: "+GenToggleAutofire",
                    description: "Toggle weapon autofire",
                    syntax: "+GenToggleAutofire",
                    icon: "🔁"
                },
                bind_save_file: {
                    name: "Save Binds to File",
                    command: "bind_save_file",
                    description: "Save all your binds to a text file",
                    syntax: "bind_save_file <filename>",
                    icon: "💾",
                    customizable: true,
                    parameters: {
                        filename: { type: "text", default: "my_binds.txt" }
                    }
                },
                bind_load_file: {
                    name: "Load Binds from File",
                    command: "bind_load_file",
                    description: "Load a bind file into the client",
                    syntax: "bind_load_file <filename>",
                    icon: "📁",
                    customizable: true,
                    parameters: {
                        filename: { type: "text", default: "my_binds.txt" }
                    }
                },
                combat_log: {
                    name: "Toggle Combat Log",
                    command: "CombatLog",
                    description: "Turn combat log recording on/off (1=on, 0=off)",
                    syntax: "CombatLog <1/0>",
                    icon: "📊",
                    customizable: true,
                    parameters: {
                        state: { type: "number", min: 0, max: 1, default: 1 }
                    }
                },
                missions: {
                    name: "Show/Hide Missions",
                    command: "missions",
                    description: "Show/hide the mission journal",
                    syntax: "missions",
                    icon: "📋"
                },
                inventory: {
                    name: "Show/Hide Inventory",
                    command: "Inventory",
                    description: "Show/hide your inventory",
                    syntax: "Inventory",
                    icon: "🎒"
                },
                map: {
                    name: "Show/Hide Map",
                    command: "Map",
                    description: "Show/hide the map window",
                    syntax: "Map",
                    icon: "🗺️"
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
                    "+power_exec Distribute_Shields"
                ]
            },
            alpha_strike: {
                name: "Alpha Strike",
                description: "Full offensive sequence with buffs",
                commands: [
                    "Target_Enemy_Near",
                    "FireAll"
                ]
            },
            healing_sequence: {
                name: "Emergency Healing",
                description: "Self-healing and damage control",
                commands: [
                    "Target_Self",
                    "+power_exec Distribute_Shields"
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
            currentEnvironment: "space",
            builds: {
                space: {
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
                    aliases: {
                        AttackCall: {
                            description: "Call out attack target to team",
                            commands: 'team Attacking [$Target] - focus fire!'
                        },
                        TargetReport: {
                            description: "Report current target to team",
                            commands: 'team Current target: [$Target]'
                        },
                        HealCall: {
                            description: "Request healing for target",
                            commands: 'team Need healing on [$Target]!'
                        }
                    }
                },
                ground: {
                    keys: {
                        Space: [
                            {
                                command: "Target_Enemy_Near",
                                type: "targeting",
                                icon: "🎯", 
                                text: "Target nearest enemy",
                                id: "cmd_g1"
                            },
                            {
                                command: "+STOTrayExecByTray 0 0",
                                type: "tray",
                                icon: "⚡",
                                text: "Primary attack",
                                id: "cmd_g2"
                            }
                        ]
                    },
                    aliases: {}
                }
            }
        },
        tactical_space: {
            name: "Tactical Space",
            description: "Aggressive DPS-focused space build",
            currentEnvironment: "space",
            builds: {
                space: {
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
                                command: "+STOTrayExecByTray 2 0",
                                type: "tray",
                                icon: "⚡",
                                text: "Execute Tray 3 Slot 1",
                                id: "cmd_7"
                            }
                        ]
                    },
                    aliases: {}
                },
                ground: {
                    keys: {
                        Space: [
                            {
                                command: "Target_Enemy_Near",
                                type: "targeting",
                                icon: "🎯",
                                text: "Target nearest enemy",
                                id: "cmd_g1"
                            },
                            {
                                command: "+STOTrayExecByTray 0 0",
                                type: "tray",
                                icon: "⚡",
                                text: "Primary attack",
                                id: "cmd_g2"
                            }
                        ],
                        "1": [
                            {
                                command: "+STOTrayExecByTray 0 1",
                                type: "tray",
                                icon: "⚡",
                                text: "Secondary attack",
                                id: "cmd_g3"
                            }
                        ],
                        F1: [
                            {
                                command: "Target_Self",
                                type: "targeting",
                                icon: "👤",
                                text: "Target self",
                                id: "cmd_g4"
                            },
                            {
                                command: "+STOTrayExecByTray 1 0",
                                type: "tray",
                                icon: "💊",
                                text: "Heal self",
                                id: "cmd_g5"
                            }
                        ]
                    },
                    aliases: {}
                }
            }
        }
    },

    // Comprehensive key definitions organized by category
    keys: {
        common: {
            name: "Common Keys",
            description: "Most frequently used keys",
            keys: [
                { key: "Space", description: "Spacebar" },
                { key: "1", description: "Number 1" },
                { key: "2", description: "Number 2" },
                { key: "3", description: "Number 3" },
                { key: "4", description: "Number 4" },
                { key: "5", description: "Number 5" },
                { key: "F1", description: "Function Key 1" },
                { key: "F2", description: "Function Key 2" },
                { key: "F3", description: "Function Key 3" },
                { key: "F4", description: "Function Key 4" },
                { key: "Tab", description: "Tab" },
                { key: "enter", description: "Main Enter Key" },
                { key: "Shift", description: "Shift" },
                { key: "Control", description: "Control" },
                { key: "ALT", description: "Alt" }
            ]
        },
        letters: {
            name: "Letter Keys",
            description: "A-Z keyboard letters",
            keys: [
                { key: "A", description: "Key A" },
                { key: "B", description: "Key B" },
                { key: "C", description: "Key C" },
                { key: "D", description: "Key D" },
                { key: "E", description: "Key E" },
                { key: "F", description: "Key F" },
                { key: "G", description: "Key G" },
                { key: "H", description: "Key H" },
                { key: "I", description: "Key I" },
                { key: "J", description: "Key J" },
                { key: "K", description: "Key K" },
                { key: "L", description: "Key L" },
                { key: "M", description: "Key M" },
                { key: "N", description: "Key N" },
                { key: "O", description: "Key O" },
                { key: "P", description: "Key P" },
                { key: "Q", description: "Key Q" },
                { key: "R", description: "Key R" },
                { key: "S", description: "Key S" },
                { key: "T", description: "Key T" },
                { key: "U", description: "Key U" },
                { key: "V", description: "Key V" },
                { key: "W", description: "Key W" },
                { key: "X", description: "Key X" },
                { key: "Y", description: "Key Y" },
                { key: "Z", description: "Key Z" }
            ]
        },
        numbers: {
            name: "Number Keys",
            description: "Number row and numpad",
            keys: [
                { key: "0", description: "Number 0" },
                { key: "6", description: "Number 6" },
                { key: "7", description: "Number 7" },
                { key: "8", description: "Number 8" },
                { key: "9", description: "Number 9" },
                { key: "numpad0", description: "Numerical Keypad 0" },
                { key: "numpad1", description: "Numerical Keypad 1" },
                { key: "numpad2", description: "Numerical Keypad 2" },
                { key: "numpad3", description: "Numerical Keypad 3" },
                { key: "numpad4", description: "Numerical Keypad 4" },
                { key: "numpad5", description: "Numerical Keypad 5" },
                { key: "numpad6", description: "Numerical Keypad 6" },
                { key: "numpad7", description: "Numerical Keypad 7" },
                { key: "numpad8", description: "Numerical Keypad 8" },
                { key: "numpad9", description: "Numerical Keypad 9" },
                { key: "Decimal", description: "Numerical Keypad Decimal" },
                { key: "Divide", description: "Numerical Keypad Divide" },
                { key: "Multiply", description: "Multiply (*)" },
                { key: "Subtract", description: "Subtract (-)" },
                { key: "Add", description: "Add (+)" },
                { key: "numpadenter", description: "Numerical Keypad Enter" }
            ]
        },
        function: {
            name: "Function Keys",
            description: "F1-F24 function keys",
            keys: [
                { key: "F5", description: "Function Key 5" },
                { key: "F6", description: "Function Key 6" },
                { key: "F7", description: "Function Key 7" },
                { key: "F8", description: "Function Key 8" },
                { key: "F9", description: "Function Key 9" },
                { key: "F10", description: "Function Key 10" },
                { key: "F11", description: "Function Key 11" },
                { key: "F12", description: "Function Key 12" },
                { key: "F13", description: "Function Key 13" },
                { key: "F14", description: "Function Key 14" },
                { key: "F15", description: "Function Key 15" },
                { key: "F16", description: "Function Key 16" },
                { key: "F17", description: "Function Key 17" },
                { key: "F18", description: "Function Key 18" },
                { key: "F19", description: "Function Key 19" },
                { key: "F20", description: "Function Key 20" },
                { key: "F21", description: "Function Key 21" },
                { key: "F22", description: "Function Key 22" },
                { key: "F23", description: "Function Key 23" },
                { key: "F24", description: "Function Key 24" }
            ]
        },
        arrows: {
            name: "Arrow & Navigation",
            description: "Arrow keys and navigation",
            keys: [
                { key: "Up", description: "Arrow Key: Up" },
                { key: "Down", description: "Arrow Key: Down" },
                { key: "Left", description: "Arrow Key: Left" },
                { key: "Right", description: "Arrow Key: Right" },
                { key: "Home", description: "Home" },
                { key: "End", description: "End" },
                { key: "PageUp", description: "Page Up" },
                { key: "PageDown", description: "Page Down" },
                { key: "insert", description: "Insert" },
                { key: "delete", description: "Delete" }
            ]
        },
        modifiers: {
            name: "Modifier Keys",
            description: "Shift, Ctrl, Alt variations",
            keys: [
                { key: "LALT", description: "Alt (Left)" },
                { key: "RALT", description: "Alt (Right)" },
                { key: "LCTRL", description: "Control (Left)" },
                { key: "RCTRL", description: "Control (Right)" }
            ]
        },
        symbols: {
            name: "Symbol Keys",
            description: "Punctuation and symbols",
            keys: [
                { key: "[", description: "[" },
                { key: "]", description: "]" },
                { key: "\\", description: "\\" },
                { key: ",", description: "Comma (,)" },
                { key: ".", description: "Period (.)" },
                { key: "/", description: "Divide (/)" },
                { key: "`", description: "Tilda Key (~)" }
            ]
        },
        mouse: {
            name: "Mouse Controls",
            description: "Mouse buttons and scroll",
            keys: [
                { key: "Lbutton", description: "Mouse Left Press" },
                { key: "Rbutton", description: "Mouse Right Press" },
                { key: "Middleclick", description: "Mouse Middle Click" },
                { key: "Button1", description: "Mouse Button 1" },
                { key: "Button2", description: "Mouse Button 2" },
                { key: "Button3", description: "Mouse Button 3" },
                { key: "Button4", description: "Mouse Button 4" },
                { key: "Button5", description: "Mouse Button 5" },
                { key: "Button6", description: "Mouse Button 6" },
                { key: "Button7", description: "Mouse Button 7" },
                { key: "Button8", description: "Mouse Button 8" },
                { key: "Button9", description: "Mouse Button 9" },
                { key: "Button10", description: "Mouse Button 10" },
                { key: "Wheelplus", description: "Mouse Scroll Up" },
                { key: "Wheelminus", description: "Mouse Scroll Down" }
            ]
        },
        gamepad: {
            name: "Xbox Controller",
            description: "Xbox/Gamepad controls",
            keys: [
                { key: "Joy1", description: "XBOX Contr [Start]" },
                { key: "Joy2", description: "XBOX Contr [Back]" },
                { key: "Joy3", description: "XBOX Contr [L Thumb depress]" },
                { key: "Joy4", description: "XBOX Contr [R Thumb depress]" },
                { key: "Joy5", description: "XBOX Contr [Left Bumper]" },
                { key: "Joy6", description: "XBOX Contr [Right Bumper]" },
                { key: "Joy7", description: "XBOX Contr [Left Trigger]" },
                { key: "Joy8", description: "XBOX Contr [Right Trigger]" },
                { key: "Joy9", description: "XBOX Contr [A Button]" },
                { key: "Joy10", description: "XBOX Contr [B Button]" },
                { key: "Joy11", description: "XBOX Contr [X Button]" },
                { key: "Joy12", description: "XBOX Contr [Y Button]" },
                { key: "Joypad_up", description: "XBOX Contr [Pad up]" },
                { key: "Joypad_down", description: "XBOX Contr [Pad down]" },
                { key: "Joypad_left", description: "XBOX Contr [Pad left]" },
                { key: "Joypad_right", description: "XBOX Contr [Pad right]" },
                { key: "Lstick_up", description: "XBOX Contr [Left Stick up]" },
                { key: "Lstick_down", description: "XBOX Contr [Left Stick down]" },
                { key: "Lstick_left", description: "XBOX Contr [Left Stick left]" },
                { key: "Lstick_right", description: "XBOX Contr [Left Stick right]" },
                { key: "Rstick_up", description: "XBOX Contr [Right Stick up]" },
                { key: "Rstick_down", description: "XBOX Contr [Right Stick down]" },
                { key: "Rstick_left", description: "XBOX Contr [Right Stick left]" },
                { key: "Rstick_right", description: "XBOX Contr [Right Stick right]" }
            ]
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
    },

    // STO Variables that can be used in commands
    variables: {
        target: {
            variable: "$Target",
            description: "Replaced with the name of your current target",
                                    example: 'team Target [$Target]',
            usableIn: ["communication", "custom", "aliases"],
            notes: "If your target's name is 'froggyMonster', this will output 'Target [froggyMonster]'"
        }
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
    currentEnvironment: profile.currentEnvironment || 'space',
    builds: profile.builds || {
        space: { keys: {} },
        ground: { keys: {} }
    },
    // Maintain backward compatibility
    mode: profile.currentEnvironment || 'space',
    keybinds: profile.builds?.space?.keys || {},
    aliases: profile.builds?.space?.aliases || {},
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
        commands: ["Target_Self", "+power_exec Distribute_Shields"],
        description: "Self-target and activate defensive abilities"
    },
    heal_sequence: {
        name: "Healing Sequence",
        commands: ["Target_Self", "+STOTrayExecByTray 3 0 $$ +STOTrayExecByTray 3 1"],
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
