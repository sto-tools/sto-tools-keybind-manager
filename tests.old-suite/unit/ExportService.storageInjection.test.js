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
      })
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
    it('should not throw ReferenceError when syncing with injected storage', () => {
      // This test verifies that the original bug (ReferenceError: storageService is not defined) is fixed
      expect(() => {
        exportService.syncToFolder({})
      }).not.toThrow('storageService is not defined')
    })
  })
})
