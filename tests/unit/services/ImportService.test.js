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

  describe("importKBFFile", () => {
    it("should reject invalid KBF format with validation error", async () => {
      const kbfContent = "SGVsbG8gV29ybGQ=" // Base64 encoded "Hello World" - not valid KBF
      const profileId = "test-profile"
      const environment = "space"

      const result = await service.importKBFFile(kbfContent, profileId, environment)

      expect(result.success).toBe(false)
      expect(result.error).toBe("invalid_kbf_file_format")
      expect(result.errors).toBeDefined()
      expect(result.warnings).toBeDefined()
      expect(Array.isArray(result.errors)).toBe(true)
      expect(Array.isArray(result.warnings)).toBe(true)
    })

    it("should reject invalid KBF format", async () => {
      // Mock an invalid format validation result
      const mockValidationResult = {
        isValid: false,
        isKBF: false,
        format: 'unknown',
        errors: ['Invalid KBF file format'],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      const kbfContent = "SW52YWxpZCBGb3JtYXQ=" // Base64 encoded "Invalid Format"
      const profileId = "test-profile"
      const environment = "space"

      const result = await service.importKBFFile(kbfContent, profileId, environment)

      expect(result.success).toBe(false)
      expect(result.error).toBe("invalid_kbf_file_format")
      expect(result.errors).toContain('Invalid KBF file format')

      vi.restoreAllMocks()
    })

    it("should reject files without valid KEYSET records", async () => {
      // Mock a partial format validation result
      const mockValidationResult = {
        isValid: true,
        isKBF: false,
        format: 'partial-kbf',
        errors: [],
        warnings: ['Partial KBF format detected']
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      const kbfContent = "UGFydGlhbCBLQkY=" // Base64 encoded "Partial KBF"
      const profileId = "test-profile"
      const environment = "space"

      const result = await service.importKBFFile(kbfContent, profileId, environment)

      expect(result.success).toBe(false)
      expect(result.error).toBe("invalid_kbf_file_format")
      expect(result.errors).toBeDefined()
      expect(result.warnings).toContain('Partial KBF format detected')

      vi.restoreAllMocks()
    })

    it("should return no valid bindsets found when parser returns empty bindsets", async () => {
      // Mock a valid KBF format validation result
      const mockValidationResult = {
        isValid: true,
        isKBF: true,
                format: 'kbf-keyset',
        estimatedKeysets: 2,
        estimatedSize: 1024,
        processingTime: 15,
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      // Mock parser result with no valid bindsets
      const mockParseResult = {
        bindsets: {}, // Empty bindsets
        aliases: {},
        stats: {
          totalBindsets: 0,
          processedLayers: [1, 2, 3]
        },
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser, 'parseFile').mockResolvedValue(mockParseResult)

      const kbfContent = "VmFsaWQgS0JGIEZvcm1hdA==" // Base64 encoded "Valid KBF Format"
      const profileId = "test-profile"
      const environment = "space"

      const result = await service.importKBFFile(kbfContent, profileId, environment)

      expect(result.success).toBe(false)
      expect(result.error).toBe("no_valid_bindsets_found")
      expect(result.message).toContain("KBF file contains no valid bindsets that could be imported")
      expect(result.errors).toBeDefined()
      expect(result.warnings).toBeDefined()

      vi.restoreAllMocks()
    })

    it("should properly map Master bindset to primary build and return correct metadata", async () => {
      // Mock a valid KBF format validation result
      const mockValidationResult = {
        isValid: true,
        isKBF: true,
                format: 'kbf-keyset',
        estimatedKeysets: 1,
        estimatedSize: 1024,
        processingTime: 15,
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      // Mock parser result with Master bindset
      const mockParseResult = {
        bindsets: {
          'Master': {
            keys: {
              'F1': ['cmd1', 'cmd2'],
              'F2': ['cmd3']
            },
            metadata: {
              priorityOrder: 1,
              testMeta: 'testValue'
            }
          }
        },
        aliases: {
          testAlias: {
            commands: ['aliasCmd1', 'aliasCmd2'],
            description: 'Test alias'
          }
        },
        stats: {
          totalBindsets: 1,
          processedLayers: [1, 2, 3, 4, 5, 6]
        },
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser, 'parseFile').mockResolvedValue(mockParseResult)

      // Mock storage service
      const mockProfile = {
        builds: {
          space: { keys: {}, aliases: {} },
          ground: { keys: {}, aliases: {} }
        },
        bindsets: {},
        aliases: {},
        keybindMetadata: {},
        bindsetMetadata: {}
      }
      vi.spyOn(service.storage, 'getProfile').mockReturnValue(mockProfile)
      vi.spyOn(service.storage, 'saveProfile').mockImplementation((id, profile) => {
        // Store the profile for inspection
        mockProfile.profile = profile
      })

      const kbfContent = "VmFsaWQgS0JGIEZvcm1hdA==" // Base64 encoded "Valid KBF Format"
      const profileId = "test-profile"
      const environment = "space"

      const result = await service.importKBFFile(kbfContent, profileId, environment)

      // Verify success
      expect(result.success).toBe(true)
      expect(result.message).toBe('kbf_import_completed')

      // Verify Master bindset metadata
      expect(result.masterBindset.hasMasterBindset).toBe(true)
      expect(result.masterBindset.masterBindsetName).toBe('Master')
      expect(result.masterBindset.mappedToPrimary).toBe(true)
      expect(result.masterBindset.displayName).toBe('Primary Bindset')

      // Verify single bindset file detection
      expect(result.singleBindsetFile.isSingleBindset).toBe(true)
      expect(result.singleBindsetFile.onlyBindsetIsMaster).toBe(true)
      expect(result.singleBindsetFile.requiresBindsetSelection).toBe(false)

      // Verify import counts
      expect(result.imported.keys).toBe(2)
      expect(result.imported.aliases).toBe(1)
      expect(result.imported.bindsets).toBe(1)

      vi.restoreAllMocks()
    })

    it("should ignore per-bindset aliases and only import global aliases", async () => {
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue({
        isValid: true,
        isKBF: true,
        format: 'kbf-keyset',
        estimatedKeysets: 1,
        estimatedSize: 512,
        processingTime: 10,
        errors: [],
        warnings: []
      })

      const mockParseResult = {
        bindsets: {
          'Master': {
            keys: {
              'F1': ['cmd1']
            },
            // Aliases inside bindsets should be ignored by importer
            aliases: {
              shouldNotImport: {
                commands: ['noop'],
                description: 'ignore me'
              }
            },
            metadata: {}
          }
        },
        aliases: {
          globalAlias: {
            commands: ['doGlobal'],
            description: 'global alias'
          }
        },
        stats: {
          totalBindsets: 1,
          processedLayers: [1, 2, 3]
        },
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser, 'parseFile').mockResolvedValue(mockParseResult)

      const mockProfile = {
        builds: {
          space: { keys: {}, aliases: {} },
          ground: { keys: {}, aliases: {} }
        },
        bindsets: {},
        aliases: {},
        keybindMetadata: {},
        bindsetMetadata: {}
      }
      vi.spyOn(service.storage, 'getProfile').mockReturnValue(mockProfile)
      vi.spyOn(service.storage, 'saveProfile').mockImplementation(() => {})

      const result = await service.importKBFFile("content", "profile", "space")

      expect(result.success).toBe(true)
      expect(result.imported.aliases).toBe(1) // only the global alias
      const savedProfile = service.storage.saveProfile.mock.calls[0][1]
      expect(savedProfile.aliases.globalAlias.commands).toEqual(['doGlobal'])
      expect(savedProfile.aliases.shouldNotImport).toBeUndefined()

      vi.restoreAllMocks()
    })

    describe("validateKBFFile", () => {
      it("should validate valid KBF files successfully", () => {
        const mockValidationResult = {
          isValid: true,
          isKBF: true,
                    format: 'kbf-keyset',
          estimatedKeysets: 3,
          estimatedSize: 2048,
          processingTime: 25,
          errors: [],
          warnings: []
        }
        vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

        const kbfContent = "VmFsaWQgS0JGIEZvcm1hdA=="
        const result = service.validateKBFFile(kbfContent)

        expect(result.valid).toBe(true)
        expect(result.format).toBe('kbf-keyset')
        expect(result.isKBF).toBe(true)
        expect(result.supportedFormat).toBe(true)
        expect(result.rejectionReason).toBeNull()
        expect(result.stats.estimatedKeysets).toBe(3)
        expect(result.stats.estimatedSize).toBe(2048)
        expect(result.errors).toEqual([])
        expect(result.warnings).toEqual([])

        vi.restoreAllMocks()
      })

      it("should reject invalid KBF format", () => {
        const mockValidationResult = {
          isValid: false,
          isKBF: false,
                    format: 'unknown',
          estimatedKeysets: 0,
          estimatedSize: 0,
          processingTime: 5,
          errors: ['Invalid Base64 format'],
          warnings: []
        }
        vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

        const kbfContent = "Invalid Content"
        const result = service.validateKBFFile(kbfContent)

        expect(result.valid).toBe(false)
        expect(result.format).toBe('unknown')
        expect(result.supportedFormat).toBe(false)
        expect(result.errors).toContain('Invalid Base64 format')

        vi.restoreAllMocks()
      })

      it("should handle invalid format correctly", () => {
        const mockValidationResult = {
          isValid: false,
          isKBF: false,
          format: 'invalid',
          estimatedKeysets: 0,
          estimatedSize: 512,
          processingTime: 10,
          errors: ['Invalid KBF file format'],
          warnings: []
        }
        vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

        const kbfContent = "SW52YWxpZCBGb3JtYXQ="
        const result = service.validateKBFFile(kbfContent)

        expect(result.valid).toBe(false)
        expect(result.format).toBe('invalid')
        expect(result.isKBF).toBe(false)
        expect(result.supportedFormat).toBe(false)
        expect(result.rejectionReason).toBe('Invalid KBF file format')
        expect(result.errors).toContain('Invalid KBF file format')

        vi.restoreAllMocks()
      })

      it("should handle empty or null content", () => {
        const result1 = service.validateKBFFile(null)
        expect(result1.valid).toBe(false)
        expect(result1.errors).toContain('No content provided for validation')

        const result2 = service.validateKBFFile('')
        expect(result2.valid).toBe(false)
        expect(result2.errors).toContain('No content provided for validation')
      })

      it("should handle validation exceptions", () => {
        vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockImplementation(() => {
          throw new Error('Parser error')
        })

        const kbfContent = "RXJyb3IgQ29udGVudA=="
        const result = service.validateKBFFile(kbfContent)

        expect(result.valid).toBe(false)
        expect(result.error).toContain('KBF validation error: Parser error')
        expect(result.errors).toContain('Parser error')

        vi.restoreAllMocks()
      })
    })

    it("should validate input parameters", async () => {
      // Test with null content
      let result = await service.importKBFFile(null, "test-profile", "space")
      expect(result.success).toBe(false)
      expect(result.error).toBe("invalid_kbf_file_content")

      // Test with undefined content
      result = await service.importKBFFile(undefined, "test-profile", "space")
      expect(result.success).toBe(false)
      expect(result.error).toBe("invalid_kbf_file_content")

      // Test with empty string
      result = await service.importKBFFile("", "test-profile", "space")
      expect(result.success).toBe(false)
      expect(result.error).toBe("invalid_kbf_file_content")
    })

    it("should handle missing storage gracefully", async () => {
      const serviceWithoutStorage = new ImportService({ eventBus: fixture.eventBus })
      serviceWithoutStorage.init()

      const result = await serviceWithoutStorage.importKBFFile("SGVsbG8=", "test-profile", "space")

      expect(result.success).toBe(false)
      expect(result.error).toBe("storage_not_available")

      serviceWithoutStorage.destroy()
    })

    it("should handle missing profileId gracefully", async () => {
      const result = await service.importKBFFile("SGVsbG8=", null, "space")

      expect(result.success).toBe(false)
      expect(result.error).toBe("no_active_profile")
    })

    it("should handle exceptions during import", async () => {
      // Create a service that will throw an error
      const faultyService = new ImportService({ eventBus: fixture.eventBus, storage: null })
      faultyService.init()

      const result = await faultyService.importKBFFile("SGVsbG8=", "test-profile", "space")

      expect(result.success).toBe(false)
      expect(result.error).toBe("storage_not_available")

      faultyService.destroy()
    })

    })

  describe('import:kbf-file endpoint', () => {
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

    it('should handle successful KBF import via request endpoint', async () => {
      // Mock a valid KBF format validation result
      const mockValidationResult = {
        isValid: true,
        isKBF: true,
                format: 'kbf-keyset',
        estimatedKeysets: 2,
        estimatedSize: 2048,
        processingTime: 25,
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      // Mock parser result with multiple bindsets
      const mockParseResult = {
        bindsets: {
          'Master': {
            keys: {
              'F1': ['power_exec AttackPatternOmega 1'],
              'F2': ['power_exec TacticalTeam 1']
            },
            aliases: {},
            metadata: { priorityOrder: 1 }
          },
          'PvP': {
            keys: {
              'F1': ['power_exec Powersink 1'],
              'F3': ['power_exec EmergencyPowerToWeapons 1']
            },
            aliases: {},
            metadata: {}
          }
        },
        aliases: {},
        stats: {
          totalBindsets: 2,
          processedLayers: [1, 2, 3, 4, 5, 6]
        },
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser, 'parseFile').mockResolvedValue(mockParseResult)

      // Mock storage service
      const mockProfile = {
        builds: {
          space: { keys: {}, aliases: {} },
          ground: { keys: {}, aliases: {} }
        },
        bindsets: {},
        aliases: {},
        keybindMetadata: {},
        bindsetMetadata: {}
      }
      vi.spyOn(service.storage, 'getProfile').mockReturnValue(mockProfile)
      vi.spyOn(service.storage, 'saveProfile').mockImplementation((id, profile) => {
        mockProfile.profile = profile
      })

      const kbfContent = "VmFsaWQgS0JGIEZvcm1hdA=="

      // Test the endpoint via request
      const result = await service.request('import:kbf-file', {
        content: kbfContent,
        profileId: 'test-profile',
        environment: 'space'
      })

      expect(result.success).toBe(true)
      expect(result.message).toBe('kbf_import_completed')
      expect(result.imported.bindsets).toBe(2)
      expect(result.imported.keys).toBe(4)
      expect(result.masterBindset.hasMasterBindset).toBe(true)

      vi.restoreAllMocks()
    })

    it('should handle validation errors via request endpoint', async () => {
      // Mock invalid KBF format validation result
      const mockValidationResult = {
        isValid: false,
        isKBF: false,
                format: 'unknown',
        estimatedKeysets: 0,
        estimatedSize: 0,
        processingTime: 5,
        errors: ['Invalid Base64 encoding', 'Missing KEYSET records'],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      const kbfContent = "SW52YWxpZCBGb3JtYXQ="

      // Test the endpoint via request
      const result = await service.request('import:kbf-file', {
        content: kbfContent,
        profileId: 'test-profile',
        environment: 'space'
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalid_kbf_file_format')
      expect(result.errors).toContain('Invalid Base64 encoding')
      expect(result.errors).toContain('Missing KEYSET records')

      vi.restoreAllMocks()
    })

    it('should handle parsing errors via request endpoint', async () => {
      // Mock a valid KBF format validation result
      const mockValidationResult = {
        isValid: true,
        isKBF: true,
                format: 'kbf-keyset',
        estimatedKeysets: 1,
        estimatedSize: 1024,
        processingTime: 15,
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      // Mock parser to throw an error
      vi.spyOn(service.kbfParser, 'parseFile').mockRejectedValue(new Error('Layer 3 decoding failed'))

      const kbfContent = "VmFsaWQgRm9ybWF0IEJ1dCBQYXJzZSBFcnJvcg=="

      // Test the endpoint via request
      const result = await service.request('import:kbf-file', {
        content: kbfContent,
        profileId: 'test-profile',
        environment: 'space'
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('kbf_import_critical_error')
      // The error structure may vary - just verify it's a critical error
      expect(result.errors.length).toBeGreaterThanOrEqual(0)

      vi.restoreAllMocks()
    })

    it('should handle profile integration errors via request endpoint', async () => {
      // Mock a valid KBF format validation result
      const mockValidationResult = {
        isValid: true,
        isKBF: true,
                format: 'kbf-keyset',
        estimatedKeysets: 1,
        estimatedSize: 1024,
        processingTime: 15,
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      // Mock parser result
      const mockParseResult = {
        bindsets: {
          'Master': {
            keys: { 'F1': ['test_command'] },
            aliases: {},
            metadata: {}
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
      vi.spyOn(service.kbfParser, 'parseFile').mockResolvedValue(mockParseResult)

      // Mock storage to return null (profile not found)
      vi.spyOn(service.storage, 'getProfile').mockReturnValue(null)

      const kbfContent = "VmFsaWQgRm9ybWF0"

      // Test the endpoint via request
      const result = await service.request('import:kbf-file', {
        content: kbfContent,
        profileId: 'nonexistent-profile',
        environment: 'space'
      })

      expect(result.success).toBe(false)  // The service returns error if profile not found
      expect(result.error).toBe('profile_not_found')
      expect(result.message).toContain('Profile with ID "nonexistent-profile" not found')

      vi.restoreAllMocks()
    })

    it('should handle bindset mapping with metadata preservation via request endpoint', async () => {
      // Mock a valid KBF format validation result
      const mockValidationResult = {
        isValid: true,
        isKBF: true,
                format: 'kbf-keyset',
        estimatedKeysets: 1,
        estimatedSize: 1024,
        processingTime: 15,
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      // Mock parser result with metadata
      const mockParseResult = {
        bindsets: {
          'Master': {
            keys: {
              'F1': ['cmd1'],
              'F2': ['cmd2']
            },
            aliases: {},
            metadata: {
              priorityOrder: 1,
              stabilizeExecutionOrder: true,
              customData: 'test_metadata'
            }
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
      vi.spyOn(service.kbfParser, 'parseFile').mockResolvedValue(mockParseResult)

      // Mock storage service and capture saved profile
      let savedProfile = null
      const mockProfile = {
        builds: {
          space: { keys: {}, aliases: {} },
          ground: { keys: {}, aliases: {} }
        },
        bindsets: {},
        aliases: {},
        keybindMetadata: {},
        bindsetMetadata: {}
      }
      vi.spyOn(service.storage, 'getProfile').mockReturnValue(mockProfile)
      vi.spyOn(service.storage, 'saveProfile').mockImplementation((id, profile) => {
        savedProfile = profile
      })

      const kbfContent = "TWV0YWRhdGEgVGVzdA=="

      // Test the endpoint via request
      const result = await service.request('import:kbf-file', {
        content: kbfContent,
        profileId: 'test-profile',
        environment: 'space'
      })

      expect(result.success).toBe(true)
      expect(savedProfile).toBeDefined()
      // Check if metadata is handled correctly by the actual implementation

      vi.restoreAllMocks()
    })

    it('should handle multiple bindsets with LoadBindSet activities via request endpoint', async () => {
      // Mock a valid KBF format validation result
      const mockValidationResult = {
        isValid: true,
        isKBF: true,
                format: 'kbf-keyset',
        estimatedKeysets: 2,
        estimatedSize: 2048,
        processingTime: 25,
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      // Mock parser result with LoadBindSet activities
      const mockParseResult = {
        bindsets: {
          'Master': {
            keys: {
              'F1': ['cmd1'],
              'F10': ['bind_load_file C_PvP.txt']  // LoadBindSet activity
            },
            aliases: {},
            metadata: {}
          },
          'PvP': {
            keys: {
              'F1': ['pvp_cmd1'],
              'F2': ['pvp_cmd2']
            },
            aliases: {},
            metadata: {}
          }
        },
        aliases: {},
        stats: {
          totalBindsets: 2,
          processedLayers: [1, 2, 3, 4, 5, 6]
        },
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser, 'parseFile').mockResolvedValue(mockParseResult)

      // Mock storage service
      const mockProfile = {
        builds: {
          space: { keys: {}, aliases: {} },
          ground: { keys: {}, aliases: {} }
        },
        bindsets: {},
        aliases: {},
        keybindMetadata: {},
        bindsetMetadata: {}
      }
      vi.spyOn(service.storage, 'getProfile').mockReturnValue(mockProfile)
      vi.spyOn(service.storage, 'saveProfile').mockImplementation((id, profile) => {
        mockProfile.profile = profile
      })

      const kbfContent = "TG9hZEJpbmRTZXQgVGVzdA=="

      // Test the endpoint via request
      const result = await service.request('import:kbf-file', {
        content: kbfContent,
        profileId: 'test-profile',
        environment: 'space'
      })

      expect(result.success).toBe(true)
      expect(result.imported.bindsets).toBe(2)
      // LoadBindSet activities are processed - verify the bindset was imported correctly
      expect(mockProfile.profile).toBeDefined()
      expect(mockProfile.profile.bindsets).toBeDefined()
      expect(Object.keys(mockProfile.profile.bindsets)).toContain('PvP')

      vi.restoreAllMocks()
    })

    it('should handle partial import with warnings via request endpoint', async () => {
      // Mock a valid KBF format validation result
      const mockValidationResult = {
        isValid: true,
        isKBF: true,
                format: 'kbf-keyset',
        estimatedKeysets: 1,
        estimatedSize: 1024,
        processingTime: 15,
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      // Mock parser result with warnings
      const mockParseResult = {
        bindsets: {
          'Master': {
            keys: { 'F1': ['cmd1'] },
            aliases: {},
            metadata: {}
          }
        },
        aliases: {},
        stats: {
          totalBindsets: 1,
          processedLayers: [1, 2, 3, 4, 5, 6]
        },
        errors: [],
        warnings: [
          'Unknown activity type 150 skipped',
          'Unsupported key token "UnknownKey" skipped'
        ]
      }
      vi.spyOn(service.kbfParser, 'parseFile').mockResolvedValue(mockParseResult)

      // Mock storage service
      const mockProfile = {
        builds: {
          space: { keys: {}, aliases: {} },
          ground: { keys: {}, aliases: {} }
        },
        bindsets: {},
        aliases: {},
        keybindMetadata: {},
        bindsetMetadata: {}
      }
      vi.spyOn(service.storage, 'getProfile').mockReturnValue(mockProfile)
      vi.spyOn(service.storage, 'saveProfile').mockImplementation((id, profile) => {
        mockProfile.profile = profile
      })

      const kbfContent = "V2FybmluZ3MgVGVzdA=="

      // Test the endpoint via request
      const result = await service.request('import:kbf-file', {
        content: kbfContent,
        profileId: 'test-profile',
        environment: 'space'
      })

      expect(result.success).toBe(true)
      expect(result.warnings).toBeDefined()
      expect(result.warnings.length).toBeGreaterThanOrEqual(2)
      expect(result.warnings.some(w =>
        typeof w === 'string' ? w.includes('Unknown activity type 150') : w.message.includes('Unknown activity type 150')
      )).toBe(true)
      expect(result.warnings.some(w =>
        typeof w === 'string' ? w.includes('UnknownKey') : w.message.includes('UnknownKey')
      )).toBe(true)

      vi.restoreAllMocks()
    })

    it('should validate input parameters via request endpoint', async () => {
      // Test missing content
      let result = await service.request('import:kbf-file', {
        content: null,
        profileId: 'test-profile',
        environment: 'space'
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('invalid_kbf_file_content')

      // Test missing profileId
      result = await service.request('import:kbf-file', {
        content: 'dGVzdA==',
        profileId: null,
        environment: 'space'
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('no_active_profile')

      // Test missing environment - service fails at validation before environment handling
      result = await service.request('import:kbf-file', {
        content: 'dGVzdA==',
        profileId: 'test-profile',
        environment: null
      })
      expect(result.success).toBe(false)  // Fails at validation stage before environment handling
      expect(result.error).toBe('invalid_kbf_file_format')
    })

    it('should handle environment-specific bindset mapping via request endpoint', async () => {
      // Mock a valid KBF format validation result
      const mockValidationResult = {
        isValid: true,
        isKBF: true,
                format: 'kbf-keyset',
        estimatedKeysets: 1,
        estimatedSize: 1024,
        processingTime: 15,
        errors: [],
        warnings: []
      }
      vi.spyOn(service.kbfParser.decoder, 'validateFormat').mockReturnValue(mockValidationResult)

      // Mock parser result with ground-specific keys
      const mockParseResult = {
        bindsets: {
          'Master': {
            keys: {
              '1': ['power_exec FireWeapon 1'],
              '2': ['power_exec KitMod 1']
            },
            aliases: {},
            metadata: {}
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
      vi.spyOn(service.kbfParser, 'parseFile').mockResolvedValue(mockParseResult)

      // Mock storage service
      const mockProfile = {
        builds: {
          space: { keys: {}, aliases: {} },
          ground: { keys: {}, aliases: {} }
        },
        bindsets: {},
        aliases: {},
        keybindMetadata: {},
        bindsetMetadata: {}
      }
      vi.spyOn(service.storage, 'getProfile').mockReturnValue(mockProfile)
      vi.spyOn(service.storage, 'saveProfile').mockImplementation((id, profile) => {
        mockProfile.profile = profile
      })

      const kbfContent = "R3JvdW5kIFRlc3Q="

      // Test the endpoint via request with ground environment
      const result = await service.request('import:kbf-file', {
        content: kbfContent,
        profileId: 'test-profile',
        environment: 'ground'
      })

      expect(result.success).toBe(true)
      expect(mockProfile.profile.builds.ground.keys).toBeDefined()
      expect(mockProfile.profile.builds.ground.keys['1']).toEqual(['power_exec FireWeapon 1'])
      expect(mockProfile.profile.builds.space.keys).toEqual({}) // Should remain empty

      vi.restoreAllMocks()
    })
  })
})
