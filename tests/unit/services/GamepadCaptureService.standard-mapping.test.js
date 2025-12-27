import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import GamepadCaptureService from '../../../src/js/components/services/GamepadCaptureService.js'
import { createServiceFixture } from '../../fixtures/services/harness.js'

describe('GamepadCaptureService - Standard Gamepad Mapping', () => {
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
    service.onInit()
  })

  afterEach(() => {
    if (service) {
      service.onDestroy()
    }
    vi.clearAllMocks()
  })

  describe('Button Mapping to STO Key Names', () => {
    it('should map standard gamepad buttons to correct STO key names', () => {
      const standardGamepad = {
        id: 'Xbox Controller',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      // Test all standard button mappings
      const buttonMappings = {
        0: 'Joy1',   // A button
        1: 'Joy2',   // B button
        2: 'Joy3',   // X button
        3: 'Joy4',   // Y button
        4: 'Joy5',   // LB
        5: 'Joy6',   // RB
        6: 'Joy7',   // LT (digital press)
        7: 'Joy8',   // RT (digital press)
        8: 'Joy9',   // Select/Back
        9: 'Joy10',  // Start/Forward
        10: 'Joy11', // LS (left stick click)
        11: 'Joy12', // RS (right stick click)
        12: 'Joypad_up',    // D-pad Up
        13: 'Joypad_down',  // D-pad Down
        14: 'Joypad_left',  // D-pad Left
        15: 'Joypad_right'  // D-pad Right
      }

      Object.entries(buttonMappings).forEach(([buttonIndex, expectedChordName]) => {
        const chordName = service.getButtonChordName(parseInt(buttonIndex), standardGamepad)
        expect(chordName).toBe(expectedChordName)
      })
    })

    it('should handle non-standard gamepad buttons with fallback naming', () => {
      const nonStandardGamepad = {
        id: 'Unknown Controller',
        index: 0,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      // Test fallback naming for non-standard controllers
      expect(service.getButtonChordName(0, nonStandardGamepad)).toBe('Joy1')
      expect(service.getButtonChordName(1, nonStandardGamepad)).toBe('Joy2')
      expect(service.getButtonChordName(15, nonStandardGamepad)).toBe('Joy16')
    })

    it('should handle out-of-range button indices on standard controllers', () => {
      const standardGamepad = {
        id: 'Xbox Controller',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      // Test fallback for buttons beyond standard mapping
      expect(service.getButtonChordName(16, standardGamepad)).toBe('Joy17')
      expect(service.getButtonChordName(20, standardGamepad)).toBe('Joy21')
    })
  })

  describe('Axis Mapping to STO Key Names', () => {
    it('should map standard gamepad axes to correct STO key names', () => {
      const standardGamepad = {
        id: 'Xbox Controller',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      // Test left stick X-axis
      expect(service.getAxisChordName(0, 0.8, standardGamepad)).toBe('Lstick_right')
      expect(service.getAxisChordName(0, -0.8, standardGamepad)).toBe('Lstick_left')

      // Test left stick Y-axis (note: positive = down in Gamepad API)
      expect(service.getAxisChordName(1, 0.8, standardGamepad)).toBe('Lstick_down')
      expect(service.getAxisChordName(1, -0.8, standardGamepad)).toBe('Lstick_up')

      // Test right stick X-axis
      expect(service.getAxisChordName(2, 0.8, standardGamepad)).toBe('Rstick_right')
      expect(service.getAxisChordName(2, -0.8, standardGamepad)).toBe('Rstick_left')

      // Test right stick Y-axis
      expect(service.getAxisChordName(3, 0.8, standardGamepad)).toBe('Rstick_down')
      expect(service.getAxisChordName(3, -0.8, standardGamepad)).toBe('Rstick_up')
    })

    it('should return null for axis values within deadzone', () => {
      const standardGamepad = {
        id: 'Xbox Controller',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      // Test values within default deadzone (0.15)
      expect(service.getAxisChordName(0, 0.1, standardGamepad)).toBeNull()
      expect(service.getAxisChordName(0, -0.1, standardGamepad)).toBeNull()
      expect(service.getAxisChordName(1, 0.14, standardGamepad)).toBeNull()
      expect(service.getAxisChordName(1, -0.14, standardGamepad)).toBeNull()
    })

    it('should handle non-standard gamepad axes with fallback naming', () => {
      const nonStandardGamepad = {
        id: 'Unknown Controller',
        index: 0,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      // Test fallback naming for non-standard controllers
      expect(service.getAxisChordName(0, 0.8, nonStandardGamepad)).toBe('Axis1_positive')
      expect(service.getAxisChordName(0, -0.8, nonStandardGamepad)).toBe('Axis1_negative')
      expect(service.getAxisChordName(2, 0.5, nonStandardGamepad)).toBe('Axis3_positive')
    })

    it('should handle additional axes beyond standard 4 on standard controllers', () => {
      const standardGamepad = {
        id: 'Advanced Controller',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      // Test fallback for axes beyond standard 4
      expect(service.getAxisChordName(4, 0.8, standardGamepad)).toBe('Axis5_positive')
      expect(service.getAxisChordName(4, -0.8, standardGamepad)).toBe('Axis5_negative')
      expect(service.getAxisChordName(6, 0.5, standardGamepad)).toBe('Axis7_positive')
    })

    it('should return null for non-standard axes within deadzone', () => {
      const nonStandardGamepad = {
        id: 'Unknown Controller',
        index: 0,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      // Test values within deadzone for non-standard controllers
      expect(service.getAxisChordName(0, 0.1, nonStandardGamepad)).toBeNull()
      expect(service.getAxisChordName(1, -0.14, nonStandardGamepad)).toBeNull()
    })
  })

  describe('Button Display Names', () => {
    it('should provide correct display names for standard gamepad buttons', () => {
      const standardGamepad = {
        id: 'Xbox Controller',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      const buttonNames = [
        'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
        'Select', 'Start', 'LS', 'RS', 'D-pad Up', 'D-pad Down',
        'D-pad Left', 'D-pad Right'
      ]

      buttonNames.forEach((expectedName, index) => {
        const displayName = service.getButtonName(index, standardGamepad)
        expect(displayName).toBe(expectedName)
      })
    })

    it('should provide fallback display names for non-standard controllers', () => {
      const nonStandardGamepad = {
        id: 'Unknown Controller',
        index: 0,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      expect(service.getButtonName(0, nonStandardGamepad)).toBe('Button 0')
      expect(service.getButtonName(5, nonStandardGamepad)).toBe('Button 5')
      expect(service.getButtonName(15, nonStandardGamepad)).toBe('Button 15')
    })
  })

  describe('Axis Display Names', () => {
    it('should provide correct display names for standard gamepad axes', () => {
      const standardGamepad = {
        id: 'Xbox Controller',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      const axisNames = [
        'Left Stick X', 'Left Stick Y', 'Right Stick X', 'Right Stick Y'
      ]

      axisNames.forEach((expectedName, index) => {
        const displayName = service.getAxisName(index, standardGamepad)
        expect(displayName).toBe(expectedName)
      })
    })

    it('should provide fallback display names for non-standard controllers', () => {
      const nonStandardGamepad = {
        id: 'Unknown Controller',
        index: 0,
        mapping: '',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      expect(service.getAxisName(0, nonStandardGamepad)).toBe('Axis 0')
      expect(service.getAxisName(3, nonStandardGamepad)).toBe('Axis 3')
      expect(service.getAxisName(7, nonStandardGamepad)).toBe('Axis 7')
    })
  })

  describe('Direct Input Mapping Verification', () => {
    it('should generate correct input objects with STO key names', () => {
      const standardGamepad = {
        id: 'Xbox Controller',
        index: 0,
        mapping: 'standard',
        connected: true,
        buttons: [],
        axes: [],
        timestamp: Date.now()
      }

      // Test button input object generation
      const buttonInput = {
        type: 'button',
        index: 0,
        value: 1,
        pressed: true,
        threshold: 0.1,
        name: service.getButtonName(0, standardGamepad),
        standardMapping: true,
        chordName: service.getButtonChordName(0, standardGamepad)
      }

      expect(buttonInput.name).toBe('A')
      expect(buttonInput.chordName).toBe('Joy1')
      expect(buttonInput.standardMapping).toBe(true)

      // Test axis input object generation
      const axisInput = {
        type: 'axis',
        index: 1,
        value: 0.8,
        pressed: true,
        threshold: 0.15,
        name: service.getAxisName(1, standardGamepad),
        standardMapping: true,
        chordName: service.getAxisChordName(1, 0.8, standardGamepad)
      }

      expect(axisInput.name).toBe('Left Stick Y')
      expect(axisInput.chordName).toBe('Lstick_down')
      expect(axisInput.standardMapping).toBe(true)
    })
  })
})