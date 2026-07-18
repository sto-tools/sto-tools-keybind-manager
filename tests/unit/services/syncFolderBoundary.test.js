import { describe, expect, it, vi } from "vitest";

import {
  decodeSyncDirectoryCapability,
  decodeSyncDirectoryPermissionEffects,
  ensureSyncDirectoryPermission,
  probeSyncProjectFile,
} from "../../../src/js/components/services/syncFolderBoundary.js";
import { MAX_PROJECT_JSON_BYTES } from "../../../src/js/components/services/jsonDataBoundary.js";

function projectText(data = {}) {
  return JSON.stringify({ type: "project", data });
}

function createDirectory(overrides = {}) {
  return {
    kind: "directory",
    name: "sync",
    getFileHandle: vi.fn(),
    getDirectoryHandle: vi.fn(),
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    ...overrides,
  };
}

function createProjectFileHandle(content, overrides = {}) {
  const size = new TextEncoder().encode(content).byteLength;
  const file = {
    size,
    text: vi.fn().mockResolvedValue(content),
  };
  return {
    kind: "file",
    name: "project.json",
    getFile: vi.fn().mockResolvedValue(file),
    file,
    ...overrides,
  };
}

function decodeDirectory(raw) {
  const decoded = decodeSyncDirectoryCapability(raw);
  expect(decoded.success).toBe(true);
  if (!decoded.success) throw new Error("expected a valid directory");
  return decoded.value;
}

describe("sync folder runtime boundary", () => {
  describe("decodeSyncDirectoryCapability", () => {
    it.each([
      ["null", null],
      ["array", []],
      ["wrong kind", createDirectory({ kind: "file" })],
      ["missing name", createDirectory({ name: undefined })],
      ["empty name", createDirectory({ name: "" })],
      ["missing getFileHandle", createDirectory({ getFileHandle: undefined })],
      [
        "missing getDirectoryHandle",
        createDirectory({ getDirectoryHandle: undefined }),
      ],
    ])("rejects a %s value", (_label, raw) => {
      expect(decodeSyncDirectoryCapability(raw)).toEqual({
        success: false,
        error: "invalid_directory_capability",
      });
    });

    it("rejects throwing capability properties without leaking the exception", () => {
      const raw = createDirectory();
      Object.defineProperty(raw, "name", {
        get() {
          throw new Error("hostile getter");
        },
      });

      expect(decodeSyncDirectoryCapability(raw)).toEqual({
        success: false,
        error: "invalid_directory_capability",
      });
    });

    it("binds both filesystem methods to their external receiver", async () => {
      const raw = createDirectory({
        marker: "raw receiver",
        getFileHandle() {
          return Promise.resolve(this.marker);
        },
        getDirectoryHandle() {
          return Promise.resolve(this.marker);
        },
      });
      const directory = decodeDirectory(raw);

      expect(await directory.getFileHandle("project.json")).toBe(
        "raw receiver",
      );
      expect(await directory.getDirectoryHandle("nested")).toBe("raw receiver");
      expect(directory.raw).toBe(raw);
      expect(directory).not.toHaveProperty("queryPermission");
    });
  });

  describe("permission effects", () => {
    it("decodes permission methods separately and binds their receiver", async () => {
      const raw = createDirectory({
        marker: "raw receiver",
        queryPermission() {
          return Promise.resolve(this.marker);
        },
        requestPermission() {
          return Promise.resolve(this.marker);
        },
      });
      const decoded = decodeSyncDirectoryPermissionEffects(raw);

      expect(decoded.success).toBe(true);
      if (!decoded.success) throw new Error("expected permission effects");
      expect(await decoded.value.queryPermission({ mode: "read" })).toBe(
        "raw receiver",
      );
      expect(await decoded.value.requestPermission({ mode: "readwrite" })).toBe(
        "raw receiver",
      );
    });

    it.each([
      [null],
      [createDirectory({ queryPermission: undefined })],
      [createDirectory({ requestPermission: undefined })],
    ])("rejects unavailable permission effects", (raw) => {
      expect(decodeSyncDirectoryPermissionEffects(raw)).toEqual({
        success: false,
        error: "permission_api_unavailable",
      });
    });

    it("returns immediately when queried permission is granted", async () => {
      const effects = {
        queryPermission: vi.fn().mockResolvedValue("granted"),
        requestPermission: vi.fn(),
      };

      await expect(ensureSyncDirectoryPermission(effects)).resolves.toEqual({
        success: true,
        state: "granted",
      });
      expect(effects.queryPermission).toHaveBeenCalledWith({
        mode: "readwrite",
      });
      expect(effects.requestPermission).not.toHaveBeenCalled();
    });

    it("requests permission after a prompt and preserves an explicit denial", async () => {
      const effects = {
        queryPermission: vi.fn().mockResolvedValue("prompt"),
        requestPermission: vi.fn().mockResolvedValue("denied"),
      };

      await expect(
        ensureSyncDirectoryPermission(effects, "read"),
      ).resolves.toEqual({
        success: false,
        error: "permission_denied",
        state: "denied",
      });
      expect(effects.requestPermission).toHaveBeenCalledWith({ mode: "read" });
    });

    it.each([
      ["query", "unexpected"],
      ["request", undefined],
    ])("rejects an invalid %s result", async (operation, value) => {
      const effects = {
        queryPermission: vi
          .fn()
          .mockResolvedValue(operation === "query" ? value : "prompt"),
        requestPermission: vi.fn().mockResolvedValue(value),
      };

      await expect(ensureSyncDirectoryPermission(effects)).resolves.toEqual({
        success: false,
        error: "invalid_permission_result",
        operation,
        value,
      });
    });

    it.each(["query", "request"])(
      "keeps a thrown %s effect distinct from denial",
      async (operation) => {
        const failure = new DOMException("permission API failed", "AbortError");
        const effects = {
          queryPermission:
            operation === "query"
              ? vi.fn().mockRejectedValue(failure)
              : vi.fn().mockResolvedValue("prompt"),
          requestPermission: vi.fn().mockRejectedValue(failure),
        };

        await expect(ensureSyncDirectoryPermission(effects)).resolves.toEqual({
          success: false,
          error: "permission_api_failed",
          operation,
          cause: failure,
        });
      },
    );
  });

  describe("probeSyncProjectFile", () => {
    it("returns an absent result only for a DOMException NotFoundError", async () => {
      const directory = decodeDirectory(
        createDirectory({
          getFileHandle: vi
            .fn()
            .mockRejectedValue(new DOMException("missing", "NotFoundError")),
        }),
      );

      await expect(probeSyncProjectFile(directory)).resolves.toEqual({
        success: true,
        state: "absent",
      });
    });

    it.each([
      [new Error("missing"), "project_file_read_failed"],
      [{ name: "NotFoundError" }, "project_file_read_failed"],
      [
        new DOMException("denied", "NotAllowedError"),
        "project_file_access_denied",
      ],
      [
        new DOMException("unsafe", "SecurityError"),
        "project_file_access_denied",
      ],
    ])("does not mask a rejected lookup as absence", async (cause, error) => {
      const directory = decodeDirectory(
        createDirectory({
          getFileHandle: vi.fn().mockRejectedValue(cause),
        }),
      );

      await expect(probeSyncProjectFile(directory)).resolves.toEqual({
        success: false,
        error,
        operation: "get_file_handle",
        cause,
      });
    });

    it.each([
      [null],
      [{ kind: "directory", name: "project.json", getFile: vi.fn() }],
      [{ kind: "file", name: "", getFile: vi.fn() }],
      [{ kind: "file", name: "project.json" }],
    ])("rejects a malformed file handle", async (rawFileHandle) => {
      const directory = decodeDirectory(
        createDirectory({
          getFileHandle: vi.fn().mockResolvedValue(rawFileHandle),
        }),
      );

      await expect(probeSyncProjectFile(directory)).resolves.toEqual({
        success: false,
        error: "invalid_project_file_capability",
        path: "handle",
      });
    });

    it.each([
      [null],
      [{ size: -1, text: vi.fn() }],
      [{ size: 1.5, text: vi.fn() }],
      [{ size: 1 }],
    ])("rejects a malformed readable file", async (rawFile) => {
      const fileHandle = createProjectFileHandle(projectText(), {
        getFile: vi.fn().mockResolvedValue(rawFile),
      });
      const directory = decodeDirectory(
        createDirectory({
          getFileHandle: vi.fn().mockResolvedValue(fileHandle),
        }),
      );

      await expect(probeSyncProjectFile(directory)).resolves.toEqual({
        success: false,
        error: "invalid_project_file_capability",
        path: "file",
      });
    });

    it.each([
      ["get_file", new Error("disk unavailable")],
      ["get_file", new DOMException("denied", "NotAllowedError")],
      ["read_text", new Error("read unavailable")],
      ["read_text", new DOMException("unsafe", "SecurityError")],
    ])("classifies an effect failure during %s", async (operation, cause) => {
      const content = projectText();
      const fileHandle = createProjectFileHandle(content);
      if (operation === "get_file") {
        fileHandle.getFile.mockRejectedValue(cause);
      } else {
        fileHandle.file.text.mockRejectedValue(cause);
      }
      const directory = decodeDirectory(
        createDirectory({
          getFileHandle: vi.fn().mockResolvedValue(fileHandle),
        }),
      );

      await expect(probeSyncProjectFile(directory)).resolves.toEqual({
        success: false,
        error:
          cause instanceof DOMException
            ? "project_file_access_denied"
            : "project_file_read_failed",
        operation,
        cause,
      });
    });

    it("does not read a file whose declared size exceeds the limit", async () => {
      const fileHandle = createProjectFileHandle(projectText());
      fileHandle.file.size = MAX_PROJECT_JSON_BYTES + 1;
      const directory = decodeDirectory(
        createDirectory({
          getFileHandle: vi.fn().mockResolvedValue(fileHandle),
        }),
      );

      await expect(probeSyncProjectFile(directory)).resolves.toEqual({
        success: false,
        error: "project_file_too_large",
        source: "file.size",
        size: MAX_PROJECT_JSON_BYTES + 1,
        limit: MAX_PROJECT_JSON_BYTES,
      });
      expect(fileHandle.file.text).not.toHaveBeenCalled();
    });

    it("checks actual UTF-8 content even when the declared size is small", async () => {
      const content = `"${"é".repeat(MAX_PROJECT_JSON_BYTES / 2)}"`;
      const fileHandle = createProjectFileHandle(content);
      fileHandle.file.size = 1;
      const directory = decodeDirectory(
        createDirectory({
          getFileHandle: vi.fn().mockResolvedValue(fileHandle),
        }),
      );

      const result = await probeSyncProjectFile(directory);

      expect(result).toMatchObject({
        success: false,
        error: "project_file_too_large",
        source: "file.text()",
        limit: MAX_PROJECT_JSON_BYTES,
      });
      if (result.error === "project_file_too_large") {
        expect(result.size).toBeGreaterThan(MAX_PROJECT_JSON_BYTES);
      }
    });

    it("rejects a non-string text result", async () => {
      const fileHandle = createProjectFileHandle(projectText());
      fileHandle.file.text.mockResolvedValue({ type: "project" });
      const directory = decodeDirectory(
        createDirectory({
          getFileHandle: vi.fn().mockResolvedValue(fileHandle),
        }),
      );

      await expect(probeSyncProjectFile(directory)).resolves.toEqual({
        success: false,
        error: "invalid_project_file_capability",
        path: "file.text()",
      });
    });

    it.each([
      [
        "invalid JSON",
        '{"type":"project"',
        { success: false, error: "import_failed_invalid_json" },
      ],
      [
        "invalid project data",
        JSON.stringify({ type: "other", data: {} }),
        {
          success: false,
          error: "invalid_project_file",
          params: { path: "$.type" },
        },
      ],
    ])("returns a typed failure for %s", async (_label, content, decode) => {
      const fileHandle = createProjectFileHandle(content);
      const directory = decodeDirectory(
        createDirectory({
          getFileHandle: vi.fn().mockResolvedValue(fileHandle),
        }),
      );

      await expect(probeSyncProjectFile(directory)).resolves.toEqual({
        success: false,
        error: "invalid_project",
        decode,
      });
    });

    it("returns only detached canonical project data for a valid file", async () => {
      const content = projectText({
        currentProfile: "alpha",
        settings: { autoSync: true },
      });
      const fileHandle = createProjectFileHandle(content);
      const raw = createDirectory({
        marker: "directory receiver",
        getFileHandle(name, options) {
          if (this.marker !== "directory receiver") {
            throw new Error("wrong directory receiver");
          }
          expect({ name, options }).toEqual({
            name: "project.json",
            options: { create: false },
          });
          return Promise.resolve(fileHandle);
        },
      });

      await expect(probeSyncProjectFile(decodeDirectory(raw))).resolves.toEqual(
        {
          success: true,
          state: "present",
          value: {
            type: "project",
            data: {
              currentProfile: "alpha",
              settings: { autoSync: true },
            },
          },
          content,
          fileName: "project.json",
        },
      );
    });
  });
});
