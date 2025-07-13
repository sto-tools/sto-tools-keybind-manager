// Test suite for Phase 2.2: Centralized Selection Events
// Verifies that selection events are properly centralized through SelectionService
// and that services delegate selection operations correctly
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/services/harness.js'
import SelectionService from '../../../src/js/components/services/SelectionService.js'
import KeyBrowserService from '../../../src/js/components/services/KeyBrowserService.js'
import AliasBrowserService from '../../../src/js/components/services/AliasBrowserService.js'
import CommandService from '../../../src/js/components/services/CommandService.js'
import CommandLibraryService from '../../../src/js/components/services/CommandLibraryService.js'
import ParameterCommandService from '../../../src/js/components/services/ParameterCommandService.js'

describe('Phase 2.2: Centralized Selection Events', () => {
  let harness
  let selectionService
  let keyBrowserService
  let aliasBrowserService
  let commandService
  let commandLibraryService
  let parameterCommandService
  let capturedEvents = []

  beforeEach(async () => {
    harness = createServiceFixture()
    capturedEvents = []

    // Create all services
    selectionService = new SelectionService({ eventBus: harness.eventBus })
    keyBrowserService = new KeyBrowserService({ 
      eventBus: harness.eventBus, 
      storage: harness.mockStorage,
      ui: harness.mockUI
    })
    aliasBrowserService = new AliasBrowserService({
      eventBus: harness.eventBus,
      storage: harness.mockStorage,
      ui: harness.mockUI
    })
    commandService = new CommandService({
      eventBus: harness.eventBus,
      storage: harness.mockStorage,
      i18n: harness.mockI18n,
      ui: harness.mockUI
    })
    commandLibraryService = new CommandLibraryService({
      eventBus: harness.eventBus,
      storage: harness.mockStorage,
      i18n: harness.mockI18n,
      ui: harness.mockUI,
      modalManager: harness.mockModalManager
    })
    parameterCommandService = new ParameterCommandService({
      eventBus: harness.eventBus
    })

    // Set up event capture
    const originalEmit = harness.eventBus.emit
    harness.eventBus.emit = vi.fn((event, data) => {
      capturedEvents.push({ event, data })
      originalEmit.call(harness.eventBus, event, data)
    })

    // Initialize all services
    await selectionService.init()
    await keyBrowserService.init()
    await aliasBrowserService.init()
    await commandService.init()
    await commandLibraryService.init()
    await parameterCommandService.init()

    // Clear initial events
    capturedEvents = []
  })

  describe('Selection Delegation', () => {
    it('should delegate key selection from KeyBrowserService to SelectionService', async () => {
      // Mock SelectionService request response
      selectionService.respond = vi.fn().mockImplementation((method, handler) => {
        if (method === 'selection:select-key') {
          return () => handler({ keyName: 'F1', environment: 'space' })
        }
      })

      // KeyBrowserService should delegate to SelectionService
      await keyBrowserService.selectKey('F1')

      // Verify that SelectionService emits the centralized event
      const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
      expect(keySelectedEvents).toHaveLength(1)
      expect(keySelectedEvents[0].data.key).toBe('F1')
      expect(keySelectedEvents[0].data.source).toBe('SelectionService')
    })

    it('should delegate alias selection from AliasBrowserService to SelectionService', async () => {
      // Mock SelectionService request response
      selectionService.respond = vi.fn().mockImplementation((method, handler) => {
        if (method === 'selection:select-alias') {
          return () => handler({ aliasName: 'TestAlias' })
        }
      })

      // AliasBrowserService should delegate to SelectionService
      await aliasBrowserService.selectAlias('TestAlias')

      // Verify that SelectionService emits the centralized event
      const aliasSelectedEvents = capturedEvents.filter(e => e.event === 'alias-selected')
      expect(aliasSelectedEvents).toHaveLength(1)
      expect(aliasSelectedEvents[0].data.name).toBe('TestAlias')
      expect(aliasSelectedEvents[0].data.source).toBe('SelectionService')
    })
  })

  describe('Selection State Ownership', () => {
    it('should not expose selection state in CommandService.getCurrentState()', () => {
      const state = commandService.getCurrentState()
      
      expect(state).not.toHaveProperty('selectedKey')
      expect(state).not.toHaveProperty('selectedAlias')
      expect(state).not.toHaveProperty('currentEnvironment')
      expect(state).not.toHaveProperty('currentProfile')
    })

    it('should not expose selection state in CommandLibraryService.getCurrentState()', () => {
      const state = commandLibraryService.getCurrentState()
      
      expect(state).not.toHaveProperty('selectedKey')
      expect(state).not.toHaveProperty('selectedAlias')
      expect(state).not.toHaveProperty('currentEnvironment')
      expect(state).not.toHaveProperty('currentProfile')
    })

    it('should not expose selection state in ParameterCommandService.getCurrentState()', () => {
      const state = parameterCommandService.getCurrentState()
      
      expect(state).not.toHaveProperty('selectedKey')
      expect(state).not.toHaveProperty('selectedAlias')
      expect(state).not.toHaveProperty('currentEnvironment') // Not owned by this service
      // editingContext is still appropriate for parameter editing
      expect(state).toHaveProperty('editingContext')
    })

    it('should only expose selection state in SelectionService.getCurrentState()', () => {
      const state = selectionService.getCurrentState()
      
      expect(state).toHaveProperty('selectedKey')
      expect(state).toHaveProperty('selectedAlias')
      expect(state).toHaveProperty('editingContext')
      expect(state).toHaveProperty('cachedSelections')
      expect(state).toHaveProperty('currentEnvironment')
    })
  })

  describe('Request/Response Pattern Usage', () => {
    it('should use request/response for getting current selection in CommandLibraryService', async () => {
      // Mock SelectionService request for current selection
      const mockSelection = {
        selectedKey: 'F1',
        selectedAlias: null
      }
      
      commandLibraryService.request = vi.fn().mockResolvedValue(mockSelection)

      // Call a method that should get current selection
      await commandLibraryService.getCommandsForSelectedKey()

      // Verify that it requested current selection from SelectionService
      expect(commandLibraryService.request).toHaveBeenCalledWith('selection:get-current')
    })

    it('should use request/response for parameterized command operations in ParameterCommandService', async () => {
      // The test should verify that ParameterCommandService follows request/response pattern
      // and doesn't maintain its own selection state
      
      // Mock command definition
      const mockCommandDef = {
        command: 'Target',
        parameters: { entityName: { type: 'text', default: 'EntityName' } }
      }

      // Call buildParameterizedCommand - this should work without needing current selection
      const result = await parameterCommandService.buildParameterizedCommand(
        'targeting', 
        'target', 
        mockCommandDef, 
        { entityName: 'TestTarget' }
      )

      // Verify that it built the command correctly without depending on selection state
      expect(result).toBeDefined()
      expect(result.command).toBe('Target "TestTarget"')
      expect(result.displayText).toBe('Target: TestTarget')
      
      // Verify the service doesn't expose selection state in its getCurrentState()
      const state = parameterCommandService.getCurrentState()
      expect(state).not.toHaveProperty('selectedKey')
      expect(state).not.toHaveProperty('selectedAlias')
    })
  })

  describe('Event Flow Verification', () => {
    it('should maintain backward compatibility with key-selected events', async () => {
      // Simulate SelectionService selecting a key
      selectionService.selectedKey = 'F1'
      selectionService.currentEnvironment = 'space'
      selectionService.emit('key-selected', { 
        key: 'F1', 
        environment: 'space',
        source: 'SelectionService' 
      })

      // Verify the event was emitted
      const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
      expect(keySelectedEvents).toHaveLength(1)
      expect(keySelectedEvents[0].data.key).toBe('F1')
      expect(keySelectedEvents[0].data.source).toBe('SelectionService')
    })

    it('should maintain backward compatibility with alias-selected events', async () => {
      // Simulate SelectionService selecting an alias
      selectionService.selectedAlias = 'TestAlias'
      selectionService.currentEnvironment = 'alias'
      selectionService.emit('alias-selected', { 
        name: 'TestAlias',
        source: 'SelectionService' 
      })

      // Verify the event was emitted
      const aliasSelectedEvents = capturedEvents.filter(e => e.event === 'alias-selected')
      expect(aliasSelectedEvents).toHaveLength(1)
      expect(aliasSelectedEvents[0].data.name).toBe('TestAlias')
      expect(aliasSelectedEvents[0].data.source).toBe('SelectionService')
    })

    it('should not emit scattered selection events from other services', () => {
      // After Phase 2.2, only SelectionService should emit selection events
      
      // Verify no services emit their own selection events
      const nonSelectionServiceEvents = capturedEvents.filter(e => 
        (e.event === 'key-selected' || e.event === 'alias-selected') &&
        (!e.data.source || e.data.source !== 'SelectionService')
      )

      expect(nonSelectionServiceEvents).toHaveLength(0)
    })
  })

  describe('Service Integration', () => {
    it('should properly integrate all services without selection state conflicts', async () => {
      // Test a full flow: SelectionService selects a key, other services respond appropriately
      
      // Mock profile data for services
      const mockProfile = {
        id: 'test-profile',
        builds: {
          space: { keys: { 'F1': ['Target_Enemy_Near'] } },
          ground: { keys: {} }
        },
        aliases: {}
      }

      // Simulate profile loading
      harness.eventBus.emit('profile:switched', {
        profileId: 'test-profile',
        profile: mockProfile,
        environment: 'space'
      })

      // Clear events from profile loading
      capturedEvents = []

      // Simulate key selection via SelectionService
      await selectionService.selectKey('F1', 'space')

      // Verify that:
      // 1. Only SelectionService emits key-selected
      const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
      expect(keySelectedEvents).toHaveLength(1)
      expect(keySelectedEvents[0].data.source).toBe('SelectionService')

      // 2. No other services emit their own selection events
      const scatteredSelectionEvents = capturedEvents.filter(e => 
        (e.event === 'key-selected' || e.event === 'alias-selected') &&
        (!e.data.source || e.data.source !== 'SelectionService')
      )
      expect(scatteredSelectionEvents).toHaveLength(0)
    })
  })
})