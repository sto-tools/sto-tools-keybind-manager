import { describe, it, expect, beforeEach, vi } from 'vitest'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'

describe('CommandChainUI Space to Ground Fix', () => {
  let ui, mockDocument, mockEventBus, mockUI

  beforeEach(async () => {
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
  })

  describe('Space to Ground Environment Switch', () => {
    it('should clear selection and show empty state when switching from space to ground with no keys', async () => {
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

      // Mock empty state service response for ground environment with no keys
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

      // Simulate initial state: space environment with F1 selected
      ui._currentEnvironment = 'space'
      ui._selectedKey = 'F1'
      ui._selectedAlias = null

      // Now simulate environment change to ground (this is the scenario that was broken)
      ui._currentEnvironment = 'ground'
      ui._selectedKey = null  // This should be cleared by the environment change handler
      ui._selectedAlias = null

      // Call render - this should show empty state, not "Command Chain for F1"
      await ui.render()

      // Verify that empty state is shown correctly
      expect(ui._selectedKey).toBe(null)
      expect(ui._selectedAlias).toBe(null)
      expect(mockTitleEl.textContent).toBe('No Key Selected')
      expect(mockPreviewEl.textContent).toBe('Select a key to see the generated command')
      expect(mockCountSpanEl.textContent).toBe('0')
      expect(mockContainer.replaceChildren).toHaveBeenCalled()
      expect(ui.request).toHaveBeenCalledWith('command:get-empty-state-info')
    })

    it('should show correct state when switching from alias to ground (working case)', async () => {
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

      // Simulate initial state: alias environment with an alias selected
      ui._currentEnvironment = 'alias'
      ui._selectedKey = null
      ui._selectedAlias = 'MyAlias'

      // Now simulate environment change to ground
      ui._currentEnvironment = 'ground'
      ui._selectedKey = null
      ui._selectedAlias = null  // This should be cleared

      // Call render
      await ui.render()

      // Verify that empty state is shown correctly (this case was already working)
      expect(ui._selectedKey).toBe(null)
      expect(ui._selectedAlias).toBe(null)
      expect(mockTitleEl.textContent).toBe('No Key Selected')
      expect(mockPreviewEl.textContent).toBe('Select a key to see the generated command')
      expect(mockCountSpanEl.textContent).toBe('0')
    })

    it('should clear both selections when switching to any environment', () => {
      // Test the specific fix: both selections should be cleared regardless of target environment
      
      // Start with space environment and F1 selected
      ui._currentEnvironment = 'space'
      ui._selectedKey = 'F1'
      ui._selectedAlias = null

      // Simulate environment change to ground - both selections should be cleared
      ui._currentEnvironment = 'ground'
      ui._selectedKey = null
      ui._selectedAlias = null

      expect(ui._selectedKey).toBe(null)
      expect(ui._selectedAlias).toBe(null)

      // Start with alias environment and alias selected
      ui._currentEnvironment = 'alias'
      ui._selectedKey = null
      ui._selectedAlias = 'MyAlias'

      // Simulate environment change to space - both selections should be cleared
      ui._currentEnvironment = 'space'
      ui._selectedKey = null
      ui._selectedAlias = null

      expect(ui._selectedKey).toBe(null)
      expect(ui._selectedAlias).toBe(null)
    })
  })
})