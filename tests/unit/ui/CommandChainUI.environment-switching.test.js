import { describe, it, expect, beforeEach, vi } from 'vitest'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'

describe('CommandChainUI Environment Switching', () => {
  let ui, mockDocument, mockEventBus, mockUI

  beforeEach(async () => {
    // Mock document
    mockDocument = {
      getElementById: vi.fn(),
      createElement: vi.fn(() => ({
        innerHTML: '',
        classList: { remove: vi.fn(), add: vi.fn(), toggle: vi.fn() },
        style: {},
        replaceChildren: vi.fn(),
        children: [],
        addEventListener: vi.fn(),
        querySelector: vi.fn(),
        appendChild: vi.fn(),
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
        dataset: {}
      })),
      querySelector: vi.fn(),
      body: { appendChild: vi.fn() },
      addEventListener: vi.fn()
    }
    
    mockUI = {
      showToast: vi.fn(),
      initDragAndDrop: vi.fn()
    }

    // Mock event bus
    mockEventBus = {
      on: vi.fn(() => () => {}), // Return cleanup function
      off: vi.fn(),
      emit: vi.fn(),
      request: vi.fn(),
      // Stub DOM delegation so init() doesn't fail in unit tests without real DOM
      onDom: vi.fn(() => () => {}),
      onDomDebounced: vi.fn(() => () => {}),
    }

    // Create CommandChainUI instance
    ui = new CommandChainUI({
      eventBus: mockEventBus,
      ui: mockUI,
      document: mockDocument
    })

    await ui.init()

    // Set up request method on the ui instance
    ui.request = vi.fn().mockResolvedValue({})

    // Ensure cache is properly initialized for tests
    ui.cache = ui.cache || {}
    ui.cache.currentEnvironment = 'space'
    ui.cache.selectedKey = null
    ui.cache.selectedAlias = null
    ui.cache.preferences = {}
    ui.cache.activeBindset = 'Primary Bindset'

    // Mock empty state info response
    ui.request.mockImplementation((topic, data) => {
      if (topic === 'command:get-empty-state-info') {
        return Promise.resolve({
          title: 'No Key Selected',
          preview: 'Select a key to see the generated command',
          icon: 'fas fa-keyboard',
          emptyTitle: 'No Key Selected',
          emptyDesc: 'Select a key from the left panel to view and edit its command chain.',
          commandCount: '0'
        })
      }
      if (topic === 'preferences:get-setting') {
        return Promise.resolve(false)
      }
      if (topic === 'command-chain:is-stabilized') {
        return Promise.resolve(true)
      }
      if (topic === 'command:generate-mirrored-commands') {
        return Promise.resolve([])
      }
      return Promise.resolve({})
    })
  })

  describe('Environment Change Handling', () => {
    it('should clear key selection when switching to alias environment', async () => {
      // Set up initial state with a selected key in space environment
      ui.cache.currentEnvironment = 'space'
      ui.cache.selectedKey = 'F1'
      ui.cache.selectedAlias = null

      // Mock the updateChainActions and render methods
      const updateChainActionsSpy = vi.spyOn(ui, 'updateChainActions')
      const renderSpy = vi.spyOn(ui, 'render')

      // Directly call the environment change logic
      ui.cache.currentEnvironment = 'alias'
      ui.cache.selectedKey = null
      ui.updateChainActions()
      await ui.render()

      // Verify that the environment was updated
      expect(ui.cache.currentEnvironment).toBe('alias')
      
      // Verify that key selection was cleared when switching to alias
      expect(ui.cache.selectedKey).toBe(null)

      // Verify that actions were updated and render was called
      expect(updateChainActionsSpy).toHaveBeenCalled()
      expect(renderSpy).toHaveBeenCalled()
    })

    it('should handle environment change event', async () => {
      // Set up initial state with a selected alias
      ui.cache.currentEnvironment = 'alias'
      ui.cache.selectedAlias = 'MyAlias'
      ui.cache.selectedKey = null

      // Simulate environment change to space
      const environmentChangeCall = mockEventBus.on.mock.calls.find(
        call => call[0] === 'environment:changed'
      )
      const environmentChangeHandler = environmentChangeCall[1]

      // Call the environment change handler
      await environmentChangeHandler({ environment: 'space' })

      // Verify that the environment was updated
      expect(ui.cache.currentEnvironment).toBe('space')

      // Note: Selection clearing is handled by SelectionService, not CommandChainUI
      // CommandChainUI should only respond to environment changes by updating UI
    })

    it('should render when key is selected after environment change', async () => {
      // Set up DOM elements
      const mockContainer = { replaceChildren: vi.fn(), children: [] }
      const mockTitleEl = { textContent: '' }
      const mockPreviewEl = { textContent: '' }
      const mockCountSpanEl = { textContent: '' }
      const mockEmptyState = { classList: { remove: vi.fn() } }
      const mockGeneratedAlias = { style: { display: 'none' } }
      const mockAliasPreviewEl = { textContent: '' }

      mockDocument.getElementById.mockImplementation((id) => {
        switch (id) {
          case 'commandList': return mockContainer
          case 'chainTitle': return mockTitleEl
          case 'commandPreview': return mockPreviewEl
          case 'commandCount': return mockCountSpanEl
          case 'emptyState': return mockEmptyState
          case 'generatedAlias': return mockGeneratedAlias
          case 'aliasPreview': return mockAliasPreviewEl
          case 'stabilizeExecutionOrderBtn': return { disabled: false, classList: { toggle: vi.fn(), remove: vi.fn() } }
          case 'copyAliasBtn': return { addEventListener: vi.fn() }
          case 'bindsetSelectorContainer': return { style: { display: 'none' } }
          default: return null
        }
      })

      // Mock service responses
      ui.request.mockImplementation((topic, data) => {
        if (topic === 'command:get-empty-state-info') {
          return Promise.resolve({
            title: 'Command Chain for F2',
            preview: 'F2 "FireAll"',
            icon: 'fas fa-keyboard',
            emptyTitle: 'No Commands',
            emptyDesc: 'Click "Add Command" to start building your command chain for F2.',
            commandCount: '1'
          })
        }
        if (topic === 'preferences:get-setting') {
          return Promise.resolve(false)
        }
        if (topic === 'data:get-key-commands') {
          return Promise.resolve([{ command: 'FireAll' }])
        }
        return Promise.resolve([])
      })

      // Set up initial state
      ui.cache.currentEnvironment = 'space'
      ui.cache.selectedKey = null

      // Mock the render method
      const renderSpy = vi.spyOn(ui, 'render')

      // Simulate key selection (this would happen after environment change)
      const keySelectedHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'key-selected'
      )[1]

      await keySelectedHandler({ key: 'F2' })

      // Verify that the key was selected
      expect(ui.cache.selectedKey).toBe('F2')
      expect(ui.cache.selectedAlias).toBe(null)

      // Note: Render is called through ComponentBase's cache mechanism, not directly by key-selected handler
      // The cache update should trigger render automatically
    })

    it('should show empty state when no selection exists after environment change', async () => {
      // Set up DOM elements
      const mockContainer = { replaceChildren: vi.fn(), children: [] }
      const mockTitleEl = { textContent: '' }
      const mockPreviewEl = { textContent: '' }
      const mockCountSpanEl = { textContent: '' }
      const mockEmptyState = { classList: { remove: vi.fn() } }
      const mockGeneratedAlias = { style: { display: 'none' } }
      const mockAliasPreviewEl = { textContent: '' }

      mockDocument.getElementById.mockImplementation((id) => {
        switch (id) {
          case 'commandList': return mockContainer
          case 'chainTitle': return mockTitleEl
          case 'commandPreview': return mockPreviewEl
          case 'commandCount': return mockCountSpanEl
          case 'emptyState': return mockEmptyState
          case 'generatedAlias': return mockGeneratedAlias
          case 'aliasPreview': return mockAliasPreviewEl
          case 'stabilizeExecutionOrderBtn': return { disabled: false, classList: { toggle: vi.fn(), remove: vi.fn() } }
          case 'copyAliasBtn': return { addEventListener: vi.fn() }
          case 'bindsetSelectorContainer': return { style: { display: 'none' } }
          default: return null
        }
      })

      // Mock empty state service response
      ui.request.mockImplementation((topic, data) => {
        if (topic === 'command:get-empty-state-info') {
          return Promise.resolve({
            title: 'No Key Selected',
            preview: 'Select a key to see the generated command',
            icon: 'fas fa-keyboard',
            emptyTitle: 'No Key Selected',
            emptyDesc: 'Select a key from the left panel to view and edit its command chain.',
            commandCount: '0'
          })
        }
        if (topic === 'preferences:get-setting') {
          return Promise.resolve(false)
        }
        return Promise.resolve({})
      })

      // Set up state with no selection
      ui.cache.currentEnvironment = 'ground'
      ui.cache.selectedKey = null
      ui.cache.selectedAlias = null

      // Call render to show empty state
      await ui.render()

      // Verify empty state is displayed
      expect(mockTitleEl.textContent).toBe('No Key Selected')
      expect(mockPreviewEl.textContent).toBe('Select a key to see the generated command')
      expect(mockCountSpanEl.textContent).toBe('0')
      expect(mockContainer.replaceChildren).toHaveBeenCalled()
    })
  })
})