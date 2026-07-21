/**
 * @typedef {'createWritable' | 'write' | 'close' | 'abort'} FailurePhase
 * @typedef {{ phase: FailurePhase, path: string, error: unknown }} ScheduledFailure
 */

/** @param {string} path */
function notFound(path) {
  return new DOMException(
    `File System Access entry not found: ${path}`,
    "NotFoundError",
  );
}

/**
 * A File System Access test double whose visible tree contains only committed
 * bytes, apart from the empty entry created when a missing file handle is
 * requested with creation enabled. Each writable stages its content
 * independently, so a rejected write/close followed by abort leaves an
 * existing file untouched.
 *
 * @param {{ seed?: Record<string, string> }} [options]
 */
export function createCommittedTreeFileSystem({ seed = {} } = {}) {
  const files = new Map(Object.entries(seed));
  const directories = new Set([""]);
  /** @type {Array<{ path: string, contents: string }>} */
  const commits = [];
  /** @type {Array<{ phase: FailurePhase, path: string, reason?: unknown }>} */
  const effects = [];
  /** @type {ScheduledFailure[]} */
  const failures = [];

  /** @param {FailurePhase} phase @param {string} path */
  function consumeFailure(phase, path) {
    const index = failures.findIndex(
      (failure) => failure.phase === phase && failure.path === path,
    );
    if (index < 0) return;
    const [{ error }] = failures.splice(index, 1);
    throw error;
  }

  /** @param {string} path */
  function createFileHandle(path) {
    const name = path.split("/").at(-1) || path;
    return {
      kind: "file",
      name,
      async createWritable() {
        consumeFailure("createWritable", path);
        let staged = "";
        let settled = false;

        return {
          async write(contents) {
            if (settled)
              throw new DOMException("Writable is closed", "InvalidStateError");
            effects.push({ phase: "write", path });
            consumeFailure("write", path);
            staged = String(contents);
          },
          async close() {
            if (settled)
              throw new DOMException("Writable is closed", "InvalidStateError");
            effects.push({ phase: "close", path });
            consumeFailure("close", path);
            settled = true;
            files.set(path, staged);
            commits.push({ path, contents: staged });
          },
          async abort(reason) {
            effects.push({ phase: "abort", path, reason });
            consumeFailure("abort", path);
            settled = true;
          },
        };
      },
      async getFile() {
        if (!files.has(path)) throw notFound(path);
        const content = files.get(path) || "";
        return {
          size: new TextEncoder().encode(content).byteLength,
          text: async () => content,
        };
      },
    };
  }

  /** @param {string} prefix @param {string} name */
  function createDirectoryHandle(prefix, name) {
    return {
      kind: "directory",
      name,
      async getDirectoryHandle(part, { create = false } = {}) {
        const path = `${prefix}${part}/`;
        if (!directories.has(path)) {
          if (!create) throw notFound(path);
          directories.add(path);
        }
        return createDirectoryHandle(path, part);
      },
      async getFileHandle(fileName, { create = false } = {}) {
        const path = `${prefix}${fileName}`;
        if (!files.has(path)) {
          if (!create) throw notFound(path);
          // Creating a file handle creates an empty committed file. Subsequent
          // writable changes still remain invisible until close succeeds.
          files.set(path, "");
        }
        return createFileHandle(path);
      },
      async queryPermission() {
        return "granted";
      },
      async requestPermission() {
        return "granted";
      },
    };
  }

  return {
    root: createDirectoryHandle("", "root"),
    /** @param {FailurePhase} phase @param {string} path @param {unknown} error */
    failNext(phase, path, error) {
      failures.push({ phase, path, error });
    },
    clearHistory() {
      commits.length = 0;
      effects.length = 0;
    },
    getCommits() {
      return commits.map((commit) => ({ ...commit }));
    },
    getEffects() {
      return effects.map((effect) => ({ ...effect }));
    },
    getPaths() {
      return [...files.keys()].sort();
    },
    snapshot() {
      return Object.fromEntries(
        [...files.entries()].sort(([a], [b]) => a.localeCompare(b)),
      );
    },
    /** @param {string} path */
    async readText(path) {
      if (!files.has(path)) throw notFound(path);
      return files.get(path) || "";
    },
  };
}
