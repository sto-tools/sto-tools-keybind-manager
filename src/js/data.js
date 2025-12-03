// STO Tools Keybind Manager - Data Layer
// Contains all command definitions, templates, and default configurations

const STO_DATA = {
  // Command categories and definitions
  commands: {
   // -------------------------------------------------------------
    // Custom – Raw command input category
    // -------------------------------------------------------------
    custom: {
      name: 'Custom',
      icon: 'fas fa-plus',
      description: 'Create commands from raw STO command strings',
      commands: {
        add_custom_command: {
          name: 'Add Custom Command',
          command: '', // Raw input – no predefined command string
          description: 'Add any STO command as raw text',
          syntax: '<raw command>',
          icon: '➕',
          customizable: true,
          parameters: {
            rawCommand: {
              type: 'text',
              default: '',
              placeholder: 'command_definitions.parameter_placeholders.any_sto_command',
              label: 'Command:'
            }
          }
        }
      }
    },

    targeting: {
      name: 'Targeting',
      icon: 'fas fa-crosshairs',
      description: 'Target selection and management',
      commands: {
        target: {
          name: 'Target by Name',
          command: 'Target',
          description: 'Target entity by name (requires quotes)',
          syntax: 'Target "EntityName"',
          icon: '🎯',
          customizable: true,
          parameters: {
            entityName: {
              type: 'text',
              default: 'EntityName',
              placeholder: 'command_definitions.parameter_placeholders.entity_name',
            },
          },
        },
        target_enemy_near: {
          name: 'Target Nearest Enemy',
          command: 'Target_Enemy_Near',
          description: 'Target the nearest enemy in view',
          syntax: 'Target_Enemy_Near',
          icon: '🎯',
        },
        target_friend_near: {
          name: 'Target Nearest Friend',
          command: 'Target_Friend_Near',
          description: 'Target the nearest friendly entity',
          syntax: 'Target_Friend_Near',
          icon: '🤝',
        },
        target_self: {
          name: 'Target Self',
          command: 'Target_Self',
          description: 'Target your own ship/character',
          syntax: 'Target_Self',
          icon: '👤',
        },
        target_clear: {
          name: 'Clear Target',
          command: 'Target_Clear',
          description: 'Remove current target lock',
          syntax: 'Target_Clear',
          icon: '❌',
        },
        target_teammate_1: {
          name: 'Target Teammate 1',
          command: 'Target_Teammate 1',
          description: 'Target first team member',
          syntax: 'Target_Teammate 1',
          icon: '👥',
        },
        target_teammate_2: {
          name: 'Target Teammate 2',
          command: 'Target_Teammate 2',
          description: 'Target second team member',
          syntax: 'Target_Teammate 2',
          icon: '👥',
        },
        target_teammate_3: {
          name: 'Target Teammate 3',
          command: 'Target_Teammate 3',
          description: 'Target third team member',
          syntax: 'Target_Teammate 3',
          icon: '👥',
        },
        target_teammate_4: {
          name: 'Target Teammate 4',
          command: 'Target_Teammate 4',
          description: 'Target fourth team member',
          syntax: 'Target_Teammate 4',
          icon: '👥',
        },
      },
    },

    combat: {
      name: 'Combat',
      icon: 'fas fa-fire',
      description: 'Weapon firing and combat actions',
      commands: {
        fire_all: {
          name: 'Fire All Weapons',
          command: 'FireAll',
          description: 'Fire all weapons',
          syntax: 'FireAll',
          environment: 'space',
          icon: '🔥',
          warning: 'spam_bar_warning',
        },
        fire_phasers: {
          name: 'Fire Energy Weapons',
          command: 'FirePhasers',
          description: 'Fire all Energy Weapons',
          syntax: 'FirePhasers',
          environment: 'space',
          icon: '⚡',
          warning: 'spam_bar_warning',
        },
        fire_torps: {
          name: 'Fire Torpedoes',
          command: 'FireTorps',
          description: 'Fire all Torpedos',
          syntax: 'FireTorps',
          environment: 'space',
          icon: '🚀',
          warning: 'spam_bar_warning',
        },
        fire_mines: {
          name: 'Fire Mines',
          command: 'FireMines',
          description: 'Fire all Mines',
          syntax: 'FireMines',
          environment: 'space',
          icon: '💣',
          warning: 'spam_bar_warning',
        },
        fire_phasers_torps: {
          name: 'Fire Phasers & Torpedoes',
          command: 'FirePhasersTorps',
          description: 'Fire phasers & torpedos',
          syntax: 'FirePhasersTorps',
          environment: 'space',
          icon: '💥',
          warning: 'spam_bar_warning',
        },
        fire_projectiles: {
          name: 'Fire Projectiles',
          command: 'FireProjectiles',
          description: 'Fire torpedos & mines',
          syntax: 'FireProjectiles',
          environment: 'space',
          icon: '🎯',
          warning: 'spam_bar_warning',
        },
        aim: {
          name: 'Aim/Scope',
          command: 'aim',
          description: 'Toggle scope on/off. In scope mode the player does more damage. Can either be used as a toggle or a press and hold',
          syntax: 'aim',
          environment: 'ground',
          icon: '🎯',
        },
        holster: {
          name: 'Holster Weapon',
          command: 'Holster',
          description: 'Attempt to holster your active weapon',
          syntax: 'Holster',
          environment: 'ground',
          icon: '🔫',
        },
        holster_toggle: {
          name: 'Holster Toggle',
          command: 'HolsterToggle',
          description: 'Attempt to holster or draw your weapons',
          syntax: 'HolsterToggle',
          environment: 'ground',
          icon: '🔄',
        },
        unholster: {
          name: 'Unholster Weapon',
          command: 'Unholster',
          description: 'Attempt to draw your active weapon',
          syntax: 'Unholster',
          environment: 'ground',
          icon: '🔫',
        },
        toggle_shooter_mode: {
          name: 'Toggle Shooter Mode',
          command: 'ToggleShooterMode',
          description: 'Toggle shooter mode on/off',
          syntax: 'ToggleShooterMode',
          environment: 'ground',
          icon: '🎮',
        },
        shooter_primary: {
          name: 'Shooter Primary',
          command: 'ShooterPrimary',
          description: 'Primary shooter mode action',
          syntax: 'ShooterPrimary',
          environment: 'ground',
          icon: '🎯',
        },
        shooter_secondary: {
          name: 'Shooter Secondary',
          command: 'Shootersecondary',
          description: 'Secondary shooter mode action',
          syntax: 'Shootersecondary',
          environment: 'ground',
          icon: '🎯',
        },
        shooter_tertiary: {
          name: 'Shooter Tertiary',
          command: 'Shootertertiary',
          description: 'Tertiary shooter mode action',
          syntax: 'Shootertertiary',
          environment: 'ground',
          icon: '🎯',
        },
        shooter_clear_offset_tray_binds: {
          name: 'Shooter Clear Offset Tray Binds',
          command: 'ShooterClearOffsetTrayBinds',
          description: 'Clear the starting location and movement of the yellow action box that appears on the tray while in shooter mode',
          syntax: 'ShooterClearOffsetTrayBinds',
          environment: 'ground',
          icon: '🧹',
        },
        shooter_clear_overlay_tray_binds: {
          name: 'Shooter Clear Overlay Tray Binds',
          command: 'ShooterClearOverlayTrayBinds',
          description: 'Clear overlay tray bindings for shooter mode',
          syntax: 'ShooterClearOverlayTrayBinds',
          environment: 'ground',
          icon: '🧹',
        },
        shooter_set_offset_tray_binds: {
          name: 'Shooter Set Offset Tray Binds',
          command: 'ShooterSetOffsetTrayBinds',
          description: 'Set the starting location and movement of the yellow action box that appears on the tray while in shooter mode',
          syntax: 'ShooterSetOffsetTrayBinds',
          environment: 'ground',
          icon: '⚙️',
        },
        shooter_set_overlay_tray_binds: {
          name: 'Shooter Set Overlay Tray Binds',
          command: 'ShooterSetOverlayTrayBinds',
          description: 'Set overlay tray bindings for shooter mode',
          syntax: 'ShooterSetOverlayTrayBinds',
          environment: 'ground',
          icon: '⚙️',
        },
      },
    },

    cosmetic: {
      name: 'Cosmetic',
      icon: 'fas fa-palette',
      description: 'Character appearance and customization',
      commands: {
        setactivecostume: {
          name: 'Set Active Costume',
          command: 'setactivecostume',
          description: 'Sets current active costume. Requires two modifiers.',
          syntax: 'setactivecostume <modifier1> <modifier2>',
          environment: 'ground',
          icon: '👕',
          customizable: true,
          parameters: {
            modifier1: { type: 'text', default: 'modifier1', placeholder: 'command_definitions.parameter_placeholders.first_modifier' },
            modifier2: { type: 'text', default: 'modifier2', placeholder: 'command_definitions.parameter_placeholders.second_modifier' },
          },
        },
      },
    },

    bridge_officer: {
      name: 'Bridge Officer',
      icon: 'fas fa-user-friends',
      description: 'Ground bridge officer control commands',
      commands: {
        setrallypoint: {
          name: 'Set Rally Point',
          command: 'Setrallypoint',
          description: 'Set a rally point for your current target',
          syntax: 'Setrallypoint',
          environment: 'ground',
          icon: '📍',
        },
        setrallypointconsole: {
          name: 'Set Rally Point (Console)',
          command: 'Setrallypointconsole',
          description: 'Set a rally point for your current target (console variant)',
          syntax: 'Setrallypointconsole',
          environment: 'ground',
          icon: '🖥️',
        },
        clearrallypoint: {
          name: 'Clear Rally Point',
          command: 'Clearrallypoint',
          description: 'Clear the rally point for your current target',
          syntax: 'Clearrallypoint',
          environment: 'ground',
          icon: '❌',
        },
        clearallrallypoints: {
          name: 'Clear All Rally Points',
          command: 'Clearallrallypoints',
          description: 'Clear all the rally points',
          syntax: 'Clearallrallypoints',
          environment: 'ground',
          icon: '🧹',
        },
        assist: {
          name: 'Assist',
          command: 'Assist',
          description: 'Assist "<name>": Assists the Entity with the matching name. If no name is given, assists your current target.',
          syntax: 'Assist <name>',
          environment: 'ground',
          icon: '🤝',
          customizable: true,
          parameters: {
            name: { type: 'text', default: '', placeholder: 'command_definitions.parameter_placeholders.entity_name_optional' },
          },
        },
      },
    },

    tray: {
      name: 'Tray Execution',
      icon: 'fas fa-th',
      description: 'Execute abilities from action trays',
      commands: {
        custom_tray: {
          name: 'Tray Execution',
          command: '+STOTrayExecByTray 0 0',
          description: 'Execute specific tray slot',
          syntax: '+STOTrayExecByTray <tray> <slot>',
          icon: '⚡',
          customizable: true,
          parameters: {
            active: { type: 'boolean', min: 0, max: 1, default: 1 },
            tray: { type: 'number', min: 0, max: 9, default: 0 },
            slot: { type: 'number', min: 0, max: 9, default: 0 },
            command_type: {
              type: 'select',
              options: ['STOTrayExecByTray', 'TrayExecByTray'],
              default: 'TrayExecByTray',
            },
          },
        },
        tray_with_backup: {
          name: 'Tray Execution with Backup',
          command: 'TrayExecByTrayWithBackup 1 0 0 0 0',
          description: 'Execute specific tray slot with backup ability',
          syntax:
            'TrayExecByTrayWithBackup <active> <tray> <slot> <backup_tray> <backup_slot>',
          icon: '⚡',
          customizable: true,
          parameters: {
            active: { type: 'boolean', min: 0, max: 1, default: 1 },
            tray: { type: 'number', min: 0, max: 9, default: 0 },
            slot: { type: 'number', min: 0, max: 9, default: 0 },
            backup_tray: { type: 'number', min: 0, max: 9, default: 0 },
            backup_slot: { type: 'number', min: 0, max: 9, default: 0 },
          },
        },
        tray_range: {
          name: 'Tray Range Execution',
          command: '+STOTrayExecByTray 0 0',
          description: 'Execute a range of tray slots',
          syntax: '+STOTrayExecByTray <tray> <slot> $$ ... (range)',
          icon: '⚡',
          customizable: true,
          parameters: {
            active: { type: 'boolean', min: 0, max: 1, default: 1 },
            start_tray: { type: 'number', min: 0, max: 9, default: 0 },
            start_slot: { type: 'number', min: 0, max: 9, default: 0 },
            end_tray: { type: 'number', min: 0, max: 9, default: 0 },
            end_slot: { type: 'number', min: 0, max: 9, default: 0 },
            command_type: {
              type: 'select',
              options: ['STOTrayExecByTray', 'TrayExecByTray'],
              default: 'TrayExecByTray',
            },
          },
        },
        tray_range_with_backup: {
          name: 'Tray Range with Backup',
          command: 'TrayExecByTrayWithBackup 1 0 0 0 0',
          description: 'Execute a range of tray slots with backup abilities',
          syntax:
            'TrayExecByTrayWithBackup <active> <tray> <slot> <backup_tray> <backup_slot> $$ ... (range)',
          icon: '⚡',
          customizable: true,
          parameters: {
            active: { type: 'boolean', min: 0, max: 1, default: 1 },
            start_tray: { type: 'number', min: 0, max: 9, default: 0 },
            start_slot: { type: 'number', min: 0, max: 9, default: 0 },
            end_tray: { type: 'number', min: 0, max: 9, default: 0 },
            end_slot: { type: 'number', min: 0, max: 9, default: 0 },
            backup_start_tray: { type: 'number', min: 0, max: 9, default: 0 },
            backup_start_slot: { type: 'number', min: 0, max: 9, default: 0 },
            backup_end_tray: { type: 'number', min: 0, max: 9, default: 0 },
            backup_end_slot: { type: 'number', min: 0, max: 9, default: 0 },
          },
        },
        whole_tray: {
          name: 'Whole Tray Execution',
          command: '+STOTrayExecByTray 0 0',
          description: 'Execute all slots in a tray',
          syntax: '+STOTrayExecByTray <tray> <slot> $$ ... (all slots)',
          icon: '⚡',
          customizable: true,
          parameters: {
            active: { type: 'boolean', min: 0, max: 1, default: 1 },
            tray: { type: 'number', min: 0, max: 9, default: 0 },
            command_type: {
              type: 'select',
              options: ['STOTrayExecByTray', 'TrayExecByTray'],
              default: 'TrayExecByTray',
            },
          },
        },
        whole_tray_with_backup: {
          name: 'Whole Tray with Backup',
          command: 'TrayExecByTrayWithBackup 1 0 0 0 0',
          description: 'Execute all slots in a tray with backup tray',
          syntax:
            'TrayExecByTrayWithBackup <active> <tray> <slot> <backup_tray> <backup_slot> $$ ... (all slots)',
          icon: '⚡',
          customizable: true,
          parameters: {
            active: { type: 'boolean', min: 0, max: 1, default: 1 },
            tray: { type: 'number', min: 0, max: 9, default: 0 },
            backup_tray: { type: 'number', min: 0, max: 9, default: 0 },
          },
        },
      },
    },

    power: {
      name: 'Shield Management',
      icon: 'fas fa-shield-alt',
      description: 'Shield power and distribution management',
      commands: {
        distribute_shields: {
          name: 'Distribute Shields',
          command: '+power_exec Distribute_Shields',
          description:
            'Evenly distributes shields as if clicking in the middle of the ship and shields icon',
          syntax: '+power_exec Distribute_Shields',
          environment: 'space',
          icon: '🛡️',
          warning: 'spam_bar_warning',
        },
        reroute_shields_rear: {
          name: 'Reroute Shields Rear',
          command: '+power_exec reroute_shields_rear',
          description: 'Route shield power to rear facing',
          syntax: '+power_exec reroute_shields_rear',
          environment: 'space',
          icon: '🛡️',
          warning: 'spam_bar_warning',
        },
        reroute_shields_left: {
          name: 'Reroute Shields Left',
          command: '+power_exec reroute_shields_left',
          description: 'Route shield power to left side',
          syntax: '+power_exec reroute_shields_left',
          environment: 'space',
          icon: '🛡️',
          warning: 'spam_bar_warning',
        },
        reroute_shields_right: {
          name: 'Reroute Shields Right',
          command: '+power_exec reroute_shields_right',
          description: 'Route shield power to right side',
          syntax: '+power_exec reroute_shields_right',
          environment: 'space',
          icon: '🛡️',
          warning: 'spam_bar_warning',
        },
        reroute_shields_forward: {
          name: 'Reroute Shields Forward',
          command: '+power_exec reroute_shields_forward',
          description: 'Route shield power to forward facing',
          syntax: '+power_exec reroute_shields_forward',
          environment: 'space',
          icon: '🛡️',
          warning: 'spam_bar_warning',
        },
      },
    },

    movement: {
      name: 'Movement',
      icon: 'fas fa-arrows-alt',
      description: 'Ship movement and navigation',
      commands: {
        full_impulse: {
          name: 'Full Impulse',
          command: '+fullimpulse',
          description: 'Engage full impulse drive',
          syntax: '+fullimpulse',
          environment: 'space',
          icon: '🚀',
        },
        reverse: {
          name: 'Reverse',
          command: '+reverse',
          description: 'Reverse engines',
          syntax: '+reverse',
          icon: '⬅️',
        },
        throttle_adjust: {
          name: 'Throttle Adjust',
          command: 'ThrottleAdjust',
          description: 'Increase or decrease the throttle by amount',
          syntax: 'ThrottleAdjust <amount>',
          icon: '⚡',
          customizable: true,
          parameters: {
            amount: {
              type: 'number',
              min: -1,
              max: 1,
              default: 0.25,
              step: 0.05,
            },
          },
        },
        throttle_set: {
          name: 'Throttle Set',
          command: 'ThrottleSet',
          description:
            'Set the throttle to a specific position (negative = reverse, 0 = stop)',
          syntax: 'ThrottleSet <position>',
          icon: '🎛️',
          customizable: true,
          parameters: {
            position: {
              type: 'number',
              min: -1,
              max: 1,
              default: 1,
              step: 0.1,
            },
          },
        },
        throttle_toggle: {
          name: 'Throttle Toggle',
          command: 'ThrottleToggle',
          description: 'Alternates between full throttle and full stop',
          syntax: 'ThrottleToggle',
          icon: '🔄',
        },
        turn_left: {
          name: 'Turn Left',
          command: '+turnleft',
          description: 'Turn ship left (continuous while held)',
          syntax: '+turnleft',
          icon: '↪️',
        },
        turn_right: {
          name: 'Turn Right',
          command: '+turnright',
          description: 'Turn ship right (continuous while held)',
          syntax: '+turnright',
          icon: '↩️',
        },
        pitch_up: {
          name: 'Pitch Up',
          command: '+up',
          description: 'Pitch ship nose up (space altitude change)',
          syntax: '+up',
          icon: '⬆️',
        },
        pitch_down: {
          name: 'Pitch Down',
          command: '+down',
          description: 'Pitch ship nose down (space altitude change)',
          syntax: '+down',
          icon: '⬇️',
        },
        strafe_left: {
          name: 'Strafe Left',
          command: '+left',
          description: 'Strafe ship left',
          syntax: '+left',
          icon: '⬅️',
        },
        strafe_right: {
          name: 'Strafe Right',
          command: '+right',
          description: 'Strafe ship right',
          syntax: '+right',
          icon: '➡️',
        },
        forward: {
          name: 'Forward',
          command: '+forward',
          description: 'Move forward',
          syntax: '+forward',
          icon: '⬆️',
        },
        backward: {
          name: 'Backward',
          command: '+backward',
          description: 'Move backward',
          syntax: '+backward',
          icon: '⬇️',
        },
        auto_forward: {
          name: 'Auto Forward',
          command: 'autoForward',
          description:
            'Character moves forward until given new movement commands',
          syntax: 'autoForward',
          environment: 'ground',
          icon: '🏃',
        },
        follow: {
          name: 'Follow Target',
          command: 'Follow',
          description: 'Follow the targeted entity',
          syntax: 'Follow',
          icon: '👥',
        },
        follow_cancel: {
          name: 'Cancel Follow',
          command: 'Follow_Cancel',
          description: 'Stop following and forget about the target',
          syntax: 'Follow_Cancel',
          icon: '❌',
        },
      },
    },

    camera: {
      name: 'Camera',
      icon: 'fas fa-video',
      description: 'Camera control and view management',
      commands: {
        zoom_in: {
          name: 'Zoom In',
          command: 'Camzoomin',
          description: 'Zoom the camera in',
          syntax: 'Camzoomin',
          icon: '🔍',
        },
        zoom_out: {
          name: 'Zoom Out',
          command: 'Camzoomout',
          description: 'Zoom the camera out',
          syntax: 'Camzoomout',
          icon: '🔎',
        },
        zoom_in_small: {
          name: 'Zoom In Small',
          command: 'Camzoominsmall',
          description: 'Zoom the camera in slightly',
          syntax: 'Camzoominsmall',
          icon: '🔍',
        },
        zoom_out_small: {
          name: 'Zoom Out Small',
          command: 'Camzoomoutsmall',
          description: 'Zoom the camera out slightly',
          syntax: 'Camzoomoutsmall',
          icon: '🔎',
        },
        cam_distance: {
          name: 'Set Camera Distance',
          command: 'camdist',
          description: 'Sets the camera distance from the player',
          syntax: 'camdist <distance>',
          icon: '📏',
          customizable: true,
          parameters: {
            distance: { type: 'number', min: 1, max: 500, default: 50 },
          },
        },
        cam_reset: {
          name: 'Reset Camera',
          command: 'CamReset',
          description: 'Reset the camera position to default',
          syntax: 'CamReset',
          icon: '🔄',
        },
        cam_target_lock: {
          name: 'Lock Camera to Target',
          command: 'Camsetlocktotarget',
          description: 'Lock or unlock the camera to the target',
          syntax: 'Camsetlocktotarget',
          icon: '🎯',
        },
        cam_cycle_distance: {
          name: 'Cycle Camera Distance',
          command: 'camCycleDist',
          description:
            'Cycle the camera distance between several preset values',
          syntax: 'camCycleDist',
          icon: '🔄',
        },
        cam_mouse_look: {
          name: 'Mouse Look',
          command: '+camMouseLook',
          description: 'Enable mouse look camera control',
          syntax: '+camMouseLook',
          icon: '🖱️',
        },
        cam_turn_to_face: {
          name: 'Turn to Face Camera',
          command: '+camTurnToFace',
          description: 'Turn ship to face camera direction',
          syntax: '+camTurnToFace',
          icon: '↪️',
        },
        look_up: {
          name: 'Look Up',
          command: 'lookUp',
          description: 'Change point of view to look straight up',
          syntax: 'lookUp',
          icon: '⬆️',
        },
        look_down: {
          name: 'Look Down',
          command: 'lookDown',
          description: 'Change point of view to look straight down',
          syntax: 'lookDown',
          icon: '⬇️',
        },
      },
    },

    communication: {
      name: 'Communication',
      icon: 'fas fa-comments',
      description: 'Chat and team communication',
      commands: {
        team_message: {
          name: 'Team Message',
          command: 'team',
          description: 'Send message to team',
          syntax: 'team message',
          icon: '💬',
          customizable: true,
          parameters: {
            verb:    { type: 'select', default: 'team', options: ['say', 'team', 'zone'] },
            message: { type: 'text', default: 'Message text here' },
          },
        },
        local_message: {
          name: 'Local Message',
          command: 'say',
          description: 'Send message to local area',
          syntax: 'say message',
          icon: '📢',
          customizable: true,
          parameters: {
            verb:    { type: 'select', default: 'say', options: ['say', 'team', 'zone'] },
            message: { type: 'text', default: 'Message text here' },
          },
        },
        zone_message: {
          name: 'Zone Message',
          command: 'zone',
          description: 'Send message to zone',
          syntax: 'zone message',
          icon: '📡',
          customizable: true,
          parameters: {
            verb:    { type: 'select', default: 'zone', options: ['say', 'team', 'zone'] },
            message: { type: 'text', default: 'Message text here' },
          },
        },
      },
    },

    system: {
      name: 'System',
      icon: 'fas fa-cogs',
      description: 'UI and system commands',
      commands: {
        toggle_hud: {
          name: 'Toggle HUD',
          command: '++ShowGameUI',
          description: 'Toggle HUD visibility',
          syntax: '++ShowGameUI',
          icon: '👁️',
        },
        screenshot: {
          name: 'Screenshot',
          command: 'screenshot',
          description: 'Take a screenshot',
          syntax: 'screenshot',
          icon: '📷',
        },
        screenshot_jpg: {
          name: 'Screenshot JPG',
          command: 'screenshot_jpg',
          description: 'Save a screenshot as JPG',
          syntax: 'screenshot_jpg',
          icon: '📷',
        },
        autofire_set: {
          name: 'Set Autofire',
          command: 'defaultautoattack',
          description: 'Turn weapon autofire off and on. X = 1 turns it on and X = 0 turns it off.',
          syntax: 'defaultautoattack <x>',
          icon: '🔁',
          customizable: true,
          parameters: {
            state: { type: 'number', min: 0, max: 1, default: 1 }
          }
        },
        bind_save_file: {
          name: 'Save Binds to File',
          command: 'bind_save_file',
          description: 'Save all your binds to a text file',
          syntax: 'bind_save_file <filename>',
          icon: '💾',
          customizable: true,
          parameters: {
            filename: { type: 'text', default: 'my_binds.txt' },
          },
        },
        bind_load_file: {
          name: 'Load Binds from File',
          command: 'bind_load_file',
          description: 'Load a bind file into the client',
          syntax: 'bind_load_file <filename>',
          icon: '📁',
          customizable: true,
          parameters: {
            filename: { type: 'text', default: 'my_binds.txt' },
          },
        },
        combat_log: {
          name: 'Toggle Combat Log',
          command: 'CombatLog',
          description: 'Turn combat log recording on/off (1=on, 0=off)',
          syntax: 'CombatLog <1/0>',
          icon: '📊',
          customizable: true,
          parameters: {
            state: { type: 'number', min: 0, max: 1, default: 1 },
          },
        },
        chat_log: {
          name: 'Toggle Chat Log',
          command: 'ChatLog',
          description: 'Turn chat log recording on/off (1=on, 0=off)',
          syntax: 'ChatLog <1/0>',
          icon: '💬',
          customizable: true,
          parameters: {
            state: { type: 'number', min: 0, max: 1, default: 1 },
          },
        },
        missions: {
          name: 'Show/Hide Missions',
          command: 'missions',
          description: 'Show/hide the mission journal',
          syntax: 'missions',
          icon: '📋',
        },
        inventory: {
          name: 'Show/Hide Inventory',
          command: 'Inventory',
          description: 'Show/hide your inventory',
          syntax: 'Inventory',
          icon: '🎒',
        },
        map: {
          name: 'Show/Hide Map',
          command: 'Map',
          description: 'Show/hide the map window',
          syntax: 'Map',
          icon: '🗺️',
        },
        logout: {
          name: 'Logout',
          command: 'logout',
          description: 'Log out the current character',
          syntax: 'logout',
          icon: '🚪',
        },
        quit: {
          name: 'Quit Game',
          command: 'quit',
          description: 'Close the window',
          syntax: 'quit',
          icon: '❌',
        },
        goto_character_select: {
          name: 'Go to Character Select',
          command: 'gotoCharacterSelect',
          description: 'Go to the character select screen without logging out',
          syntax: 'gotoCharacterSelect',
          icon: '👤',
        },
        ui_load: {
          name: 'Load UI Settings',
          command: 'ui_load',
          description: 'Loads default UI Windows save file, usually Live\\ui_settings.txt',
          syntax: 'ui_load',
          icon: '📂',
        },
        ui_load_file: {
          name: 'Load UI Settings File',
          command: 'ui_load_file',
          description: 'Loads named UI Windows save file',
          syntax: 'ui_load_file <filename>',
          icon: '📂',
          customizable: true,
          parameters: {
            filename: { type: 'text', default: 'ui_settings.txt' },
          },
        },
        ui_save: {
          name: 'Save UI Settings',
          command: 'ui_save',
          description: 'Saves UI layout to default UI Window save file, usually Live\\ui_settings.txt',
          syntax: 'ui_save',
          icon: '💾',
        },
        ui_save_file: {
          name: 'Save UI Settings File',
          command: 'ui_save_file',
          description: 'Saves UI layout to named UI Window save file',
          syntax: 'ui_save_file <filename>',
          icon: '💾',
          customizable: true,
          parameters: {
            filename: { type: 'text', default: 'ui_settings.txt' },
          },
        },
        ui_cancel: {
          name: 'UI Cancel',
          command: 'uiCancel',
          description: 'Respond "Cancel" to an open dialog box; may not work in all dialogs',
          syntax: 'uiCancel',
          icon: '❌',
        },
        ui_ok: {
          name: 'UI OK',
          command: 'uiOK',
          description: 'Respond "OK" to an open dialog box; may not work in all dialogs',
          syntax: 'uiOK',
          icon: '✅',
        },
        ui_gen_layers_reset: {
          name: 'Reset UI Layout',
          command: 'ui_GenLayersReset',
          description: 'Resets the layout, used for when the server updates movable window positions',
          syntax: 'ui_GenLayersReset',
          icon: '🔄',
        },
        ui_resolution: {
          name: 'Print UI Resolution',
          command: 'ui_resolution',
          description: 'Print the current UI screen resolution',
          syntax: 'ui_resolution',
          icon: '📐',
        },
        ui_tooltip_delay: {
          name: 'Set Tooltip Delay',
          command: 'ui_TooltipDelay',
          description: 'Sets the additional delay, in seconds, before tooltips appear',
          syntax: 'ui_TooltipDelay <seconds>',
          icon: '⏱️',
          customizable: true,
          parameters: {
            seconds: { type: 'number', min: 0, max: 10, default: 0.5, step: 0.1 },
          },
        },
        remember_ui_lists: {
          name: 'Remember UI Lists',
          command: 'RememberUILists',
          description: 'Whether to remember UI List Column placement and width',
          syntax: 'RememberUILists <1/0>',
          icon: '📋',
          customizable: true,
          parameters: {
            state: { type: 'number', min: 0, max: 1, default: 1 },
          },
        },
        ui_remember_positions: {
          name: 'Remember UI Positions',
          command: 'UIRememberPositions',
          description: 'Whether to remember UI sizes and positions. On by default',
          syntax: 'UIRememberPositions <1/0>',
          icon: '📍',
          customizable: true,
          parameters: {
            state: { type: 'number', min: 0, max: 1, default: 1 },
          },
        },
        safe_login: {
          name: 'Safe Login',
          command: 'SafeLogin',
          description: 'If true, then log the player back into their most recent static map instead of anything else',
          syntax: 'SafeLogin <1/0>',
          icon: '🛡️',
          customizable: true,
          parameters: {
            state: { type: 'number', min: 0, max: 1, default: 1 },
          },
        },
        show_game_ui: {
          name: 'Show Game UI',
          command: 'ShowGameUI',
          description: 'Show the game UI',
          syntax: 'ShowGameUI',
          icon: '🎮',
        },
        show_game_ui_no_extra_keybinds: {
          name: 'Show Game UI (No Extra Keybinds)',
          command: 'ShowGameUINoExtraKeyBinds',
          description: 'This command does not add any keybinds for showing the UI when the user presses escape',
          syntax: 'ShowGameUINoExtraKeyBinds',
          icon: '🎮',
        },
        change_instance: {
          name: 'Change Instance',
          command: 'ChangeInstance',
          description: 'Change to an already created instance of the same map. Only works while not at red alert',
          syntax: 'ChangeInstance',
          icon: '🔄',
        },
        net_timing_graph: {
          name: 'Net Timing Graph',
          command: 'netTimingGraph',
          description: 'Enable or disable the network timing graph (0=disable, 1=enable)',
          syntax: 'netTimingGraph <0/1>',
          icon: '📊',
          customizable: true,
          parameters: {
            state: { type: 'number', min: 0, max: 1, default: 1 },
          },
        },
        net_timing_graph_alpha: {
          name: 'Net Timing Graph Alpha',
          command: 'netTimingGraphAlpha',
          description: 'Set transparency level for network timing graph (50=highest transparency, 255=no transparency)',
          syntax: 'netTimingGraphAlpha <50-255>',
          icon: '🎨',
          customizable: true,
          parameters: {
            alpha: { type: 'number', min: 50, max: 255, default: 255 },
          },
        },
        net_timing_graph_paused: {
          name: 'Net Timing Graph Paused',
          command: 'netTimingGraphPaused',
          description: 'Pause or resume the network timing graph (0=pause disabled, 1=pause enabled)',
          syntax: 'netTimingGraphPaused <0/1>',
          icon: '⏸️',
          customizable: true,
          parameters: {
            state: { type: 'number', min: 0, max: 1, default: 0 },
          },
        },
        netgraph: {
          name: 'Net Graph',
          command: 'netgraph',
          description: 'Display SND and RCV network data as text (1=enabled, 0=disabled)',
          syntax: 'netgraph <0/1>',
          icon: '🌐',
          customizable: true,
          parameters: {
            state: { type: 'number', min: 0, max: 1, default: 1 },
          },
        },
      },
    },

 

  }, // <-- closes STO_DATA.commands object

  // Command templates for common scenarios
  templates: {
    space_combat: {
      basic_attack: {
        name: 'Basic Attack Sequence',
        description: 'Target enemy and fire all weapons',
        commands: ['Target_Enemy_Near', 'FireAll'],
      },
      defensive_sequence: {
        name: 'Defensive Sequence',
        description: 'Target self and activate defensive abilities',
        commands: ['Target_Self', '+power_exec Distribute_Shields'],
      },
      alpha_strike: {
        name: 'Alpha Strike',
        description: 'Full offensive sequence with buffs',
        commands: ['Target_Enemy_Near', 'FireAll'],
      },
      healing_sequence: {
        name: 'Emergency Healing',
        description: 'Self-healing and damage control',
        commands: ['Target_Self', '+power_exec Distribute_Shields'],
      },
    },
    ground_combat: {
      basic_ground_attack: {
        name: 'Basic Ground Attack',
        description: 'Target and attack sequence for ground combat',
        commands: ['Target_Enemy_Near', '+STOTrayExecByTray 0 0'],
      },
    },
  },

  // Default profiles
  defaultProfiles: {
    default: {
      "name": "Default",
      "description": "Default keybind configuration",
      "currentEnvironment": "space",
      "builds": {
        "space": {
          "keys": {
            "Space": [
              "+TrayExecByTray 8 0",
              "+TrayExecByTray 8 1",
              "+TrayExecByTray 8 2",
              "+TrayExecByTray 8 3",
              "+TrayExecByTray 8 4",
              "+TrayExecByTray 8 5",
              "+TrayExecByTray 8 6",
              "+TrayExecByTray 8 7",
              "+TrayExecByTray 8 8",
              "+TrayExecByTray 8 9"
            ],
            "F1": [
              "+TrayExecByTray 9 0",
              "+TrayExecByTray 9 1",
              "+TrayExecByTray 9 2",
              "+TrayExecByTray 9 3",
              "+TrayExecByTray 9 4",
              "+TrayExecByTray 9 5",
              "+TrayExecByTray 9 6",
              "+TrayExecByTray 9 7",
              "+TrayExecByTray 9 8",
              "+TrayExecByTray 9 9"
            ],
            "F2": [
              "+TrayExecByTray 3 0",
              "+TrayExecByTray 3 1",
              "+TrayExecByTray 3 2",
              "+TrayExecByTray 3 3",
              "+TrayExecByTray 3 4"
            ],
            "F3": [
              "+TrayExecByTray 3 5",
              "+TrayExecByTray 3 6",
              "+TrayExecByTray 3 7",
              "+TrayExecByTray 3 8",
              "+TrayExecByTray 3 9"
            ],
            "F4": [
              "+TrayExecByTray 4 0",
              "+TrayExecByTray 4 1",
              "+TrayExecByTray 4 2",
              "+TrayExecByTray 4 3",
              "+TrayExecByTray 4 4"
            ],
            "F5": [
              "+TrayExecByTray 4 5",
              "+TrayExecByTray 4 6",
              "+TrayExecByTray 4 7",
              "+TrayExecByTray 4 8",
              "+TrayExecByTray 4 9"
            ],
            "Z": [
              "+TrayExecByTray 6 0",
              "+TrayExecByTray 6 1",
              "+TrayExecByTray 6 2",
              "+TrayExecByTray 6 3",
              "+TrayExecByTray 6 4"
            ],
            "C": [
              "+TrayExecByTray 6 5",
              "+TrayExecByTray 6 6",
              "+TrayExecByTray 6 7",
              "+TrayExecByTray 6 8",
              "+TrayExecByTray 6 9"
            ],
            "`": [
              "Target_Enemy_Near_ForArc 90",
              "PlayerSay Target Arc=90"
            ],
            "Alt+`": [
              "Target_Enemy_Near_ForArc 180",
              "PlayerSay Target Arc=180"
            ],
            "LSHIFT": [
              "FireAll"
            ],
            "F9": [
              "dynFxSetFXExclusionList_Space"
            ],
            "F10": [
              "toggle_combatlog"
            ],
            "F11": [
              "bind_load_file Default_space.txt"
            ],
            "numpad0": [
              "toggle_default_auto_attack_off"
            ],
            "numpad1": [
              "toggle_default_auto_attack_on"
            ]
          }
        },
        "ground": {
          "keys": {
            "X": [
              "+TrayExecByTray 7 0",
              "+TrayExecByTray 7 1",
              "+TrayExecByTray 7 2",
              "+TrayExecByTray 7 3",
              "+TrayExecByTray 7 4",
              "+TrayExecByTray 7 5",
              "+TrayExecByTray 7 6",
              "+TrayExecByTray 7 7",
              "+TrayExecByTray 7 8",
              "+TrayExecByTray 7 9"
            ],
            "F1": [
              "+TrayExecByTray 6 0",
              "+TrayExecByTray 6 1",
              "+TrayExecByTray 6 2"
            ],
            "F2": [
              "+TrayExecByTray 6 3",
              "+TrayExecByTray 6 4",
              "+TrayExecByTray 6 5"
            ],
            "F3": [
              "+TrayExecByTray 6 6",
              "+TrayExecByTray 6 7",
              "+TrayExecByTray 6 8",
              "+TrayExecByTray 6 9"
            ],
            "T": [
              "+TrayExecByTray 5 0",
              "+TrayExecByTray 5 1",
              "+TrayExecByTray 5 2",
              "+TrayExecByTray 5 3",
              "+TrayExecByTray 5 4"
            ],
            "Y": [
              "+TrayExecByTray 5 5",
              "+TrayExecByTray 5 6",
              "+TrayExecByTray 5 7",
              "+TrayExecByTray 5 8",
              "+TrayExecByTray 5 9"
            ],
            "F9": [
              "dynFxSetFXExclusionList_Ground"
            ],
            "F10": [
              "toggle_combatlog"
            ],
            "F11": [
              "bind_load_file Default_ground.txt"
            ]
          }
        },
        "alias": {
          "keys": {}
        }
      },
      "aliases": {
        "toggle_combatlog": {
          "commands": [
            "toggle_combatlog_on"
          ],
          "description": ""
        },
        "toggle_combatlog_off": {
          "commands": [
            "combatlog 0",
            "PlayerSay Toggle Combat Log: Off",
            "alias toggle_combatlog \"toggle_combatlog_on\"",
            "combatlog"
          ],
          "description": ""
        },
        "toggle_combatlog_on": {
          "commands": [
            "combatlog 1",
            "PlayerSay Toggle Combat Log: On",
            "alias toggle_combatlog \"toggle_combatlog_off\"",
            "combatlog"
          ],
          "description": ""
        },
        "toggle_default_auto_attack": {
          "commands": [
            "toggle_default_auto_attack_on"
          ],
          "description": ""
        },
        "toggle_default_auto_attack_off": {
          "commands": [
            "defaultautoattack 0",
            "PlayerSay Toggle Default Auto Attack: Off",
            "alias toggle_default_auto_attack \"toggle_default_auto_attack_on\""
          ],
          "description": ""
        },
        "toggle_default_auto_attack_on": {
          "commands": [
            "defaultautoattack 1",
            "PlayerSay Toggle Default Auto Attack: On",
            "alias toggle_default_auto_attack \"toggle_default_auto_attack_off\""
          ],
          "description": ""
        }
      },
      "created": "2025-07-11T00:19:39.458Z",
      "lastModified": "2025-07-11T02:01:08.466Z",
      "migrationVersion": "2.0.0",
      "id": "default_space",
      "keybindMetadata": {
        "space": {
          "Space": {
            "stabilizeExecutionOrder": true
          },
          "F1": {
            "stabilizeExecutionOrder": true
          },
          "F2": {
            "stabilizeExecutionOrder": true
          },
          "F3": {
            "stabilizeExecutionOrder": true
          },
          "F4": {
            "stabilizeExecutionOrder": true
          },
          "F5": {
            "stabilizeExecutionOrder": true
          },
          "Z": {
            "stabilizeExecutionOrder": true
          },
          "C": {
            "stabilizeExecutionOrder": true
          }
        },
        "ground": {
          "X": {
            "stabilizeExecutionOrder": true
          },
          "F3": {
            "stabilizeExecutionOrder": true
          },
          "F2": {
            "stabilizeExecutionOrder": true
          },
          "F1": {
            "stabilizeExecutionOrder": true
          },
          "T": {
            "stabilizeExecutionOrder": true
          },
          "Y": {
            "stabilizeExecutionOrder": true
          }
        }
      },
      "aliasMetadata": {},
      "selections": {
        "space": "F1",
        "alias": "toggle_combatlog",
        "ground": "F1"
      },
      "vertigoSettings": {
        "selectedEffects": {
          "space": [],
          "ground": []
        },
        "showPlayerSay": true
      }
    }, 
  },

  // Comprehensive key definitions organized by category
  keys: {
    common: {
      name: 'Common Keys',
      description: 'Most frequently used keys',
      keys: [
        { key: 'Space', description: 'Spacebar' },
        { key: '1', description: 'Number 1' },
        { key: '2', description: 'Number 2' },
        { key: '3', description: 'Number 3' },
        { key: '4', description: 'Number 4' },
        { key: '5', description: 'Number 5' },
        { key: 'F1', description: 'Function Key 1' },
        { key: 'F2', description: 'Function Key 2' },
        { key: 'F3', description: 'Function Key 3' },
        { key: 'F4', description: 'Function Key 4' },
        { key: 'Tab', description: 'Tab' },
        { key: 'enter', description: 'Main Enter Key' },
        { key: 'Shift', description: 'Shift' },
        { key: 'Control', description: 'Control' },
        { key: 'ALT', description: 'Alt' },
      ],
    },
    letters: {
      name: 'Letter Keys',
      description: 'A-Z keyboard letters',
      keys: [
        { key: 'A', description: 'Key A' },
        { key: 'B', description: 'Key B' },
        { key: 'C', description: 'Key C' },
        { key: 'D', description: 'Key D' },
        { key: 'E', description: 'Key E' },
        { key: 'F', description: 'Key F' },
        { key: 'G', description: 'Key G' },
        { key: 'H', description: 'Key H' },
        { key: 'I', description: 'Key I' },
        { key: 'J', description: 'Key J' },
        { key: 'K', description: 'Key K' },
        { key: 'L', description: 'Key L' },
        { key: 'M', description: 'Key M' },
        { key: 'N', description: 'Key N' },
        { key: 'O', description: 'Key O' },
        { key: 'P', description: 'Key P' },
        { key: 'Q', description: 'Key Q' },
        { key: 'R', description: 'Key R' },
        { key: 'S', description: 'Key S' },
        { key: 'T', description: 'Key T' },
        { key: 'U', description: 'Key U' },
        { key: 'V', description: 'Key V' },
        { key: 'W', description: 'Key W' },
        { key: 'X', description: 'Key X' },
        { key: 'Y', description: 'Key Y' },
        { key: 'Z', description: 'Key Z' },
      ],
    },
    numbers: {
      name: 'Number Keys',
      description: 'Number row and numpad',
      keys: [
        { key: '0', description: 'Number 0' },
        { key: '6', description: 'Number 6' },
        { key: '7', description: 'Number 7' },
        { key: '8', description: 'Number 8' },
        { key: '9', description: 'Number 9' },
        { key: 'numpad0', description: 'Numerical Keypad 0' },
        { key: 'numpad1', description: 'Numerical Keypad 1' },
        { key: 'numpad2', description: 'Numerical Keypad 2' },
        { key: 'numpad3', description: 'Numerical Keypad 3' },
        { key: 'numpad4', description: 'Numerical Keypad 4' },
        { key: 'numpad5', description: 'Numerical Keypad 5' },
        { key: 'numpad6', description: 'Numerical Keypad 6' },
        { key: 'numpad7', description: 'Numerical Keypad 7' },
        { key: 'numpad8', description: 'Numerical Keypad 8' },
        { key: 'numpad9', description: 'Numerical Keypad 9' },
        { key: 'Decimal', description: 'Numerical Keypad Decimal' },
        { key: 'Divide', description: 'Numerical Keypad Divide' },
        { key: 'Multiply', description: 'Multiply (*)' },
        { key: 'Subtract', description: 'Subtract (-)' },
        { key: 'Add', description: 'Add (+)' },
        { key: 'numpadenter', description: 'Numerical Keypad Enter' },
      ],
    },
    function: {
      name: 'Function Keys',
      description: 'F1-F24 function keys',
      keys: [
        { key: 'F5', description: 'Function Key 5' },
        { key: 'F6', description: 'Function Key 6' },
        { key: 'F7', description: 'Function Key 7' },
        { key: 'F8', description: 'Function Key 8' },
        { key: 'F9', description: 'Function Key 9' },
        { key: 'F10', description: 'Function Key 10' },
        { key: 'F11', description: 'Function Key 11' },
        { key: 'F12', description: 'Function Key 12' },
        { key: 'F13', description: 'Function Key 13' },
        { key: 'F14', description: 'Function Key 14' },
        { key: 'F15', description: 'Function Key 15' },
        { key: 'F16', description: 'Function Key 16' },
        { key: 'F17', description: 'Function Key 17' },
        { key: 'F18', description: 'Function Key 18' },
        { key: 'F19', description: 'Function Key 19' },
        { key: 'F20', description: 'Function Key 20' },
        { key: 'F21', description: 'Function Key 21' },
        { key: 'F22', description: 'Function Key 22' },
        { key: 'F23', description: 'Function Key 23' },
        { key: 'F24', description: 'Function Key 24' },
      ],
    },
    arrows: {
      name: 'Arrow & Navigation',
      description: 'Arrow keys and navigation',
      keys: [
        { key: 'Up', description: 'Arrow Key: Up' },
        { key: 'Down', description: 'Arrow Key: Down' },
        { key: 'Left', description: 'Arrow Key: Left' },
        { key: 'Right', description: 'Arrow Key: Right' },
        { key: 'Home', description: 'Home' },
        { key: 'End', description: 'End' },
        { key: 'PageUp', description: 'Page Up' },
        { key: 'PageDown', description: 'Page Down' },
        { key: 'insert', description: 'Insert' },
        { key: 'delete', description: 'Delete' },
      ],
    },
    modifiers: {
      name: 'Modifier Keys',
      description: 'Shift, Ctrl, Alt variations',
      keys: [
        { key: 'ALT', description: 'Alt' },
        { key: 'LALT', description: 'Alt (Left)' },
        { key: 'RALT', description: 'Alt (Right)' },
        { key: 'CTRL', description: 'Control' },
        { key: 'LCTRL', description: 'Control (Left)' },
        { key: 'RCTRL', description: 'Control (Right)' },
      ],
    },
    symbols: {
      name: 'Symbol Keys',
      description: 'Punctuation and symbols',
      keys: [
        { key: '[', description: '[' },
        { key: ']', description: ']' },
        { key: '\\', description: '\\' },
        { key: ',', description: 'Comma (,)' },
        { key: '.', description: 'Period (.)' },
        { key: '/', description: 'Divide (/)' },
        { key: '`', description: 'Tilda Key (~)' },
      ],
    },
    mouse: {
      name: 'Mouse Controls',
      description: 'Mouse buttons and scroll',
      keys: [
        { key: 'Lbutton', description: 'Mouse Left Press' },
        { key: 'Rbutton', description: 'Mouse Right Press' },
        { key: 'Middleclick', description: 'Mouse Middle Click' },
        { key: 'Button1', description: 'Mouse Button 1' },
        { key: 'Button2', description: 'Mouse Button 2' },
        { key: 'Button3', description: 'Mouse Button 3' },
        { key: 'Button4', description: 'Mouse Button 4' },
        { key: 'Button5', description: 'Mouse Button 5' },
        { key: 'Button6', description: 'Mouse Button 6' },
        { key: 'Button7', description: 'Mouse Button 7' },
        { key: 'Button8', description: 'Mouse Button 8' },
        { key: 'Button9', description: 'Mouse Button 9' },
        { key: 'Button10', description: 'Mouse Button 10' },
        { key: 'Wheelplus', description: 'Mouse Scroll Up' },
        { key: 'Wheelminus', description: 'Mouse Scroll Down' },
      ],
    },
    gamepad: {
      name: 'Xbox Controller',
      description: 'Xbox/Gamepad controls',
      keys: [
        { key: 'Joy1', description: 'XBOX Contr [Start]' },
        { key: 'Joy2', description: 'XBOX Contr [Back]' },
        { key: 'Joy3', description: 'XBOX Contr [L Thumb depress]' },
        { key: 'Joy4', description: 'XBOX Contr [R Thumb depress]' },
        { key: 'Joy5', description: 'XBOX Contr [Left Bumper]' },
        { key: 'Joy6', description: 'XBOX Contr [Right Bumper]' },
        { key: 'Joy7', description: 'XBOX Contr [Left Trigger]' },
        { key: 'Joy8', description: 'XBOX Contr [Right Trigger]' },
        { key: 'Joy9', description: 'XBOX Contr [A Button]' },
        { key: 'Joy10', description: 'XBOX Contr [B Button]' },
        { key: 'Joy11', description: 'XBOX Contr [X Button]' },
        { key: 'Joy12', description: 'XBOX Contr [Y Button]' },
        { key: 'Joypad_up', description: 'XBOX Contr [Pad up]' },
        { key: 'Joypad_down', description: 'XBOX Contr [Pad down]' },
        { key: 'Joypad_left', description: 'XBOX Contr [Pad left]' },
        { key: 'Joypad_right', description: 'XBOX Contr [Pad right]' },
        { key: 'Lstick_up', description: 'XBOX Contr [Left Stick up]' },
        { key: 'Lstick_down', description: 'XBOX Contr [Left Stick down]' },
        { key: 'Lstick_left', description: 'XBOX Contr [Left Stick left]' },
        { key: 'Lstick_right', description: 'XBOX Contr [Left Stick right]' },
        { key: 'Rstick_up', description: 'XBOX Contr [Right Stick up]' },
        { key: 'Rstick_down', description: 'XBOX Contr [Right Stick down]' },
        { key: 'Rstick_left', description: 'XBOX Contr [Right Stick left]' },
        { key: 'Rstick_right', description: 'XBOX Contr [Right Stick right]' },
      ],
    },
  },

  // Validation rules
  validation: {
    keyNamePattern: 'USE_STO_KEY_NAMES', // Use STO_KEY_NAMES list for validation
    aliasNamePattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
    maxCommandsPerKey: 20,
    maxKeysPerProfile: 100,
  },

  // Application settings
  settings: {
    version: '1.0.0',
    autoSave: true,
    maxUndoSteps: 50,
    defaultMode: 'space',
    language: 'en',
  },

  // STO Variables that can be used in commands
  variables: {
    target: {
      variable: '$Target',
      description: 'Replaced with the name of your current target',
      example: 'team Target [$Target]',
      usableIn: ['communication', 'custom', 'aliases'],
      notes:
        "If your target's name is 'froggyMonster', this will output 'Target [froggyMonster]'",
    },
  },

  // VFX Effects data for disabling via dynFxSetFXExclusionList (migrated from vertigo_data.js)
  vfxEffects: {
    space: [
      {
        label: 'Advanced inhibiting turret shield bubble',
        effect: 'Fx_Rep_Temporal_Ship_Chroniton_Stabilization_Proc',
      },
      {
        label: 'Approaching Agony',
        effect: 'Cfx_Lockboxfx_Cb29_Ship_Agony_Field',
      },
      { label: 'Attack Pattern Alpha', effect: 'Fx_Ship_Tac_Attackpatternalpha' },
      { label: 'Attack Pattern Beta', effect: 'Fx_Ship_Tac_Attackpatternbeta' },
      { label: 'Attack Pattern Delta', effect: 'Fx_Ship_Tac_Attackpatterndelta' },
      { label: 'Attack Pattern Omega', effect: 'Fx_Ship_Tac_Attackpatternomega' },
      { label: 'Beacon of Kahless', effect: 'Fx_Er_Bbs_Beacon_Of_Kahless_Flash' },
      {
        label: 'Boost Morale',
        effect:
          'Fx_Ship_Spec_Powers_Command_Boost_Morale_Bufffx,Cfx_Ship_Spec_Powers_Command_Boost_Morale_Activate',
      },
      {
        label: 'Brace for Impact',
        effect: 'Fx_Bop_Braceforimpact,Cfx_Ship_Sci_Hazardemitter_Buff',
      },
      {
        label: 'Breath of the Dragon',
        effect: 'Fx_Ship_Cp_T6_Hysperian_Dragonbreath',
      },
      {
        label: 'Call Emergency Artillery',
        effect:
          'Fx_Ships_Boffs_Cmd_Callartillery_Activate,Fx_Ships_Boffs_Cmd_Callartillery_Explosion',
      },
      {
        label: 'Competitive Engine Buff Effect',
        effect: 'Fx_Ship_Mod_Haste_Buff_Gen',
      },
      {
        label: 'Co-opt Energy Weapons',
        effect:
          'Fx_Capt_Powers_Ship_Sci_Coopt_Energy_Wep_Aoe,Cfx_Capt_Powers_Ship_Sci_Coopt_Energy_Wep_Area',
      },
      {
        label: 'Concentrate Fire Power',
        effect:
          'Fx_Ships_Boff_Cmd_Confire_Activatefx,Cfx_Ships_Boff_Cmd_Confire_Mark',
      },
      {
        label: 'Cnidarian Jellyfish AoE',
        effect: 'Cfx_Ship_Sp_T6_Jellyfish_Cnidarian_Defense_Aoe',
      },
      {
        label: 'Dark Matter Anomaly',
        effect: 'Cfx_Ship_Console_Dark_Matter_Anamoly_Costumefx',
      },
      { label: 'Delphic Tear', effect: 'Fx_Ships_Consoles_Cb21_Delphictear' },
      {
        label: 'Destabilising Resonance Beam',
        effect: 'P_Er_Ship_Destabilizing_Resonance_Beam_Aoe_Particles',
      },
      {
        label: 'Elachi Walker Combat Pet (3 effects)',
        effect:
          'Soundfx_Elachiwalker_Footstep_Pet,Fx_Er_Tfo_Elachi_Walker_Combat_Pet_Deathfx,Soundfx_Elachiwalker_Petsummon',
      },
      {
        label: 'Electrified Anomalies Trait',
        effect:
          'Fx_Tp_Ship_T6_Risian_Science_Electrified_Anomalies_Arc_Foe,Fx_Tp_Ship_T6_Risian_Science_Electrified_Anomalies_Arc_Friend',
      },
      {
        label: 'Emergency Pwr to Shields',
        effect: 'Fx_Ship_Eng_Emergencypowershields',
      },
      {
        label: 'Emergency Pwr to Wep',
        effect: 'Fx_Ship_Eng_Emergencypowerweapons',
      },
      {
        label: 'Engineering Fleet III',
        effect: 'Fx_Ship_Boff_Fleet_Capt_Engineering_Teambuff',
      },
      {
        label: 'Engineering Team',
        effect: 'Cfx_Ship_Crewteam_Engineeringteam_Buff',
      },
      {
        label: 'EPS Power Transfer',
        effect: 'Cfx_Ship_Eng_Epspowertransfer_Target',
      },
      { label: 'Focus Frenzy', effect: 'Fx_Skilltree_Ship_Ffrenzy_Activatefx' },
      { label: 'Go Down Fighting', effect: 'Fx_Bop_Godownfighting' },
      { label: 'Hangar Pet Rank Up', effect: 'Fx_Ship_Levelup_Fighter_Rankup' },
      { label: 'Hazard Emitters', effect: 'Cfx_Ship_Sci_Hazardemitter_Buff' },
      {
        label: 'Intel Fleet III',
        effect: 'Fx_Ship_Boff_Fleet_Capt_Intel_Teambuff',
      },
      {
        label: 'Intel Team (uses 3 effects)',
        effect:
          'Cfx_Ship_Cruiser_Auras_Taunt,Cfx_Spc_Boffpowers_Intel_Intelteam_Buff,Fx_Ships_Intel_Lyinginwait',
      },
      {
        label: 'Kemocite on ship animation',
        effect: 'C1_E_Ship_Xindi_Lockboxcb15_Kemocite_Weaponry_Bufffx',
      },
      {
        label: 'Kemocite HitFX ring',
        effect: 'Fx_Ship_Xindi_Lockboxcb15_Kemocite_Weaponry_Aoe_Proc',
      },
      {
        label: 'Kentari Ferocity Weapons Glow',
        effect: 'P_Trait_Powers_Ship_Lukari_Colony_Kentari_Ferocity_Weapons_Glow',
      },
      {
        label: 'Kobayashi Maru powerup silenced',
        effect:
          'Fx_Evr_Kmaru_Ship_Dev_Resupply_Drop_Powerup_Bufffx,Fx_Evr_Kmaru_Ship_Dev_Resupply_Drop_Powerup',
      },
      {
        label: 'Less Obvious Loot Drop Common',
        effect: 'Cfx_Space_Loot_Drop_Common_Costumefx',
      },
      {
        label: 'Less Obvious Loot Drop Uncommon',
        effect: 'Cfx_Space_Loot_Drop_Uncommon_Costumefx',
      },
      {
        label: 'Less Obvious Loot Drop Rare',
        effect: 'Cfx_Space_Loot_Drop_Rare_Costumefx',
      },
      {
        label: 'Less Obvious Loot Drop Very Rare',
        effect: 'Cfx_Space_Loot_Drop_Veryrare_Costumefx',
      },
      {
        label: 'Less Obvious Loot Drop Lock Box',
        effect: 'Cfx_Space_Loot_Drop_Chancebox_Costumefx',
      },
      {
        label: 'Less Obvious Loot Drop Dilithium',
        effect: 'Cfx_Space_Loot_Drop_Dilithium_Costumefx',
      },
      { label: 'Miraculous Repairs', effect: 'Fx_Bop_Miracleworker' },
      {
        label: 'MW - Align Shield Frequencies',
        effect: 'Fx_Spc_Boffpowers_Miracleworker_Alignshieldfrequencies_Hitfx',
      },
      {
        label: 'MW - Destabilize Warp Core',
        effect: 'Fx_Spc_Boffpowers_Miracleworker_Destabilizewarpcore',
      },
      {
        label: 'MW - Exceed rated limits',
        effect:
          'Fx_Spc_Boffpowers_Miracleworker_Energyweaponsexceedratedlimits_Dot_Hitfx,Fx_Spc_Boffpowers_Miracleworker_Energyweaponsexceedratedlimits',
      },
      {
        label: 'MW - Fix em up (and other green glows)',
        effect: 'Fx_Ship_Mod_Damage_Buff',
      },
      {
        label: 'MW - Mixed Armaments Synergy',
        effect: 'Fx_Spc_Boffpowers_Miracleworker_Mixedarmamentssynergy',
      },
      {
        label: 'MW - Narrow Sensor Bands',
        effect: 'Fx_Spc_Boffpowers_Miracleworker_Narrowsensorbands',
      },
      {
        label: 'MW - Null Pointer Flood',
        effect: 'Fx_Spc_Boffpowers_Miracleworker_Nullpointerflood',
      },
      {
        label: 'MW - Reroute shilds to Hull containment',
        effect:
          'Fx_Spc_Boffpowers_Miracleworker_Rerouteshieldstohullcontainment,Cfx_Spc_Boffpowers_Miracleworker_Rerouteshieldstohullcontainment',
      },
      { label: 'Nadion Inversion', effect: 'Fx_Bop_Nadioinversion' },
      {
        label: 'Nanoprobe Shield Generator (Dyson Rep)',
        effect: 'Cfx_Rp_Dyson_Ship_Reactive_Shielding',
      },
      {
        label: 'Neutronic Eddies',
        effect: 'Cfx_Ships_Cp_T6_Risian_Science_Neutronic_Edides_Costumefx',
      },
      {
        label: 'Overwhelm Emitters',
        effect: 'Fx_Ships_Boff_Cmd_Owemitters_Activatefx',
      },
      { label: 'Photonic Officer', effect: 'Fx_Bop_Photonicofficer_activate' },
      {
        label: 'PILOT - Clean Getaway',
        effect: 'Fx_Spc_Boff_Pilot_Cleangetaway_Activate',
      },
      {
        label: 'PILOT - Coolant Ignition (mostly)',
        effect:
          'Fx_Spc_Boff_Pilot_Coolantinjection_Ignite,Fx_Spc_Boff_Pilot_Coolantinjection_Costumefx',
      },
      {
        label: 'PILOT - Deploy Countermeasures',
        effect: 'Fx_Spc_Boff_Pilot_Deploycm',
      },
      {
        label: 'PILOT - Fly her apart',
        effect: 'Cfx_Spc_Boff_Pilot_Flyapart_Dot',
      },
      {
        label: 'PILOT - Form Up (mostly)',
        effect:
          'Fx_Spc_Boff_Pilot_Formup_Teleport,Fx_Spc_Boff_Pilot_Formup_Buff_Wepbuff',
      },
      {
        label: 'PILOT - hold Together',
        effect: 'Cfx_Spc_Boff_Pilot_Holdtogether',
      },
      {
        label: 'PILOT - Lambda',
        effect:
          'Fx_Ship_Mod_Damage_Buff,Fx_Spc_Boff_Pilot_Aplambda_Bufffx,Fx_Spc_Boff_Pilot_Aplambda',
      },
      {
        label: 'PILOT - Lock Trajectory',
        effect:
          'Fx_Spc_Boff_Pilot_Flares_Switch,Cfx_Spc_Boff_Pilot_Locktrajectory',
      },
      {
        label: 'PILOT - Pilot Team',
        effect: 'Cfx_Spc_Boff_Pilot_Pilotteam_Buff',
      },
      {
        label: 'PILOT - Reroute Reserves to Weapons',
        effect:
          'Fx_Spc_Boff_Pilot_Reroute_Wepbuff,Fx_Spc_Boff_Pilot_Reroute_Activate',
      },
      {
        label: 'PILOT - Subspace Boom',
        effect:
          'Cfx_Spc_Boff_Pilot_Ssboom_Costumefx_Neverdie,Fx_Spc_Boff_Pilot_Ssboom_Boom',
      },
      {
        label: 'Plasma Storm',
        effect: 'Cfx_Ship_Cp_Cb27_Generate_Plasma_Storm_Costumefx',
      },
      {
        label: 'Rally Point Marker',
        effect: 'Cfx_Ships_Boff_Cmd_Rallypoint_Marker',
      },
      {
        label: 'Reverse Shield Polarity',
        effect: 'Cfx_Ship_Eng_Reverseshieldpolarity_Buff',
      },
      {
        label: 'Scattering Field',
        effect:
          'Cfx_Ship_Sci_Dampeningfield_Aoe,Cfx_Ship_Sci_Dampeningfield_Shield_Buff',
      },
      { label: 'Science Team', effect: 'Cfx_Ship_Crewteam_Scienceteam_Buff' },
      {
        label: 'Science Fleet III',
        effect: 'Fx_Ship_Boff_Fleet_Capt_Science_Teambuff',
      },
      {
        label: 'Soliton Wave Generator (uses 4 effects)',
        effect:
          'Cfx_Ship_Risa_Loot_Soliton_Wave_Suckfx_Target,Cfx_Ship_Risa_Loot_Soliton_Wave_Suckfx,Cfx_Ship_Risa_Loot_Soliton_Wave_Out,Cfx_Ship_Risa_Loot_Soliton_Wave_In',
      },
      {
        label: 'Spore Infused Anomalies',
        effect: 'Fx_Trait_Powers_Ship_T6_Somerville_Sia_Blast',
      },
      {
        label: 'Subspace Vortex Teleport Effect',
        effect: 'Fx_Ship_Xindi_Lockboxcb15_Subspace_Vortex_Teleport',
      },
      {
        label: 'Suppression Barrage',
        effect: 'Cfx_Ships_Boff_Cmd_Sbarrage_Buff',
      },
      {
        label: 'Surgical Strikes',
        effect: 'Fx_Spc_Boffpowers_Int_Sstrikes_Buff',
      },
      {
        label: 'Tactical Fleet III',
        effect: 'Fx_Ship_Boff_Fleet_Capt_Tactical_Teambuff',
      },
      { label: 'Tactical Initiative', effect: 'Fx_Bop_Tacticalinitiative' },
      { label: 'Tactical Team', effect: 'Cfx_Ship_Crewteam_Tacticalteam_Buff' },
      {
        label: 'Target Rich Environment',
        effect: 'Fx_Ship_Trait_Cb20_Targetrichenvironment',
      },
      {
        label: 'Temporal Anchor',
        effect: 'Cfx_Ship_Trait_Temporal_Anchor_Costumefx',
      },
      {
        label: 'Temporal Vortex Probe',
        effect:
          'C1_Eventreward_Fcd_Temporal_Vortex_Costumefx,Fx_Eventreward_Fcd_Temporal_Vortex_Blast',
      },
      {
        label: 'Timeline Collapse (5 effects!)',
        effect:
          'Cfx_Ship_Temp_Tcollapse_Costume,Fx_Ship_Temp_Tcollapse_Hitfx,Fx_Ship_Temp_Tcollapse_Explode,Fx_Ship_Temp_Tcollapse_Beamhitfx,Fx_Ship_Temp_Tcollapse',
      },
      {
        label: "V'Ger Torpedo (Volatile Digital Transformation)",
        effect:
          'Fx_Ship_Torpedo_Plasma_Vger_Anniv_Explode,Cfx_Ship_Torpedo_Vger_Disintegrate_In_Tintable',
      },
      {
        label: 'Viral Impulse Burst',
        effect: 'Fx_Spc_Boffpowers_int_Viralimpulse',
      },
      {
        label: 'Vulcan Jelly Fish Eject Red Matter',
        effect: 'Cfx_ship_jellyfish_eject_red_matter_costumefx',
      },
      {
        label: 'Vulnerability Assessment Sweep',
        effect: 'Fx_Capt_Powers_Ship_Tac_Vulnerability_Assessment_Sweep',
      },
    ],
    ground: [
      {
        label: 'Agony Field Generator',
        effect: 'Fx_Ground_Lockboxfx_Cb29_Agony_Field_Generator',
      },
      {
        label: 'Anti-time ground',
        effect: 'Cfx_Rep_Temp_Char_Kit_Sci_Antitime_Entanglement_Field_Costumefx',
      },
      {
        label: 'Ball Lightning',
        effect: 'Cfx_Char_Kit_Univ_Sum_Ball_Lightning_Costumefx',
      },
      { label: 'Chaos Blaze', effect: 'Cfx_Char_Chaos_Blaze_Aoe' },
      {
        label: 'Conussive Tachyon Emission',
        effect: 'fx_Char_Delta_Rep_Cte_Aoe',
      },
      { label: 'Disco Ball (Party Bomb)', effect: 'Cfx_Char_Device_Partybomb' },
      {
        label: 'Dot-7 Drone Support Field',
        effect: 'Cfx_Er_Bbs_char_Dot7_Drone_support_Field',
      },
      {
        label: 'Eng Proficiency (Character Glow)',
        effect: 'Cfx_Ground_Kit_Eng_Engineeringproficiency',
      },
      {
        label: 'Ever Watchful',
        effect:
          'Cfx_Ground_Kit_Tac_Overwatch_Bufffx,Fx_Ground_Kit_Tac_Overwatch_Activatefx',
      },
      {
        label: 'Herald AP Beam Projector ground weapon',
        effect:
          'Fx_Char_Icoenergy_Rifle_Energyblast,Fx_Char_Icoenergy_Assault_Beam_Lockbox',
      },
      {
        label: 'Lava Floor',
        effect:
          'Cfx_Char_Kit_Univ_Sum_The_Floor_Is_Lava_Costumefx,Cfx_Char_Kit_Univ_Sum_The_Floor_Is_Lava_Geyser',
      },
      {
        label: 'Less Obvious Loot Drop Common',
        effect: 'Cfx_Gnd_Loot_Drop_Common_Costumefx',
      },
      {
        label: 'Less Obvious Loot Drop Uncommon',
        effect: 'Cfx_Gnd_Loot_Drop_Uncommon_Costumefx',
      },
      {
        label: 'Less Obvious Loot Drop Rare',
        effect: 'Cfx_Gnd_Loot_Drop_Rare_Costumefx',
      },
      {
        label: 'Less Obvious Loot Drop Very Rare',
        effect: 'Cfx_Gnd_Loot_Drop_Veryrare_Costumefx',
      },
      {
        label: 'Less Obvious Loot Drop Lock Box',
        effect: 'Cfx_Gnd_Loot_Drop_Chancebox_Costumefx',
      },
      {
        label: 'Less Obvious Loot Drop Dilithium',
        effect: 'Cfx_Gnd_Loot_Drop_Dilithium_Costumefx',
      },
      {
        label: 'Motivation (Tac Kit Module)',
        effect: 'Cfx_Ground_Kit_Tac_Motivation_Buff,Fx_Ground_Kit_Tac_Motivation',
      },
      {
        label: 'Orbital Devastation',
        effect: 'Fx_Char_Voth_Orbitalstrike_Chasebeam',
      },
      {
        label: 'Pahvan Crystal Prism noisy tether',
        effect: 'Cfx_Er_Tfo_Pahvan_Crystal_Prism_Tether_Beam',
      },
      { label: 'Rally Cry', effect: 'Fx_Ground_Kit_Tac_Rallycry' },
      {
        label: 'Red Riker Gun Sound effect',
        effect: 'Cfx_Ep_Winterevent_Redriker_Sniper_Chargefx',
      },
      {
        label: 'Scientific Aptitude (character glow)',
        effect: 'Cfx_Ground_Kit_Sci_Scientificaptitude',
      },
      {
        label: 'Solar Gateway',
        effect: 'Fx_Char_Ico_Capt_Portal,Fx_Char_Ico_Capt_Portal_Sunbeam',
      },
      {
        label: 'Smoke Grenade',
        effect: 'Fx_Char_Grenade_smoke_costume,Fx_Char_Grenade_Smoke_Explode',
      },
      {
        label: 'Sompek Energy Rebounder',
        effect: 'Fx_Env_Gnd_Qadhos_Arena_Phaserhazard_Cylinder_Turret',
      },
      {
        label: 'Strike Team III (character red glow)',
        effect: 'Cfx_Ground_Kit_Tac_Striketeam',
      },
      {
        label: 'Symphony of Lightning Char Glow',
        effect: 'Fx_Er_Featured_Char_Kuumaarke_Wristgun_Tir_bufffx',
      },
      {
        label: 'Symphony of Lightning Drone AoE',
        effect:
          'Cfx_Er_Featured_Char_Kuumaarke_Set_Symphony_Of_Lightning_Drone_Aoe',
      },
      {
        label: 'Symphony of Lightning STRIKE',
        effect: 'Fx_Er_Featured_Char_Kuumaarke_Set_Symphony_Of_Lightning_Strike',
      },
      {
        label: 'Trajectory Bending',
        effect: 'Cfx_Char_Xindi_Cb15_Tac_Kit_Trajectory_Bending',
      },
      {
        label: 'Visual Dampening Field',
        effect: 'Cfx_Char_Trait_Mirror_Vdfield',
      },
    ],
  },
}

// Make available globally
window.STO_DATA = STO_DATA

// Export VFX Effects data for components that need it (migrated from vertigo_data.js)
window.VFX_EFFECTS = STO_DATA.vfxEffects

// Create flattened data structures for testing
window.COMMAND_CATEGORIES = STO_DATA.commands

// Flatten all commands into a single object
window.COMMANDS = {}
Object.entries(STO_DATA.commands).forEach(([categoryKey, category]) => {
  Object.entries(category.commands).forEach(([commandKey, command]) => {
    window.COMMANDS[commandKey] = {
      ...command,
      category: categoryKey,
      key: commandKey,
    }
  })
})

// Key layouts (if they exist in STO_DATA, otherwise create basic structure)
window.KEY_LAYOUTS = STO_DATA.keyLayouts || {
  qwerty: {
    name: 'QWERTY',
    rows: [
      [
        { key: 'Escape', display: 'Esc' },
        { key: 'F1', display: 'F1' },
        { key: 'F2', display: 'F2' },
        { key: 'F3', display: 'F3' },
        { key: 'F4', display: 'F4' },
        { key: 'F5', display: 'F5' },
        { key: 'F6', display: 'F6' },
        { key: 'F7', display: 'F7' },
        { key: 'F8', display: 'F8' },
        { key: 'F9', display: 'F9' },
        { key: 'F10', display: 'F10' },
        { key: 'F11', display: 'F11' },
        { key: 'F12', display: 'F12' },
      ],
      [
        { key: '`', display: '`' },
        { key: '1', display: '1' },
        { key: '2', display: '2' },
        { key: '3', display: '3' },
        { key: '4', display: '4' },
        { key: '5', display: '5' },
        { key: '6', display: '6' },
        { key: '7', display: '7' },
        { key: '8', display: '8' },
        { key: '9', display: '9' },
        { key: '0', display: '0' },
        { key: '-', display: '-' },
        { key: '=', display: '=' },
        { key: 'Backspace', display: 'Backspace' },
      ],
      [
        { key: 'Tab', display: 'Tab' },
        { key: 'Q', display: 'Q' },
        { key: 'W', display: 'W' },
        { key: 'E', display: 'E' },
        { key: 'R', display: 'R' },
        { key: 'T', display: 'T' },
        { key: 'Y', display: 'Y' },
        { key: 'U', display: 'U' },
        { key: 'I', display: 'I' },
        { key: 'O', display: 'O' },
        { key: 'P', display: 'P' },
        { key: '[', display: '[' },
        { key: ']', display: ']' },
        { key: '\\', display: '\\' },
      ],
      [
        { key: 'CapsLock', display: 'Caps' },
        { key: 'A', display: 'A' },
        { key: 'S', display: 'S' },
        { key: 'D', display: 'D' },
        { key: 'F', display: 'F' },
        { key: 'G', display: 'G' },
        { key: 'H', display: 'H' },
        { key: 'J', display: 'J' },
        { key: 'K', display: 'K' },
        { key: 'L', display: 'L' },
        { key: ';', display: ';' },
        { key: "'", display: "'" },
        { key: 'Enter', display: 'Enter' },
      ],
      [
        { key: 'Shift', display: 'Shift' },
        { key: 'Z', display: 'Z' },
        { key: 'X', display: 'X' },
        { key: 'C', display: 'C' },
        { key: 'V', display: 'V' },
        { key: 'B', display: 'B' },
        { key: 'N', display: 'N' },
        { key: 'M', display: 'M' },
        { key: ',', display: ',' },
        { key: '.', display: '.' },
        { key: '/', display: '/' },
        { key: 'Shift', display: 'Shift' },
      ],
      [
        { key: 'Ctrl', display: 'Ctrl' },
        { key: 'Alt', display: 'Alt' },
        { key: 'Space', display: 'Space' },
        { key: 'Alt', display: 'Alt' },
        { key: 'Ctrl', display: 'Ctrl' },
      ],
    ],
  },
}

// Default settings
window.DEFAULT_SETTINGS = {
  keyLayout: 'qwerty',
  autoSave: STO_DATA.settings?.autoSave || true,
  showTooltips: true,
  exportFormat: 'txt',
  maxUndoSteps: STO_DATA.settings?.maxUndoSteps || 50,
  defaultMode: STO_DATA.settings?.defaultMode || 'space',
  language: STO_DATA.settings?.language || 'en',
}

// Sample profiles
window.SAMPLE_PROFILES = Object.values(STO_DATA.defaultProfiles).map(
  (profile) => ({
    id: profile.name.toLowerCase().replace(/\s+/g, '_'),
    name: profile.name,
    description: profile.description,
    currentEnvironment: profile.currentEnvironment || 'space',
    builds: profile.builds || {
      space: { keys: {} },
      ground: { keys: {} },
    },

    created: new Date().toISOString(),
    modified: new Date().toISOString(),
  })
)

// Sample aliases
window.SAMPLE_ALIASES = {
  attack_sequence: {
    name: 'Attack Sequence',
    commands: ['Target_Enemy_Near', 'FireAll'],
    description: 'Target and attack nearest enemy',
  },
  defensive_sequence: {
    name: 'Defensive Sequence',
    commands: ['Target_Self', '+power_exec Distribute_Shields'],
    description: 'Self-target and activate defensive abilities',
  },
  heal_sequence: {
    name: 'Healing Sequence',
    commands: [
      'Target_Self',
      '+STOTrayExecByTray 3 0 $$ +STOTrayExecByTray 3 1',
    ],
    description: 'Emergency healing and repair sequence',
  },
}

// Tray configuration
window.TRAY_CONFIG = {
  maxTrays: 10,
  slotsPerTray: 10,
  defaultTray: 0,
  maxCommandsPerSlot: 1,
}

// Utility functions for data access
window.localizeCommandData = function () {
  const i18n = window.i18next
  if (!i18n) return

  Object.entries(STO_DATA.commands).forEach(([catKey, category]) => {
    if (category.name) {
      category.name = i18n.t(`command_categories.${catKey}`)
    }
    if (category.description) {
      category.description = i18n.t(
        `category_descriptions.${catKey}`
      )
    }
    Object.entries(category.commands).forEach(([cmdKey, cmd]) => {
      if (cmd.name) {
        cmd.name = i18n.t(`command_definitions.${cmdKey}.name`)
      }
      if (cmd.description) {
        cmd.description = i18n.t(
          `command_definitions.${cmdKey}.description`
        )
      }
    })
  })
}
