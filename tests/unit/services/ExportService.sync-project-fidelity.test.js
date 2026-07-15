import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExportService from "../../../src/js/components/services/ExportService.js";
import ImportService from "../../../src/js/components/services/ImportService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

const goldenProject = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests/fixtures/sync/sync-project-golden.json"),
    "utf8",
  ),
);

const staleRootSettings = {
  theme: "stale-root",
  language: "fr",
  autoSave: true,
};

describe("ExportService sync project fidelity", () => {
  const fixtures = [];
  const services = [];
  const detachResponders = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(goldenProject.exported));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    detachResponders.splice(0).forEach((detach) => detach());
    services.splice(0).forEach((service) => service.destroy());
    fixtures.splice(0).forEach((fixture) => fixture.destroy());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createSource() {
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
          settings: staleRootSettings,
        },
        sto_keybind_settings: structuredClone(goldenProject.data.settings),
      },
    });
    fixtures.push(fixture);

    detachResponders.push(
      respond(fixture.eventBus, "vfx:get-virtual-aliases", () => ({})),
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
    services.push(exporter);
    exporter.init();

    return { fixture, exporter };
  }

  async function exportProject() {
    const { fixture, exporter } = createSource();
    await exporter.syncToFolder(fixture.rootDir);
    return {
      fixture,
      projectText: await fixture.fsReadText("project.json"),
    };
  }

  it("writes the canonical settings record and complete project state to the golden file", async () => {
    const { fixture, projectText } = await exportProject();
    const project = JSON.parse(projectText);

    expect(projectText).toBe(JSON.stringify(goldenProject, null, 2));
    expect(project.data.settings).toEqual(goldenProject.data.settings);
    expect(project.data.settings).not.toEqual(staleRootSettings);
    expect(project.data.profiles).toEqual(goldenProject.data.profiles);
    expect(project.data.currentProfile).toBe(goldenProject.data.currentProfile);
    expect(fixture.storage.getSettings).toHaveBeenCalled();
  });

  it("round-trips the exact synced project through ImportService", async () => {
    const { projectText } = await exportProject();
    const destination = createServiceFixture({
      initialStorageData: {
        sto_keybind_manager: {
          version: "1.0.0",
          currentProfile: null,
          profiles: {},
          settings: { theme: "destination-root" },
        },
        sto_keybind_settings: {
          theme: "dark",
          language: "en",
          autoSave: true,
        },
      },
    });
    fixtures.push(destination);

    const importer = new ImportService({
      eventBus: destination.eventBus,
      storage: destination.storage,
    });
    services.push(importer);
    importer.init();

    const result = await importer.importProjectFile(projectText);

    expect(result).toMatchObject({
      success: true,
      currentProfile: goldenProject.data.currentProfile,
      imported: { profiles: 1, settings: true },
    });
    expect(destination.storage.getAllData().profiles).toEqual(
      goldenProject.data.profiles,
    );
    expect(destination.storage.getAllData().currentProfile).toBe(
      goldenProject.data.currentProfile,
    );
    expect(destination.storage.getSettings()).toEqual(
      goldenProject.data.settings,
    );
  });
});
