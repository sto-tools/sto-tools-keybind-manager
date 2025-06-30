import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveDirectoryHandle,
  getDirectoryHandle,
  KEY_SYNC_FOLDER,
} from '../../src/js/components/services/FileSystemService.js'

// A very small in-memory stub for IndexedDB sufficient for the methods that
// FileSystemService relies on.  The goal isn't to faithfully reproduce the
// full IDB API – only the subset actually used by the code under test.
function createIndexedDBStub() {
  const store = new Map()
  return {
    open() {
      // The real API returns an "IDBOpenDBRequest" that fires events
      const request = {}
      setTimeout(() => {
        request.result = {
          createObjectStore() {
            /* noop – our `store` map is already initialised */
          },
          transaction(storeName, mode) {
            const tx = {
              objectStore() {
                return {
                  put(value, key) {
                    store.set(key, value)
                    // Emulate async completion of the transaction
                    setTimeout(() => tx.oncomplete && tx.oncomplete())
                  },
                  get(key) {
                    const req = {}
                    setTimeout(() => {
                      req.result = store.get(key)
                      req.onsuccess && req.onsuccess()
                    })
                    return req
                  },
                }
              },
            }
            return tx
          },
          close() {/* noop */},
        }

        // Fire upgrade handler if the test attached one
        if (request.onupgradeneeded) request.onupgradeneeded()
        // Finally resolve the open request
        request.onsuccess && request.onsuccess()
      })

      return request
    },
  }
}

/**
 * Unit tests – verify we can persist and retrieve a directory handle via the
 * stubbed IndexedDB implementation.
 */
describe('FileSystemService (IndexedDB wrapper)', () => {
  beforeEach(() => {
    // Provide our stub on the global scope so the service picks it up
    global.indexedDB = createIndexedDBStub()
  })

  it('persists and retrieves a directory handle', async () => {
    const fakeHandle = { name: 'SampleDirHandle' }
    await saveDirectoryHandle(KEY_SYNC_FOLDER, fakeHandle)

    const retrieved = await getDirectoryHandle(KEY_SYNC_FOLDER)
    expect(retrieved).toBe(fakeHandle)
  })
}) 