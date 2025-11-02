import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import ImportService from '../../../src/js/components/services/ImportService.js'
import { createServiceFixture } from '../../fixtures/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import { vi } from 'vitest'

/**
 * Unit tests – ImportService – verify project file validation
 */

// Register a lightweight responder for parser operations
respond(undefined, 'parser:parse-command-string', ({ commandString }) => {
  return {
    commands: [{ command: commandString }]
  }
})

describe('ImportService', () => {
  let fixture, service

  beforeEach(() => {
    fixture = createServiceFixture()
    service = new ImportService({ eventBus: fixture.eventBus, storage: fixture.storage })
    service.init()

    // Register responder for parser on the fixture event bus
    respond(fixture.eventBus, 'parser:parse-command-string', ({ commandString }) => ({ commands: [{ command: commandString }] }))
  })

  afterEach(() => {
    service.destroy()
  })

  describe('importProjectFile', () => {
    it('should accept valid project files with correct type and data', async () => {
      const validProjectContent = JSON.stringify({
        type: 'project',
        data: {
          profiles: {},
          settings: {}
        }
      })

      const result = await service.importProjectFile(validProjectContent)
      expect(result.success).toBe(true)
    })

    it('should reject project files with incorrect type', async () => {
      const invalidProjectContent = JSON.stringify({
        type: 'other',
        data: {
          profiles: {},
          settings: {}
        }
      })

      const result = await service.importProjectFile(invalidProjectContent)
      expect(result.success).toBe(false)
      expect(result.error).toBe('invalid_project_file')
    })

    it('should reject project files with missing data property', async () => {
      const noDataProjectContent = JSON.stringify({
        type: 'project'
        // missing data property
      })

      const result = await service.importProjectFile(noDataProjectContent)
      expect(result.success).toBe(false)
      expect(result.error).toBe('invalid_project_file')
    })

    it('should reject project files with null data property', async () => {
      const nullDataProjectContent = JSON.stringify({
        type: 'project',
        data: null
      })

      const result = await service.importProjectFile(nullDataProjectContent)
      expect(result.success).toBe(false)
      expect(result.error).toBe('invalid_project_file')
    })

    it('should reject project files with undefined data property', async () => {
      const undefinedDataProjectContent = JSON.stringify({
        type: 'project',
        data: undefined
      })

      const result = await service.importProjectFile(undefinedDataProjectContent)
      expect(result.success).toBe(false)
      expect(result.error).toBe('invalid_project_file')
    })

    it('should accept project files with empty data object', async () => {
      const emptyDataProjectContent = JSON.stringify({
        type: 'project',
        data: {}
      })

      // Empty object should still be accepted as it has truthy value
      const result = await service.importProjectFile(emptyDataProjectContent)
      expect(result.success).toBe(true)
    })

    it('should reject malformed JSON content', async () => {
      const malformedContent = '{ "type": "project", "data": {} ' // missing closing brace

      const result = await service.importProjectFile(malformedContent)
      expect(result.success).toBe(false)
      expect(result.error).toBe('import_failed_invalid_json')
    })

    it('should handle case-sensitive type checking correctly', async () => {
      const wrongCaseContent = JSON.stringify({
        type: 'Project', // capitalized instead of lowercase
        data: {
          profiles: {},
          settings: {}
        }
      })

      const result = await service.importProjectFile(wrongCaseContent)
      expect(result.success).toBe(false)
      expect(result.error).toBe('invalid_project_file')
    })

    it('should import project files with actual profile data', async () => {
      const projectWithProfileContent = JSON.stringify({
        type: 'project',
        data: {
          profiles: {
            'test-profile': {
              name: 'Test Profile',
              builds: {
                space: { keys: { 'k': ['cmd1'] } },
                ground: { keys: {} }
              }
            }
          },
          settings: {
            currentProfile: 'test-profile'
          }
        }
      })

      const result = await service.importProjectFile(projectWithProfileContent)
      expect(result.success).toBe(true)
      expect(result.imported.profiles).toBe(1)
      expect(result.currentProfile).toBe('test-profile')
    })

    it('should sanitize imported profile data correctly', async () => {
      // Test with legacy profile format (keys instead of builds)
      const legacyProfileContent = JSON.stringify({
        type: 'project',
        data: {
          profiles: {
            'legacy-profile': {
              name: 'Legacy Profile',
              // Legacy format - keys at root level instead of builds
              keys: { 'k': ['legacy_cmd'] },
              aliases: { 'test_alias': ['test_command'] }
            }
          },
          settings: {}
        }
      })

      const result = await service.importProjectFile(legacyProfileContent)
      expect(result.success).toBe(true)
      expect(result.imported.profiles).toBe(1)

      // Verify the profile was sanitized to new format
      const savedProfile = fixture.storage.getProfile('legacy-profile')
      expect(savedProfile).toBeDefined()
      expect(savedProfile.builds).toBeDefined()
      expect(savedProfile.builds.space.keys).toEqual({ 'k': ['legacy_cmd'] })
      expect(savedProfile.aliases).toEqual({ 'test_alias': ['test_command'] })
    })

    it('should return currentProfile from imported settings', async () => {
      const projectWithCurrentProfile = JSON.stringify({
        type: 'project',
        data: {
          profiles: {
            'test-profile': {
              name: 'Test Profile',
              builds: { space: { keys: {} }, ground: { keys: {} } }
            }
          },
          settings: {
            currentProfile: 'test-profile'
          }
        }
      })

      const result = await service.importProjectFile(projectWithCurrentProfile)
      expect(result.success).toBe(true)
      expect(result.currentProfile).toBe('test-profile')
    })

    it('should handle missing sanitizeProfileData method gracefully', async () => {
      // Temporarily remove the method to test error handling
      const originalMethod = service.sanitizeProfileData
      service.sanitizeProfileData = undefined

      const projectContent = JSON.stringify({
        type: 'project',
        data: {
          profiles: {
            'test-profile': {
              name: 'Test Profile',
              builds: { space: { keys: {} }, ground: { keys: {} } }
            }
          },
          settings: {}
        }
      })

      // Should return structured error if sanitizeProfileData is missing
      const result = await service.importProjectFile(projectContent)
      expect(result.success).toBe(false)
      expect(result.error).toBe('import_failed_invalid_json')
      expect(result.params.reason).toContain('sanitizeProfileData is not a function')

      // Restore the method
      service.sanitizeProfileData = originalMethod
    })
  })
})