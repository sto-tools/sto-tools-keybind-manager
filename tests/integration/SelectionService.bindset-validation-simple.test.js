import { describe, it, expect } from 'vitest'
import SelectionService from '../../src/js/components/services/SelectionService.js'

describe('SelectionService Bindset Validation Fix - Simple Test', () => {
  it('should validate keys using profile.builds data structure', () => {
    // Create a mock event bus
    const mockEventBus = {
      emit: () => {},
      on: () => {},
      off: () => {}
    }
    
    // Create SelectionService
    const selectionService = new SelectionService({ eventBus: mockEventBus })
    
    // Setup test data that matches the real application structure
    selectionService.cache = {
      profile: {
        builds: {
          space: {
            keys: {
              'F1': ['FirePhaser'],
              'F2': ['FireTorpedo']
            }
          },
          ground: {
            keys: {
              'F1': ['FireWeapon'],
              'F4': ['Sprint']
            }
          }
        }
      }
    }

    // Test validation using the fixed logic
    expect(selectionService.validateKeyExists('F1', 'space')).toBe(true)
    expect(selectionService.validateKeyExists('F2', 'space')).toBe(true)
    expect(selectionService.validateKeyExists('F1', 'ground')).toBe(true)
    expect(selectionService.validateKeyExists('F4', 'ground')).toBe(true)
    
    // Test invalid keys
    expect(selectionService.validateKeyExists('F99', 'space')).toBe(false)
    expect(selectionService.validateKeyExists('F4', 'space')).toBe(false) // F4 not in space
    expect(selectionService.validateKeyExists('F2', 'ground')).toBe(false) // F2 not in ground
  })

  it('should validate keys against array format requirement', () => {
    // Create a mock event bus
    const mockEventBus = {
      emit: () => {},
      on: () => {},
      off: () => {}
    }
    
    // Create SelectionService
    const selectionService = new SelectionService({ eventBus: mockEventBus })
    
    // Setup test data with malformed key data
    selectionService.cache = {
      profile: {
        builds: {
          space: {
            keys: {
              'F1': ['ValidCommand'], // Valid array
              'F2': 'InvalidCommand', // Invalid string
              'F3': null, // Invalid null
              'F4': undefined // Invalid undefined
            }
          }
        }
      }
    }

    // Only F1 should be valid (array format)
    expect(selectionService.validateKeyExists('F1', 'space')).toBe(true)
    expect(selectionService.validateKeyExists('F2', 'space')).toBe(false)
    expect(selectionService.validateKeyExists('F3', 'space')).toBe(false)
    expect(selectionService.validateKeyExists('F4', 'space')).toBe(false)
  })

  it('should handle missing profile data gracefully', () => {
    // Create a mock event bus
    const mockEventBus = {
      emit: () => {},
      on: () => {},
      off: () => {}
    }
    
    // Create SelectionService
    const selectionService = new SelectionService({ eventBus: mockEventBus })
    
    // Setup test data with missing profile
    selectionService.cache = {}

    // All validations should return false
    expect(selectionService.validateKeyExists('F1', 'space')).toBe(false)
    expect(selectionService.validateKeyExists('F2', 'ground')).toBe(false)
  })
})