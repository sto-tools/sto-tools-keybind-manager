import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CommandUI from '../../src/js/components/ui/CommandUI.js'
import eventBus from '../../src/js/core/eventBus.js'
import { request } from '../../src/js/core/requestResponse.js'

// Mock the ParameterCommandUI module
vi.mock('../../src/js/components/ui/ParameterCommandUI.js', () => ({
  parameterCommands: {
    showParameterModal: vi.fn()
  }
}))

// Mock the request function
vi.mock('../../src/js/core/requestResponse.js', () => ({
  request: vi.fn()
}))

describe('CommandUI', () => {
  let commandUI
  let mockEventBus
  let mockUI
  let mockModalManager

  beforeEach(() => {
    // Create mock dependencies
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      onDom: vi.fn(),
      offDom: vi.fn()
    }
    
    mockUI = {
      showToast: vi.fn()
    }

    mockModalManager = {
      show: vi.fn()
    }

    // Mock request/response for i18n and toast
    vi.mocked(request).mockImplementation((eventBus, endpoint, params) => {
      if (endpoint === 'i18n:translate') {
        const translations = {
          'please_select_a_key_first': 'Please select a key first',
          'please_select_an_alias_first': 'Please select an alias first',
          'confirm_clear_chain': 'Clear command chain for {key}?',
          'command_chain_is_valid': 'Command chain is valid'
        }
        return Promise.resolve(translations[params.key] || params.key)
      }
      if (endpoint === 'ui:show-toast') {
        mockUI.showToast(params.message, params.type)
        return Promise.resolve()
      }
      return Promise.resolve()
    })

    // Create CommandUI instance with mocks
    commandUI = new CommandUI({
      eventBus: mockEventBus,
      ui: mockUI,
      modalManager: mockModalManager
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    // Clean up event listeners if any
    if (commandUI && commandUI.destroy) {
      commandUI.destroy()
    }
  })

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      expect(commandUI.componentName).toBe('CommandUI')
      expect(commandUI._selectedKey).toBe(null)
      expect(commandUI._selectedAlias).toBe(null)
      expect(commandUI._currentEnvironment).toBe('space')
    })

    it('should setup event listeners on init', () => {
      commandUI.onInit()
      
      // Check that all required event listeners are set up (order doesn't matter)
      const eventNames = mockEventBus.on.mock.calls.map(call => call[0])
      expect(eventNames).toContain('command:add')
      expect(eventNames).toContain('key-selected')
      expect(eventNames).toContain('alias-selected')
      expect(eventNames).toContain('environment:changed')
    })
  })

  describe('State Management - Broadcast/Cache Pattern', () => {
    beforeEach(() => {
      commandUI.onInit()
    })

    it('should cache key selection from broadcast events', () => {
      // Simulate key-selected event
      const keySelectedCallback = mockEventBus.on.mock.calls.find(
        call => call[0] === 'key-selected'
      )[1]
      
      keySelectedCallback({ key: 'spacebar' })
      
      expect(commandUI._selectedKey).toBe('spacebar')
      expect(commandUI._selectedAlias).toBe(null)
      expect(commandUI.getSelectedKey()).toBe('spacebar')
    })

    it('should cache alias selection from broadcast events', () => {
      commandUI._currentEnvironment = 'alias'
      
      const aliasSelectedCallback = mockEventBus.on.mock.calls.find(
        call => call[0] === 'alias-selected'
      )[1]
      
      aliasSelectedCallback({ name: 'myalias' })
      
      expect(commandUI._selectedAlias).toBe('myalias')
      expect(commandUI._selectedKey).toBe(null)
      expect(commandUI.getSelectedKey()).toBe('myalias')
    })

    it('should cache environment changes from broadcast events', () => {
      const envChangedCallback = mockEventBus.on.mock.calls.find(
        call => call[0] === 'environment:changed'
      )[1]
      
      envChangedCallback({ environment: 'ground' })
      
      expect(commandUI._currentEnvironment).toBe('ground')
      expect(commandUI.getCurrentEnvironment()).toBe('ground')
    })

    it('should handle environment changes as string format', () => {
      const envChangedCallback = mockEventBus.on.mock.calls.find(
        call => call[0] === 'environment:changed'
      )[1]
      
      envChangedCallback('alias')
      
      expect(commandUI._currentEnvironment).toBe('alias')
    })
  })

  describe('Command Handling', () => {
    beforeEach(() => {
      commandUI.onInit()
    })

    it('should handle static command when key is selected', async () => {
      // Set up cached state
      commandUI._selectedKey = 'spacebar'
      commandUI._currentEnvironment = 'space'
      
      const commandAddCallback = mockEventBus.on.mock.calls.find(
        call => call[0] === 'command:add'
      )[1]

      const mockCommand = { command: '+forward' }
      await commandAddCallback({ commandDef: mockCommand })

      expect(mockEventBus.emit).toHaveBeenCalledWith('command:add', {
        command: mockCommand,
        key: 'spacebar'
      })
    })

    it('should show warning when no key is selected for static command', async () => {
      // No key selected
      commandUI._selectedKey = null
      commandUI._currentEnvironment = 'space'
      
      const commandAddCallback = mockEventBus.on.mock.calls.find(
        call => call[0] === 'command:add'
      )[1]

      const mockCommand = { command: '+forward' }
      await commandAddCallback({ commandDef: mockCommand })

      expect(mockUI.showToast).toHaveBeenCalledWith('Please select a key first', 'warning')
      expect(mockEventBus.emit).not.toHaveBeenCalledWith('command:add', expect.anything())
    })

    it('should show alias warning when in alias mode with no selection', async () => {
      commandUI._selectedAlias = null
      commandUI._currentEnvironment = 'alias'
      
      const commandAddCallback = mockEventBus.on.mock.calls.find(
        call => call[0] === 'command:add'
      )[1]

      const mockCommand = { command: '+forward' }
      await commandAddCallback({ commandDef: mockCommand })

      expect(mockUI.showToast).toHaveBeenCalledWith('Please select an alias first', 'warning')
    })

    it('should delegate to parameter modal for customizable commands', async () => {
      const { parameterCommands } = await import('../../src/js/components/ui/ParameterCommandUI.js')
      
      const commandAddCallback = mockEventBus.on.mock.calls.find(
        call => call[0] === 'command:add'
      )[1]

      const mockCommand = { command: '+forward' }
      await commandAddCallback({ 
        categoryId: 'combat',
        commandId: 'forwardMove',
        commandDef: mockCommand 
      })

      expect(parameterCommands.showParameterModal).toHaveBeenCalledWith(
        'combat',
        'forwardMove', 
        mockCommand
      )
    })
  })

  describe('Late-join State Sync', () => {
    it('should provide current state', () => {
      commandUI._selectedKey = 'spacebar'
      commandUI._selectedAlias = 'myalias'
      commandUI._currentEnvironment = 'ground'

      const state = commandUI.getCurrentState()

      expect(state).toEqual({
        selectedKey: 'spacebar',
        selectedAlias: 'myalias',
        currentEnvironment: 'ground'
      })
    })

    it('should handle initial state from other components', () => {
      commandUI.handleInitialState('KeyService', {
        selectedKey: 'f1',
        selectedAlias: 'testalias',
        currentEnvironment: 'alias'
      })

      expect(commandUI._selectedKey).toBe('f1')
      expect(commandUI._selectedAlias).toBe('testalias')
      expect(commandUI._currentEnvironment).toBe('alias')
    })

    it('should handle undefined initial state gracefully', () => {
      const originalState = {
        selectedKey: commandUI._selectedKey,
        selectedAlias: commandUI._selectedAlias,
        currentEnvironment: commandUI._currentEnvironment
      }

      commandUI.handleInitialState('SomeService', undefined)

      expect(commandUI._selectedKey).toBe(originalState.selectedKey)
      expect(commandUI._selectedAlias).toBe(originalState.selectedAlias)
      expect(commandUI._currentEnvironment).toBe(originalState.currentEnvironment)
    })
  })

  describe('DOM Event Handlers', () => {
    beforeEach(() => {
      commandUI.onInit()
    })

    it('should setup DOM event listeners', () => {
      expect(mockEventBus.onDom).toHaveBeenCalledWith('addCommandBtn', 'click', 'command-add-modal', expect.any(Function))
      expect(mockEventBus.onDom).toHaveBeenCalledWith('clearChainBtn', 'click', 'command-chain-clear', expect.any(Function))
      expect(mockEventBus.onDom).toHaveBeenCalledWith('validateChainBtn', 'click', 'command-chain-validate', expect.any(Function))
      expect(mockEventBus.onDom).toHaveBeenCalledWith('commandSearch', 'input', 'command-search', expect.any(Function))
    })

    it('should handle add command button click', () => {
      const addCommandCallback = mockEventBus.onDom.mock.calls.find(
        call => call[0] === 'addCommandBtn'
      )[3]
      
      addCommandCallback()
      
      expect(mockModalManager.show).toHaveBeenCalledWith('addCommandModal')
    })

    it('should handle clear chain button click with selected key', async () => {
      commandUI._selectedKey = 'spacebar'
      
      const clearChainCallback = mockEventBus.onDom.mock.calls.find(
        call => call[0] === 'clearChainBtn'
      )[3]
      
      // Mock confirm dialog to return true
      global.confirm = vi.fn(() => true)
      
      // Call the callback and wait for async operations
      clearChainCallback()
      
      // Wait a tick for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('command-chain:clear', { key: 'spacebar' })
    })

    it('should handle validate chain button click', () => {
      commandUI._selectedKey = 'spacebar'
      
      const validateChainCallback = mockEventBus.onDom.mock.calls.find(
        call => call[0] === 'validateChainBtn'
      )[3]
      
      validateChainCallback()
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('command-chain:validate', { key: 'spacebar' })
    })

    it('should handle command search input', () => {
      const searchCallback = mockEventBus.onDom.mock.calls.find(
        call => call[0] === 'commandSearch'
      )[3]
      
      const mockEvent = { target: { value: 'combat' } }
      searchCallback(mockEvent)
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('command:filter', { filter: 'combat' })
    })
  })

  describe('Action Methods', () => {
    beforeEach(() => {
      commandUI.onInit()
    })

    it('should get i18n messages via request/response', async () => {
      const message = await commandUI.getI18nMessage('test_key')
      
      expect(request).toHaveBeenCalledWith(mockEventBus, 'i18n:translate', { 
        key: 'test_key', 
        params: {} 
      })
      expect(message).toBe('test_key')
    })

    it('should show toast via UI service when available', async () => {
      await commandUI.showToast('Test message', 'success')
      
      expect(mockUI.showToast).toHaveBeenCalledWith('Test message', 'success')
    })

    it('should fallback to request/response for toast when UI service unavailable', async () => {
      commandUI.ui = null
      
      await commandUI.showToast('Test message', 'info')
      
      expect(request).toHaveBeenCalledWith(mockEventBus, 'ui:show-toast', { 
        message: 'Test message', 
        type: 'info' 
      })
    })

    it('should handle confirm clear chain dialog', async () => {
      global.confirm = vi.fn(() => true)
      
      await commandUI.confirmClearChain('spacebar')
      
      expect(request).toHaveBeenCalledWith(mockEventBus, 'i18n:translate', { 
        key: 'confirm_clear_chain', 
        params: { key: 'spacebar' } 
      })
      expect(global.confirm).toHaveBeenCalledWith('Clear command chain for {key}?')
      expect(mockEventBus.emit).toHaveBeenCalledWith('command-chain:clear', { key: 'spacebar' })
    })

    it('should validate current command chain', async () => {
      await commandUI.validateCurrentChain('spacebar')
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('command-chain:validate', { key: 'spacebar' })
      expect(mockUI.showToast).toHaveBeenCalledWith('Command chain is valid', 'success')
    })

    it('should filter commands by search term', () => {
      commandUI.filterCommands('combat')
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('command:filter', { filter: 'combat' })
    })
  })
}) 