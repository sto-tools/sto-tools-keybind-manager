import ComponentBase from "../ComponentBase.js";

// Default IndexedDB details
const DB_NAME = "sto-sync-handles";
const STORE_NAME = "directories";

// Key used by SyncService to store the user-selected sync folder handle
export const KEY_SYNC_FOLDER = "sync-folder";
const KEY_SYNC_FOLDER_TRANSITION = "sync-folder-transition-pending";
const SYNC_FOLDER_TRANSITION_MARKER = true;

/**
 * @param {IDBTransaction} transaction
 * @returns {Promise<void>}
 */
function waitForTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * @param {IDBRequest} request
 * @returns {Promise<unknown>}
 */
function readRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** @param {unknown} value @returns {value is object} */
function isObject(value) {
  return typeof value === "object" && value !== null;
}

/**
 * @param {unknown} raw
 * @returns {{ getDirectoryHandle: Function, getFileHandle: Function }}
 */
function decodeWritableDirectory(raw) {
  if (!isObject(raw)) throw new Error("Invalid directory capability");
  try {
    const kind = Reflect.get(raw, "kind");
    const name = Reflect.get(raw, "name");
    const getDirectoryHandle = Reflect.get(raw, "getDirectoryHandle");
    const getFileHandle = Reflect.get(raw, "getFileHandle");
    if (
      kind !== "directory" ||
      typeof name !== "string" ||
      name.length === 0 ||
      typeof getDirectoryHandle !== "function" ||
      typeof getFileHandle !== "function"
    ) {
      throw new Error("Invalid directory capability");
    }
    return {
      getDirectoryHandle: getDirectoryHandle.bind(raw),
      getFileHandle: getFileHandle.bind(raw),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Invalid directory capability"
    ) {
      throw error;
    }
    throw new Error("Invalid directory capability", { cause: error });
  }
}

/** @param {unknown} raw */
function decodeWritableFileHandle(raw) {
  if (!isObject(raw)) throw new Error("Invalid file capability");
  try {
    const kind = Reflect.get(raw, "kind");
    const name = Reflect.get(raw, "name");
    const createWritable = Reflect.get(raw, "createWritable");
    if (
      kind !== "file" ||
      typeof name !== "string" ||
      name.length === 0 ||
      typeof createWritable !== "function"
    ) {
      throw new Error("Invalid file capability");
    }
    return createWritable.bind(raw);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid file capability") {
      throw error;
    }
    throw new Error("Invalid file capability", { cause: error });
  }
}

/** @param {unknown} raw */
function decodeWritableStream(raw) {
  if (!isObject(raw)) throw new Error("Invalid writable capability");
  try {
    const write = Reflect.get(raw, "write");
    const close = Reflect.get(raw, "close");
    const abort = Reflect.get(raw, "abort");
    if (typeof write !== "function" || typeof close !== "function") {
      throw new Error("Invalid writable capability");
    }
    return {
      write: write.bind(raw),
      close: close.bind(raw),
      abort: typeof abort === "function" ? abort.bind(raw) : null,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Invalid writable capability"
    ) {
      throw error;
    }
    throw new Error("Invalid writable capability", { cause: error });
  }
}

/** @param {unknown} relativePath */
function decodeRelativeFilePath(relativePath) {
  if (typeof relativePath !== "string") throw new Error("Invalid file path");
  const parts = relativePath.split("/");
  if (
    parts.length === 0 ||
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error("Invalid file path");
  }
  return parts;
}

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
   * @param {unknown} handle
   */
  async saveDirectoryHandle(key, handle) {
    const db = await this.openDB();
    try {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).put(handle, key);
      await waitForTransaction(tx);
    } finally {
      db.close();
    }
  }

  /**
   * @param {IDBValidKey} key
   * @returns {Promise<unknown | null>}
   */
  async getDirectoryHandle(key) {
    const db = await this.openDB();
    try {
      const tx = db.transaction(this.storeName, "readonly");
      const request = tx.objectStore(this.storeName).get(key);

      const handle = await readRequest(request);

      return handle === undefined ? null : handle;
    } finally {
      db.close();
    }
  }

  /**
   * @param {IDBValidKey} key
   * @returns {Promise<void>}
   */
  async deleteDirectoryHandle(key) {
    const db = await this.openDB();
    try {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).delete(key);
      await waitForTransaction(tx);
    } finally {
      db.close();
    }
  }

  /**
   * Read the sync handle and its durable transition marker in one IndexedDB
   * transaction. Any stored marker value means the cross-store transition did
   * not reach a proven clean state.
   *
   * @returns {Promise<{ handle: unknown | null, transitionPending: boolean }>}
   */
  async getSyncDirectoryState() {
    const db = await this.openDB();
    try {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const markerRequest =
        typeof store.getKey === "function"
          ? store.getKey(KEY_SYNC_FOLDER_TRANSITION)
          : store.get(KEY_SYNC_FOLDER_TRANSITION);
      const [handle, markerIdentity] = await Promise.all([
        readRequest(store.get(KEY_SYNC_FOLDER)),
        readRequest(markerRequest),
      ]);
      return {
        handle: handle === undefined ? null : handle,
        transitionPending: markerIdentity !== undefined,
      };
    } finally {
      db.close();
    }
  }

  /**
   * Atomically install a candidate sync handle and mark its cross-store
   * transition dirty before settings persistence begins.
   *
   * @param {unknown} handle
   * @returns {Promise<void>}
   */
  async beginSyncDirectoryTransition(handle) {
    const db = await this.openDB();
    try {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      store.put(handle, KEY_SYNC_FOLDER);
      store.put(SYNC_FOLDER_TRANSITION_MARKER, KEY_SYNC_FOLDER_TRANSITION);
      await waitForTransaction(tx);
    } finally {
      db.close();
    }
  }

  /**
   * Mark the installed sync handle clean after its settings owner mutation has
   * completed.
   *
   * @returns {Promise<void>}
   */
  async completeSyncDirectoryTransition() {
    const db = await this.openDB();
    try {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).delete(KEY_SYNC_FOLDER_TRANSITION);
      await waitForTransaction(tx);
    } finally {
      db.close();
    }
  }

  /**
   * Atomically restore both parts of a previously captured sync directory
   * state during compensation.
   *
   * @param {{ handle: unknown | null, transitionPending: boolean }} previousState
   * @returns {Promise<void>}
   */
  async restoreSyncDirectoryState(previousState) {
    const db = await this.openDB();
    try {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      if (previousState.handle === null) {
        store.delete(KEY_SYNC_FOLDER);
      } else {
        store.put(previousState.handle, KEY_SYNC_FOLDER);
      }
      if (previousState.transitionPending) {
        store.put(SYNC_FOLDER_TRANSITION_MARKER, KEY_SYNC_FOLDER_TRANSITION);
      } else {
        store.delete(KEY_SYNC_FOLDER_TRANSITION);
      }
      await waitForTransaction(tx);
    } finally {
      db.close();
    }
  }

  // File writing (File System Access API)
  /**
   * @param {unknown} dirHandle
   * @param {unknown} relativePath
   * @param {FileSystemWriteChunkType} contents
   */
  async writeFile(dirHandle, relativePath, contents) {
    const parts = decodeRelativeFilePath(relativePath);
    const fileName = /** @type {string} */ (parts.pop());
    let current = decodeWritableDirectory(dirHandle);

    for (const part of parts) {
      const next = await current.getDirectoryHandle(part, { create: true });
      current = decodeWritableDirectory(next);
    }

    const rawFileHandle = await current.getFileHandle(fileName, {
      create: true,
    });
    const createWritable = decodeWritableFileHandle(rawFileHandle);
    const writable = decodeWritableStream(await createWritable());
    try {
      await writable.write(contents);
      await writable.close();
    } catch (error) {
      if (writable.abort) {
        try {
          await writable.abort(error);
        } catch (abortError) {
          console.error(
            "[FileSystemService] writable abort failed",
            abortError,
          );
        }
      }
      throw error;
    }
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
   * @param {unknown} handle
   */
  static saveDirectoryHandle(key, handle) {
    return this._getInstance().saveDirectoryHandle(key, handle);
  }

  /** @param {IDBValidKey} key */
  static getDirectoryHandle(key) {
    return this._getInstance().getDirectoryHandle(key);
  }

  /**
   * @param {unknown} dirHandle
   * @param {unknown} relativePath
   * @param {FileSystemWriteChunkType} contents
   */
  static writeFile(dirHandle, relativePath, contents) {
    return this._getInstance().writeFile(dirHandle, relativePath, contents);
  }
}

// Preserve named functional exports used across the codebase and tests
/**
 * @param {IDBValidKey} key
 * @param {unknown} handle
 */
export const saveDirectoryHandle = (key, handle) =>
  FileSystemService.saveDirectoryHandle(key, handle);
/** @param {IDBValidKey} key */
export const getDirectoryHandle = (key) =>
  FileSystemService.getDirectoryHandle(key);
/**
 * @param {unknown} dirHandle
 * @param {unknown} relativePath
 * @param {FileSystemWriteChunkType} contents
 */
export const writeFile = (dirHandle, relativePath, contents) =>
  FileSystemService.writeFile(dirHandle, relativePath, contents);
