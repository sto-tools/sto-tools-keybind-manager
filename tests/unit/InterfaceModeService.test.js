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
  })

  describe('Mode Management', () => {
    it('should switch mode correctly', () => {
      const emitSpy = vi.spyOn(mockEventBus, 'emit')
      
      interfaceModeService.switchMode('ground')

      expect(interfaceModeService.currentMode).toBe('ground')
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
        currentEnvironment: 'space',
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
    it('should cleanup event listeners on destroy', () => {
      interfaceModeService.init()
      interfaceModeService.destroy()

      expect(mockEventBus.off).toHaveBeenCalledWith('mode-switched')
      expect(mockEventBus.off).toHaveBeenCalledWith('profile-switched')
    })
  })
}) 