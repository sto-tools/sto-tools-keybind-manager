import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import ExportService from "../../src/js/components/services/ExportService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import { respond } from "../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../fixtures/index.js";

const goldenProject = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests/fixtures/sync/sync-project-golden.json"),
    "utf8",
  ),
);
const goldenProjectText = JSON.stringify(goldenProject, null, 2);

describe("project artifact producer parity", () => {
  const fixtures = [];
  const services = [];
  const detachFunctions = [];

  afterEach(() => {
    detachFunctions.splice(0).forEach((detach) => detach());
    services.splice(0).forEach((service) => service.destroy());
    fixtures.splice(0).forEach((fixture) => fixture.destroy());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("writes byte-identical downloaded and synced project artifacts from one state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(goldenProject.exported));
    const fixture = createServiceFixture({
      enableFS: true,
      initialStorageData: {
        sto_keybind_manager: {
          version: "1.0.0",
          created: "2024-01-02T03:04:05.000Z",
          lastModified: "2025-01-02T03:04:05.000Z",
          currentProfile: goldenProject.data.currentProfile,
          profiles: structuredClone(goldenProject.data.profiles),
          globalAliases: {},
          settings: { theme: "stale-root" },
        },
        sto_keybind_settings: structuredClone(goldenProject.data.settings),
      },
    });
    fixtures.push(fixture);
    detachFunctions.push(
      respond(
        fixture.eventBus,
        "parser:parse-command-string",
        ({ commandString }) => ({ commands: [{ command: commandString }] }),
      ),
    );

    const exporter = new ExportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    const projectManager = new ProjectManagementService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    services.push(exporter, projectManager);
    exporter.init();
    projectManager.init();

    /** @type {string[]} */
    let downloadedParts = [];
    class CapturedBlob {
      /** @param {string[]} parts @param {{ type?: string }} options */
      constructor(parts = [], options = {}) {
        downloadedParts = [...parts];
        this.size = parts.reduce((size, part) => size + part.length, 0);
        this.type = options.type || "";
      }
    }
    vi.stubGlobal("Blob", CapturedBlob);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await expect(projectManager.backupApplicationState()).resolves.toEqual({
      success: true,
      filename: "STO_Tools_Backup_2025-03-04.json",
    });
    await exporter.syncToFolder(fixture.rootDir);

    const downloadedProjectText = downloadedParts.join("");
    const syncedProjectText = await fixture.fsReadText("project.json");
    expect(downloadedProjectText).toBe(syncedProjectText);
    expect(syncedProjectText).toBe(goldenProjectText);
  });
});
