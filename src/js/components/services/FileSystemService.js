import ComponentBase from '../ComponentBase.js'

// Default IndexedDB details
export const DB_NAME = 'sto-sync-handles'
export const STORE_NAME = 'directories'

// Key used by SyncService to store the user-selected sync folder handle
export const KEY_SYNC_FOLDER = 'sync-folder'

/*
 * FileSystemService – stateless helper for persisting File System Access API
 * handles and writing files.  Follows the common Service Component pattern
 * by extending ComponentBase, enabling future event-emission when needed.
 */
export default class FileSystemService extends ComponentBase {
  constructor({ dbName = DB_NAME, storeName = STORE_NAME, eventBus } = {}) {
    super(eventBus)
    this.componentName = 'FileSystemService'
    this.dbName = dbName
    this.storeName = storeName
  }

  // IndexedDB helpers
  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onupgradeneeded = () => {
        request.result.createObjectStore(this.storeName)
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async saveDirectoryHandle(key, handle) {
    const db = await this.openDB()
    const tx = db.transaction(this.storeName, 'readwrite')
    tx.objectStore(this.storeName).put(handle, key)

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })

    db.close()
  }

  async getDirectoryHandle(key) {
    const db = await this.openDB()
    const tx = db.transaction(this.storeName, 'readonly')
    const request = tx.objectStore(this.storeName).get(key)

    const handle = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    db.close()
    return handle || null
  }

  // File writing (File System Access API)
  async writeFile(dirHandle, relativePath, contents) {
    const parts = relativePath.split('/')
    const fileName = parts.pop()
    let current = dirHandle

    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true })
    }

    const fileHandle = await current.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(contents)
    await writable.close()
  }

  // Convenience static proxies so existing code that imports
  // individual helpers keeps working without needing an instance.
  static #singleton = null

  static _getInstance() {
    if (!this.#singleton) this.#singleton = new FileSystemService()
    return this.#singleton
  }

  static saveDirectoryHandle(key, handle) {
    return this._getInstance().saveDirectoryHandle(key, handle)
  }

  static getDirectoryHandle(key) {
    return this._getInstance().getDirectoryHandle(key)
  }

  static writeFile(dirHandle, relativePath, contents) {
    return this._getInstance().writeFile(dirHandle, relativePath, contents)
  }
}

// Preserve named functional exports used across the codebase and tests
export const saveDirectoryHandle = (...args) => FileSystemService.saveDirectoryHandle(...args)
export const getDirectoryHandle = (...args) => FileSystemService.getDirectoryHandle(...args)
export const writeFile = (...args) => FileSystemService.writeFile(...args) 