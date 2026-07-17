import { afterEach, describe, expect, it, vi } from "vitest";
import ImportService from "../../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../../src/js/components/services/ProjectManagementService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("project backup and import profile contract", () => {
  const fixtures = [];
  const services = [];

  afterEach(() => {
    services.splice(0).forEach((service) => service.destroy());
    fixtures.splice(0).forEach((fixture) => fixture.destroy());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("round-trips a complete canonical profile and active profile", async () => {
    const source = createServiceFixture();
    const destination = createServiceFixture();
    fixtures.push(source, destination);

    const canonicalProfile = {
      id: "canonical-profile",
      name: "Canonical Profile",
      description: "Every persisted profile feature",
      currentEnvironment: "ground",
      builds: {
        space: { keys: { F1: ["FireAll"] }, aliases: {} },
        ground: { keys: { F2: ["Jump"] }, aliases: {} },
      },
      aliases: {
        Alpha: { commands: ["FireAll"], description: "Primary alias" },
      },
      bindsets: {
        Alternate: {
          space: { keys: { F3: ["Target_Enemy_Near"] } },
          ground: { keys: {} },
        },
      },
      keybindMetadata: {
        space: { F1: { stabilizeExecutionOrder: true } },
      },
      aliasMetadata: {
        Alpha: { stabilizeExecutionOrder: true },
      },
      bindsetMetadata: {
        Alternate: {
          space: { F3: { stabilizeExecutionOrder: true } },
        },
      },
      selections: { space: "F1", ground: "F2", alias: "Alpha" },
      created: "2025-01-02T03:04:05.000Z",
      lastModified: "2025-06-07T08:09:10.000Z",
      migrationVersion: "2.1.1",
      vertigoSettings: {
        selectedEffects: { space: ["fx-space"], ground: ["fx-ground"] },
        showPlayerSay: true,
      },
    };
    source.storage.saveAllData({
      ...source.storage.getAllData(),
      profiles: { "canonical-profile": canonicalProfile },
      currentProfile: "canonical-profile",
      settings: { theme: "default" },
    });
    source.storage.saveSettings({
      theme: "light",
      language: "en",
      autoSave: false,
      compactView: true,
    });

    const producer = new ProjectManagementService({
      eventBus: source.eventBus,
      storage: source.storage,
      i18n: { t: (key) => key },
    });
    const consumer = new ImportService({
      eventBus: destination.eventBus,
      storage: destination.storage,
    });
    services.push(producer, consumer);
    producer.init();
    consumer.init();

    /** @type {string[]} */
    let artifactParts = [];
    class CapturedBlob {
      /** @param {string[]} parts @param {{ type?: string }} options */
      constructor(parts = [], options = {}) {
        artifactParts = [...parts];
        this.size = parts.reduce((size, part) => size + part.length, 0);
        this.type = options.type || "";
      }
    }
    vi.stubGlobal("Blob", CapturedBlob);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const backupResult = await producer.backupApplicationState();
    const projectData = JSON.parse(artifactParts.join(""));
    const importResult = await consumer.importProjectFile(
      artifactParts.join(""),
    );

    expect(backupResult.success).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: "application/json" }),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("mock-object-url");
    expect(projectData.data.currentProfile).toBe("canonical-profile");
    expect(projectData.data.settings).toEqual({
      theme: "light",
      language: "en",
      autoSave: false,
      compactView: true,
    });
    expect(importResult).toMatchObject({
      success: true,
      currentProfile: "canonical-profile",
      imported: { profiles: 1, settings: true },
    });
    expect(destination.storage.getProfile("canonical-profile")).toEqual(
      canonicalProfile,
    );
    expect(destination.storage.getAllData().currentProfile).toBe(
      "canonical-profile",
    );
    expect(destination.storage.getSettings()).toMatchObject(
      projectData.data.settings,
    );
  });

  it("returns a localized failure without starting a download when artifact creation fails", async () => {
    const fixture = createServiceFixture();
    fixtures.push(fixture);
    const ui = { showToast: vi.fn() };
    const i18n = {
      t: vi.fn((key, params = {}) => `${key}:${params.error || ""}`),
    };
    const producer = new ProjectManagementService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      ui,
      i18n,
    });
    services.push(producer);
    producer.init();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    vi.stubGlobal(
      "Blob",
      class FailingBlob {
        constructor() {
          throw new Error("artifact unavailable");
        }
      },
    );

    await expect(producer.backupApplicationState()).resolves.toEqual({
      success: false,
      error: "artifact unavailable",
    });
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_create_backup:artifact unavailable",
      "error",
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});
