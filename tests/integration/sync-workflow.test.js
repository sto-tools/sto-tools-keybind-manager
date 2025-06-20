import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import '../../src/js/data.js'
import STOSyncManager, { writeFile } from '../../src/js/sync.js'
import STOExportManager from '../../src/js/export.js'
import STOStorage from '../../src/js/storage.js'
import eventBus from '../../src/js/eventBus.js'

const store = new Map()
vi.mock('../../src/js/fsHandles.js', () => ({
  saveDirectoryHandle: vi.fn((k, h) => {
    store.set(k, h)
    return Promise.resolve()
  }),
  getDirectoryHandle: vi.fn((k) => Promise.resolve(store.get(k))),
  KEY_SYNC_FOLDER: 'sync-folder'
}))

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
    storage = new STOStorage()
    exportMgr = new STOExportManager()
    sync = new STOSyncManager(storage)
    Object.assign(global, { stoStorage: storage, stoExport: exportMgr })

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
