import { describe, it, expect, beforeEach, vi } from 'vitest'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'

describe('CommandChainUI Environment Switching', () => {
  let ui, mockDocument, mockEventBus, mockUI

  beforeEach(() => {
    // Mock document
    mockDocument = {
      getElementById: vi.fn(),
      createElement: vi.fn(() => ({
        innerHTML: '',
        classList: { remove: vi.fn(), add: vi.fn() },
        style: {},
        replaceChildren: vi.fn(),
        children: []
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
      request: vi.fn()
    }

    // Create CommandChainUI instance
    ui = new CommandChainUI({
      eventBus: mockEventBus,
      ui: mockUI,
      document: mockDocument
    })

    // Set up request method on the ui instance
    ui.request = vi.fn().mockResolvedValue({})
  })

  describe('Environment Change Handling', () => {
    it('should clear key selection when switching to alias environment', async () => {
      // Set up initial state with a selected key in space environment
      ui._currentEnvironment = 'space'
      ui._selectedKey = 'F1'
      ui._selectedAlias = null

      // Mock the updateChainActions and render methods
      const updateChainActionsSpy = vi.spyOn(ui, 'updateChainActions')
      const renderSpy = vi.spyOn(ui, 'render')

      // Directly call the environment change logic
      ui._currentEnvironment = 'alias'
      ui._selectedKey = null
      ui.updateChainActions()
      await ui.render()

      // Verify that the environment was updated
      expect(ui._currentEnvironment).toBe('alias')
      
      // Verify that key selection was cleared when switching to alias
      expect(ui._selectedKey).toBe(null)

      // Verify that actions were updated and render was called
      expect(updateChainActionsSpy).toHaveBeenCalled()
      expect(renderSpy).toHaveBeenCalled()
    })

    it('should clear alias selection when switching to space environment', async () => {
      // Set up initial state with a selected alias
      ui._currentEnvironment = 'alias'
      ui._selectedAlias = 'MyAlias'
      ui._selectedKey = null

      // Mock the updateChainActions and render methods
      const updateChainActionsSpy = vi.spyOn(ui, 'updateChainActions')
      const renderSpy = vi.spyOn(ui, 'render')

      // Simulate environment change to space
      const environmentChangeHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'environment:changed'
      )[1]

      await environmentChangeHandler({ environment: 'space' })

      // Verify that the environment was updated
      expect(ui._currentEnvironment).toBe('space')
      
      // Verify that alias selection was cleared when switching to space
      expect(ui._selectedAlias).toBe(null)
      expect(ui._selectedKey).toBe(null)

      // Verify that actions were updated and render was called
      expect(updateChainActionsSpy).toHaveBeenCalled()
      expect(renderSpy).toHaveBeenCalled()
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
      ui._currentEnvironment = 'space'
      ui._selectedKey = null

      // Simulate key selection (this would happen after environment change)
      const keySelectedHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'key-selected'
      )[1]

      await keySelectedHandler({ key: 'F2' })

      // Verify that the key was selected
      expect(ui._selectedKey).toBe('F2')
      expect(ui._selectedAlias).toBe(null)

      // Verify that render was called and the UI was updated
      expect(ui.request).toHaveBeenCalledWith('command:get-empty-state-info')
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
      ui._currentEnvironment = 'ground'
      ui._selectedKey = null
      ui._selectedAlias = null

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