import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
  })

  it('setSyncFolder saves folder name in preferences', async () => {
    const handle = createHandle('syncDir')
    global.window.showDirectoryPicker = vi.fn().mockResolvedValue(handle)

    await service.setSyncFolder(false)

    expect(fixture.storageService.saveSettings).toHaveBeenCalled()
    const saved = JSON.parse(fixture.storageFixture.localStorage.getItem('sto_keybind_settings') || '{}')
    expect(saved.syncFolderName).toBe('syncDir')
    expect(uiMock.showToast).toHaveBeenCalled()
  })

  it('ensurePermission returns true when already granted', async () => {
    const handle = createHandle('any')
    const ok = await service.ensurePermission(handle)
    expect(ok).toBe(true)
    expect(handle.queryPermission).toHaveBeenCalled()
    expect(handle.requestPermission).not.toHaveBeenCalled()
  })
}) 