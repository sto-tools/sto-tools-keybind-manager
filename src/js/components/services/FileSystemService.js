import ComponentBase from "../ComponentBase.js";

// Default IndexedDB details
const DB_NAME = "sto-sync-handles";
const STORE_NAME = "directories";

// Key used by SyncService to store the user-selected sync folder handle
export const KEY_SYNC_FOLDER = "sync-folder";

/*
 * FileSystemService – stateless helper for persisting File System Access API
 * handles and writing files.  Follows the common Service Component pattern
 * by extending ComponentBase, enabling future event-emission when needed.
 */
export default class FileSystemService extends ComponentBase {
  /** @param {{ dbName?: string, storeName?: string, eventBus?: import('./serviceTypes.js').EventBus }} [options] */
  constructor({ dbName = DB_NAME, storeName = STORE_NAME, eventBus } = {}) {
    super(eventBus);
    this.componentName = "FileSystemService";
    this.dbName = dbName;
    this.storeName = storeName;
  }

  // IndexedDB helpers
  /** @returns {Promise<IDBDatabase>} */
  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        request.result.createObjectStore(this.storeName);
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * @param {IDBValidKey} key
   * @param {FileSystemDirectoryHandle} handle
   */
  async saveDirectoryHandle(key, handle) {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, "readwrite");
    tx.objectStore(this.storeName).put(handle, key);

    await /** @type {Promise<void>} */ (
      new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
    );

    db.close();
  }

  /**
   * @param {IDBValidKey} key
   * @returns {Promise<FileSystemDirectoryHandle | null>}
   */
  async getDirectoryHandle(key) {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, "readonly");
    const request = tx.objectStore(this.storeName).get(key);

    const handle =
      await /** @type {Promise<FileSystemDirectoryHandle | null>} */ (
        new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        })
      );

    db.close();
    return handle || null;
  }

  // File writing (File System Access API)
  /**
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} relativePath
   * @param {FileSystemWriteChunkType} contents
   */
  async writeFile(dirHandle, relativePath, contents) {
    const parts = relativePath.split("/");
    const fileName = parts.pop();
    if (!fileName) {
      throw new Error("A file path is required");
    }
    let current = dirHandle;

    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }

    const fileHandle = await current.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
  }

  // Convenience static proxies so existing code that imports
  // individual helpers keeps working without needing an instance.
  /** @type {FileSystemService | null} */
  static #singleton = null;

  static _getInstance() {
    if (!this.#singleton) this.#singleton = new FileSystemService();
    return this.#singleton;
  }

  /**
   * @param {IDBValidKey} key
   * @param {FileSystemDirectoryHandle} handle
   */
  static saveDirectoryHandle(key, handle) {
    return this._getInstance().saveDirectoryHandle(key, handle);
  }

  /** @param {IDBValidKey} key */
  static getDirectoryHandle(key) {
    return this._getInstance().getDirectoryHandle(key);
  }

  /**
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} relativePath
   * @param {FileSystemWriteChunkType} contents
   */
  static writeFile(dirHandle, relativePath, contents) {
    return this._getInstance().writeFile(dirHandle, relativePath, contents);
  }
}

// Preserve named functional exports used across the codebase and tests
/**
 * @param {IDBValidKey} key
 * @param {FileSystemDirectoryHandle} handle
 */
export const saveDirectoryHandle = (key, handle) =>
  FileSystemService.saveDirectoryHandle(key, handle);
/** @param {IDBValidKey} key */
export const getDirectoryHandle = (key) =>
  FileSystemService.getDirectoryHandle(key);
/**
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} relativePath
 * @param {FileSystemWriteChunkType} contents
 */
export const writeFile = (dirHandle, relativePath, contents) =>
  FileSystemService.writeFile(dirHandle, relativePath, contents);
