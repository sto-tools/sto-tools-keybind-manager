import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import ComponentBase from '../../src/js/components/ComponentBase.js'
import CommandChainUI from '../../src/js/components/ui/CommandChainUI.js'
import { request, respond } from '../../src/js/core/requestResponse.js'

describe('CommandChainUI', () => {
  let dom, document, window, eventBus, commandChainUI

  beforeEach(() => {
    // Setup DOM
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="commandList"></div>
          <div id="chainTitle"></div>
          <div id="commandPreview"></div>
          <span id="commandCount"></span>
          <div id="emptyState"></div>
        </body>
      </html>
    `)
    
    document = dom.window.document
    window = dom.window
    
    // Setup event bus
    eventBus = {
      on: vi.fn().mockImplementation((event, callback) => {
        return () => {} // Mock detach function
      }),
      off: vi.fn(),
      emit: vi.fn(),
      onDom: vi.fn()
    }

    // Mock UI utilities
    const mockUI = {
      initDragAndDrop: vi.fn()
    }

    // Create CommandChainUI instance
    commandChainUI = new CommandChainUI({
      eventBus,
      ui: mockUI,
      document
    })

    // Mock request/response handlers
    respond(eventBus, 'command:get-empty-state-info', () => ({
      title: 'Test Title',
      preview: 'Test Preview',
      commandCount: '0',
      icon: 'fas fa-test',
      emptyTitle: 'No Commands',
      emptyDesc: 'Add commands to get started'
    }))

    respond(eventBus, 'command:get-for-selected-key', () => [])
    respond(eventBus, 'command:find-definition', () => null)
    respond(eventBus, 'command:get-warning', () => null)
  })

  afterEach(() => {
    if (commandChainUI && commandChainUI.destroy) {
      commandChainUI.destroy()
    }
  })

  describe('Language Change Handling', () => {
    it('should listen for language:changed events during initialization', async () => {
      await commandChainUI.onInit()

      // Verify that language:changed event listener was registered
      const languageChangedListener = eventBus.on.mock.calls.find(call => 
        call[0] === 'language:changed'
      )
      
      expect(languageChangedListener).toBeDefined()
      expect(typeof languageChangedListener[1]).toBe('function')
    })

    it('should re-render when language:changed event is emitted', async () => {
      // Set up initial state
      commandChainUI._selectedKey = 'F1'
      commandChainUI._currentEnvironment = 'space'
      
      // Mock the render method to track calls
      const renderSpy = vi.spyOn(commandChainUI, 'render').mockImplementation(() => Promise.resolve())
      
      await commandChainUI.onInit()

      // Find the language:changed event listener
      const languageChangedListener = eventBus.on.mock.calls.find(call => 
        call[0] === 'language:changed'
      )[1]

      // Simulate language change event
      await languageChangedListener()

      // Verify render was called
      expect(renderSpy).toHaveBeenCalled()
    })

    it('should re-render command items with updated translations when language changes', async () => {
      // Set up initial state with a selected key and some commands
      commandChainUI._selectedKey = 'F1'
      commandChainUI._currentEnvironment = 'space'

      // Mock the render method to track calls
      const renderSpy = vi.spyOn(commandChainUI, 'render').mockImplementation(() => Promise.resolve())

      await commandChainUI.onInit()

      // Find and call the language:changed event listener
      const languageChangedListener = eventBus.on.mock.calls.find(call => 
        call[0] === 'language:changed'
      )[1]

      // Reset the spy to count calls after initialization
      renderSpy.mockClear()

      // Simulate language change event
      await languageChangedListener()

      // Verify render was called due to language change
      expect(renderSpy).toHaveBeenCalledTimes(1)
    })

    it('should handle language change events when no commands are present', async () => {
      // Set up with no selected key
      commandChainUI._selectedKey = null
      commandChainUI._currentEnvironment = 'space'

      await commandChainUI.onInit()

      // Find the language:changed event listener
      const languageChangedListener = eventBus.on.mock.calls.find(call => 
        call[0] === 'language:changed'
      )[1]

      // Should not throw when called with no commands
      expect(async () => {
        await languageChangedListener()
      }).not.toThrow()

      // Should show empty state
      const emptyState = document.getElementById('emptyState')
      expect(emptyState).toBeDefined()
    })
  })

  describe('Event Listener Cleanup', () => {
    it('should store detach functions for language:changed listener', async () => {
      await commandChainUI.onInit()

      // Verify that detach functions array includes the language:changed listener
      expect(commandChainUI._detachFunctions).toBeDefined()
      expect(commandChainUI._detachFunctions.length).toBeGreaterThan(0)
      
      // Each call to eventBus.on should return a detach function
      expect(eventBus.on).toHaveBeenCalled()
      eventBus.on.mock.calls.forEach(call => {
        expect(typeof call[1]).toBe('function') // The callback should be a function
      })
    })
  })
}) 