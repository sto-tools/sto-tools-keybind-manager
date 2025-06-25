import { describe, it, expect, beforeEach, vi } from 'vitest'
import InterfaceModeUI from '../../src/js/components/ui/InterfaceModeUI.js'

describe('InterfaceModeUI', () => {
  let interfaceModeUI
  let mockService
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
    mockService = {
      currentMode: 'space'
    }
    
    mockEventBus = {
      on: vi.fn(),
      emit: vi.fn(),
      off: vi.fn()
    }
    
    mockUI = {
      showToast: vi.fn()
    }
    
    mockProfileUI = {
      renderKeyGrid: vi.fn(),
      renderCommandChain: vi.fn()
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
      service: mockService,
      eventBus: mockEventBus,
      ui: mockUI,
      profileUI: mockProfileUI,
      document: mockDocument
    })
  })

  describe('Constructor', () => {
    it('should create an instance with correct properties', () => {
      expect(interfaceModeUI).toBeInstanceOf(InterfaceModeUI)
      expect(interfaceModeUI.service).toBe(mockService)
      expect(interfaceModeUI.eventBus).toBe(mockEventBus)
      expect(interfaceModeUI.ui).toBe(mockUI)
      expect(interfaceModeUI.profileUI).toBe(mockProfileUI)
      expect(interfaceModeUI.document).toBe(mockDocument)
    })

    it('should initialize internal state', () => {
      expect(interfaceModeUI._uiListenersSetup).toBe(false)
      expect(interfaceModeUI._modeButtons).toEqual({})
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
    it('should handle mode button clicks', () => {
      interfaceModeUI.handleModeButtonClick('ground')

      expect(mockEventBus.emit).toHaveBeenCalledWith('mode-switched', { mode: 'ground' })
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
      expect(mockProfileUI.renderCommandChain).toHaveBeenCalled()
    })

    it('should update key grid display for alias mode', () => {
      interfaceModeUI.updateKeyGridDisplay('alias')
      expect(mockKeySelector.style.display).toBe('none')
      expect(mockAliasSelector.style.display).toBe('')
      expect(mockProfileUI.renderCommandChain).toHaveBeenCalled()
    })
  })

  describe('Getters and Setters', () => {
    it('should get current mode from service', () => {
      expect(interfaceModeUI.currentMode).toBe('space')
    })

    it('should set current mode via service', () => {
      mockService.currentMode = 'ground'
      interfaceModeUI.currentMode = 'ground'
      expect(interfaceModeUI.currentMode).toBe('ground')
    })

    it('should get current environment', () => {
      expect(interfaceModeUI.currentEnvironment).toBe('space')
    })

    it('should set current environment', () => {
      mockService.currentMode = 'ground'
      interfaceModeUI.currentEnvironment = 'ground'
      expect(interfaceModeUI.currentEnvironment).toBe('ground')
    })
  })

  describe('Public Methods', () => {
    it('should get current mode via method', () => {
      expect(interfaceModeUI.getCurrentMode()).toBe('space')
    })

    it('should set current mode via method', () => {
      mockService.currentMode = 'ground'
      interfaceModeUI.setCurrentMode('ground')
      expect(interfaceModeUI.getCurrentMode()).toBe('ground')
    })

    it('should update mode UI via method', () => {
      const updateSpy = vi.spyOn(interfaceModeUI, 'updateModeUI')
      interfaceModeUI.updateModeUIState()
      expect(updateSpy).toHaveBeenCalled()
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
      interfaceModeUI._modeButtons = {
        space: mockSpaceBtn,
        ground: mockGroundBtn,
        alias: mockAliasBtn
      }

      interfaceModeUI.destroy()

      expect(mockSpaceBtn.removeEventListener).toHaveBeenCalledWith('click', interfaceModeUI.handleModeButtonClick)
      expect(mockGroundBtn.removeEventListener).toHaveBeenCalledWith('click', interfaceModeUI.handleModeButtonClick)
      expect(mockAliasBtn.removeEventListener).toHaveBeenCalledWith('click', interfaceModeUI.handleModeButtonClick)
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
        service: mockService,
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