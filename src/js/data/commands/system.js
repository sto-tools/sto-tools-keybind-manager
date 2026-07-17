import inventorySystemCommands from "../inventorySystemCommands.js";

export default {
  name: "System",
  icon: "fas fa-cogs",
  description: "UI and system commands",
  commands: {
    toggle_hud: {
      name: "Toggle HUD",
      command: "++ShowGameUI",
      description: "Toggle HUD visibility",
      syntax: "++ShowGameUI",
      icon: "👁️",
    },
    screenshot: {
      name: "Screenshot",
      command: "screenshot",
      description: "Take a screenshot",
      syntax: "screenshot",
      icon: "📷",
    },
    screenshot_jpg: {
      name: "Screenshot JPG",
      command: "screenshot_jpg",
      description: "Save a screenshot as JPG",
      syntax: "screenshot_jpg",
      icon: "📷",
    },
    autofire_set: {
      name: "Set Autofire",
      command: "defaultautoattack",
      description:
        "Turn weapon autofire off and on. X = 1 turns it on and X = 0 turns it off.",
      syntax: "defaultautoattack <x>",
      icon: "🔁",
      customizable: true,
      parameters: {
        state: { type: "number", min: 0, max: 1, default: 1 },
      },
    },
    bind_save_file: {
      name: "Save Binds to File",
      command: "bind_save_file",
      description: "Save all your binds to a text file",
      syntax: "bind_save_file <filename>",
      icon: "💾",
      customizable: true,
      parameters: {
        filename: { type: "text", default: "my_binds.txt" },
      },
    },
    bind_load_file: {
      name: "Load Binds from File",
      command: "bind_load_file",
      description: "Load a bind file into the client",
      syntax: "bind_load_file <filename>",
      icon: "📁",
      customizable: true,
      parameters: {
        filename: { type: "text", default: "my_binds.txt" },
      },
    },
    combat_log: {
      name: "Toggle Combat Log",
      command: "CombatLog",
      description: "Turn combat log recording on/off (1=on, 0=off)",
      syntax: "CombatLog <1/0>",
      icon: "📊",
      customizable: true,
      parameters: {
        state: { type: "number", min: 0, max: 1, default: 1 },
      },
    },
    chat_log: {
      name: "Toggle Chat Log",
      command: "ChatLog",
      description: "Turn chat log recording on/off (1=on, 0=off)",
      syntax: "ChatLog <1/0>",
      icon: "💬",
      customizable: true,
      parameters: {
        state: { type: "number", min: 0, max: 1, default: 1 },
      },
    },
    missions: {
      name: "Show/Hide Missions",
      command: "missions",
      description: "Show/hide the mission journal",
      syntax: "missions",
      icon: "📋",
    },
    ...inventorySystemCommands,
    map: {
      name: "Show/Hide Map",
      command: "Map",
      description: "Show/hide the map window",
      syntax: "Map",
      icon: "🗺️",
    },
    logout: {
      name: "Logout",
      command: "logout",
      description: "Log out the current character",
      syntax: "logout",
      icon: "🚪",
    },
    quit: {
      name: "Quit Game",
      command: "quit",
      description: "Close the window",
      syntax: "quit",
      icon: "❌",
    },
    goto_character_select: {
      name: "Go to Character Select",
      command: "gotoCharacterSelect",
      description: "Go to the character select screen without logging out",
      syntax: "gotoCharacterSelect",
      icon: "👤",
    },
    ui_load: {
      name: "Load UI Settings",
      command: "ui_load",
      description:
        "Loads default UI Windows save file, usually Live\\ui_settings.txt",
      syntax: "ui_load",
      icon: "📂",
    },
    ui_load_file: {
      name: "Load UI Settings File",
      command: "ui_load_file",
      description: "Loads named UI Windows save file",
      syntax: "ui_load_file <filename>",
      icon: "📂",
      customizable: true,
      parameters: {
        filename: { type: "text", default: "ui_settings.txt" },
      },
    },
    ui_save: {
      name: "Save UI Settings",
      command: "ui_save",
      description:
        "Saves UI layout to default UI Window save file, usually Live\\ui_settings.txt",
      syntax: "ui_save",
      icon: "💾",
    },
    ui_save_file: {
      name: "Save UI Settings File",
      command: "ui_save_file",
      description: "Saves UI layout to named UI Window save file",
      syntax: "ui_save_file <filename>",
      icon: "💾",
      customizable: true,
      parameters: {
        filename: { type: "text", default: "ui_settings.txt" },
      },
    },
    ui_cancel: {
      name: "UI Cancel",
      command: "uiCancel",
      description:
        'Respond "Cancel" to an open dialog box; may not work in all dialogs',
      syntax: "uiCancel",
      icon: "❌",
    },
    ui_ok: {
      name: "UI OK",
      command: "uiOK",
      description:
        'Respond "OK" to an open dialog box; may not work in all dialogs',
      syntax: "uiOK",
      icon: "✅",
    },
    ui_gen_layers_reset: {
      name: "Reset UI Layout",
      command: "ui_GenLayersReset",
      description:
        "Resets the layout, used for when the server updates movable window positions",
      syntax: "ui_GenLayersReset",
      icon: "🔄",
    },
    ui_resolution: {
      name: "Print UI Resolution",
      command: "ui_resolution",
      description: "Print the current UI screen resolution",
      syntax: "ui_resolution",
      icon: "📐",
    },
    ui_tooltip_delay: {
      name: "Set Tooltip Delay",
      command: "ui_TooltipDelay",
      description:
        "Sets the additional delay, in seconds, before tooltips appear",
      syntax: "ui_TooltipDelay <seconds>",
      icon: "⏱️",
      customizable: true,
      parameters: {
        seconds: {
          type: "number",
          min: 0,
          max: 10,
          default: 0.5,
          step: 0.1,
        },
      },
    },
    remember_ui_lists: {
      name: "Remember UI Lists",
      command: "RememberUILists",
      description: "Whether to remember UI List Column placement and width",
      syntax: "RememberUILists <1/0>",
      icon: "📋",
      customizable: true,
      parameters: {
        state: { type: "number", min: 0, max: 1, default: 1 },
      },
    },
    ui_remember_positions: {
      name: "Remember UI Positions",
      command: "UIRememberPositions",
      description: "Whether to remember UI sizes and positions. On by default",
      syntax: "UIRememberPositions <1/0>",
      icon: "📍",
      customizable: true,
      parameters: {
        state: { type: "number", min: 0, max: 1, default: 1 },
      },
    },
    safe_login: {
      name: "Safe Login",
      command: "SafeLogin",
      description:
        "If true, then log the player back into their most recent static map instead of anything else",
      syntax: "SafeLogin <1/0>",
      icon: "🛡️",
      customizable: true,
      parameters: {
        state: { type: "number", min: 0, max: 1, default: 1 },
      },
    },
    show_game_ui: {
      name: "Show Game UI",
      command: "ShowGameUI",
      description: "Show the game UI",
      syntax: "ShowGameUI",
      icon: "🎮",
    },
    show_game_ui_no_extra_keybinds: {
      name: "Show Game UI (No Extra Keybinds)",
      command: "ShowGameUINoExtraKeyBinds",
      description:
        "This command does not add any keybinds for showing the UI when the user presses escape",
      syntax: "ShowGameUINoExtraKeyBinds",
      icon: "🎮",
    },
    change_instance: {
      name: "Change Instance",
      command: "ChangeInstance",
      description:
        "Change to an already created instance of the same map. Only works while not at red alert",
      syntax: "ChangeInstance",
      icon: "🔄",
    },
    net_timing_graph: {
      name: "Net Timing Graph",
      command: "netTimingGraph",
      description:
        "Enable or disable the network timing graph (0=disable, 1=enable)",
      syntax: "netTimingGraph <0/1>",
      icon: "📊",
      customizable: true,
      parameters: {
        state: { type: "number", min: 0, max: 1, default: 1 },
      },
    },
    net_timing_graph_alpha: {
      name: "Net Timing Graph Alpha",
      command: "netTimingGraphAlpha",
      description:
        "Set transparency level for network timing graph (50=highest transparency, 255=no transparency)",
      syntax: "netTimingGraphAlpha <50-255>",
      icon: "🎨",
      customizable: true,
      parameters: {
        alpha: { type: "number", min: 50, max: 255, default: 255 },
      },
    },
    net_timing_graph_paused: {
      name: "Net Timing Graph Paused",
      command: "netTimingGraphPaused",
      description:
        "Pause or resume the network timing graph (0=pause disabled, 1=pause enabled)",
      syntax: "netTimingGraphPaused <0/1>",
      icon: "⏸️",
      customizable: true,
      parameters: {
        state: { type: "number", min: 0, max: 1, default: 0 },
      },
    },
    netgraph: {
      name: "Net Graph",
      command: "netgraph",
      description:
        "Display SND and RCV network data as text (1=enabled, 0=disabled)",
      syntax: "netgraph <0/1>",
      icon: "🌐",
      customizable: true,
      parameters: {
        state: { type: "number", min: 0, max: 1, default: 1 },
      },
    },
  },
};
