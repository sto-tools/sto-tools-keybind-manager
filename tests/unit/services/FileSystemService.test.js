import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import FileSystemService from "../../../src/js/components/services/FileSystemService.js";
import { createServiceFixture } from "../../fixtures/index.js";

/**
 * Unit tests – FileSystemService interacting with the in-memory FS fixture
 */

describe("FileSystemService", () => {
  let fixture, fsService, rootDir;
  let databaseSequence = 0;

  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: true });
    rootDir = fixture.rootDir;
    fsService = new FileSystemService({
      eventBus: fixture.eventBus,
      dbName: `file-system-service-test-${databaseSequence++}`,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fixture.destroy();
  });

  it("saveDirectoryHandle / getDirectoryHandle round-trip", async () => {
    await fsService.saveDirectoryHandle("sync-folder", rootDir);
    const handle = await fsService.getDirectoryHandle("sync-folder");
    expect(handle).toBe(rootDir);
  });

  it("deleteDirectoryHandle removes a saved handle", async () => {
    await fsService.saveDirectoryHandle("delete-folder", rootDir);

    await fsService.deleteDirectoryHandle("delete-folder");

    await expect(
      fsService.getDirectoryHandle("delete-folder"),
    ).resolves.toBeNull();
  });

  it("deleteDirectoryHandle is a no-op when no prior handle exists", async () => {
    await expect(
      fsService.deleteDirectoryHandle("missing-folder"),
    ).resolves.toBeUndefined();
    await expect(
      fsService.getDirectoryHandle("missing-folder"),
    ).resolves.toBeNull();
  });

  it("can restore a captured prior handle after replacing it", async () => {
    const replacement = globalThis.createMockDirectoryHandle("replacement");
    await fsService.saveDirectoryHandle("restore-folder", rootDir);
    const prior = await fsService.getDirectoryHandle("restore-folder");

    await fsService.saveDirectoryHandle("restore-folder", replacement);
    await fsService.saveDirectoryHandle("restore-folder", prior);

    await expect(fsService.getDirectoryHandle("restore-folder")).resolves.toBe(
      rootDir,
    );
  });

  it("can remove a replacement when there was no prior handle", async () => {
    const replacement = globalThis.createMockDirectoryHandle("replacement");
    await fsService.saveDirectoryHandle("new-folder", replacement);

    await fsService.deleteDirectoryHandle("new-folder");

    await expect(
      fsService.getDirectoryHandle("new-folder"),
    ).resolves.toBeNull();
  });

  it("atomically begins and completes a durable sync directory transition", async () => {
    const replacement = globalThis.createMockDirectoryHandle("replacement");

    await expect(fsService.getSyncDirectoryState()).resolves.toEqual({
      handle: null,
      transitionPending: false,
    });
    await fsService.beginSyncDirectoryTransition(replacement);
    await expect(fsService.getSyncDirectoryState()).resolves.toEqual({
      handle: replacement,
      transitionPending: true,
    });

    await fsService.completeSyncDirectoryTransition();

    await expect(fsService.getSyncDirectoryState()).resolves.toEqual({
      handle: replacement,
      transitionPending: false,
    });
  });

  it("treats every stored transition marker value as pending", async () => {
    await fsService.saveDirectoryHandle(
      "sync-folder-transition-pending",
      false,
    );

    await expect(fsService.getSyncDirectoryState()).resolves.toEqual({
      handle: null,
      transitionPending: true,
    });
  });

  it("treats an undefined transition marker record as pending", async () => {
    const { db } = createDatabaseDouble({
      initialEntries: [["sync-folder-transition-pending", undefined]],
    });
    vi.spyOn(fsService, "openDB").mockResolvedValue(db);

    await expect(fsService.getSyncDirectoryState()).resolves.toEqual({
      handle: null,
      transitionPending: true,
    });
  });

  it("restores a previously clean sync directory state atomically", async () => {
    const prior = globalThis.createMockDirectoryHandle("prior");
    const replacement = globalThis.createMockDirectoryHandle("replacement");
    await fsService.saveDirectoryHandle("sync-folder", prior);
    const previousState = await fsService.getSyncDirectoryState();
    await fsService.beginSyncDirectoryTransition(replacement);

    await fsService.restoreSyncDirectoryState(previousState);

    await expect(fsService.getSyncDirectoryState()).resolves.toEqual({
      handle: prior,
      transitionPending: false,
    });
  });

  it("restores a previously dirty sync directory state atomically", async () => {
    const prior = globalThis.createMockDirectoryHandle("prior");
    const replacement = globalThis.createMockDirectoryHandle("replacement");
    await fsService.beginSyncDirectoryTransition(prior);
    const previousState = await fsService.getSyncDirectoryState();
    await fsService.beginSyncDirectoryTransition(replacement);

    await fsService.restoreSyncDirectoryState(previousState);

    await expect(fsService.getSyncDirectoryState()).resolves.toEqual({
      handle: prior,
      transitionPending: true,
    });
  });

  it("restores a clean state with no prior handle", async () => {
    const replacement = globalThis.createMockDirectoryHandle("replacement");
    const previousState = await fsService.getSyncDirectoryState();
    await fsService.beginSyncDirectoryTransition(replacement);

    await fsService.restoreSyncDirectoryState(previousState);

    await expect(fsService.getSyncDirectoryState()).resolves.toEqual({
      handle: null,
      transitionPending: false,
    });
  });

  it.each(["save", "get", "delete"])(
    "closes its database connection after a successful %s operation",
    async (operation) => {
      const { db, close } = createDatabaseDouble();
      vi.spyOn(fsService, "openDB").mockResolvedValue(db);

      await runHandleOperation(fsService, operation, rootDir);

      expect(close).toHaveBeenCalledOnce();
    },
  );

  it.each(["state", "begin", "complete", "restore"])(
    "closes its database connection after a successful sync-transition %s operation",
    async (operation) => {
      const { db, close } = createDatabaseDouble();
      vi.spyOn(fsService, "openDB").mockResolvedValue(db);

      await runSyncTransitionOperation(fsService, operation, rootDir);

      expect(close).toHaveBeenCalledOnce();
    },
  );

  it.each(["state", "begin", "complete", "restore"])(
    "closes its database connection after a failed sync-transition %s operation",
    async (operation) => {
      const { db, close, error } = createDatabaseDouble({
        failedOperation: operation,
      });
      vi.spyOn(fsService, "openDB").mockResolvedValue(db);

      await expect(
        runSyncTransitionOperation(fsService, operation, rootDir),
      ).rejects.toBe(error);
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it.each(["begin", "restore"])(
    "does not partially apply a failed atomic sync-transition %s operation",
    async (operation) => {
      const prior = globalThis.createMockDirectoryHandle("prior");
      const { db, values } = createDatabaseDouble({
        failedOperation: operation,
        initialEntries: [
          ["sync-folder", prior],
          ["sync-folder-transition-pending", "existing-marker"],
        ],
      });
      vi.spyOn(fsService, "openDB").mockResolvedValue(db);

      await expect(
        runSyncTransitionOperation(fsService, operation, rootDir),
      ).rejects.toBeDefined();
      expect(values).toEqual(
        new Map([
          ["sync-folder", prior],
          ["sync-folder-transition-pending", "existing-marker"],
        ]),
      );
    },
  );

  it.each(["save", "get", "delete"])(
    "closes its database connection after a failed %s operation",
    async (operation) => {
      const { db, close, error } = createDatabaseDouble({
        failedOperation: operation,
      });
      vi.spyOn(fsService, "openDB").mockResolvedValue(db);

      await expect(
        runHandleOperation(fsService, operation, rootDir),
      ).rejects.toBe(error);
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it("writeFile should create nested path and persist contents", async () => {
    const content = "Hello World";
    await fsService.writeFile(rootDir, "exports/logs/output.txt", content);

    const stored = await fixture.fsReadText("exports/logs/output.txt");
    expect(stored).toBe(content);
  });

  it.each([
    "",
    "/project.json",
    "nested/",
    "./project.json",
    "../project.json",
    "nested//project.json",
  ])(
    "rejects the unsafe relative path %j before touching the directory",
    async (relativePath) => {
      const getFileHandle = vi.spyOn(rootDir, "getFileHandle");
      const getDirectoryHandle = vi.spyOn(rootDir, "getDirectoryHandle");

      await expect(
        fsService.writeFile(rootDir, relativePath, "content"),
      ).rejects.toThrow("Invalid file path");

      expect(getFileHandle).not.toHaveBeenCalled();
      expect(getDirectoryHandle).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed directory and file capabilities", async () => {
    await expect(
      fsService.writeFile({ name: "partial" }, "project.json", "content"),
    ).rejects.toThrow("Invalid directory capability");

    const directory = {
      kind: "directory",
      name: "root",
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn().mockResolvedValue({
        kind: "file",
        name: "project.json",
      }),
    };
    await expect(
      fsService.writeFile(directory, "project.json", "content"),
    ).rejects.toThrow("Invalid file capability");
  });

  it("rejects a malformed writable before attempting a write", async () => {
    const directory = {
      kind: "directory",
      name: "root",
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn().mockResolvedValue({
        kind: "file",
        name: "project.json",
        createWritable: vi.fn().mockResolvedValue({ write: vi.fn() }),
      }),
    };

    await expect(
      fsService.writeFile(directory, "project.json", "content"),
    ).rejects.toThrow("Invalid writable capability");
  });

  it("aborts a writable and preserves the primary write failure", async () => {
    const writeError = new Error("disk full");
    const abort = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    const directory = createWritableDirectory({
      write: vi.fn().mockRejectedValue(writeError),
      close,
      abort,
    });

    await expect(
      fsService.writeFile(directory, "project.json", "content"),
    ).rejects.toBe(writeError);
    expect(abort).toHaveBeenCalledWith(writeError);
    expect(close).not.toHaveBeenCalled();
  });

  it("aborts a writable and preserves the primary close failure", async () => {
    const closeError = new Error("commit failed");
    const abort = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn().mockResolvedValue(undefined);
    const directory = createWritableDirectory({
      write,
      close: vi.fn().mockRejectedValue(closeError),
      abort,
    });

    await expect(
      fsService.writeFile(directory, "project.json", "content"),
    ).rejects.toBe(closeError);
    expect(write).toHaveBeenCalledWith("content");
    expect(abort).toHaveBeenCalledWith(closeError);
  });

  it("preserves the primary failure when abort also rejects", async () => {
    const writeError = new Error("disk full");
    const abortError = new Error("abort failed");
    const abort = vi.fn().mockRejectedValue(abortError);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const directory = createWritableDirectory({
      write: vi.fn().mockRejectedValue(writeError),
      close: vi.fn(),
      abort,
    });

    await expect(
      fsService.writeFile(directory, "project.json", "content"),
    ).rejects.toBe(writeError);
    expect(abort).toHaveBeenCalledWith(writeError);
    expect(consoleError).toHaveBeenCalledWith(
      "[FileSystemService] writable abort failed",
      abortError,
    );
  });
});

function createWritableDirectory(writable) {
  return {
    kind: "directory",
    name: "root",
    getDirectoryHandle: vi.fn(),
    getFileHandle: vi.fn().mockResolvedValue({
      kind: "file",
      name: "project.json",
      createWritable: vi.fn().mockResolvedValue(writable),
    }),
  };
}

function createDatabaseDouble({
  failedOperation = null,
  initialEntries = null,
} = {}) {
  const error = new Error("simulated IndexedDB failure");
  const close = vi.fn();
  const values = new Map(
    initialEntries || [
      ["connection-test", globalThis.createMockDirectoryHandle("stored")],
    ],
  );

  const db = {
    close,
    transaction(_storeName, mode) {
      const pendingUpdates = [];
      let completionScheduled = false;
      const tx = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore() {
          return {
            put(nextValue, key) {
              pendingUpdates.push(() => values.set(key, nextValue));
              scheduleWriteCompletion();
            },
            get(key) {
              const request = {
                result: undefined,
                error: null,
                onsuccess: null,
                onerror: null,
              };
              queueMicrotask(() => {
                if (failedOperation === "get" || failedOperation === "state") {
                  request.error = error;
                  request.onerror?.();
                  return;
                }
                request.result = values.get(key);
                request.onsuccess?.();
              });
              return request;
            },
            getKey(key) {
              const request = {
                result: undefined,
                error: null,
                onsuccess: null,
                onerror: null,
              };
              queueMicrotask(() => {
                if (failedOperation === "get" || failedOperation === "state") {
                  request.error = error;
                  request.onerror?.();
                  return;
                }
                request.result = values.has(key) ? key : undefined;
                request.onsuccess?.();
              });
              return request;
            },
            delete(key) {
              pendingUpdates.push(() => values.delete(key));
              scheduleWriteCompletion();
            },
          };
        },
      };

      function scheduleWriteCompletion() {
        if (completionScheduled || mode !== "readwrite") return;
        completionScheduled = true;
        queueMicrotask(() => {
          if (
            failedOperation !== null &&
            failedOperation !== "get" &&
            failedOperation !== "state"
          ) {
            tx.error = error;
            tx.onerror?.();
            return;
          }
          pendingUpdates.forEach((update) => update());
          tx.oncomplete?.();
        });
      }

      return tx;
    },
  };

  return { db, close, error, values };
}

function runHandleOperation(service, operation, handle) {
  if (operation === "save") {
    return service.saveDirectoryHandle("connection-test", handle);
  }
  if (operation === "get") {
    return service.getDirectoryHandle("connection-test");
  }
  return service.deleteDirectoryHandle("connection-test");
}

function runSyncTransitionOperation(service, operation, handle) {
  if (operation === "state") return service.getSyncDirectoryState();
  if (operation === "begin") {
    return service.beginSyncDirectoryTransition(handle);
  }
  if (operation === "complete") {
    return service.completeSyncDirectoryTransition();
  }
  return service.restoreSyncDirectoryState({
    handle,
    transitionPending: false,
  });
}
