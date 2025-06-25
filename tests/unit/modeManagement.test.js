import { describe, it, expect, beforeEach, vi } from 'vitest'
import { modeManagement } from '../../src/js/ui/modeManagement.js'
import eventBus from '../../src/js/core/eventBus.js'

describe('Mode Management', () => {
  let mockApp

  beforeEach(() => {
    // Create a mock app object with the modeManagement mixin
    mockApp = {
      currentMode: 'space',
      currentEnvironment: 'space',
      currentProfile: 'test-profile',
      profileService: {
        setCurrentEnvironment: vi.fn()
      },
      profileUI: {
        renderKeyGrid: vi.fn(),
        renderCommandChain: vi.fn()
      }
    }

    // Apply the modeManagement mixin to the mock app
    Object.assign(mockApp, modeManagement)

    // Mock DOM elements
    document.body.innerHTML = `
      <button class="mode-btn" data-mode="space">Space</button>
      <button class="mode-btn" data-mode="ground">Ground</button>
      <button class="mode-btn" data-mode="alias">Alias</button>
    `

    // Mock window.storageService
    global.window = global.window || {}
    window.storageService = {
      getProfile: vi.fn(() => ({ currentEnvironment: 'space' })),
      saveProfile: vi.fn()
    }

    // Clear event listeners
    eventBus.listeners = {}
  })

  describe('switchMode', () => {
    it('should switch from space to ground mode', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit')
      
      mockApp.switchMode('ground')

      expect(mockApp.currentMode).toBe('ground')
      expect(mockApp.currentEnvironment).toBe('ground')
      expect(emitSpy).toHaveBeenCalledWith('mode-changed', {
        oldMode: 'space',
        newMode: 'ground'
      })
    })

    it('should not switch if mode is already current', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit')
      
      mockApp.switchMode('space') // Already in space mode

      expect(emitSpy).not.toHaveBeenCalled()
    })

    it('should update button states when switching modes', () => {
      mockApp.switchMode('ground')

      const spaceBtn = document.querySelector('[data-mode="space"]')
      const groundBtn = document.querySelector('[data-mode="ground"]')

      expect(spaceBtn.classList.contains('active')).toBe(false)
      expect(groundBtn.classList.contains('active')).toBe(true)
    })

    it('should call profileService.setCurrentEnvironment', () => {
      mockApp.switchMode('ground')

      expect(mockApp.profileService.setCurrentEnvironment).toHaveBeenCalledWith('ground')
    })

    it('should call profileUI.renderKeyGrid and renderCommandChain', () => {
      mockApp.switchMode('ground')

      expect(mockApp.profileUI.renderKeyGrid).toHaveBeenCalled()
      expect(mockApp.profileUI.renderCommandChain).toHaveBeenCalled()
    })
  })

  describe('updateModeUI', () => {
    it('should set correct button active states', () => {
      mockApp.currentMode = 'ground'
      mockApp.updateModeUI()

      const spaceBtn = document.querySelector('[data-mode="space"]')
      const groundBtn = document.querySelector('[data-mode="ground"]')
      const aliasBtn = document.querySelector('[data-mode="alias"]')

      expect(spaceBtn.classList.contains('active')).toBe(false)
      expect(groundBtn.classList.contains('active')).toBe(true)
      expect(aliasBtn.classList.contains('active')).toBe(false)
    })
  })

  describe('event listeners', () => {
    it('should respond to mode-switched events', () => {
      const switchModeSpy = vi.spyOn(mockApp, 'switchMode')
      mockApp.setupEventListeners()

      eventBus.emit('mode-switched', { mode: 'ground' })

      expect(switchModeSpy).toHaveBeenCalledWith('ground')
    })

    it('should respond to profile-switched events with environment', () => {
      const switchModeSpy = vi.spyOn(mockApp, 'switchMode')
      mockApp.setupEventListeners()

      eventBus.emit('profile-switched', { environment: 'ground' })

      expect(switchModeSpy).toHaveBeenCalledWith('ground')
    })
  })
}) 