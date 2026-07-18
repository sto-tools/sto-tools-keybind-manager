import { afterEach, describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

function createWritableDirectoryFixture({ onFirstProjectionWrite } = {}) {
  const files = new Map();
  let projectionWriteStarted = false;

  function createDirectory(prefix = "", name = "root") {
    const directories = new Map();

    return {
      kind: "directory",
      name,
      async getDirectoryHandle(part, { create = false } = {}) {
        if (!directories.has(part)) {
          if (!create) throw new Error(`Directory not found: ${part}`);
          directories.set(part, createDirectory(`${prefix}${part}/`, part));
        }
        return directories.get(part);
      },
      async getFileHandle(fileName, { create = false } = {}) {
        const path = `${prefix}${fileName}`;
        if (!create && !files.has(path)) {
          throw new Error(`File not found: ${path}`);
        }
        return {
          kind: "file",
          name: fileName,
          async createWritable() {
            return {
              async write(contents) {
                if (path !== "project.json" && !projectionWriteStarted) {
                  projectionWriteStarted = true;
                  onFirstProjectionWrite?.();
                }
                files.set(path, String(contents));
              },
              async close() {},
            };
          },
        };
      },
    };
  }

  return { files, root: createDirectory() };
}

describe("Project artifact checked-bundle parity", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("downloads and syncs byte-identical artifacts from the live owner state", async () => {
    const bus = window.eventBus;
    const storage = window.storageService;
    expect(bus?.hasListeners("project:save")).toBe(true);
    expect(bus?.hasListeners("rpc:export:sync-to-folder")).toBe(true);
    expect(storage).toBeTruthy();
    if (!bus || !storage) return;

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-18T01:02:03.000Z"));

    let downloadedBlob;
    let downloadedFileName;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      downloadedBlob = blob;
      return "blob:project-artifact-test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function () {
        downloadedFileName = this.download;
      },
    );

    await bus.emit("project:save");
    expect(downloadedBlob).toBeInstanceOf(Blob);
    expect(downloadedFileName).toBe("STO_Tools_Backup_2026-07-18.json");

    const downloadedText = await downloadedBlob.text();
    const rootSnapshot = structuredClone(storage.getAllData());
    const settingsSnapshot = structuredClone(storage.getSettings());
    const changedSettings = {
      ...settingsSnapshot,
      artifactParityProbe: "changed-during-projection",
    };
    let settingsMutationAccepted = false;
    const directory = createWritableDirectoryFixture({
      onFirstProjectionWrite: () => {
        settingsMutationAccepted = storage.saveSettings(changedSettings, {
          replace: true,
        });
      },
    });

    try {
      await request(bus, "export:sync-to-folder", {
        dirHandle: directory.root,
      });

      expect(settingsMutationAccepted).toBe(true);
      expect(storage.getSettings()).toEqual(changedSettings);
      const syncedText = directory.files.get("project.json");
      expect(syncedText).toBe(downloadedText);
      expect(JSON.parse(downloadedText)).toEqual({
        version: expect.any(String),
        exported: "2026-07-18T01:02:03.000Z",
        type: "project",
        data: {
          profiles: rootSnapshot.profiles,
          settings: settingsSnapshot,
          currentProfile: rootSnapshot.currentProfile,
        },
      });
    } finally {
      storage.saveSettings(settingsSnapshot, { replace: true });
    }
  });
});
