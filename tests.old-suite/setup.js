// Vitest global setup file
import { beforeEach, afterEach, vi } from 'vitest'
import i18next from 'i18next'
import en from '../src/i18n/en.json' assert { type: 'json' }

// Initialize i18next with English resources so modules relying on translations
// behave consistently in the test environment
await i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
})

// Make i18next available globally for all modules
global.i18next = i18next
window.i18next = i18next

// Mock browser APIs that aren't available in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock File and FileReader APIs
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

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-object-url')
global.URL.revokeObjectURL = vi.fn()

// Mock Blob
global.Blob = class Blob {
  constructor(chunks = [], options = {}) {
    this.size = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    this.type = options.type || ''
  }
}

// Mock stoUI for global availability in tests
global.stoUI = {
  showToast: vi.fn(),
  showModal: vi.fn(),
  hideModal: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true),
}

// Provide a minimal modalManager for modules that expect it
global.modalManager = {
  show: vi.fn((id) => {
    const modal = typeof id === 'string' ? document.getElementById(id) : id
    const overlay = document.getElementById('modalOverlay')
    if (modal && overlay) {
      overlay.classList.add('active')
      modal.classList.add('active')
      document.body.classList.add('modal-open')

      const firstInput = modal.querySelector('input, textarea, select')
      if (firstInput) setTimeout(() => firstInput.focus(), 0)
      return true
    }
    return false
  }),
  hide: vi.fn((id) => {
    const modal = typeof id === 'string' ? document.getElementById(id) : id
    const overlay = document.getElementById('modalOverlay')
    if (modal && overlay) {
      modal.classList.remove('active')
      overlay.classList.remove('active')
      document.body.classList.remove('modal-open')
      return true
    }
    return false
  }),
}

// Clean up after each test
beforeEach(() => {
  // Clear all mocks
  vi.clearAllMocks()
})

afterEach(() => {
  // Clean up DOM after each test
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

// Mock File System Access API (directory/file handles)
function createMockDirectoryHandle(name = 'root') {
  const files = new Map()
  const directories = new Map()

  const dirHandle = {
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
        // minimal file handle
        const fileHandle = {
          kind: 'file',
          name: fileName,
          async createWritable() {
            const writable = {
              async write(contents) {
                files.set(fileName, contents)
              },
              async close() {},
            }
            return writable
          },
          async getFile() {
            return { text: async () => files.get(fileName) || '' }
          },
        }
        files.set(fileName, '') // placeholder
        files.set(`${fileName}__handle`, fileHandle)
      }
      return files.get(`${fileName}__handle`)
    },
    // Helper for tests to inspect created files
    _files: files,
    _directories: directories,
  }
  return dirHandle
}

global.createMockDirectoryHandle = createMockDirectoryHandle

// Override setInterval to execute callback once immediately to avoid long-running loops in tests
const _realSetInterval = global.setInterval
const _realClearInterval = global.clearInterval

global.setInterval = (callback, delay = 0, ...args) => {
  // Execute immediately (next tick) but do NOT schedule repeated execution
  const id = _realSetInterval(() => {}, 0) // dummy to generate id
  Promise.resolve().then(() => callback(...args))
  return id
}

global.clearInterval = (id) => {
  _realClearInterval(id)
}
