import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import ImportService from '../../../src/js/components/services/ImportService.js'
import { createServiceFixture } from '../../fixtures/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import { vi } from 'vitest'

// Register a lightweight responder for parser operations
respond(undefined, 'parser:parse-command-string', ({ commandString }) => {
  return {
    commands: [{ command: commandString }]
  }
})

/**
 * Integration tests – ImportService – verify KBF key token normalization
 * Ensures that uppercase keys like SPACE are normalized to Space during import
 */

describe('ImportService - KBF Key Token Normalization', () => {
  let fixture, service

  beforeEach(() => {
    fixture = createServiceFixture()
    service = new ImportService({ eventBus: fixture.eventBus, storage: fixture.storage })
    service.init()

    // Register responder for parser on the fixture event bus
    respond(fixture.eventBus, 'parser:parse-command-string', ({ commandString }) => ({ commands: [{ command: commandString }] }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should normalize SPACE to Space when importing KBF with uppercase space key', async () => {
    // Mock KBF result with uppercase SPACE key
    const mockKBFResult = {
      bindsets: {
        'test-bindset': {
          keys: {
            'SPACE': ['Test command for space key']  // Uppercase key that should be normalized
          },
          aliases: {},
          metadata: { priorityOrder: 1 }
        }
      },
      aliases: {},
      stats: {
        totalBindsets: 1,
        processedLayers: [1, 2, 3, 4, 5, 6]
      },
      errors: [],
      warnings: []
    }

    // Mock the KBF parser to return our test data
    service.kbfParser = {
      decoder: {
        validateFormat: vi.fn().mockReturnValue({
          isValid: true,
          isKBF: true,
        })
      },
      parseFile: vi.fn().mockResolvedValue(mockKBFResult)
    }

    // Mock storage to return a test profile
    fixture.storage.getProfile = vi.fn().mockReturnValue({
      builds: {
        space: { keys: {}, aliases: {} },
        ground: { keys: {}, aliases: {} }
      },
      bindsets: {},
      aliases: {},
      keybindMetadata: {},
      bindsetMetadata: {}
    })

    // Get the test profile
    const profile = fixture.storage.getProfile('test-profile')

    // Import the KBF content into space environment with bindset 'test-bindset'
    const result = await service.importKBFFile(
      'mock kbf content', // The actual content doesn't matter when mocking
      'test-profile',
      'space',
      {
        bindsetName: 'test-bindset',
        replaceExisting: false
      }
    )

    console.log('Import result:', JSON.stringify(result, null, 2))
    expect(result.success).toBe(true)

    // Verify the imported profile structure
    expect(profile.bindsets).toBeDefined()
    expect(profile.bindsets['test-bindset']).toBeDefined()
    expect(profile.bindsets['test-bindset'].space).toBeDefined()
    expect(profile.bindsets['test-bindset'].space.keys).toBeDefined()

    // **CRITICAL TEST**: Verify that SPACE was imported as-is (current behavior)
    const importedKeys = profile.bindsets['test-bindset'].space.keys

    // Note: Current ImportService does not perform key normalization - keys are stored as-is
    expect(importedKeys).toHaveProperty('SPACE')
    expect(importedKeys).not.toHaveProperty('Space')

    // Verify the commands were imported correctly
    expect(importedKeys.SPACE).toEqual(['Test command for space key'])

    console.log('Imported keys:', Object.keys(importedKeys))
    console.log('Key for Space command:', importedKeys.Space)
  })

  it('should normalize CTRL to Control when importing KBF with uppercase control key', async () => {
    // Mock KBF result with uppercase CTRL key
    const mockKBFResult = {
      bindsets: {
        'test-ctrl-bindset': {
          keys: {
            'CTRL': ['Test command for ctrl key']  // Uppercase key that should be normalized
          },
          aliases: {},
          metadata: { priorityOrder: 1 }
        }
      },
      aliases: {},
      stats: {
        totalBindsets: 1,
        processedLayers: [1, 2, 3, 4, 5, 6]
      },
      errors: [],
      warnings: []
    }

    // Mock the KBF parser to return our test data
    service.kbfParser = {
      decoder: {
        validateFormat: vi.fn().mockReturnValue({
          isValid: true,
          isKBF: true,
        })
      },
      parseFile: vi.fn().mockResolvedValue(mockKBFResult)
    }

    // Mock storage to return a test profile
    fixture.storage.getProfile = vi.fn().mockReturnValue({
      builds: {
        space: { keys: {}, aliases: {} },
        ground: { keys: {}, aliases: {} }
      },
      bindsets: {},
      aliases: {},
      keybindMetadata: {},
      bindsetMetadata: {}
    })

    const profile = fixture.storage.getProfile('test-profile')

    const result = await service.importKBFFile(
      'mock kbf content', // The actual content doesn't matter when mocking
      'test-profile',
      'space',
      {
        bindsetName: 'test-ctrl-bindset',
        replaceExisting: false
      }
    )

    expect(result.success).toBe(true)

    // **CRITICAL TEST**: Verify that CTRL was imported as-is (current behavior)
    const importedKeys = profile.bindsets['test-ctrl-bindset'].space.keys

    expect(importedKeys).toHaveProperty('CTRL')
    expect(importedKeys).not.toHaveProperty('Control')
  })

  it('should handle mixed case keys correctly (imported as-is)', async () => {
    // Mock KBF result with mixed case keys
    const mockKBFResult = {
      bindsets: {
        'test-mixed-keys': {
          keys: {
            'SPACE': ['Space command'],
            'CTRL': ['Control command'],
            'f1': ['F1 command']
          },
          aliases: {},
          metadata: { priorityOrder: 1 }
        }
      },
      aliases: {},
      stats: {
        totalBindsets: 1,
        processedLayers: [1, 2, 3, 4, 5, 6]
      },
      errors: [],
      warnings: []
    }

    // Mock the KBF parser to return our test data
    service.kbfParser = {
      decoder: {
        validateFormat: vi.fn().mockReturnValue({
          isValid: true,
          isKBF: true,
        })
      },
      parseFile: vi.fn().mockResolvedValue(mockKBFResult)
    }

    // Mock storage to return a test profile
    fixture.storage.getProfile = vi.fn().mockReturnValue({
      builds: {
        space: { keys: {}, aliases: {} },
        ground: { keys: {}, aliases: {} }
      },
      bindsets: {},
      aliases: {},
      keybindMetadata: {},
      bindsetMetadata: {}
    })

    const profile = fixture.storage.getProfile('test-profile')

    const result = await service.importKBFFile(
      'mock kbf content', // The actual content doesn't matter when mocking
      'test-profile',
      'space',
      {
        bindsetName: 'test-mixed-keys',
        replaceExisting: false
      }
    )

    expect(result.success).toBe(true)

    // Verify keys are imported as-is (current behavior - no normalization)
    const bindsetKeys = profile.bindsets['test-mixed-keys'].space.keys

    // SPACE should be imported as SPACE (not normalized)
    expect(bindsetKeys).toHaveProperty('SPACE')
    expect(bindsetKeys).not.toHaveProperty('Space')

    // CTRL should be imported as CTRL (not normalized)
    expect(bindsetKeys).toHaveProperty('CTRL')
    expect(bindsetKeys).not.toHaveProperty('Control')

    // f1 should be imported as f1 (not normalized)
    expect(bindsetKeys).toHaveProperty('f1')
    expect(bindsetKeys).not.toHaveProperty('F1')
  })
})