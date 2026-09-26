import { runtime } from "../fixtures/ui/applicationRuntime.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";
import { readPreferencesState } from "../fixtures/ui/preferencesState.js";

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
                  await onFirstProjectionWrite?.();
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
    const applicationRuntime = runtime();
    const bus = applicationRuntime.eventBus;
    const dataCoordinator = applicationRuntime.dataCoordinator;
    expect(bus?.hasListeners("project:save")).toBe(true);
    expect(bus?.hasListeners("rpc:export:sync-to-folder")).toBe(true);
    expect(applicationRuntime).not.toHaveProperty("storageService");
    expect(applicationRuntime).not.toHaveProperty("projectRepository");
    expect(dataCoordinator).toBeTruthy();
    if (!bus || !dataCoordinator) return;

    const dataSnapshot = dataCoordinator.getCurrentState();
    expect(dataSnapshot.ready).toBe(true);
    let settingsSnapshot;

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

    try {
      await bus.emit("project:save", null, { synchronous: true });
      expect(downloadedBlob).toBeInstanceOf(Blob);
      expect(downloadedFileName).toBe("STO_Tools_Backup_2026-07-18.json");

      const downloadedText = await downloadedBlob.text();
      settingsSnapshot = (await readPreferencesState(bus)).settings;
      const changedSettings = {
        ...settingsSnapshot,
        bindToAliasMode: !settingsSnapshot.bindToAliasMode,
        bindsetsEnabled: !settingsSnapshot.bindsetsEnabled,
        translateGeneratedMessages:
          !settingsSnapshot.translateGeneratedMessages,
        artifactParityProbe: "changed-during-projection",
      };
      let settingsMutationAccepted = false;
      const directory = createWritableDirectoryFixture({
        onFirstProjectionWrite: async () => {
          settingsMutationAccepted = await request(
            bus,
            "preferences:set-settings",
            changedSettings,
          );
        },
      });

      await request(bus, "export:sync-to-folder", {
        dirHandle: directory.root,
      });

      expect(settingsMutationAccepted).toBe(true);
      expect((await readPreferencesState(bus)).settings).toEqual(
        changedSettings,
      );
      const syncedText = directory.files.get("project.json");
      expect(syncedText).toBe(downloadedText);
      const profile = Object.values(dataSnapshot.profiles).find((candidate) =>
        Object.values(candidate.builds || {}).some(
          (build) => Object.keys(build.keys || {}).length > 0,
        ),
      );
      if (!profile?.name) throw new Error("projected_profile_required");
      const sanitizedName = profile.name.replace(/[^a-zA-Z0-9_-]/g, "_");
      const aliasesText = directory.files.get(
        `${sanitizedName}/${sanitizedName}_aliases.txt`,
      );
      expect(aliasesText).toBeTypeOf("string");
      if (settingsSnapshot.bindToAliasMode) {
        expect(aliasesText).toContain("sto_kb_");
      } else {
        expect(aliasesText).not.toContain("sto_kb_");
      }
      expect(JSON.parse(downloadedText)).toEqual({
        version: expect.any(String),
        exported: "2026-07-18T01:02:03.000Z",
        type: "project",
        data: {
          profiles: dataSnapshot.profiles,
          settings: settingsSnapshot,
          currentProfile: dataSnapshot.currentProfile,
        },
      });
    } finally {
      if (settingsSnapshot) {
        await request(bus, "preferences:set-settings", settingsSnapshot);
      }
    }
  });
});
