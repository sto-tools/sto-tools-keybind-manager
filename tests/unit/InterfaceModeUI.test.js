import { describe, it, expect, beforeEach, vi } from 'vitest'
import InterfaceModeUI from '../../src/js/components/ui/InterfaceModeUI.js'

describe('InterfaceModeUI', () => {
  let interfaceModeUI
  let mockEventBus
  let mockUI
  let mockProfileUI
  let mockDocument
  let mockSpaceBtn
  let mockGroundBtn
  let mockAliasBtn
  let mockKeySelector
  let mockAliasSelector

  beforeEach(() => {
    mockEventBus = {
      on: vi.fn(),
      emit: vi.fn(),
      off: vi.fn()
    }
    
    mockUI = {
      showToast: vi.fn()
    }
    
    mockProfileUI = {
      renderKeyGrid: vi.fn()
    }

    // Mock DOM elements
    mockDocument = {
      querySelector: vi.fn((selector) => {
        if (selector === '[data-mode="space"]') return mockSpaceBtn
        if (selector === '[data-mode="ground"]') return mockGroundBtn
        if (selector === '[data-mode="alias"]') return mockAliasBtn
        if (selector === '.key-selector-container') return mockKeySelector
        return null
      }),
      getElementById: vi.fn((id) => {
        if (id === 'aliasSelectorContainer') return mockAliasSelector
        return null
      })
    }

    // Mock mode buttons and containers
    mockSpaceBtn = { addEventListener: vi.fn(), classList: { toggle: vi.fn() }, removeEventListener: vi.fn() }
    mockGroundBtn = { addEventListener: vi.fn(), classList: { toggle: vi.fn() }, removeEventListener: vi.fn() }
    mockAliasBtn = { addEventListener: vi.fn(), classList: { toggle: vi.fn() }, removeEventListener: vi.fn() }
    mockKeySelector = { style: { display: '' } }
    mockAliasSelector = { style: { display: 'none' } }

    interfaceModeUI = new InterfaceModeUI({
      eventBus: mockEventBus,
      ui: mockUI,
      profileUI: mockProfileUI,
      document: mockDocument
    })
  })

  describe('Constructor', () => {
    it('should create an instance with correct properties', () => {
      expect(interfaceModeUI).toBeInstanceOf(InterfaceModeUI)
      expect(interfaceModeUI.eventBus).toBe(mockEventBus)
      expect(interfaceModeUI.ui).toBe(mockUI)
      expect(interfaceModeUI.profileUI).toBe(mockProfileUI)
      expect(interfaceModeUI.document).toBe(mockDocument)
    })

    it('should initialize internal state', () => {
      expect(interfaceModeUI._uiListenersSetup).toBe(false)
      expect(interfaceModeUI._modeButtons).toEqual({})
      expect(interfaceModeUI._currentMode).toBe('space')
    })

    it('should initialize handler references as null', () => {
      expect(interfaceModeUI._modeChangedHandler).toBe(null)
      expect(interfaceModeUI._environmentChangedHandler).toBe(null)
    })
  })

  describe('Initialization', () => {
    it('should setup event listeners on init', () => {
      interfaceModeUI.init()

      expect(mockEventBus.on).toHaveBeenCalledWith('mode-changed', expect.any(Function))
      expect(mockEventBus.on).toHaveBeenCalledWith('environment:changed', expect.any(Function))
      expect(interfaceModeUI._uiListenersSetup).toBe(true)
    })

    it('should store handler references after setup', () => {
      interfaceModeUI.init()

      expect(interfaceModeUI._modeChangedHandler).toBeInstanceOf(Function)
      expect(interfaceModeUI._environmentChangedHandler).toBeInstanceOf(Function)
    })

    it('should setup mode buttons on init', () => {
      interfaceModeUI.init()

      expect(mockDocument.querySelector).toHaveBeenCalledWith('[data-mode="space"]')
      expect(mockDocument.querySelector).toHaveBeenCalledWith('[data-mode="ground"]')
      expect(mockDocument.querySelector).toHaveBeenCalledWith('[data-mode="alias"]')
    })
  })

  describe('Mode Button Handling', () => {
    it('should handle mode button clicks', async () => {
      // Mock the request function to resolve successfully
      vi.doMock('../../src/js/core/requestResponse.js', () => ({
        request: vi.fn().mockResolvedValue({ success: true })
      }))
      
      await interfaceModeUI.handleModeButtonClick('ground')

      // Verify that the request-response pattern was used
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'rpc:environment:switch',
        expect.objectContaining({
          payload: { mode: 'ground' }
        })
      )
    })

    it('should setup click handlers for mode buttons', () => {
      interfaceModeUI.init()

      // Verify that addEventListener was called for each button
      expect(mockDocument.querySelector).toHaveBeenCalledWith('[data-mode="space"]')
      expect(mockDocument.querySelector).toHaveBeenCalledWith('[data-mode="ground"]')
      expect(mockDocument.querySelector).toHaveBeenCalledWith('[data-mode="alias"]')
    })
  })

  describe('UI Updates', () => {
    it('should update mode UI when mode changes', () => {
      interfaceModeUI._modeButtons = {
        space: mockSpaceBtn,
        ground: mockGroundBtn,
        alias: mockAliasBtn
      }
      interfaceModeUI.updateModeUI('ground')
      expect(mockSpaceBtn.classList.toggle).toHaveBeenCalledWith('active', false)
      expect(mockGroundBtn.classList.toggle).toHaveBeenCalledWith('active', true)
      expect(mockAliasBtn.classList.toggle).toHaveBeenCalledWith('active', false)
    })

    it('should update key grid display for space mode', () => {
      interfaceModeUI.updateKeyGridDisplay('space')
      expect(mockKeySelector.style.display).toBe('')
      expect(mockAliasSelector.style.display).toBe('none')
      expect(mockProfileUI.renderKeyGrid).toHaveBeenCalled()
      // Note: renderCommandChain is no longer called - command chain rendering is handled by CommandChainUI via events
    })

    it('should update key grid display for alias mode', () => {
      interfaceModeUI.updateKeyGridDisplay('alias')
      expect(mockKeySelector.style.display).toBe('none')
      expect(mockAliasSelector.style.display).toBe('')
      // Note: renderCommandChain is no longer called - command chain rendering is handled by CommandChainUI via events
    })
  })

  describe('Getters and Setters', () => {
    it('should get current mode from internal state', () => {
      expect(interfaceModeUI.currentMode).toBe('space')
    })

    it('should set current mode via request-response', async () => {
      // Mock the request function to resolve successfully
      vi.doMock('../../src/js/core/requestResponse.js', () => ({
        request: vi.fn().mockResolvedValue({ success: true })
      }))
      
      interfaceModeUI.currentMode = 'ground'
      
      // Verify that the request-response pattern was used
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'rpc:environment:switch',
        expect.objectContaining({
          payload: { mode: 'ground' }
        })
      )
    })

    it('should get current environment', () => {
      expect(interfaceModeUI.currentEnvironment).toBe('space')
    })

    it('should set current environment', async () => {
      // Mock the request function to resolve successfully
      vi.doMock('../../src/js/core/requestResponse.js', () => ({
        request: vi.fn().mockResolvedValue({ success: true })
      }))
      
      interfaceModeUI.currentEnvironment = 'ground'
      
      // Verify that the request-response pattern was used
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'rpc:environment:switch',
        expect.objectContaining({
          payload: { mode: 'ground' }
        })
      )
    })
  })

  describe('Public Methods', () => {
    it('should get current mode via method', () => {
      expect(interfaceModeUI.getCurrentMode()).toBe('space')
    })

    it('should set current mode via method', async () => {
      // Mock the request function to resolve successfully
      vi.doMock('../../src/js/core/requestResponse.js', () => ({
        request: vi.fn().mockResolvedValue({ success: true })
      }))
      
      await interfaceModeUI.setCurrentMode('ground')
      
      // Verify that the request-response pattern was used
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'rpc:environment:switch',
        expect.objectContaining({
          payload: { mode: 'ground' }
        })
      )
    })

    it('should update mode UI via method', () => {
      const updateSpy = vi.spyOn(interfaceModeUI, 'updateModeUI')
      interfaceModeUI.updateModeUI('ground')
      expect(updateSpy).toHaveBeenCalledWith('ground')
    })
  })

  describe('Event Handling', () => {
    it('should respond to mode-changed events', () => {
      interfaceModeUI.init()
      
      // Get the event handler
      const modeChangedHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'mode-changed'
      )[1]

      const updateSpy = vi.spyOn(interfaceModeUI, 'updateModeUI')
      modeChangedHandler({ newMode: 'ground' })

      expect(updateSpy).toHaveBeenCalledWith('ground')
    })
  })

  describe('Cleanup', () => {
    it('should cleanup event listeners on destroy with specific handler references', () => {
      interfaceModeUI.init()
      
      // Store references to the handlers that were registered
      const modeChangedHandler = interfaceModeUI._modeChangedHandler
      const environmentChangedHandler = interfaceModeUI._environmentChangedHandler
      
      interfaceModeUI.destroy()

      // Verify off was called with the specific handler references
      expect(mockEventBus.off).toHaveBeenCalledWith('mode-changed', modeChangedHandler)
      expect(mockEventBus.off).toHaveBeenCalledWith('environment:changed', environmentChangedHandler)
      expect(interfaceModeUI._uiListenersSetup).toBe(false)
    })

    it('should not call off if listeners were never setup', () => {
      // Don't call init() - listeners never setup
      interfaceModeUI.destroy()

      expect(mockEventBus.off).not.toHaveBeenCalled()
    })

    it('should cleanup DOM event listeners', () => {
      // Setup the component with buttons and handlers
      interfaceModeUI._modeButtons = {
        space: mockSpaceBtn,
        ground: mockGroundBtn,
        alias: mockAliasBtn
      }

      // Simulate the handler storage that happens during setupModeButtons
      const spaceHandler = vi.fn()
      const groundHandler = vi.fn()
      const aliasHandler = vi.fn()
      
      interfaceModeUI._modeButtonHandlers = {
        space: spaceHandler,
        ground: groundHandler,
        alias: aliasHandler
      }

      interfaceModeUI.destroy()

      // Verify that removeEventListener was called with the stored handler references
      expect(mockSpaceBtn.removeEventListener).toHaveBeenCalledWith('click', spaceHandler)
      expect(mockGroundBtn.removeEventListener).toHaveBeenCalledWith('click', groundHandler)
      expect(mockAliasBtn.removeEventListener).toHaveBeenCalledWith('click', aliasHandler)
      
      // Verify handlers are cleared
      expect(interfaceModeUI._modeButtonHandlers).toEqual({})
    })
  })

  describe('Event Listener Cleanup Regression Test', () => {
    it('should only remove its own handlers, not all handlers for the event', () => {
      // This test verifies the bug fix - that we don't remove ALL handlers for an event
      
      // Create a real eventBus instance to test the actual behavior
      const realEventBus = {
        listeners: new Map(),
        on(event, callback) {
          if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set())
          }
          this.listeners.get(event).add(callback)
        },
        off(event, callback) {
          const eventListeners = this.listeners.get(event)
          if (eventListeners) {
            if (callback) {
              eventListeners.delete(callback)
            } else {
              // This is the bug - removing all listeners when no callback provided
              eventListeners.clear()
            }
          }
        },
        emit(event, data) {
          const eventListeners = this.listeners.get(event)
          if (eventListeners) {
            eventListeners.forEach(callback => callback(data))
          }
        }
      }

      // Create UI with real event bus
      const uiWithRealBus = new InterfaceModeUI({
        eventBus: realEventBus,
        ui: mockUI,
        profileUI: mockProfileUI,
        document: mockDocument
      })

      // Add other handlers to the same events (simulating other components)
      const otherModeChangedHandler = vi.fn()
      const otherEnvironmentChangedHandler = vi.fn()
      realEventBus.on('mode-changed', otherModeChangedHandler)
      realEventBus.on('environment:changed', otherEnvironmentChangedHandler)

      // Initialize our UI (adds its own handlers)
      uiWithRealBus.init()

      // Verify both handlers are present
      expect(realEventBus.listeners.get('mode-changed').size).toBe(2)
      expect(realEventBus.listeners.get('environment:changed').size).toBe(2)

      // Destroy our UI
      uiWithRealBus.destroy()

      // Verify only our UI's handlers were removed, other handlers remain
      expect(realEventBus.listeners.get('mode-changed').size).toBe(1)
      expect(realEventBus.listeners.get('environment:changed').size).toBe(1)

      // Verify the remaining handlers are the other ones
      expect(realEventBus.listeners.get('mode-changed').has(otherModeChangedHandler)).toBe(true)
      expect(realEventBus.listeners.get('environment:changed').has(otherEnvironmentChangedHandler)).toBe(true)

      // Verify the other handlers still work
      realEventBus.emit('mode-changed', { newMode: 'test' })
      realEventBus.emit('environment:changed', { environment: 'test' })
      
      expect(otherModeChangedHandler).toHaveBeenCalledWith({ newMode: 'test' })
      expect(otherEnvironmentChangedHandler).toHaveBeenCalledWith({ environment: 'test' })
    })
  })
}) 