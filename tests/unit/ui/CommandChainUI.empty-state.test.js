import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'

describe('CommandChainUI Empty State', () => {
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

    // Mock event bus with proper request/response capability
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

  afterEach(() => {
    // Clean up any timers
    vi.clearAllTimers()
  })

  describe('Initial Load Empty State', () => {
    it('should render empty state on initial load when no keys/aliases exist', async () => {
      // Mock DOM elements
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

      // Set environment
      ui._currentEnvironment = 'space'

      // Call render without any selection
      await ui.render()

      // Verify empty state is displayed
      expect(mockTitleEl.textContent).toBe('No Key Selected')
      expect(mockPreviewEl.textContent).toBe('Select a key to see the generated command')
      expect(mockCountSpanEl.textContent).toBe('0')
      expect(mockContainer.replaceChildren).toHaveBeenCalled()
      expect(ui.request).toHaveBeenCalledWith('command:get-empty-state-info')
    })

    it('should show different empty state for alias environment', async () => {
      // Mock DOM elements
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

      // Mock empty state service response for alias environment
      mockEventBus.request.mockImplementation((topic, data) => {
        if (topic === 'command:get-empty-state-info') {
          return Promise.resolve({
            title: 'No Alias Selected',
            preview: 'Select an alias to see the generated command',
            icon: 'fas fa-mask',
            emptyTitle: 'No Alias Selected',
            emptyDesc: 'Select an alias from the left panel to view and edit its command chain.',
            commandCount: '0'
          })
        }
        if (topic === 'preferences:get-setting') {
          return Promise.resolve(false)
        }
        return Promise.resolve({})
      })

      // Set environment to alias
      ui._currentEnvironment = 'alias'

      // Call render without any selection
      await ui.render()

      // Verify alias empty state is displayed
      expect(mockTitleEl.textContent).toBe('No Alias Selected')
      expect(mockPreviewEl.textContent).toBe('Select an alias to see the generated command')
      expect(mockCountSpanEl.textContent).toBe('0')
      expect(mockContainer.replaceChildren).toHaveBeenCalled()
      expect(ui.request).toHaveBeenCalledWith('command:get-empty-state-info')
    })

    it('should trigger initial render after timeout during initialization', async () => {
      // Use fake timers to control setTimeout
      vi.useFakeTimers()

      // Mock DOM elements
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
          case 'stabilizeExecutionOrderBtn': return { disabled: false, classList: { toggle: vi.fn(), remove: vi.fn() }, addEventListener: vi.fn() }
          case 'copyAliasBtn': return { addEventListener: vi.fn() }
          case 'bindsetSelectorContainer': return { style: { display: 'none' } }
          default: return { style: {}, disabled: false, addEventListener: vi.fn() }
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

      // Spy on render method
      const renderSpy = vi.spyOn(ui, 'render')

      // Initialize the component
      await ui.onInit()

      // Verify render was not called yet
      expect(renderSpy).not.toHaveBeenCalled()

      // Fast-forward time to trigger the scheduled render
      vi.advanceTimersByTime(100)

      // Wait for any promises to resolve
      await new Promise(resolve => setTimeout(resolve, 0))

      // Verify render was called after timeout
      expect(renderSpy).toHaveBeenCalled()

      // Restore real timers
      vi.useRealTimers()
    })

    it('should trigger render when late-join environment is received', async () => {
      // Mock DOM elements
      const mockContainer = { replaceChildren: vi.fn(), children: [] }
      const mockTitleEl = { textContent: '' }
      const mockPreviewEl = { textContent: '' }

      mockDocument.getElementById.mockImplementation((id) => {
        switch (id) {
          case 'commandList': return mockContainer
          case 'chainTitle': return mockTitleEl
          case 'commandPreview': return { textContent: '' }
          case 'commandCount': return { textContent: '' }
          case 'emptyState': return { classList: { remove: vi.fn() } }
          case 'generatedAlias': return { style: { display: 'none' } }
          case 'aliasPreview': return { textContent: '' }
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
            title: 'No Alias Selected',
            preview: 'Select an alias to see the generated command',
            icon: 'fas fa-mask',
            emptyTitle: 'No Alias Selected',
            emptyDesc: 'Select an alias from the left panel to view and edit its command chain.',
            commandCount: '0'
          })
        }
        if (topic === 'preferences:get-setting') {
          return Promise.resolve(false)
        }
        return Promise.resolve({})
      })

      // Spy on render method
      const renderSpy = vi.spyOn(ui, 'render')

      // Simulate late-join environment state
      ui.handleInitialState('InterfaceModeService', { environment: 'alias' })

      // Wait for any promises to resolve
      await new Promise(resolve => setTimeout(resolve, 0))

      // Verify environment was set and render was called
      expect(ui._currentEnvironment).toBe('alias')
      expect(renderSpy).toHaveBeenCalled()
    })
  })
})