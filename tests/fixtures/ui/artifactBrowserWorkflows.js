import { expect, vi } from "vitest";
import { withApplication } from "./applicationRuntime.js";
import en from "../../../src/i18n/en.json";

// Native OPFS handles are cloneable by actual IndexedDB. Function-valued fake
// handles would only exercise DataCloneError, not production folder selection.
export async function artifactParity() {
  await withApplication(async (app) => {
    const NativeDate = app.window.Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : ["2026-07-18T01:02:03.000Z"]));
      }
      static now() {
        return NativeDate.parse("2026-07-18T01:02:03.000Z");
      }
    }
    app.window.Date = FixedDate;
    const opfs = await app.window.navigator.storage.getDirectory();
    const directory = await opfs.getDirectoryHandle(
      `artifact-parity-${Date.now()}`,
      { create: true },
    );
    app.window.showDirectoryPicker = vi.fn().mockResolvedValue(directory);
    try {
      app.element("#preferencesBtn").click();
      app.element("#setSyncFolderBtn").click();
      await vi.waitFor(() =>
        expect(app.settings().syncFolderName).toBe(directory.name),
      );
      app
        .element(
          '#preferencesModal .modal-close[data-modal="preferencesModal"]',
        )
        .click();
      let downloadedBlob;
      let name;
      vi.spyOn(app.window.URL, "createObjectURL").mockImplementation((blob) => {
        downloadedBlob = blob;
        return "blob:task11-artifact";
      });
      vi.spyOn(app.window.URL, "revokeObjectURL").mockImplementation(() => {});
      vi.spyOn(
        app.window.HTMLAnchorElement.prototype,
        "click",
      ).mockImplementation(function () {
        name = this.download;
      });
      app.element("#backupMenuBtn").click();
      app.element("#saveProjectBtn").click();
      await vi.waitFor(() => expect(downloadedBlob).toBeTruthy());
      expect(name).toBe("STO_Tools_Backup_2026-07-18.json");
      const downloaded = await downloadedBlob.text();
      const acceptedSettings = app.settings();
      const acceptedRoot = app.root();
      let settingsChangedDuringProjection = false;
      const createWritable =
        app.window.FileSystemFileHandle.prototype.createWritable;
      vi.spyOn(
        app.window.FileSystemFileHandle.prototype,
        "createWritable",
      ).mockImplementation(async function (...args) {
        const stream = await createWritable.apply(this, args);
        if (this.name !== "project.json" && !settingsChangedDuringProjection) {
          const write = stream.write.bind(stream);
          vi.spyOn(stream, "write").mockImplementation(async (contents) => {
            if (!settingsChangedDuringProjection) {
              settingsChangedDuringProjection = true;
              app.element("#themeToggleBtn").click();
              await vi.waitFor(() =>
                expect(app.settings().theme).not.toBe(acceptedSettings.theme),
              );
            }
            return write(contents);
          });
        }
        return stream;
      });
      app.element("#syncNowBtn").click();
      await vi.waitFor(
        () => {
          expect(
            [
              ...app.document.querySelectorAll(".toast-success .toast-message"),
            ].map((node) => node.textContent),
          ).toContain(en.project_synced_successfully);
        },
        { timeout: 10000 },
      );
      let synced;
      await vi.waitFor(
        async () => {
          const handle = await directory.getFileHandle("project.json");
          synced = await (await handle.getFile()).text();
          expect(synced).toBe(downloaded);
        },
        { timeout: 10000 },
      );
      expect(settingsChangedDuringProjection).toBe(true);
      expect(app.settings().theme).not.toBe(acceptedSettings.theme);
      expect(JSON.parse(downloaded)).toEqual({
        version: expect.any(String),
        exported: "2026-07-18T01:02:03.000Z",
        type: "project",
        data: {
          profiles: acceptedRoot.profiles,
          settings: acceptedSettings,
          currentProfile: "captain",
        },
      });
      const profileDirectory = await directory.getDirectoryHandle("Captain");
      expect(
        await (
          await (
            await profileDirectory.getFileHandle("Captain_aliases.txt")
          ).getFile()
        ).text(),
      ).toBeTypeOf("string");
      expect(app.root()).not.toHaveProperty("settings");
      expect(
        app
          .diagnostics()
          .domains.find((row) => row.domain === "sync-capability"),
      ).toMatchObject({ portRegistered: true, adapter: "FileSystemService" });
    } finally {
      app.window.Date = NativeDate;
      await vi.waitFor(
        async () => {
          await opfs.removeEntry(directory.name, { recursive: true });
        },
        { timeout: 10000 },
      );
    }
  });
}
