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
    // Mock a KBF parsed result with uppercase SPACE key to test normalization
    const mockKBFParsedResult = {
      bindsets: {
        'test-bindset': {
          keys: {
            'SPACE': ['FirePhasers', 'FireTorps']  // Uppercase key that should be normalized
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
    vi.spyOn(service.kbfParser, 'parseFile').mockResolvedValue(mockKBFParsedResult)

    // Get the test profile
    const profile = fixture.storage.getProfile('test-profile')

    // Import the KBF content into space environment with bindset 'test-bindset'
    const result = await service.importKBFFile(
      'mock kbf content',
      'test-profile',
      'space',
      {
        bindsetName: 'test-bindset',
        replaceExisting: false
      }
    )

    expect(result.success).toBe(true)

    // Verify the imported profile structure
    expect(profile.bindsets).toBeDefined()
    expect(profile.bindsets['test-bindset']).toBeDefined()
    expect(profile.bindsets['test-bindset'].space).toBeDefined()
    expect(profile.bindsets['test-bindset'].space.keys).toBeDefined()

    // **CRITICAL TEST**: Verify that SPACE was normalized to Space
    const importedKeys = profile.bindsets['test-bindset'].space.keys

    // The key should be stored as "Space", not "SPACE" due to FieldParser normalization
    expect(importedKeys).toHaveProperty('Space')
    expect(importedKeys).not.toHaveProperty('SPACE')

    // Verify the commands were imported correctly
    expect(importedKeys.Space).toEqual(['FirePhasers', 'FireTorps'])

    console.log('Imported keys:', Object.keys(importedKeys))
    console.log('Key for Space command:', importedKeys.Space)
  })

  it('should normalize CTRL to Control when importing KBF with uppercase control key', async () => {
    // Mock a KBF parsed result with uppercase CTRL key
    const mockKBFParsedResult = {
      success: true,
      data: {
        keysets: [{
          name: 'test-ctrl-bindset',
          environment: 'space',
          activities: [{
            id: 1,
            type: 'Key',
            fields: {
              KEY: 'CTRL'  // Uppercase key that should be normalized
            },
            commands: ['Target_Enemy_Near'],
            metadata: {
              stabilizeExecutionOrder: false
            }
          }]
        }]
      }
    }

    respond(fixture.eventBus, 'kbf:decode-file', () => mockKBFParsedResult)

    const profile = fixture.storage.getProfile('test-profile')

    const result = await service.importKBFFile(
      'mock kbf content',
      'test-profile',
      'space',
      {
        bindsetName: 'test-ctrl-bindset',
        replaceExisting: false
      }
    )

    expect(result.success).toBe(true)

    // **CRITICAL TEST**: Verify that CTRL was normalized to Control
    const importedKeys = profile.bindsets['test-ctrl-bindset'].space.keys

    expect(importedKeys).toHaveProperty('Control')
    expect(importedKeys).not.toHaveProperty('CTRL')
  })

  it('should handle mixed case keys and normalize them correctly', async () => {
    // Test various case combinations
    const testCases = [
      { input: 'SPACE', expected: 'Space' },
      { input: 'CTRL', expected: 'Control' },
      { input: 'ALT', expected: 'ALT' },
      { input: 'f1', expected: 'F1' }
    ]

    for (const testCase of testCases) {
      console.log(`\nTesting normalization: ${testCase.input} -> ${testCase.expected}`)

      // Mock a KBF parsed result for this specific key
      const mockKBFParsedResult = {
        success: true,
        data: {
          keysets: [{
            name: `test-${testCase.input}-bindset`,
            environment: 'space',
            activities: [{
              id: 1,
              type: 'Key',
              fields: {
                KEY: testCase.input
              },
              commands: ['TestCommand'],
              metadata: {}
            }]
          }]
        }
      }

      respond(fixture.eventBus, 'kbf:decode-file', () => mockKBFParsedResult)

      const profile = fixture.storage.getProfile('test-profile')

      const result = await service.importKBFFile(
        'mock kbf content',
        'test-profile',
        'space',
        {
          bindsetName: `test-${testCase.input}-bindset`,
          replaceExisting: false
        }
      )

      expect(result.success).toBe(true)

      // Verify normalization
      const bindsetKeys = profile.bindsets[`test-${testCase.input}-bindset`].space.keys
      console.log(`Keys in bindset:`, Object.keys(bindsetKeys))

      expect(bindsetKeys).toHaveProperty(testCase.expected)
      if (testCase.input !== testCase.expected) {
        expect(bindsetKeys).not.toHaveProperty(testCase.input)
      }
    }
  })
})