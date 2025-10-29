import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createBasicTestEnvironment } from '../fixtures/index.js'
import SelectionService from '../../src/js/components/services/SelectionService.js'

describe('SelectionService Bindset Validation Fix', () => {
  let env
  let selectionService

  beforeEach(async () => {
    env = await createBasicTestEnvironment()
    selectionService = new SelectionService({ eventBus: env.eventBus })
  })

  afterEach(() => {
    if (env?.destroy) {
      env.destroy()
    }
  })

  it('should validate keys using profile.builds data structure', () => {
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
    // Setup test data with missing profile
    selectionService.cache = {}

    // All validations should return false
    expect(selectionService.validateKeyExists('F1', 'space')).toBe(false)
    expect(selectionService.validateKeyExists('F2', 'ground')).toBe(false)
  })

  it('should handle missing builds data gracefully', () => {
    // Setup test data with missing builds
    selectionService.cache = {
      profile: {
        // No builds property
      }
    }

    // All validations should return false
    expect(selectionService.validateKeyExists('F1', 'space')).toBe(false)
    expect(selectionService.validateKeyExists('F2', 'ground')).toBe(false)
  })

  it('should handle missing environment data gracefully', () => {
    // Setup test data with missing environment
    selectionService.cache = {
      profile: {
        builds: {
          space: {
            keys: {
              'F1': ['FirePhaser']
            }
          }
          // No ground environment
        }
      }
    }

    // Space should work, ground should fail
    expect(selectionService.validateKeyExists('F1', 'space')).toBe(true)
    expect(selectionService.validateKeyExists('F1', 'ground')).toBe(false)
  })

  it('should use current environment when no environment specified', () => {
    // Setup test data
    selectionService.cache = {
      profile: {
        builds: {
          space: {
            keys: {
              'F1': ['FirePhaser']
            }
          },
          ground: {
            keys: {
              'F2': ['FireWeapon']
            }
          }
        }
      },
      currentEnvironment: 'space'
    }

    // Should validate against space environment
    expect(selectionService.validateKeyExists('F1')).toBe(true)
    expect(selectionService.validateKeyExists('F2')).toBe(false)

    // Change current environment to ground
    selectionService.cache.currentEnvironment = 'ground'

    // Should validate against ground environment
    expect(selectionService.validateKeyExists('F1')).toBe(false)
    expect(selectionService.validateKeyExists('F2')).toBe(true)
  })
})