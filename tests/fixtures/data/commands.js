// Command library fixtures
// Provides mock STO command data for testing

import { registerFixture, unregisterFixture, generateFixtureId } from '../core/cleanup.js'

/**
 * Mock STO command data structure
 */
export const MOCK_COMMAND_DATA = {
  validation: {
    keyNamePattern: /^[A-Za-z0-9_+\-\s]+$/,
    aliasNamePattern: /^[A-Za-z0-9_]+$/,
    maxKeyNameLength: 20,
    maxAliasNameLength: 30
  },
  commands: {
    combat: {
      name: 'Combat Commands',
      commands: {
        FireAll: {
          name: 'Fire All Weapons',
          description: 'Fires all available weapons',
          syntax: 'FireAll',
          category: 'combat'
        },
        FirePhasers: {
          name: 'Fire Phasers',
          description: 'Fires phaser weapons only',
          syntax: 'FirePhasers',
          category: 'combat'
        },
        FireTorps: {
          name: 'Fire Torpedoes',
          description: 'Fires torpedo weapons only',
          syntax: 'FireTorps',
          category: 'combat'
        },
        Target_Enemy_Near: {
          name: 'Target Nearest Enemy',
          description: 'Targets the nearest enemy',
          syntax: 'Target_Enemy_Near',
          category: 'combat'
        },
        Target_Friend_Near: {
          name: 'Target Nearest Friend',
          description: 'Targets the nearest friendly target',
          syntax: 'Target_Friend_Near',
          category: 'combat'
        }
      }
    },
    tray: {
      name: 'Tray Commands',
      commands: {
        '+TrayExecByTray': {
          name: 'Execute Tray Slot',
          description: 'Executes a specific tray slot',
          syntax: '+TrayExecByTray <tray> <slot>',
          category: 'tray',
          parameters: [
            { name: 'tray', type: 'number', description: 'Tray number (0-9)' },
            { name: 'slot', type: 'number', description: 'Slot number (0-9)' }
          ]
        },
        'TraySwapTray': {
          name: 'Swap Tray',
          description: 'Switches to a different tray',
          syntax: 'TraySwapTray <tray>',
          category: 'tray',
          parameters: [
            { name: 'tray', type: 'number', description: 'Tray number to switch to' }
          ]
        }
      }
    },
    movement: {
      name: 'Movement Commands',
      commands: {
        Jump: {
          name: 'Jump',
          description: 'Makes character jump (ground only)',
          syntax: 'Jump',
          category: 'movement'
        },
        '+forward': {
          name: 'Move Forward',
          description: 'Moves character/ship forward',
          syntax: '+forward',
          category: 'movement'
        },
        '+backward': {
          name: 'Move Backward',
          description: 'Moves character/ship backward',
          syntax: '+backward',
          category: 'movement'
        }
      }
    },
    communication: {
      name: 'Communication Commands',
      commands: {
        say: {
          name: 'Say',
          description: 'Sends a message to local chat',
          syntax: 'say "<message>"',
          category: 'communication',
          parameters: [
            { name: 'message', type: 'string', description: 'Message to send' }
          ]
        },
        tell: {
          name: 'Tell',
          description: 'Sends a private message to a player',
          syntax: 'tell <player> "<message>"',
          category: 'communication',
          parameters: [
            { name: 'player', type: 'string', description: 'Player name' },
            { name: 'message', type: 'string', description: 'Message to send' }
          ]
        },
        team: {
          name: 'Team Chat',
          description: 'Sends a message to team chat',
          syntax: 'team "<message>"',
          category: 'communication',
          parameters: [
            { name: 'message', type: 'string', description: 'Message to send' }
          ]
        }
      }
    },
    system: {
      name: 'System Commands',
      commands: {
        quit: {
          name: 'Quit Game',
          description: 'Exits the game',
          syntax: 'quit',
          category: 'system'
        },
        screenshot: {
          name: 'Take Screenshot',
          description: 'Takes a screenshot',
          syntax: 'screenshot',
          category: 'system'
        },
        renderscale: {
          name: 'Render Scale',
          description: 'Sets the render scale',
          syntax: 'renderscale <value>',
          category: 'system',
          parameters: [
            { name: 'value', type: 'number', description: 'Scale value (0.5-2.0)' }
          ]
        }
      }
    }
  },
  keyNames: [
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'Space', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete',
    'Up', 'Down', 'Left', 'Right',
    'Home', 'End', 'PageUp', 'PageDown',
    'Insert', 'PrintScreen', 'ScrollLock', 'Pause',
    'NumLock', 'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4',
    'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
    'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadEnter'
  ],
  modifiers: ['Ctrl', 'Shift', 'Alt'],
  environments: ['space', 'ground']
}

/**
 * Create a command library fixture
 * @param {Object} options - Configuration options
 * @param {Object} options.customCommands - Additional commands to include
 * @param {boolean} options.minimal - Whether to use minimal command set
 * @returns {Object} Command library fixture
 */
export function createCommandLibraryFixture(options = {}) {
  const {
    customCommands = {},
    minimal = false
  } = options

  const fixtureId = generateFixtureId('commandLibrary')
  
  // Create command data
  let commandData = minimal ? createMinimalCommandData() : JSON.parse(JSON.stringify(MOCK_COMMAND_DATA))
  
  // Add custom commands
  if (customCommands && Object.keys(customCommands).length > 0) {
    for (const [category, commands] of Object.entries(customCommands)) {
      if (!commandData.commands[category]) {
        commandData.commands[category] = {
          name: category.charAt(0).toUpperCase() + category.slice(1),
          commands: {}
        }
      }
      Object.assign(commandData.commands[category].commands, commands)
    }
  }

  const fixture = {
    data: commandData,
    
    // Command utilities
    getAllCommands: () => {
      const allCommands = {}
      for (const category of Object.values(commandData.commands)) {
        Object.assign(allCommands, category.commands)
      }
      return allCommands
    },
    
    getCommandsByCategory: (category) => {
      return commandData.commands[category]?.commands || {}
    },
    
    getCommand: (commandName) => {
      const allCommands = fixture.getAllCommands()
      return allCommands[commandName] || null
    },
    
    addCommand: (category, name, command) => {
      if (!commandData.commands[category]) {
        commandData.commands[category] = {
          name: category.charAt(0).toUpperCase() + category.slice(1),
          commands: {}
        }
      }
      commandData.commands[category].commands[name] = command
    },
    
    removeCommand: (category, name) => {
      if (commandData.commands[category]?.commands[name]) {
        delete commandData.commands[category].commands[name]
      }
    },
    
    // Validation utilities
    isValidKeyName: (keyName) => {
      return commandData.validation.keyNamePattern.test(keyName) &&
             keyName.length <= commandData.validation.maxKeyNameLength
    },
    
    isValidAliasName: (aliasName) => {
      return commandData.validation.aliasNamePattern.test(aliasName) &&
             aliasName.length <= commandData.validation.maxAliasNameLength
    },
    
    isValidCommand: (commandName) => {
      return fixture.getCommand(commandName) !== null
    },
    
    // Key name utilities
    getAllKeyNames: () => {
      return [...commandData.keyNames]
    },
    
    getKeyNamesWithModifiers: () => {
      const keys = []
      const baseKeys = commandData.keyNames
      const modifiers = commandData.modifiers
      
      // Add base keys
      keys.push(...baseKeys)
      
      // Add single modifier combinations
      for (const modifier of modifiers) {
        for (const key of baseKeys) {
          keys.push(`${modifier}+${key}`)
        }
      }
      
      // Add common double modifier combinations
      const commonDoubles = ['Ctrl+Shift', 'Ctrl+Alt', 'Shift+Alt']
      for (const modCombo of commonDoubles) {
        for (const key of baseKeys.slice(0, 20)) { // Limit to first 20 keys
          keys.push(`${modCombo}+${key}`)
        }
      }
      
      return keys
    },
    
    // Mock global STO_DATA
    setupGlobal: () => {
      if (typeof global !== 'undefined') {
        global.STO_DATA = commandData
      }
      if (typeof window !== 'undefined') {
        window.STO_DATA = commandData
      }
    },
    
    // Cleanup
    destroy: () => {
      // Remove global if we set it
      if (typeof global !== 'undefined' && global.STO_DATA === commandData) {
        delete global.STO_DATA
      }
      if (typeof window !== 'undefined' && window.STO_DATA === commandData) {
        delete window.STO_DATA
      }
      unregisterFixture(fixtureId)
    }
  }
  
  // Set up global by default
  fixture.setupGlobal()
  
  registerFixture(fixtureId, fixture.destroy)
  
  return fixture
}

/**
 * Create minimal command data for lightweight testing
 */
function createMinimalCommandData() {
  return {
    validation: {
      keyNamePattern: /^[A-Za-z0-9_+\-\s]+$/,
      aliasNamePattern: /^[A-Za-z0-9_]+$/,
      maxKeyNameLength: 20,
      maxAliasNameLength: 30
    },
    commands: {
      combat: {
        name: 'Combat Commands',
        commands: {
          FireAll: {
            name: 'Fire All Weapons',
            description: 'Fires all available weapons',
            syntax: 'FireAll',
            category: 'combat'
          }
        }
      },
      tray: {
        name: 'Tray Commands',
        commands: {
          '+TrayExecByTray': {
            name: 'Execute Tray Slot',
            description: 'Executes a specific tray slot',
            syntax: '+TrayExecByTray <tray> <slot>',
            category: 'tray'
          }
        }
      }
    },
    keyNames: ['F1', 'F2', 'F3', 'Space', 'Tab', '1', '2', '3'],
    modifiers: ['Ctrl', 'Shift'],
    environments: ['space', 'ground']
  }
}

/**
 * Create a command suggestion fixture for testing autocomplete
 * @param {Object} commandLibrary - Command library fixture to base suggestions on
 * @returns {Object} Command suggestion fixture
 */
export function createCommandSuggestionFixture(commandLibrary) {
  const fixtureId = generateFixtureId('commandSuggestion')
  
  const allCommands = commandLibrary.getAllCommands()
  const commandNames = Object.keys(allCommands)
  
  const fixture = {
    // Get suggestions for a partial command
    getSuggestions: (partial, limit = 10) => {
      const lower = partial.toLowerCase()
      return commandNames
        .filter(name => name.toLowerCase().includes(lower))
        .slice(0, limit)
        .map(name => ({
          name,
          command: allCommands[name],
          score: calculateSuggestionScore(name, partial)
        }))
        .sort((a, b) => b.score - a.score)
    },
    
    // Get exact matches
    getExactMatches: (query) => {
      const matches = []
      const lower = query.toLowerCase()
      
      for (const [name, command] of Object.entries(allCommands)) {
        if (name.toLowerCase() === lower) {
          matches.push({ name, command, exact: true })
        }
      }
      
      return matches
    },
    
    // Get commands by category for suggestions
    getCommandsByCategory: (category, limit = 5) => {
      const categoryCommands = commandLibrary.getCommandsByCategory(category)
      return Object.entries(categoryCommands)
        .slice(0, limit)
        .map(([name, command]) => ({ name, command }))
    },
    
    // Cleanup
    destroy: () => {
      unregisterFixture(fixtureId)
    }
  }
  
  registerFixture(fixtureId, fixture.destroy)
  
  return fixture
}

/**
 * Calculate suggestion score for sorting
 */
function calculateSuggestionScore(commandName, partial) {
  const name = commandName.toLowerCase()
  const query = partial.toLowerCase()
  
  if (name === query) return 100
  if (name.startsWith(query)) return 80
  if (name.includes(query)) return 60
  
  // Fuzzy matching score
  let score = 0
  let queryIndex = 0
  
  for (let i = 0; i < name.length && queryIndex < query.length; i++) {
    if (name[i] === query[queryIndex]) {
      score += 1
      queryIndex++
    }
  }
  
  return queryIndex === query.length ? score : 0
} 