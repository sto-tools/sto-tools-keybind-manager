import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import GamepadCaptureService from '../../../src/js/components/services/GamepadCaptureService.js'
import { createServiceFixture } from '../../fixtures/services/harness.js'

describe('GamepadCaptureService - Basic Connection Handling', () => {
  let service
  let fixture

  beforeEach(() => {
    // Create service fixture with proper event bus
    fixture = createServiceFixture({ trackEvents: true })

    // Mock window and navigator for gamepad API
    global.window = {
      isSecureContext: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }

    global.navigator = {
      getGamepads: vi.fn(() => [])
    }

    // Mock i18n
    const mockI18n = {
      t: vi.fn((key) => key)
    }

    // Create service instance
    service = new GamepadCaptureService({ eventBus: fixture.eventBus, i18n: mockI18n })
  })

  afterEach(() => {
    if (service) {
      service.onDestroy()
    }
    vi.clearAllMocks()
  })

  describe('Event Listener Setup and Cleanup', () => {
    it('should set up gamepad event listeners when available', () => {
      service.onInit()

      expect(global.window.addEventListener).toHaveBeenCalledWith(
        'gamepadconnected',
        expect.any(Function)
      )
      expect(global.window.addEventListener).toHaveBeenCalledWith(
        'gamepaddisconnected',
        expect.any(Function)
      )
    })

    it('should remove event listeners on destroy', () => {
      service.onInit()
      service.onDestroy()

      expect(global.window.removeEventListener).toHaveBeenCalledWith(
        'gamepadconnected',
        expect.any(Function)
      )
      expect(global.window.removeEventListener).toHaveBeenCalledWith(
        'gamepaddisconnected',
        expect.any(Function)
      )
    })
  })

  describe('Gamepad State Tracking', () => {
    it('should track connected gamepads using Map', () => {
      service.onInit()

      const mockGamepad = {
        id: 'Test Gamepad',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      service.handleGamepadConnection(mockGamepad)

      expect(service.connectedGamepads instanceof Map).toBe(true)
      expect(service.connectedGamepads.size).toBe(1)
      expect(service.connectedGamepads.has(0)).toBe(true)
      expect(service.connectedGamepads.get(0)).toMatchObject({
        id: 'Test Gamepad',
        index: 0,
        mapping: 'standard',
        connected: true
      })
    })

    it('should handle multiple gamepads', () => {
      service.onInit()

      const mockGamepad1 = {
        id: 'Gamepad 1',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      const mockGamepad2 = {
        id: 'Gamepad 2',
        index: 1,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      service.handleGamepadConnection(mockGamepad1)
      service.handleGamepadConnection(mockGamepad2)

      expect(service.connectedGamepads.size).toBe(2)
      expect(service.connectedGamepads.has(0)).toBe(true)
      expect(service.connectedGamepads.has(1)).toBe(true)
    })

    it('should remove gamepads on disconnection', () => {
      service.onInit()

      const mockGamepad = {
        id: 'Test Gamepad',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      service.handleGamepadConnection(mockGamepad)
      expect(service.connectedGamepads.size).toBe(1)

      mockGamepad.connected = false
      service.handleGamepadDisconnection(mockGamepad)

      expect(service.connectedGamepads.size).toBe(0)
    })
  })

  describe('Initial Gamepad Scan', () => {
    it('should scan for initially connected gamepads on init', () => {
      const mockGamepad = {
        id: 'Initial Gamepad',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      global.navigator.getGamepads.mockReturnValue([mockGamepad, null])

      service.onInit()

      expect(service.connectedGamepads.size).toBe(1)
      expect(service.connectedGamepads.get(0)).toMatchObject({
        id: 'Initial Gamepad',
        index: 0,
        mapping: 'standard'
      })
    })

    it('should handle multiple initially connected gamepads', () => {
      const mockGamepad1 = {
        id: 'Gamepad 1',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      const mockGamepad2 = {
        id: 'Gamepad 2',
        index: 1,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      global.navigator.getGamepads.mockReturnValue([mockGamepad1, mockGamepad2])

      service.onInit()

      expect(service.connectedGamepads.size).toBe(2)
    })
  })

  describe('Active Gamepad Management', () => {
    it('should set first connected gamepad as active', () => {
      service.onInit()

      const mockGamepad = {
        id: 'Test Gamepad',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      service.handleGamepadConnection(mockGamepad)

      expect(service.activeGamepadIndex).toBe(0)
    })

    it('should allow switching active gamepad', () => {
      service.onInit()

      const mockGamepad1 = {
        id: 'Gamepad 1',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      const mockGamepad2 = {
        id: 'Gamepad 2',
        index: 1,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      service.handleGamepadConnection(mockGamepad1)
      service.handleGamepadConnection(mockGamepad2)

      const result = service.selectActiveGamepad({ gamepadIndex: 1 })

      expect(result).toBe(true)
      expect(service.activeGamepadIndex).toBe(1)
    })

    it('should fail to select non-existent gamepad', () => {
      service.onInit()

      const result = service.selectActiveGamepad({ gamepadIndex: 99 })

      expect(result).toBe(false)
    })

    it('should clear active gamepad when all are disconnected', () => {
      service.onInit()

      const mockGamepad = {
        id: 'Test Gamepad',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      service.handleGamepadConnection(mockGamepad)
      expect(service.activeGamepadIndex).toBe(0)

      mockGamepad.connected = false
      service.handleGamepadDisconnection(mockGamepad)

      expect(service.activeGamepadIndex).toBeNull()
    })
  })

  describe('Gamepad Type Detection', () => {
    it('should detect standard gamepad mapping', () => {
      const mockGamepad = {
        id: 'Xbox Controller',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      const gamepadType = service.detectGamepadType(mockGamepad)
      expect(gamepadType).toBe('gamepad')
    })

    it('should detect joystick type from name', () => {
      const mockGamepad = {
        id: 'Logitech Joystick',
        index: 0,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      const gamepadType = service.detectGamepadType(mockGamepad)
      expect(gamepadType).toBe('joystick')
    })

    it('should detect flight stick type', () => {
      const mockGamepad = {
        id: 'Flight Stick Pro',
        index: 0,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      const gamepadType = service.detectGamepadType(mockGamepad)
      expect(gamepadType).toBe('joystick')
    })

    it('should default to generic for unknown controllers', () => {
      const mockGamepad = {
        id: 'Unknown Device',
        index: 0,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      const gamepadType = service.detectGamepadType(mockGamepad)
      expect(gamepadType).toBe('generic')
    })
  })

  describe('Connected Gamepads Information', () => {
    it('should return connected gamepads information', () => {
      service.onInit()

      const mockGamepad = {
        id: 'Test Gamepad',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      service.handleGamepadConnection(mockGamepad)

      const connected = service.getConnectedGamepads()
      expect(connected).toHaveLength(1)
      expect(connected[0]).toMatchObject({
        index: 0,
        id: 'Test Gamepad',
        mapping: 'standard',
        connected: true
      })
      expect(connected[0].type).toBe('gamepad')
    })
  })
})