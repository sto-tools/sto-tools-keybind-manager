import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import i18next from 'i18next'
import en from '../../src/i18n/en.json'

const handleStore = new Map()
vi.mock('../../src/js/components/services/FileSystemService.js', () => {
  const stubWriteFile = vi.fn(async (dirHandle, relPath, contents) => {
    const parts = relPath.split('/')
    const fileName = parts.pop()
    let current = dirHandle
    for (const p of parts) {
      if (!current.children[p]) current.children[p] = { children: {}, name: p }
      current = current.children[p]
    }
    current.children[fileName] = { contents }
  })

  const saveDirectoryHandleSpy = vi.fn((key, handle) => { handleStore.set(key, handle); return Promise.resolve() })
  const getDirectoryHandleSpy = vi.fn((key) => Promise.resolve(handleStore.get(key)))

  const defaultCls = class {
    saveDirectoryHandle (...args) { return saveDirectoryHandleSpy(...args) }
    getDirectoryHandle (...args) { return getDirectoryHandleSpy(...args) }
    writeFile (...args) { return stubWriteFile(...args) }
  }

  return {
    saveDirectoryHandle: saveDirectoryHandleSpy,
    getDirectoryHandle: getDirectoryHandleSpy,
    writeFile: stubWriteFile,
    KEY_SYNC_FOLDER: 'sync-folder',
    default: defaultCls,
  }
})

import { saveDirectoryHandle, getDirectoryHandle } from '../../src/js/components/services/FileSystemService.js'
import STOSyncManager, { writeFile } from '../../src/js/services/sync.js'

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
  constructor(name = 'test-folder') {
    this.name = name
    this.children = {}
  }
  async getDirectoryHandle(name, opts) {
    if (!this.children[name]) this.children[name] = new MockDirHandle(name)
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
    global.storageService = {
      getSettings: vi.fn().mockReturnValue({}),
      saveSettings: vi.fn(),
    }
    sync = new STOSyncManager(global.storageService)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete global.storageService
  })

  it('setSyncFolder stores selected handle', async () => {
    const handle = new MockDirHandle()
    global.showDirectoryPicker = vi.fn().mockResolvedValue(handle)
    await sync.setSyncFolder()
    expect(showDirectoryPicker).toHaveBeenCalled()
    expect(saveDirectoryHandle).toHaveBeenCalledWith('sync-folder', handle)
    expect(stoUI.showToast).toHaveBeenCalled()
    expect(storageService.saveSettings).toHaveBeenCalledWith({
      syncFolderName: handle.name,
      syncFolderPath: `Selected folder: ${handle.name}`,
      autoSync: false,
    })
    const stored = await getDirectoryHandle('sync-folder')
    expect(stored).toBe(handle)
  })

  it('setSyncFolder can enable autoSync', async () => {
    const handle = new MockDirHandle()
    global.showDirectoryPicker = vi.fn().mockResolvedValue(handle)
    await sync.setSyncFolder(true)
    expect(storageService.saveSettings).toHaveBeenCalledWith({
      syncFolderName: handle.name,
      syncFolderPath: `Selected folder: ${handle.name}`,
      autoSync: true,
    })
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

  it('syncProject writes files via export manager', async () => {
    const handle = new MockDirHandle()
    global.showDirectoryPicker = vi.fn().mockResolvedValue(handle)
    await sync.setSyncFolder()

    stoExport.syncToFolder.mockImplementation(async (dir) => {
      await writeFile(dir, 'test.txt', 'data')
    })

    await sync.syncProject()
    expect(handle.children['test.txt'].contents).toBe('data')
  })
})

describe('writeFile helper', () => {
  it('creates nested files', async () => {
    const root = new MockDirHandle()
    await writeFile(root, 'a/b/c.txt', 'hello')
    expect(root.children.a.children.b.children['c.txt'].contents).toBe('hello')
  })
})
