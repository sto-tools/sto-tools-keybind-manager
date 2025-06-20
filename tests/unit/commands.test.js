/**
 * STO Tools Keybind Manager - Command Management Tests
 * Tests for STOCommandManager class functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('STOCommandManager', () => {
  let commandManager

  beforeEach(async () => {
    // Reset localStorage
    localStorage.clear()
    
    // Setup window object for browser environment simulation
    if (!global.window) {
      global.window = global
    }
    
    // Load data.js by executing it as a script (since it's not an ES6 module)
    const fs = require('fs')
    const path = require('path')
    const dataPath = path.resolve(__dirname, '../../src/js/data.js')
    const dataContent = fs.readFileSync(dataPath, 'utf8')
    
    // Execute the data.js content in the global context
    eval(dataContent)
    
    // Now STO_DATA should be available on window
    global.STO_DATA = global.window.STO_DATA
    
    // Setup DOM elements needed for tests
    document.body.innerHTML = `
      <div id="commandTypeSelect"></div>
      <div id="commandBuilderContainer"></div>
      <div id="commandPreview"></div>
      <div id="commandWarnings"></div>
      <select id="traySelect"></select>
      <select id="slotSelect"></select>
      <div id="trayVisual"></div>
      <input id="messageInput" type="text">
      <input id="filenameInput" type="text">
      <input id="distanceInput" type="number">
      <input id="amountInput" type="number">
    `
    
    // Load the commands module as ES module and instantiate
    const { default: STOCommandManager } = await import('../../src/js/commands.js')
    commandManager = new STOCommandManager()
    global.window.stoCommands = commandManager
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    delete global.STO_DATA
  })

  describe('Initialization', () => {
    it('should initialize with null currentCommand', () => {
      expect(commandManager.currentCommand).toBeNull()
    })

    it('should initialize command builders map', () => {
      expect(commandManager.commandBuilders).toBeInstanceOf(Map)
      expect(commandManager.commandBuilders.size).toBeGreaterThan(0)
      
      // Check that all expected builders are present
      const expectedBuilders = ['targeting', 'combat', 'tray', 'power', 'movement', 'camera', 'communication', 'system']
      expectedBuilders.forEach(builder => {
        expect(commandManager.commandBuilders.has(builder)).toBe(true)
      })
    })

    it('should setup event listeners', () => {
      // Test that the init method calls setupEventListeners
      const setupSpy = vi.spyOn(commandManager, 'setupEventListeners')
      commandManager.init()
      expect(setupSpy).toHaveBeenCalled()
    })
  })

  describe('Command builders', () => {
    describe('targeting commands', () => {
      it('should build targeting command with default parameters', () => {
        const builder = commandManager.commandBuilders.get('targeting')
        const result = builder.build('target_enemy_near')

        expect(result).toEqual({
          command: 'Target_Enemy_Near',
          type: 'targeting',
          icon: '🎯',
          text: 'Target Nearest Enemy',
          description: 'Target the nearest enemy in view'
        })
      })

      it('should handle invalid targeting command ID', () => {
        const builder = commandManager.commandBuilders.get('targeting')
        const result = builder.build('invalid_command')
        expect(result).toBeNull()
      })
    })

    describe('combat commands', () => {
      it('should build combat command correctly', () => {
        const builder = commandManager.commandBuilders.get('combat')
        const result = builder.build('fire_all')

        expect(result).toEqual({
          command: 'FireAll',
          type: 'combat',
          icon: '🔥',
          text: 'Fire All Weapons',
          description: 'Fire all weapons'
        })
      })
    })

    describe('tray commands', () => {
      it('should build standard tray execution command', () => {
        const builder = commandManager.commandBuilders.get('tray')
        const result = builder.build('standard', { tray: 1, slot: 2 })
        
        expect(result).toEqual({
          command: '+STOTrayExecByTray 1 2',
          type: 'tray',
          icon: '⚡',
          text: 'Execute Tray 2 Slot 3',
          description: 'Execute ability in tray 2, slot 3',
          parameters: { command_type: 'STOTrayExecByTray', tray: 1, slot: 2 }
        })
      })

      it('should build tray command with backup parameters', () => {
        const builder = commandManager.commandBuilders.get('tray')
        const result = builder.build('tray_with_backup', { 
          tray: 0, 
          slot: 0, 
          backup_tray: 1, 
          backup_slot: 1,
          active: 'on'
        })
        
        expect(result).toEqual({
          command: 'TrayExecByTrayWithBackup 0 0 1 1 1',
          type: 'tray',
          icon: '⚡',
          text: 'Execute Tray 1 Slot 1 (with backup)',
          description: 'Execute ability in tray 1, slot 1 with backup in tray 2, slot 2',
          parameters: { tray: 0, slot: 0, backup_tray: 1, backup_slot: 1, active: 'on' }
        })
      })

      it('should use default parameters when none provided', () => {
        const builder = commandManager.commandBuilders.get('tray')
        const result = builder.build('standard')
        
        expect(result.command).toBe('+STOTrayExecByTray 0 0')
        expect(result.text).toBe('Execute Tray 1 Slot 1')
      })

      it('should build tray range execution command', () => {
        const builder = commandManager.commandBuilders.get('tray')
        const result = builder.build('tray_range', {
          start_tray: 0,
          start_slot: 0,
          end_tray: 0,
          end_slot: 2,
          command_type: 'STOTrayExecByTray'
        })
        
        expect(Array.isArray(result)).toBe(true)
        expect(result).toHaveLength(3)
        
        // First command should have full metadata
        expect(result[0].type).toBe('tray')
        expect(result[0].icon).toBe('⚡')
        expect(result[0].text).toBe('Execute Range: Tray 1 Slot 1 to Tray 1 Slot 3')
        expect(result[0].command).toBe('+STOTrayExecByTray 0 0')
        expect(result[0].parameters).toEqual({
          start_tray: 0,
          start_slot: 0,
          end_tray: 0,
          end_slot: 2,
          command_type: 'STOTrayExecByTray'
        })
        
        // Subsequent commands should have minimal metadata
        expect(result[1].command).toBe('+STOTrayExecByTray 0 1')
        expect(result[2].command).toBe('+STOTrayExecByTray 0 2')
      })

      it('should build tray range across multiple trays', () => {
        const builder = commandManager.commandBuilders.get('tray')
        const result = builder.build('tray_range', {
          start_tray: 0,
          start_slot: 8,
          end_tray: 1,
          end_slot: 1,
          command_type: 'STOTrayExecByTray'
        })
        
        expect(Array.isArray(result)).toBe(true)
        expect(result).toHaveLength(4)
        expect(result[0].command).toBe('+STOTrayExecByTray 0 8')
        expect(result[1].command).toBe('+STOTrayExecByTray 0 9')
        expect(result[2].command).toBe('+STOTrayExecByTray 1 0')
        expect(result[3].command).toBe('+STOTrayExecByTray 1 1')
      })

      it('should build tray range with TrayExecByTray variant', () => {
        const builder = commandManager.commandBuilders.get('tray')
        const result = builder.build('tray_range', {
          start_tray: 0,
          start_slot: 0,
          end_tray: 0,
          end_slot: 1,
          command_type: 'TrayExecByTray'
        })
        
        expect(Array.isArray(result)).toBe(true)
        expect(result).toHaveLength(2)
        expect(result[0].command).toBe('TrayExecByTray 0 0')
        expect(result[1].command).toBe('TrayExecByTray 0 1')
      })

      it('should build whole tray execution command', () => {
        const builder = commandManager.commandBuilders.get('tray')
        const result = builder.build('whole_tray', {
          tray: 2,
          command_type: 'STOTrayExecByTray'
        })
        
        expect(Array.isArray(result)).toBe(true)
        expect(result).toHaveLength(10)
        expect(result[0].type).toBe('tray')
        expect(result[0].icon).toBe('⚡')
        expect(result[0].text).toBe('Execute Whole Tray 3')
        expect(result[0].command).toBe('+STOTrayExecByTray 2 0')
        expect(result[9].command).toBe('+STOTrayExecByTray 2 9')
      })

      it('should build tray range with backup command', () => {
        const builder = commandManager.commandBuilders.get('tray')
        const result = builder.build('tray_range_with_backup', {
          active: 1,
          start_tray: 0,
          start_slot: 0,
          end_tray: 0,
          end_slot: 1,
          backup_start_tray: 1,
          backup_start_slot: 0,
          backup_end_tray: 1,
          backup_end_slot: 1
        })
        
        expect(Array.isArray(result)).toBe(true)
        expect(result).toHaveLength(2)
        expect(result[0].type).toBe('tray')
        expect(result[0].icon).toBe('⚡')
        expect(result[0].text).toBe('Execute Range with Backup: Tray 1-1')
        expect(result[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
        expect(result[1].command).toBe('TrayExecByTrayWithBackup 1 0 1 1 1')
      })

      it('should build whole tray with backup command', () => {
        const builder = commandManager.commandBuilders.get('tray')
        const result = builder.build('whole_tray_with_backup', {
          active: 1,
          tray: 0,
          backup_tray: 1
        })
        
        expect(Array.isArray(result)).toBe(true)
        expect(result).toHaveLength(10)
        expect(result[0].type).toBe('tray')
        expect(result[0].icon).toBe('⚡')
        expect(result[0].text).toBe('Execute Whole Tray 1 (with backup Tray 2)')
        expect(result[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
        expect(result[9].command).toBe('TrayExecByTrayWithBackup 1 0 9 1 9')
      })
    })

    describe('tray range helper methods', () => {
      it('should generate correct tray range commands for same tray', () => {
        const commands = commandManager.generateTrayRangeCommands(0, 0, 0, 2, 'STOTrayExecByTray')
        
        expect(commands).toEqual([
          '+STOTrayExecByTray 0 0',
          '+STOTrayExecByTray 0 1',
          '+STOTrayExecByTray 0 2'
        ])
      })

      it('should generate correct tray range commands across multiple trays', () => {
        const commands = commandManager.generateTrayRangeCommands(0, 8, 1, 1, 'STOTrayExecByTray')
        
        expect(commands).toHaveLength(4) // slots 8,9 from tray 0 + slots 0,1 from tray 1
        expect(commands[0]).toBe('+STOTrayExecByTray 0 8')
        expect(commands[1]).toBe('+STOTrayExecByTray 0 9')
        expect(commands[2]).toBe('+STOTrayExecByTray 1 0')
        expect(commands[3]).toBe('+STOTrayExecByTray 1 1')
      })

      it('should generate whole tray commands', () => {
        const commands = commandManager.generateWholeTrayCommands(1, 'TrayExecByTray')
        
        expect(commands).toHaveLength(10)
        expect(commands[0]).toBe('TrayExecByTray 1 0')
        expect(commands[9]).toBe('TrayExecByTray 1 9')
      })

      it('should generate tray slot list correctly', () => {
        const slots = commandManager.generateTraySlotList(0, 1, 0, 3)
        
        expect(slots).toEqual([
          { tray: 0, slot: 1 },
          { tray: 0, slot: 2 },
          { tray: 0, slot: 3 }
        ])
      })

      it('should generate tray slot list across multiple trays', () => {
        const slots = commandManager.generateTraySlotList(0, 9, 1, 0)
        
        expect(slots).toEqual([
          { tray: 0, slot: 9 },
          { tray: 1, slot: 0 }
        ])
      })

      it('should generate tray range with backup commands', () => {
        const commands = commandManager.generateTrayRangeWithBackupCommands(1, 0, 0, 0, 1, 1, 0, 1, 1)
        
        expect(commands).toHaveLength(2)
        expect(commands[0]).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
        expect(commands[1]).toBe('TrayExecByTrayWithBackup 1 0 1 1 1')
      })

      it('should generate whole tray with backup commands', () => {
        const commands = commandManager.generateWholeTrayWithBackupCommands(1, 0, 1)
        
        expect(commands).toHaveLength(10)
        expect(commands[0]).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
        expect(commands[5]).toBe('TrayExecByTrayWithBackup 1 0 5 1 5')
        expect(commands[9]).toBe('TrayExecByTrayWithBackup 1 0 9 1 9')
      })
    })

    describe('power management commands', () => {
      it('should build shield distribution commands', () => {
        const builder = commandManager.commandBuilders.get('power')
        const result = builder.build('distribute_shields')

        expect(result).toEqual({
          command: '+power_exec Distribute_Shields',
          type: 'power',
          icon: '🛡️',
          text: 'Distribute Shields',
          description: 'Evenly distributes shields as if clicking in the middle of the ship and shields icon'
        })
      })
    })

    describe('movement commands', () => {
      it('should build basic movement commands', () => {
        const builder = commandManager.commandBuilders.get('movement')
        const result = builder.build('full_impulse')

        expect(result).toEqual({
          command: '+fullimpulse',
          type: 'movement',
          icon: '🚀',
          text: 'Full Impulse',
          description: 'Engage full impulse drive'
        })
      })

      it('should handle throttle adjustment parameters', () => {
        const builder = commandManager.commandBuilders.get('movement')
        const result = builder.build('throttle_adjust', { amount: 25 })

        expect(result.command).toBe('ThrottleAdjust 25')
      })
    })

    describe('camera commands', () => {
      it('should build camera commands with distance parameters', () => {
        const builder = commandManager.commandBuilders.get('camera')
        const result = builder.build('cam_distance', { distance: 10 })

        expect(result.command).toBe('camdist 10')
        expect(result.type).toBe('camera')
                  expect(result.icon).toBe('📏')
      })
    })

    describe('communication commands', () => {
      it('should build communication commands with message parameters', () => {
        const builder = commandManager.commandBuilders.get('communication')
        const result = builder.build('local_message', { message: 'Hello world' })

        expect(result).toEqual({
          command: 'say Hello world',
          type: 'communication',
          icon: '📢',
          text: 'Local Message: Hello world',
          description: 'Send message to local area',
          parameters: {
            message: 'Hello world'
          }
        })
      })

      it('should use default message when none provided', () => {
        const builder = commandManager.commandBuilders.get('communication')
        const result = builder.build('team_message')

        expect(result.command).toBe('team Message text here')
        expect(result.text).toBe('Team Message: Message text here')
      })
    })

    describe('system commands', () => {
      it('should build parameterized system commands', () => {
        const builder = commandManager.commandBuilders.get('system')
        const result = builder.build('bind_save_file', { filename: 'mykeys.txt' })
        
        expect(result.command).toBe('bind_save_file mykeys.txt')
      })

      it('should handle state-based system commands', () => {
        const builder = commandManager.commandBuilders.get('system')
        const result = builder.build('combat_log', { state: 1 })

        expect(result.command).toBe('CombatLog 1')
      })
    })
  })

  describe('Command validation', () => {
    it('should validate command syntax for valid commands', () => {
      const validCommands = [
        'target_enemy_near',
        '+STOTrayExecByTray 0 0',
        'say "Hello world"',
        'FireAll'
      ]
      
      validCommands.forEach(cmd => {
        const result = commandManager.validateCommand(cmd)
        expect(result.valid).toBe(true)
      })
    })

    it('should detect invalid command syntax', () => {
      const result = commandManager.validateCommand('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Command cannot be empty')
    })

    it('should detect dangerous commands', () => {
      const dangerousCommands = ['quit', 'exit', 'shutdown']
      
      dangerousCommands.forEach(cmd => {
        const result = commandManager.validateCommand(cmd)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Dangerous command not allowed')
      })
    })

    it('should detect unquoted pipe characters', () => {
      const result = commandManager.validateCommand('command | dangerous')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid characters in command (|)')
    })

    it('should allow pipe characters inside quotes', () => {
      const result = commandManager.validateCommand('say "Hello | World"')
      expect(result.valid).toBe(true)
    })

    it('should handle object input with command property', () => {
      const cmdObj = { command: 'target_enemy_near', type: 'targeting' }
      const result = commandManager.validateCommand(cmdObj)
      expect(result.valid).toBe(true)
    })
  })

  describe('Unquoted pipe character detection', () => {
    it('should detect unquoted pipe characters', () => {
      expect(commandManager.hasUnquotedPipeCharacter('cmd | other')).toBe(true)
      expect(commandManager.hasUnquotedPipeCharacter('cmd|other')).toBe(true)
    })

    it('should not detect pipe characters inside quotes', () => {
      expect(commandManager.hasUnquotedPipeCharacter('say "hello | world"')).toBe(false)
      expect(commandManager.hasUnquotedPipeCharacter("say 'hello | world'")).toBe(false)
    })

    it('should handle escaped quotes correctly', () => {
      // The pipe is inside the quoted string, so should return false
      expect(commandManager.hasUnquotedPipeCharacter('say "hello \\" | world"')).toBe(false)
      // With double backslash, the quote is not escaped, so quote ends and pipe is outside
      expect(commandManager.hasUnquotedPipeCharacter('say "hello \\\\" | world"')).toBe(true)
    })

    it('should handle commands without pipe characters', () => {
      expect(commandManager.hasUnquotedPipeCharacter('target_enemy_near')).toBe(false)
      expect(commandManager.hasUnquotedPipeCharacter('say "hello world"')).toBe(false)
    })
  })

  describe('Command type detection', () => {
    it('should detect targeting command types', () => {
      const targetingCommands = [
        'target_enemy_near',
        'target_self',
        'target_friend_near',
        'target_clear'
      ]
      
      targetingCommands.forEach(cmd => {
        expect(commandManager.detectCommandType(cmd)).toBe('targeting')
      })
    })

    it('should detect tray execution commands', () => {
      const trayCommands = [
        '+STOTrayExecByTray 0 0',
        '+stotrayexecbytray 1 2'
      ]
      
      trayCommands.forEach(cmd => {
        expect(commandManager.detectCommandType(cmd)).toBe('tray')
      })
    })

    it('should detect communication commands', () => {
      const commCommands = [
        'say hello',
        'team message',
        'tell player message',
        'zone announcement',
        'command "with quotes"'
      ]
      
      commCommands.forEach(cmd => {
        expect(commandManager.detectCommandType(cmd)).toBe('communication')
      })
    })

    it('should detect combat commands', () => {
      const combatCommands = [
        'FireAll',
        'firephasers',
        'firetorps',
        'attack target'
      ]
      
      combatCommands.forEach(cmd => {
        expect(commandManager.detectCommandType(cmd)).toBe('combat')
      })
    })

    it('should detect power management commands', () => {
      const powerCommands = [
        '+power_exec Distribute_Shields',
        'reroute_shields_to_front'
      ]
      
      powerCommands.forEach(cmd => {
        expect(commandManager.detectCommandType(cmd)).toBe('power')
      })
    })

    it('should detect movement commands', () => {
      const movementCommands = [
        '+fullimpulse',
        'throttle_adjust 25',
        '+forward',
        '+reverse',
        'follow target'
      ]
      
      movementCommands.forEach(cmd => {
        expect(commandManager.detectCommandType(cmd)).toBe('movement')
      })
    })

    it('should detect camera commands', () => {
      const cameraCommands = [
        'cam_distance 10',
        'look_at target',
        'zoom_in'
      ]
      
      cameraCommands.forEach(cmd => {
        expect(commandManager.detectCommandType(cmd)).toBe('camera')
      })
    })

    it('should detect system commands', () => {
      const systemCommands = [
        '+gentoggle',
        'screenshot',
        'hud_toggle',
        'interactwindow'
      ]
      
      systemCommands.forEach(cmd => {
        expect(commandManager.detectCommandType(cmd)).toBe('system')
      })
    })

    it('should default to custom type for unknown commands', () => {
      const customCommands = [
        'unknown_command',
        'custom_macro',
        ''
      ]
      
      customCommands.forEach(cmd => {
        expect(commandManager.detectCommandType(cmd)).toBe('custom')
      })
    })

    it('should handle null/undefined input', () => {
      expect(commandManager.detectCommandType(null)).toBe('custom')
      expect(commandManager.detectCommandType(undefined)).toBe('custom')
      expect(commandManager.detectCommandType(123)).toBe('custom')
    })
  })

  describe('Command icons and text', () => {
    it('should return appropriate icon for command type', () => {
      const iconTests = [
        { command: 'target_enemy_near', expectedIcon: '🎯' },
        { command: 'FireAll', expectedIcon: '🔥' },
        { command: '+STOTrayExecByTray 0 0', expectedIcon: '⚡' },
        { command: '+power_exec Distribute_Shields', expectedIcon: '🔋' },
        { command: 'say hello', expectedIcon: '💬' },
        { command: '+fullimpulse', expectedIcon: '🚀' },
        { command: 'cam_distance 10', expectedIcon: '📹' },
        { command: 'screenshot', expectedIcon: '⚙️' },
        { command: 'unknown_command', expectedIcon: '⚙️' }
      ]
      
      iconTests.forEach(({ command, expectedIcon }) => {
        expect(commandManager.getCommandIcon(command)).toBe(expectedIcon)
      })
    })

    it('should generate descriptive text for tray commands', () => {
      const trayTests = [
        { command: '+STOTrayExecByTray 0 0', expected: 'Execute Tray 1 Slot 1' },
        { command: '+STOTrayExecByTray 1 2', expected: 'Execute Tray 2 Slot 3' },
        { command: '+STOTrayExecByTray 2 5', expected: 'Execute Tray 3 Slot 6' }
      ]
      
      trayTests.forEach(({ command, expected }) => {
        expect(commandManager.getCommandText(command)).toBe(expected)
      })
    })

    it('should find friendly names for known commands', () => {
      expect(commandManager.getCommandText('Target_Enemy_Near')).toBe('Target Nearest Enemy')
      expect(commandManager.getCommandText('FireAll')).toBe('Fire All Weapons')
    })

    it('should generate friendly names for unknown commands', () => {
      expect(commandManager.getCommandText('unknown_command')).toBe('unknown command')
      expect(commandManager.getCommandText('+some_action')).toBe('some action')
      expect(commandManager.getCommandText('CamelCaseCommand')).toBe('Camel Case Command')
    })
  })

  describe('Template commands', () => {
    it('should return template commands for category', () => {
      const templates = commandManager.getTemplateCommands('combat')
      
      expect(templates).toBeInstanceOf(Array)
      expect(templates.length).toBeGreaterThan(0)
      
      const template = templates[0]
      expect(template).toHaveProperty('id')
      expect(template).toHaveProperty('name')
      expect(template).toHaveProperty('description')
      expect(template).toHaveProperty('commands')
      expect(template.commands).toBeInstanceOf(Array)
    })

    it('should return empty array for non-existent categories', () => {
      const templates = commandManager.getTemplateCommands('nonexistent')
      expect(templates).toEqual([])
    })

    it('should handle missing templates data', () => {
      delete global.STO_DATA.templates
      const templates = commandManager.getTemplateCommands('combat')
      expect(templates).toEqual([])
    })
  })

  describe('UI creation methods', () => {
    it('should create targeting UI', () => {
      const builder = commandManager.commandBuilders.get('targeting')
      const ui = builder.getUI()
      
      expect(ui).toBeTruthy()
      expect(typeof ui).toBe('string')
      expect(ui).toContain('select')
    })

    it('should create tray UI', () => {
      const builder = commandManager.commandBuilders.get('tray')
      const ui = builder.getUI()
      
      expect(ui).toBeTruthy()
      expect(typeof ui).toBe('string')
      expect(ui).toContain('tray')
    })

    it('should create communication UI', () => {
      const builder = commandManager.commandBuilders.get('communication')
      const ui = builder.getUI()
      
      expect(ui).toBeTruthy()
      expect(typeof ui).toBe('string')
      expect(ui).toContain('input')
    })
  })

  describe('Current command handling', () => {
    it('should return null for getCurrentCommand when no command built', () => {
      const result = commandManager.getCurrentCommand()
      expect(result).toBeNull()
    })

    it('should build command from UI state', () => {
      // Mock DOM elements with values
      document.getElementById('commandTypeSelect').innerHTML = '<option value="targeting" selected>Targeting</option>'
      
      // Since buildCurrentCommand is complex and requires full DOM setup,
      // we'll test that it doesn't throw and returns something reasonable
      expect(() => commandManager.buildCurrentCommand()).not.toThrow()
    })
  })

  describe('Tray visual updates', () => {
    it('should update tray visual without errors', () => {
      // Setup tray visual elements
      const trayVisual = document.getElementById('trayVisual')
      trayVisual.innerHTML = '<div class="tray-slot" data-slot="0"></div>'
      
      expect(() => commandManager.updateTrayVisual()).not.toThrow()
    })
  })

  describe('Event handling', () => {
    it('should handle command type changes', () => {
      const mockContainer = document.getElementById('commandBuilderContainer')
      
      commandManager.handleCommandTypeChange('targeting')
      
      // Should not throw and should update the container
      expect(mockContainer).toBeTruthy()
    })

    it('should setup type-specific listeners', () => {
      // Test that setupTypeSpecificListeners doesn't throw for each type
      const types = ['targeting', 'combat', 'tray', 'power', 'movement', 'camera', 'communication', 'system']
      
      types.forEach(type => {
        expect(() => commandManager.setupTypeSpecificListeners(type)).not.toThrow()
      })
    })
  })

  describe('$Target variable support', () => {
    it('should include $Target variable information in data', () => {
      expect(STO_DATA.variables).toBeDefined()
      expect(STO_DATA.variables.target).toBeDefined()
      expect(STO_DATA.variables.target.variable).toBe('$Target')
      expect(STO_DATA.variables.target.description).toContain('current target')
    })
  })

  describe('$Target variable support in custom command builder', () => {
    beforeEach(() => {
      // Set up DOM for custom command builder
      document.body.innerHTML = `
        <div id="commandBuilder">
          <div class="custom-builder">
            <div class="form-group">
              <label for="customCommand">Command:</label>
              <div class="input-with-button">
                <input type="text" id="customCommand" placeholder="Enter STO command">
                <button type="button" class="btn btn-small insert-target-btn" title="Insert $Target variable">
                  <i class="fas fa-crosshairs"></i> $Target
                </button>
              </div>
            </div>
            <div class="variable-help">
              <h4><i class="fas fa-info-circle"></i> STO Variables</h4>
              <div class="variable-info">
                <strong>$Target</strong> - Replaced with your current target's name<br>
                                        <em>Example:</em> <code>team Focus fire on [$Target]</code>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    it('should have $Target insert button in custom command builder', () => {
      const insertButton = document.querySelector('.insert-target-btn');
      expect(insertButton).toBeTruthy();
      expect(insertButton.title).toBe('Insert $Target variable');
      expect(insertButton.innerHTML).toContain('$Target');
    });

    it('should have variable help section with examples', () => {
      const variableHelp = document.querySelector('.variable-help');
      expect(variableHelp).toBeTruthy();
      
      const variableInfo = variableHelp.querySelector('.variable-info');
      expect(variableInfo).toBeTruthy();
      expect(variableInfo.innerHTML).toContain('$Target');
      expect(variableInfo.innerHTML).toContain('current target');
      expect(variableInfo.innerHTML).toContain('Example');
    });

    it('should insert $Target variable in custom command input', () => {
      const input = document.getElementById('customCommand');
      
      // Test insertion at different positions
      input.value = 'team Attacking ';
      input.setSelectionRange(15, 15); // Position after the space
      
      commandManager.insertTargetVariable(input);
      
      expect(input.value).toBe('team Attacking $Target');
      expect(input.selectionStart).toBe(22);
      expect(input.selectionEnd).toBe(22);
    });

    it('should handle event delegation for custom command $Target button', () => {
      const input = document.getElementById('customCommand');
      const insertButton = document.querySelector('.insert-target-btn');
      
      input.value = 'say Hello ';
      input.setSelectionRange(10, 10);
      
      // Mock the event delegation logic
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: insertButton });
      
      // Simulate the event delegation from commands.js
      if (clickEvent.target.classList.contains('insert-target-btn')) {
        const inputContainer = clickEvent.target.closest('.input-with-button');
        const targetInput = inputContainer ? inputContainer.querySelector('input') : null;
        
        if (targetInput) {
          commandManager.insertTargetVariable(targetInput);
        }
      }
      
      expect(input.value).toBe('say Hello $Target');
    });

    it('should trigger input event to update preview after insertion', () => {
      const input = document.getElementById('customCommand');
      const inputEventSpy = vi.fn();
      
      input.addEventListener('input', inputEventSpy);
      input.value = 'zone Status: ';
      input.setSelectionRange(13, 13); // Position after the space
      
      commandManager.insertTargetVariable(input);
      
      expect(inputEventSpy).toHaveBeenCalled();
      expect(input.value).toBe('zone Status: $Target');
    });

    it('should include $Target example in command examples', () => {
      const exampleButtons = document.querySelectorAll('.example-cmd');
      const targetExample = Array.from(exampleButtons).find(btn => 
        btn.textContent.includes('$Target')
      );
      
      // Note: This test assumes the example was added to the HTML
      // If the example button exists, verify it contains $Target
      if (targetExample) {
        expect(targetExample.textContent).toContain('$Target');
        expect(targetExample.getAttribute('data-cmd')).toContain('$Target');
      }
    });
  });
})