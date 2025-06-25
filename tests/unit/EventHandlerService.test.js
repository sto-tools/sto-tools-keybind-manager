import { describe, it, expect, beforeEach, vi } from 'vitest'
import EventHandlerService from '../../src/js/components/services/EventHandlerService.js'

describe('EventHandlerService', () => {
  let eventHandlerService
  let mockEventBus
  let mockStorage
  let mockUI
  let mockModalManager
  let mockI18n
  let mockApp

  beforeEach(() => {
    mockEventBus = {
      on: vi.fn(),
      emit: vi.fn(),
      onDom: vi.fn()
    }
    
    mockStorage = {
      getProfile: vi.fn(),
      saveProfile: vi.fn(),
      getAllData: vi.fn(),
      loadDefaultData: vi.fn(),
      clearAllData: vi.fn()
    }
    
    mockUI = {
      showToast: vi.fn()
    }
    
    mockModalManager = {
      show: vi.fn(),
      hide: vi.fn()
    }
    
    mockI18n = {
      t: vi.fn((key) => key)
    }
    
    mockApp = {
      currentProfile: 'test-profile',
      currentEnvironment: 'space',
      selectedKey: 'F1',
      isModified: false,
      profileService: {
        createProfile: vi.fn(),
        switchProfile: vi.fn(),
        deleteProfile: vi.fn()
      },
      commandService: {
        addCommand: vi.fn(),
        editCommand: vi.fn(),
        deleteCommand: vi.fn()
      }
    }

    eventHandlerService = new EventHandlerService({
      eventBus: mockEventBus,
      storage: mockStorage,
      ui: mockUI,
      modalManager: mockModalManager,
      i18n: mockI18n,
      app: mockApp
    })
  })

  describe('Constructor', () => {
    it('should create an instance with correct properties', () => {
      expect(eventHandlerService).toBeInstanceOf(EventHandlerService)
      expect(eventHandlerService.eventBus).toBe(mockEventBus)
      expect(eventHandlerService.storage).toBe(mockStorage)
      expect(eventHandlerService.ui).toBe(mockUI)
      expect(eventHandlerService.modalManager).toBe(mockModalManager)
      expect(eventHandlerService.i18n).toBe(mockI18n)
      expect(eventHandlerService.app).toBe(mockApp)
    })

    it('should initialize internal state tracking', () => {
      expect(eventHandlerService._ehListenersSetup).toBe(false)
      expect(eventHandlerService._modeToggleHandlerAdded).toBe(false)
      expect(eventHandlerService.languageListenersSetup).toBe(false)
    })
  })

  describe('Proxy Methods', () => {
    it('should proxy currentProfile getter', () => {
      expect(eventHandlerService.currentProfile).toBe('test-profile')
    })

    it('should proxy currentEnvironment getter', () => {
      expect(eventHandlerService.currentEnvironment).toBe('space')
    })

    it('should proxy selectedKey getter', () => {
      expect(eventHandlerService.selectedKey).toBe('F1')
    })

    it('should proxy isModified getter', () => {
      expect(eventHandlerService.isModified).toBe(false)
    })

    it('should proxy setter methods', () => {
      const setterSpy = vi.fn()
      mockApp.currentProfile = setterSpy
      
      eventHandlerService.currentProfile = 'new-profile'
      expect(setterSpy).toBe('new-profile')
    })
  })

  describe('Event Handling', () => {
    it('should handle profile create events', () => {
      const data = { name: 'Test Profile', description: 'Test', mode: 'space' }
      mockApp.profileService.createProfile.mockReturnValue({ success: true })
      
      eventHandlerService.handleProfileCreate(data)
      
      expect(mockApp.profileService.createProfile).toHaveBeenCalledWith('Test Profile', 'Test', 'space')
      expect(mockEventBus.emit).toHaveBeenCalledWith('profile:created', { success: true })
    })

    it('should handle profile switch events', () => {
      const data = { profileId: 'test-profile' }
      mockApp.profileService.switchProfile.mockReturnValue({ success: true })
      
      eventHandlerService.handleProfileSwitch(data)
      
      expect(mockApp.profileService.switchProfile).toHaveBeenCalledWith('test-profile')
      expect(mockEventBus.emit).toHaveBeenCalledWith('profile:switched', { success: true })
    })

    it('should handle profile delete events', () => {
      const data = { profileId: 'test-profile' }
      mockApp.profileService.deleteProfile.mockReturnValue({ success: true })
      
      eventHandlerService.handleProfileDelete(data)
      
      expect(mockApp.profileService.deleteProfile).toHaveBeenCalledWith('test-profile')
      expect(mockEventBus.emit).toHaveBeenCalledWith('profile:deleted', { success: true })
    })
  })

  describe('UI Methods', () => {
    it('should toggle settings menu', () => {
      // Mock DOM elements
      const mockBtn = { closest: vi.fn(() => ({ classList: { toggle: vi.fn() } })) }
      vi.spyOn(document, 'getElementById').mockReturnValue(mockBtn)
      
      eventHandlerService.toggleSettingsMenu()
      
      expect(mockBtn.closest).toHaveBeenCalledWith('.dropdown')
    })

    it('should close settings menu', () => {
      const mockBtn = { closest: vi.fn(() => ({ classList: { remove: vi.fn() } })) }
      vi.spyOn(document, 'getElementById').mockReturnValue(mockBtn)
      
      eventHandlerService.closeSettingsMenu()
      
      expect(mockBtn.closest).toHaveBeenCalledWith('.dropdown')
    })
  })

  describe('Fallback Methods', () => {
    it('should emit events when app methods are not available', () => {
      // Remove app methods to test fallback
      delete mockApp.addKey
      
      eventHandlerService.addKey('F2')
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('key:add', { keyName: 'F2' })
    })

    it('should call app methods when available', () => {
      mockApp.addKey = vi.fn()
      
      eventHandlerService.addKey('F2')
      
      expect(mockApp.addKey).toHaveBeenCalledWith('F2')
      expect(mockEventBus.emit).not.toHaveBeenCalledWith('key:add', expect.anything())
    })
  })

  describe('Initialization', () => {
    it('should initialize correctly', () => {
      expect(() => {
        eventHandlerService.init()
      }).not.toThrow()
      
      expect(eventHandlerService.isInitialized()).toBe(true)
    })
  })
}) 