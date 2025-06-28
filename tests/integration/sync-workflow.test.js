import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import '../../src/js/data.js'
import SyncService, { writeFile } from '../../src/js/components/services/SyncService.js'
import STOExportManager from '../../src/js/features/export.js'
import { StorageService } from '../../src/js/components/services/index.js'
import eventBus from '../../src/js/core/eventBus.js'

const store = new Map()
vi.mock('../../src/js/components/services/FileSystemService.js', () => {
  const saveSpy = vi.fn((k, h) => { store.set(k, h); return Promise.resolve() })
  const getSpy = vi.fn((k) => Promise.resolve(store.get(k)))
  const writeSpy = vi.fn(async (dirHandle, relPath, contents) => {
    const parts = relPath.split('/')
    const fileName = parts.pop()
    let current = dirHandle
    for (const p of parts) {
      if (!current.children[p]) current.children[p] = { children: {}, name: p }
      current = current.children[p]
    }
    current.children[fileName] = { contents }
  })

  return {
    saveDirectoryHandle: saveSpy,
    getDirectoryHandle: getSpy,
    writeFile: writeSpy,
    KEY_SYNC_FOLDER: 'sync-folder',
    default: class {
      saveDirectoryHandle (...args) { return saveSpy(...args) }
      getDirectoryHandle (...args) { return getSpy(...args) }
      writeFile (...args) { return writeSpy(...args) }
    },
  }
})

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
      close: () => {}
    }
  }
}
class MockDirHandle {
  constructor() {
    this.children = {}
  }
  async getDirectoryHandle(name) {
    if (!this.children[name]) this.children[name] = new MockDirHandle()
    return this.children[name]
  }
  async getFileHandle(name) {
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

describe('Sync workflow integration', () => {
  let storage, sync, exportMgr, dirHandle

  beforeEach(() => {
    document.body.innerHTML = `
      <button id="setSyncFolderBtn"></button>
      <button id="syncNowBtn"></button>
    `
    storage = new StorageService()
    exportMgr = new STOExportManager()
    sync = new SyncService({ storage })
    Object.assign(global, { storageService: storage, stoExport: exportMgr })

    eventBus.onDom('setSyncFolderBtn', 'click', 'set-sync-folder', () => sync.setSyncFolder())
    eventBus.onDom('syncNowBtn', 'click', 'sync-now', () => sync.syncProject())

    dirHandle = new MockDirHandle()
    global.showDirectoryPicker = vi.fn().mockResolvedValue(dirHandle)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    store.clear()
    vi.restoreAllMocks()
  })

  it('syncs project files after selecting folder', async () => {
    await sync.setSyncFolder()
    await sync.syncProject()

    expect(dirHandle.children['project.json']).toBeDefined()
    const profileDir = dirHandle.children['Default_Space']
    expect(profileDir.children['Default_Space_space.txt']).toBeDefined()
    expect(profileDir.children['Default_Space_aliases.txt']).toBeDefined()
  })
})
