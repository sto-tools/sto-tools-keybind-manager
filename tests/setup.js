// Test setup file for unit and integration tests (jsdom environment)
import { beforeEach, afterEach, vi } from 'vitest'
import i18next from 'i18next'
import en from '../src/i18n/en.json' assert { type: 'json' }

// Initialize i18next with English resources
await i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
})

// Make i18next available globally
global.i18next = i18next
window.i18next = i18next

// Mock browser APIs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock File APIs
global.File = class File {
  constructor(chunks, filename, options = {}) {
    this.chunks = chunks
    this.name = filename
    this.size = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    this.type = options.type || ''
    this.lastModified = options.lastModified || Date.now()
  }
}

global.FileReader = class FileReader {
  constructor() {
    this.readyState = 0
    this.result = null
    this.error = null
    this.onload = null
    this.onerror = null
    this.onabort = null
  }

  readAsText(file) {
    setTimeout(() => {
      this.readyState = 2
      this.result = file.chunks.join('')
      if (this.onload) this.onload({ target: this })
    }, 0)
  }

  abort() {
    this.readyState = 2
    if (this.onabort) this.onabort({ target: this })
  }
}

// Mock URL APIs
global.URL.createObjectURL = vi.fn(() => 'mock-object-url')
global.URL.revokeObjectURL = vi.fn()

// Mock Blob
global.Blob = class Blob {
  constructor(chunks = [], options = {}) {
    this.size = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    this.type = options.type || ''
  }
}

// Mock File System Access API
function createMockDirectoryHandle(name = 'root') {
  const files = new Map()
  const directories = new Map()

  return {
    kind: 'directory',
    name,
    async getDirectoryHandle(part, { create } = {}) {
      if (!directories.has(part)) {
        if (!create) throw new Error('Directory not found')
        directories.set(part, createMockDirectoryHandle(part))
      }
      return directories.get(part)
    },
    async getFileHandle(fileName, { create } = {}) {
      if (!files.has(fileName)) {
        if (!create) throw new Error('File not found')
        const fileHandle = {
          kind: 'file',
          name: fileName,
          async createWritable() {
            return {
              async write(contents) {
                files.set(fileName, contents)
              },
              async close() {},
            }
          },
          async getFile() {
            return { text: async () => files.get(fileName) || '' }
          },
        }
        files.set(fileName, '')
        files.set(`${fileName}__handle`, fileHandle)
      }
      return files.get(`${fileName}__handle`)
    },
    _files: files,
    _directories: directories,
  }
}

global.createMockDirectoryHandle = createMockDirectoryHandle

// Import fixture cleanup system
import { cleanupFixtures } from './fixtures/core/cleanup.js'

// Global test lifecycle
beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  // Clean up DOM
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  
  // Clean up fixtures
  cleanupFixtures()
})

// --------------------------------------------------
// Minimal IndexedDB in-memory stub for FileSystemService unit tests
// --------------------------------------------------
const _dbStore = new Map()

global.indexedDB = {
  open(name, version) {
    const dbKey = `${name}`
    const dbObj = _dbStore.get(dbKey) || { stores: new Map() }
    _dbStore.set(dbKey, dbObj)

    const request = {}
    // Prepare result object representing the DB connection
    const dbConnection = {
      createObjectStore(storeName) {
        if (!dbObj.stores.has(storeName)) dbObj.stores.set(storeName, new Map())
      },
      transaction(storeName, mode) {
        if (!dbObj.stores.has(storeName)) dbObj.stores.set(storeName, new Map())
        const store = dbObj.stores.get(storeName)
        const tx = {
          objectStore() {
            return {
              put(value, key) { store.set(key, value) },
              get(key) {
                const req = { result: undefined, onsuccess: null, onerror: null }
                setTimeout(() => {
                  req.result = store.get(key)
                  if (req.onsuccess) req.onsuccess({ target: req })
                }, 0)
                return req
              }
            }
          },
          oncomplete: null,
          onerror: null,
          onabort: null,
        }

        // Auto-complete async next tick for simple operations
        setTimeout(() => {
          if (tx.oncomplete) tx.oncomplete()
        }, 0)

        return tx
      },
      close() {}
    }

    setTimeout(() => {
      // onupgradeneeded when new
      if (!dbObj.initialized) {
        dbObj.initialized = true
        request.result = dbConnection
        if (request.onupgradeneeded) request.onupgradeneeded({ target: { result: dbConnection } })
      }
      request.result = dbConnection
      if (request.onsuccess) request.onsuccess({ target: request })
    }, 0)
    return request
  }
} 