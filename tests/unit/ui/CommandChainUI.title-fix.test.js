import { describe, it, expect, beforeEach, vi } from 'vitest'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'

describe('CommandChainUI Title Fix', () => {
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

  describe('Title Update on Environment Switch', () => {
    it('should show "No Key Selected" when switching from space to ground with no keys', async () => {
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

      // Mock service responses to simulate the problematic scenario
      let requestCount = 0
      ui.request.mockImplementation((topic, data) => {
        requestCount++
        
        if (topic === 'command:get-empty-state-info') {
          if (requestCount === 1) {
            // First call - with stale selection (F1 from space) 
            return Promise.resolve({
              title: 'Command Chain for F1',  // Wrong - should not show this
              preview: 'F1 ""',
              icon: 'fas fa-plus-circle',
              emptyTitle: 'No Commands',
              emptyDesc: 'Click "Add Command" to start building your command chain for F1.',
              commandCount: '0'
            })
          } else {
            // Second call - with cleared selection (should be this one)
            return Promise.resolve({
              title: 'No Key Selected',  // Correct
              preview: 'Select a key to see the generated command',
              icon: 'fas fa-keyboard',
              emptyTitle: 'No Key Selected',
              emptyDesc: 'Select a key from the left panel to view and edit its command chain.',
              commandCount: '0'
            })
          }
        }
        if (topic === 'preferences:get-setting') {
          return Promise.resolve(false)
        }
        return Promise.resolve({})
      })

      // Simulate switching from space to ground with stale selection
      ui._currentEnvironment = 'ground'
      ui._selectedKey = 'F1'  // Stale selection from space environment
      ui._selectedAlias = null

      // Mock getCommandsForCurrentSelection to return empty array (key doesn't exist in ground)
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue([])

      // Call render
      await ui.render()

      // Verify that the selection was cleared and correct title is shown
      expect(ui._selectedKey).toBe(null)
      expect(mockTitleEl.textContent).toBe('No Key Selected')  // Should show this, not "Command Chain for F1"
      // The service may be called multiple times due to other render logic, but the important thing is the title is correct
    })

    it('should show correct title when switching from alias to ground (working case)', async () => {
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

      // Mock empty state service response for no selection
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

      // Simulate switching from alias to ground (this case already works)
      ui._currentEnvironment = 'ground'
      ui._selectedKey = null
      ui._selectedAlias = null

      // Call render
      await ui.render()

      // Verify correct title is shown
      expect(mockTitleEl.textContent).toBe('No Key Selected')
    })
  })
})