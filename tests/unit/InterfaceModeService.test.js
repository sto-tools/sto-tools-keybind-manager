import { describe, it, expect, beforeEach, vi } from 'vitest'
import InterfaceModeService from '../../src/js/components/services/InterfaceModeService.js'
import eventBus from '../../src/js/core/eventBus.js'

describe('InterfaceModeService', () => {
  let interfaceModeService
  let mockEventBus
  let mockStorage
  let mockProfileService
  let mockApp

  beforeEach(() => {
    mockEventBus = {
      on: vi.fn(),
      emit: vi.fn(),
      off: vi.fn()
    }
    
    mockStorage = {
      getProfile: vi.fn(() => ({ currentEnvironment: 'space' })),
      saveProfile: vi.fn()
    }
    
    mockProfileService = {
      setCurrentEnvironment: vi.fn()
    }
    
    mockApp = {
      currentProfile: 'test-profile'
    }

    interfaceModeService = new InterfaceModeService({
      eventBus: mockEventBus,
      storage: mockStorage,
      profileService: mockProfileService,
      app: mockApp
    })
  })

  describe('Constructor', () => {
    it('should create an instance with correct properties', () => {
      expect(interfaceModeService).toBeInstanceOf(InterfaceModeService)
      expect(interfaceModeService.eventBus).toBe(mockEventBus)
      expect(interfaceModeService.storage).toBe(mockStorage)
      expect(interfaceModeService.profileService).toBe(mockProfileService)
      expect(interfaceModeService.app).toBe(mockApp)
    })

    it('should initialize with default mode', () => {
      expect(interfaceModeService.currentMode).toBe('space')
    })

    it('should initialize handler references as null', () => {
      expect(interfaceModeService._modeSwitchedHandler).toBe(null)
      expect(interfaceModeService._profileSwitchedHandler).toBe(null)
    })

    it('should store response detach function', () => {
      expect(interfaceModeService._responseDetachFunction).toBeInstanceOf(Function)
    })
  })

  describe('Mode Management', () => {
    it('should switch mode correctly', () => {
      const emitSpy = vi.spyOn(mockEventBus, 'emit')
      
      interfaceModeService.switchMode('ground')

      expect(interfaceModeService.currentMode).toBe('ground')
      expect(emitSpy).toHaveBeenCalledWith('environment:changed', {
        oldEnvironment: 'space',
        environment: 'ground'
      })
      expect(emitSpy).toHaveBeenCalledWith('mode-changed', {
        oldMode: 'space',
        newMode: 'ground'
      })
    })

    it('should not switch if mode is already current', () => {
      const emitSpy = vi.spyOn(mockEventBus, 'emit')
      
      interfaceModeService.switchMode('space') // Already in space mode

      expect(emitSpy).not.toHaveBeenCalled()
    })

    it('should update profile service when switching modes', () => {
      interfaceModeService.switchMode('ground')

      expect(mockProfileService.setCurrentEnvironment).toHaveBeenCalledWith('ground')
    })

    it('should update profile data in storage', () => {
      interfaceModeService.switchMode('ground')

      expect(mockStorage.getProfile).toHaveBeenCalledWith('test-profile')
      expect(mockStorage.saveProfile).toHaveBeenCalledWith('test-profile', {
        currentEnvironment: 'ground'
      })
    })
  })

  describe('Event Listeners', () => {
    it('should setup event listeners on init', () => {
      interfaceModeService.init()

      expect(mockEventBus.on).toHaveBeenCalledWith('mode-switched', expect.any(Function))
      expect(mockEventBus.on).toHaveBeenCalledWith('profile-switched', expect.any(Function))
    })

    it('should store handler references after setup', () => {
      interfaceModeService.init()

      expect(interfaceModeService._modeSwitchedHandler).toBeInstanceOf(Function)
      expect(interfaceModeService._profileSwitchedHandler).toBeInstanceOf(Function)
    })

    it('should respond to mode-switched events', () => {
      interfaceModeService.init()
      
      // Get the event handler
      const modeSwitchedHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'mode-switched'
      )[1]

      modeSwitchedHandler({ mode: 'ground' })

      expect(interfaceModeService.currentMode).toBe('ground')
    })

    it('should respond to profile-switched events with environment', () => {
      interfaceModeService.init()
      
      // Get the event handler
      const profileSwitchedHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'profile-switched'
      )[1]

      profileSwitchedHandler({ environment: 'ground' })

      expect(interfaceModeService.currentMode).toBe('ground')
    })

    it('should not setup listeners multiple times', () => {
      interfaceModeService.init()
      const firstCallCount = mockEventBus.on.mock.calls.length
      
      interfaceModeService.init() // Call again
      
      expect(mockEventBus.on.mock.calls.length).toBe(firstCallCount)
    })
  })

  describe('Getters and Setters', () => {
    it('should get current mode', () => {
      expect(interfaceModeService.currentMode).toBe('space')
    })

    it('should set current mode via setter', () => {
      interfaceModeService.currentMode = 'ground'
      expect(interfaceModeService.currentMode).toBe('ground')
    })

    it('should get current environment', () => {
      expect(interfaceModeService.currentEnvironment).toBe('space')
    })

    it('should set current environment via setter', () => {
      interfaceModeService.currentEnvironment = 'ground'
      expect(interfaceModeService.currentEnvironment).toBe('ground')
    })
  })

  describe('Public Methods', () => {
    it('should get current mode via method', () => {
      expect(interfaceModeService.getCurrentMode()).toBe('space')
    })

    it('should set current mode via method', () => {
      interfaceModeService.setCurrentMode('ground')
      expect(interfaceModeService.getCurrentMode()).toBe('ground')
    })

    it('should initialize from profile', () => {
      const profile = { currentEnvironment: 'ground' }
      interfaceModeService.initializeFromProfile(profile)
      expect(interfaceModeService.currentMode).toBe('ground')
    })
  })

  describe('Cleanup', () => {
    it('should cleanup event listeners on destroy with specific handler references', () => {
      interfaceModeService.init()
      
      // Store references to the handlers that were registered
      const modeSwitchedHandler = interfaceModeService._modeSwitchedHandler
      const profileSwitchedHandler = interfaceModeService._profileSwitchedHandler
      
      interfaceModeService.destroy()

      // Verify off was called with the specific handler references
      expect(mockEventBus.off).toHaveBeenCalledWith('mode-switched', modeSwitchedHandler)
      expect(mockEventBus.off).toHaveBeenCalledWith('profile-switched', profileSwitchedHandler)
    })

    it('should not call off if listeners were never setup', () => {
      // Don't call init() - listeners never setup
      // But the response handler is still cleaned up
      interfaceModeService.destroy()

      // Should only call off for the response handler, not for event listeners
      expect(mockEventBus.off).toHaveBeenCalledTimes(1)
      expect(mockEventBus.off).toHaveBeenCalledWith('state:current-environment', expect.any(Function))
    })

    it('should reset listeners setup flag on destroy', () => {
      interfaceModeService.init()
      expect(interfaceModeService._modeListenersSetup).toBe(true)
      
      interfaceModeService.destroy()
      expect(interfaceModeService._modeListenersSetup).toBe(false)
    })

    it('should cleanup request/response handler on destroy', () => {
      const detachFunction = vi.fn()
      interfaceModeService._responseDetachFunction = detachFunction
      
      interfaceModeService.destroy()
      
      expect(detachFunction).toHaveBeenCalled()
      expect(interfaceModeService._responseDetachFunction).toBe(null)
    })

    it('should handle missing response detach function gracefully', () => {
      interfaceModeService._responseDetachFunction = null
      
      expect(() => interfaceModeService.destroy()).not.toThrow()
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

      // Create service with real event bus
      const serviceWithRealBus = new InterfaceModeService({
        eventBus: realEventBus,
        storage: mockStorage,
        profileService: mockProfileService,
        app: mockApp
      })

      // Add other handlers to the same events (simulating other components)
      const otherModeSwitchedHandler = vi.fn()
      const otherProfileSwitchedHandler = vi.fn()
      realEventBus.on('mode-switched', otherModeSwitchedHandler)
      realEventBus.on('profile-switched', otherProfileSwitchedHandler)

      // Initialize our service (adds its own handlers)
      serviceWithRealBus.init()

      // Verify both handlers are present
      expect(realEventBus.listeners.get('mode-switched').size).toBe(2)
      expect(realEventBus.listeners.get('profile-switched').size).toBe(2)

      // Destroy our service
      serviceWithRealBus.destroy()

      // Verify only our service's handlers were removed, other handlers remain
      expect(realEventBus.listeners.get('mode-switched').size).toBe(1)
      expect(realEventBus.listeners.get('profile-switched').size).toBe(1)

      // Verify the remaining handlers are the other ones
      expect(realEventBus.listeners.get('mode-switched').has(otherModeSwitchedHandler)).toBe(true)
      expect(realEventBus.listeners.get('profile-switched').has(otherProfileSwitchedHandler)).toBe(true)

      // Verify the other handlers still work
      realEventBus.emit('mode-switched', { mode: 'test' })
      realEventBus.emit('profile-switched', { environment: 'test' })
      
      expect(otherModeSwitchedHandler).toHaveBeenCalledWith({ mode: 'test' })
      expect(otherProfileSwitchedHandler).toHaveBeenCalledWith({ environment: 'test' })
    })
  })
}) 