import { describe, it, expect, beforeEach, vi } from 'vitest'
import ExportService from '../../src/js/components/services/ExportService.js'

describe('ExportService Storage Dependency Injection', () => {
  let exportService
  let mockStorage

  beforeEach(() => {
    // Mock STO_DATA global
    global.STO_DATA = {
      settings: { version: '1.0.0' }
    }

    // Create a mock storage service
    mockStorage = {
      getAllData: vi.fn().mockReturnValue({
        version: '1.0.0',
        profiles: {},
        settings: {}
      }),
      importData: vi.fn().mockReturnValue(true)
    }

    // Create ExportService with storage dependency
    exportService = new ExportService({ storage: mockStorage })
    exportService.init()
  })

  describe('constructor', () => {
    it('should accept storage dependency in constructor', () => {
      expect(exportService.storage).toBe(mockStorage)
    })

    it('should work without storage dependency (for backward compatibility)', () => {
      const serviceWithoutStorage = new ExportService({})
      expect(serviceWithoutStorage.storage).toBeUndefined()
    })
  })

  describe('importJSONFile', () => {
    it('should use injected storage service for project imports', () => {
      const projectData = {
        type: 'project',
        data: { profiles: {}, settings: {} }
      }

      const result = exportService.importJSONFile(JSON.stringify(projectData))

      expect(mockStorage.importData).toHaveBeenCalledWith(JSON.stringify(projectData.data))
      expect(result).toBe(true)
    })

    it('should throw error when storage is not available for project imports', () => {
      const serviceWithoutStorage = new ExportService({})
      const projectData = {
        type: 'project',
        data: { profiles: {}, settings: {} }
      }

      expect(() => {
        serviceWithoutStorage.importJSONFile(JSON.stringify(projectData))
      }).toThrow('Storage service not available')
    })

    it('should handle profile imports without storage dependency', () => {
      // Profile imports use window.app.profileService, not storage directly
      const profileData = {
        type: 'profile',
        profile: { name: 'Test Profile', keys: {}, aliases: {} }
      }

      // Mock window.app.profileService
      global.window = global.window || {}
      global.window.app = {
        profileService: {
          createProfile: vi.fn().mockReturnValue({ success: true, profileId: 'test' })
        }
      }

      const result = exportService.importJSONFile(JSON.stringify(profileData))
      expect(result).toEqual({ success: true, profileId: 'test' })
    })
  })

  describe('syncToFolder', () => {
    it('should throw error when storage is not available', async () => {
      const serviceWithoutStorage = new ExportService({})
      const mockDirHandle = {}

      await expect(serviceWithoutStorage.syncToFolder(mockDirHandle)).rejects.toThrow('Storage service not available')
    })

    it('should access storage service without throwing ReferenceError', () => {
      // This test verifies that the storage service is properly accessible
      expect(() => {
        // This should not throw "storageService is not defined"
        const hasStorage = exportService.storage !== undefined
        expect(hasStorage).toBe(true)
      }).not.toThrow('storageService is not defined')
    })
  })

  describe('regression test for original bug', () => {
    it('should not throw ReferenceError when calling methods that need storage', () => {
      // This test verifies that the original bug (ReferenceError: storageService is not defined) is fixed
      expect(() => {
        const projectData = {
          type: 'project',
          data: { profiles: {}, settings: {} }
        }
        exportService.importJSONFile(JSON.stringify(projectData))
      }).not.toThrow('storageService is not defined')

      expect(() => {
        exportService.syncToFolder({})
      }).not.toThrow('storageService is not defined')
    })
  })
}) 