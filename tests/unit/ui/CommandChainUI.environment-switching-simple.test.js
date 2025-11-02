import { describe, it, expect, beforeEach, vi } from 'vitest'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'

describe('CommandChainUI Environment Switching - Simple', () => {
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
      onDomDebounced: vi.fn(() => () => {})
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

  describe('Selection State Management', () => {
    it('should show empty state when no key is selected in new environment', async () => {
      // Set up DOM elements
      const mockContainer = { replaceChildren: vi.fn(), children: [] }
      const mockTitleEl = { textContent: '' }
      const mockPreviewEl = { textContent: '' }
      const mockCountSpanEl = { textContent: '' }

      mockDocument.getElementById.mockImplementation((id) => {
        switch (id) {
          case 'commandList': return mockContainer
          case 'chainTitle': return mockTitleEl
          case 'commandPreview': return mockPreviewEl
          case 'commandCount': return mockCountSpanEl
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

      // Simulate switching to ground environment with no keys
      ui.cache.currentEnvironment = 'ground'
      ui.cache.selectedKey = null
      ui.cache.selectedAlias = null

      // Call render
      await ui.render()

      // Verify empty state is displayed with correct environment-specific messages
      expect(mockTitleEl.textContent).toBe('No Key Selected')
      expect(mockPreviewEl.textContent).toBe('Select a key to see the generated command')
      expect(mockCountSpanEl.textContent).toBe('0')
      expect(mockContainer.replaceChildren).toHaveBeenCalled()
      expect(ui.request).toHaveBeenCalledWith('command:get-empty-state-info')
    })

    it('should show selected key when switching environments with key available', async () => {
      // Set up DOM elements
      const mockContainer = { replaceChildren: vi.fn(), children: [] }
      const mockTitleEl = { textContent: '' }
      const mockPreviewEl = { textContent: '' }
      const mockCountSpanEl = { textContent: '' }

      mockDocument.getElementById.mockImplementation((id) => {
        switch (id) {
          case 'commandList': return mockContainer
          case 'chainTitle': return mockTitleEl
          case 'commandPreview': return mockPreviewEl
          case 'commandCount': return mockCountSpanEl
          case 'emptyState': return { classList: { remove: vi.fn() } }
          case 'generatedAlias': return { style: { display: 'none' } }
          case 'aliasPreview': return { textContent: '' }
          case 'stabilizeExecutionOrderBtn': return { disabled: false, classList: { toggle: vi.fn(), remove: vi.fn() } }
          case 'copyAliasBtn': return { addEventListener: vi.fn() }
          case 'bindsetSelectorContainer': return { style: { display: 'none' } }
          default: return null
        }
      })

      // Mock service responses for a key with commands
      ui.request.mockImplementation((topic, data) => {
        if (topic === 'command:get-empty-state-info') {
          return Promise.resolve({
            title: 'Command Chain for F2',
            preview: 'F2 "FireAll"',
            commandCount: '1'
          })
        }
        if (topic === 'preferences:get-setting') {
          return Promise.resolve(false)
        }
        return Promise.resolve([{ command: 'FireAll' }])
      })

      // Simulate switching to space environment with a selected key
      ui.cache.currentEnvironment = 'space'
      ui.cache.selectedKey = 'F2'
      ui.cache.selectedAlias = null

      // Mock getCommandsForCurrentSelection to return commands
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue([{ command: 'FireAll' }])

      // Call render
      await ui.render()

      // Verify that the key's command chain is displayed
      expect(mockTitleEl.textContent).toBe('Command Chain for F2')
      expect(mockCountSpanEl.textContent).toBe('1')
      expect(mockContainer.replaceChildren).toHaveBeenCalled()
    })

    it('should handle switching from space to alias environment', async () => {
      // Set up DOM elements
      const mockContainer = { replaceChildren: vi.fn(), children: [] }
      const mockTitleEl = { textContent: '' }
      const mockPreviewEl = { textContent: '' }
      const mockCountSpanEl = { textContent: '' }

      mockDocument.getElementById.mockImplementation((id) => {
        switch (id) {
          case 'commandList': return mockContainer
          case 'chainTitle': return mockTitleEl
          case 'commandPreview': return mockPreviewEl
          case 'commandCount': return mockCountSpanEl
          case 'emptyState': return { classList: { remove: vi.fn() } }
          case 'generatedAlias': return { style: { display: 'none' } }
          case 'aliasPreview': return { textContent: '' }
          case 'stabilizeExecutionOrderBtn': return { disabled: false, classList: { toggle: vi.fn(), remove: vi.fn() } }
          case 'copyAliasBtn': return { addEventListener: vi.fn() }
          case 'bindsetSelectorContainer': return { style: { display: 'none' } }
          default: return null
        }
      })

      // Mock empty state service response for alias environment
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

      // Simulate switching from space to alias environment
      ui.cache.currentEnvironment = 'alias'
      ui.cache.selectedKey = null  // Should be cleared when switching to alias
      ui.cache.selectedAlias = null

      // Call render
      await ui.render()

      // Verify alias empty state is displayed
      expect(mockTitleEl.textContent).toBe('No Alias Selected')
      expect(mockPreviewEl.textContent).toBe('Select an alias to see the generated command')
      expect(mockCountSpanEl.textContent).toBe('0')
      expect(mockContainer.replaceChildren).toHaveBeenCalled()
    })
  })
})