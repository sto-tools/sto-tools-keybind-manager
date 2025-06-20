import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import i18next from 'i18next'
import en from '../../src/i18n/en.json'

vi.mock('../../src/js/fsHandles.js', () => {
  return {
    saveDirectoryHandle: vi.fn(),
    getDirectoryHandle: vi.fn(),
    KEY_SYNC_FOLDER: 'sync-folder',
  }
})

import { saveDirectoryHandle, getDirectoryHandle } from '../../src/js/fsHandles.js'
import STOSyncManager, { writeFile } from '../../src/js/sync.js'

class MockFile {
  constructor() {
    this.contents = ''
  }
}
class MockFileHandle {
  constructor(file) {
    this.file = file
  }
  async createWritable() {
    return {
      write: (c) => {
        this.file.contents = c
      },
      close: () => {},
    }
  }
}
class MockDirHandle {
  constructor() {
    this.children = {}
  }
  async getDirectoryHandle(name, opts) {
    if (!this.children[name]) this.children[name] = new MockDirHandle()
    return this.children[name]
  }
  async getFileHandle(name, opts) {
    if (!this.children[name]) this.children[name] = new MockFile()
    return new MockFileHandle(this.children[name])
  }
  async queryPermission() {
    return 'granted'
  }
  async requestPermission() {
    return 'granted'
  }
}

describe('STOSyncManager', () => {
  let sync
  beforeEach(async () => {
    await i18next.init({ lng: 'en', resources: { en: { translation: en } } })
    window.i18next = i18next
    global.stoUI = { showToast: vi.fn() }
    global.stoExport = { syncToFolder: vi.fn() }
    sync = new STOSyncManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('setSyncFolder stores selected handle', async () => {
    const handle = new MockDirHandle()
    global.showDirectoryPicker = vi.fn().mockResolvedValue(handle)
    await sync.setSyncFolder()
    expect(showDirectoryPicker).toHaveBeenCalled()
    expect(saveDirectoryHandle).toHaveBeenCalledWith('sync-folder', handle)
    expect(stoUI.showToast).toHaveBeenCalled()
  })

  it('getSyncFolderHandle retrieves stored handle', async () => {
    const handle = new MockDirHandle()
    getDirectoryHandle.mockResolvedValue(handle)
    const result = await sync.getSyncFolderHandle()
    expect(result).toBe(handle)
  })

  it('syncProject calls export manager with handle', async () => {
    const handle = new MockDirHandle()
    getDirectoryHandle.mockResolvedValue(handle)
    await sync.syncProject()
    expect(stoExport.syncToFolder).toHaveBeenCalledWith(handle)
  })
})

describe('writeFile helper', () => {
  it('creates nested files', async () => {
    const root = new MockDirHandle()
    await writeFile(root, 'a/b/c.txt', 'hello')
    expect(root.children.a.children.b.children['c.txt'].contents).toBe('hello')
  })
})
