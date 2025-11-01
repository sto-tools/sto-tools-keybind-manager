import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock i18next before importing the service
vi.mock('i18next', () => ({
  default: {
    t: vi.fn((key) => key)
  }
}))

import SyncService from '../../../src/js/components/services/SyncService.js'
import { createServiceFixture } from '../../fixtures/index.js'

function createHandle(name) {
  return {
    name,
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
  }
}

describe('SyncService', () => {
  let fixture, service, uiMock

  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: false })
    uiMock = { showToast: vi.fn() }

    const fsMock = {
      saveDirectoryHandle: vi.fn().mockResolvedValue(undefined),
      getDirectoryHandle: vi.fn().mockResolvedValue(createHandle('syncDir')),
    }

    service = new SyncService({ eventBus: fixture.eventBus, storage: fixture.storageService, ui: uiMock, fs: fsMock })
  })

  afterEach(() => {
    fixture.destroy()
    vi.restoreAllMocks()
  })

  describe('Browser Detection', () => {
    it('isFirefox() returns true for Firefox user agent', () => {
      global.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0' }
      expect(service.isFirefox()).toBe(true)
    })

    it('isFirefox() returns false for Chrome user agent', () => {
      global.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
      expect(service.isFirefox()).toBe(false)
    })

    it('isFirefox() returns false for Edge user agent', () => {
      global.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59' }
      expect(service.isFirefox()).toBe(false)
    })

    it('isFirefox() returns false when navigator is undefined', () => {
      global.navigator = undefined
      expect(service.isFirefox()).toBe(false)
    })
  })

  describe('Secure Context Detection', () => {
    it('isSecureContext() returns true for HTTPS', () => {
      global.window = {
        isSecureContext: true,
        location: { protocol: 'https:', hostname: 'example.com' }
      }
      expect(service.isSecureContext()).toBe(true)
    })

    it('isSecureContext() returns true for file:// protocol (fallback logic)', () => {
      global.window = {
        isSecureContext: undefined, // Force fallback logic
        location: { protocol: 'file:', hostname: '' }
      }
      expect(service.isSecureContext()).toBe(true)
    })

    it('isSecureContext() returns true for localhost (fallback logic)', () => {
      global.window = {
        isSecureContext: undefined, // Force fallback logic
        location: { protocol: 'http:', hostname: 'localhost' }
      }
      expect(service.isSecureContext()).toBe(true)
    })

    it('isSecureContext() returns true for 127.0.0.1 (fallback logic)', () => {
      global.window = {
        isSecureContext: undefined, // Force fallback logic
        location: { protocol: 'http:', hostname: '127.0.0.1' }
      }
      expect(service.isSecureContext()).toBe(true)
    })

    it('isSecureContext() returns false for HTTP on non-localhost', () => {
      global.window = {
        isSecureContext: false,
        location: { protocol: 'http:', hostname: 'example.com' }
      }
      expect(service.isSecureContext()).toBe(false)
    })

    it('isSecureContext() returns false when window is undefined', () => {
      global.window = undefined
      expect(service.isSecureContext()).toBe(false)
    })
  })

  describe('setSyncFolder - Browser and Context Detection', () => {
    beforeEach(() => {
      // Mock window.confirmDialog
      global.window = {
        ...global.window,
        confirmDialog: {
          inform: vi.fn().mockResolvedValue(undefined)
        }
      }
    })

    it('shows Firefox error for Firefox regardless of protocol', async () => {
      // Setup Firefox environment
      global.navigator = { userAgent: 'Firefox/91.0' }
      global.window.location = { protocol: 'https:', hostname: 'localhost' }
      global.window.isSecureContext = true

      await service.setSyncFolder(false)

      expect(uiMock.showToast).toHaveBeenCalledWith('sync_not_supported_firefox', 'error')
      expect(global.window.confirmDialog.inform).toHaveBeenCalled()
    })

    it('shows secure context error for Chrome on HTTP', async () => {
      // Setup Chrome environment on HTTP
      global.navigator = { userAgent: 'Chrome/91.0' }
      global.window.location = { protocol: 'http:', hostname: 'example.com' }
      global.window.isSecureContext = false
      global.window.showDirectoryPicker = vi.fn() // Should not be called

      await service.setSyncFolder(false)

      expect(uiMock.showToast).toHaveBeenCalledWith('sync_not_supported_secure_context', 'error')
      expect(global.window.confirmDialog.inform).toHaveBeenCalled()
      expect(global.window.showDirectoryPicker).not.toHaveBeenCalled()
    })

    it('allows Chrome on HTTPS to proceed normally', async () => {
      // Setup Chrome environment on HTTPS
      global.navigator = { userAgent: 'Chrome/91.0' }
      global.window.location = { protocol: 'https:', hostname: 'example.com' }
      global.window.isSecureContext = true
      const handle = createHandle('syncDir')
      global.window.showDirectoryPicker = vi.fn().mockResolvedValue(handle)

      await service.setSyncFolder(false)

      expect(global.window.showDirectoryPicker).toHaveBeenCalled()
      expect(uiMock.showToast).toHaveBeenCalledWith('sync_folder_set', 'success')
      expect(fixture.storageService.saveSettings).toHaveBeenCalled()
    })

    it('allows Chrome on file:// to proceed normally', async () => {
      // Setup Chrome environment on file://
      global.navigator = { userAgent: 'Chrome/91.0' }
      global.window.location = { protocol: 'file:', hostname: '' }
      global.window.isSecureContext = true
      const handle = createHandle('syncDir')
      global.window.showDirectoryPicker = vi.fn().mockResolvedValue(handle)

      await service.setSyncFolder(false)

      expect(global.window.showDirectoryPicker).toHaveBeenCalled()
      expect(uiMock.showToast).toHaveBeenCalledWith('sync_folder_set', 'success')
    })

    it('shows browser error for non-Firefox without API support', async () => {
      // Setup non-Firefox browser without API support
      global.navigator = { userAgent: 'SomeOtherBrowser/1.0' }
      global.window.location = { protocol: 'https:', hostname: 'example.com' }
      global.window.isSecureContext = true
      delete global.window.showDirectoryPicker

      await service.setSyncFolder(false)

      expect(uiMock.showToast).toHaveBeenCalledWith('sync_not_supported_browser', 'error')
      expect(global.window.confirmDialog.inform).toHaveBeenCalled()
    })
  })

  describe('Legacy Functionality', () => {
    it('setSyncFolder saves folder name in preferences', async () => {
      const handle = createHandle('syncDir')
      global.window.showDirectoryPicker = vi.fn().mockResolvedValue(handle)
      global.navigator = { userAgent: 'Chrome/91.0' } // Non-Firefox
      global.window.location = { protocol: 'https:', hostname: 'localhost' }
      global.window.isSecureContext = true

      await service.setSyncFolder(false)

      expect(fixture.storageService.saveSettings).toHaveBeenCalled()
      const saved = JSON.parse(fixture.storageFixture.localStorage.getItem('sto_keybind_settings') || '{}')
      expect(saved.syncFolderName).toBe('syncDir')
      expect(uiMock.showToast).toHaveBeenCalledWith('sync_folder_set', 'success')
    })

    it('ensurePermission returns true when already granted', async () => {
      const handle = createHandle('any')
      const ok = await service.ensurePermission(handle)
      expect(ok).toBe(true)
      expect(handle.queryPermission).toHaveBeenCalled()
      expect(handle.requestPermission).not.toHaveBeenCalled()
    })

    describe('syncProject - Browser and Context Detection', () => {
      it('shows Firefox error for Firefox regardless of protocol', async () => {
        // Setup Firefox environment
        global.navigator = { userAgent: 'Firefox/91.0' }
        global.window.location = { protocol: 'https:', hostname: 'localhost' }
        global.window.isSecureContext = true

        await service.syncProject('manual')

        expect(uiMock.showToast).toHaveBeenCalledWith('sync_not_supported_firefox', 'warning')
      })

      it('shows secure context error for Chrome on HTTP', async () => {
        // Setup Chrome environment on HTTP
        global.navigator = { userAgent: 'Chrome/91.0' }
        global.window.location = { protocol: 'http:', hostname: 'example.com' }
        global.window.isSecureContext = false

        await service.syncProject('manual')

        expect(uiMock.showToast).toHaveBeenCalledWith('sync_not_supported_secure_context', 'warning')
      })

      it('shows no sync folder selected for Chrome on HTTPS when no folder is set', async () => {
        // Setup Chrome environment on HTTPS
        global.navigator = { userAgent: 'Chrome/91.0' }
        global.window.location = { protocol: 'https:', hostname: 'example.com' }
        global.window.isSecureContext = true
        // Mock getDirectoryHandle to return null (no folder set)
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(null)

        await service.syncProject('manual')

        expect(uiMock.showToast).toHaveBeenCalledWith('no_sync_folder_selected', 'warning')
      })

      it('allows Chrome on HTTPS to proceed when folder is set', async () => {
        // Setup Chrome environment on HTTPS
        global.navigator = { userAgent: 'Chrome/91.0' }
        global.window.location = { protocol: 'https:', hostname: 'example.com' }
        global.window.isSecureContext = true
        const handle = createHandle('syncDir')
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(handle)

        // Mock the export:sync-to-folder request to prevent errors
        service.request = vi.fn().mockResolvedValue(undefined)

        await service.syncProject('manual')

        // Should show success message
        expect(uiMock.showToast).toHaveBeenCalledWith('project_synced_successfully', 'success')
      })
    })

    describe('syncProject - Import from existing project.json when present', () => {
      beforeEach(() => {
        global.navigator = { userAgent: 'Chrome/91.0' }
        global.window.location = { protocol: 'https:', hostname: 'example.com' }
        global.window.isSecureContext = true
        // Ensure confirm dialog exists
        global.window.confirmDialog = {
          ...(global.window.confirmDialog || {}),
          confirm: vi.fn()
        }
      })

      function createDirHandleWithProject(jsonContent) {
        return {
          name: 'syncDir',
          queryPermission: vi.fn().mockResolvedValue('granted'),
          requestPermission: vi.fn().mockResolvedValue('granted'),
          getFileHandle: vi.fn().mockImplementation(async (name, opts) => {
            if (name !== 'project.json') throw new Error('Not found')
            return {
              getFile: vi.fn().mockResolvedValue({
                text: vi.fn().mockResolvedValue(jsonContent)
              })
            }
          })
        }
      }

      it('imports when user confirms import', async () => {
        const project = { version: 'x', type: 'project', data: { profiles: {}, settings: {} } }
        const handle = createDirHandleWithProject(JSON.stringify(project))
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(handle)
        global.window.confirmDialog.confirm.mockResolvedValue(true)

        const req = vi.fn().mockImplementation(async (topic, payload) => {
          if (topic === 'import:project-file') return { success: true }
          if (topic === 'export:sync-to-folder') throw new Error('should not export when importing')
          return undefined
        })
        service.request = req

        await service.syncProject('manual')

        expect(req).toHaveBeenCalledWith('import:project-file', { content: JSON.stringify(project) })
        expect(uiMock.showToast).toHaveBeenCalledWith('project_imported_from_sync_folder', 'success')
      })

      it('overwrites when user declines import but confirms overwrite', async () => {
        const project = { version: 'x', type: 'project', data: { profiles: {}, settings: {} } }
        const handle = createDirHandleWithProject(JSON.stringify(project))
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(handle)
        // First prompt (import?): decline; Second prompt (overwrite?): confirm
        global.window.confirmDialog.confirm
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(true)

        const req = vi.fn().mockImplementation(async (topic, payload) => {
          if (topic === 'import:project-file') throw new Error('should not import when declined')
          if (topic === 'export:sync-to-folder') return undefined
          return undefined
        })
        service.request = req

        await service.syncProject('manual')

        expect(req).toHaveBeenCalledWith('export:sync-to-folder', { dirHandle: handle })
        expect(uiMock.showToast).toHaveBeenCalledWith('project_synced_successfully', 'success')
      })

      it('cancels when user declines both import and overwrite', async () => {
        const project = { version: 'x', type: 'project', data: { profiles: {}, settings: {} } }
        const handle = createDirHandleWithProject(JSON.stringify(project))
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(handle)
        // First confirm: decline import; Second confirm: decline overwrite
        global.window.confirmDialog.confirm
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(false)

        const req = vi.fn().mockImplementation(async (topic, payload) => {
          if (topic === 'import:project-file') throw new Error('should not import when cancelled')
          if (topic === 'export:sync-to-folder') throw new Error('should not export when cancelled')
          return undefined
        })
        service.request = req

        await service.syncProject('manual')

        expect(req).not.toHaveBeenCalledWith('import:project-file', expect.anything())
        expect(req).not.toHaveBeenCalledWith('export:sync-to-folder', expect.anything())
        expect(uiMock.showToast).toHaveBeenCalledWith('sync_operation_cancelled', 'info')
      })
    })
  })
}) 