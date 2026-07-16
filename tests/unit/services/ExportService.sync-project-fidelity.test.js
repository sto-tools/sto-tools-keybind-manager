import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExportService from "../../../src/js/components/services/ExportService.js";
import ImportService from "../../../src/js/components/services/ImportService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";

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

  function createSource({
    profiles = goldenProject.data.profiles,
    currentProfile = goldenProject.data.currentProfile,
  } = {}) {
    const fixture = createServiceFixture({
      enableFS: true,
      initialStorageData: {
        sto_keybind_manager: {
          version: "1.0.0",
          created: "2024-01-02T03:04:05.000Z",
          lastModified: "2025-01-02T03:04:05.000Z",
          currentProfile,
          profiles: structuredClone(profiles),
          globalAliases: {},
          settings: staleRootSettings,
        },
        sto_keybind_settings: structuredClone(goldenProject.data.settings),
      },
    });
    fixtures.push(fixture);

    detachResponders.push(
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

  it("projects each synced profile's VFX aliases without cross-contamination or a VFX responder", async () => {
    const profiles = {
      alpha: {
        id: "alpha",
        name: "Alpha Profile",
        currentEnvironment: "space",
        builds: { space: { keys: {} }, ground: { keys: {} } },
        aliases: {},
        vertigoSettings: {
          selectedEffects: {
            space: ["fx-alpha-only"],
            ground: [],
          },
          showPlayerSay: false,
        },
      },
      beta: {
        id: "beta",
        name: "Beta Profile",
        currentEnvironment: "ground",
        builds: { space: { keys: {} }, ground: { keys: {} } },
        aliases: {},
        vertigoSettings: {
          selectedEffects: {
            space: [],
            ground: ["fx-beta-only"],
          },
          showPlayerSay: false,
        },
      },
    };
    const { fixture, exporter } = createSource({
      profiles,
      currentProfile: "alpha",
    });

    expect(fixture.eventBus.hasListeners("rpc:vfx:get-virtual-aliases")).toBe(
      false,
    );

    await exporter.syncToFolder(fixture.rootDir);

    const alphaAliases = await fixture.fsReadText(
      "Alpha_Profile/Alpha_Profile_aliases.txt",
    );
    const betaAliases = await fixture.fsReadText(
      "Beta_Profile/Beta_Profile_aliases.txt",
    );

    expect(alphaAliases).toContain(
      "alias dynFxSetFXExclusionList_Space <& dynFxSetFXExlusionList fx-alpha-only &>",
    );
    expect(alphaAliases).not.toContain("fx-beta-only");
    expect(betaAliases).toContain(
      "alias dynFxSetFXExclusionList_Ground <& dynFxSetFXExlusionList fx-beta-only &>",
    );
    expect(betaAliases).not.toContain("fx-alpha-only");
    expect(fixture.eventBus.hasListeners("rpc:vfx:get-virtual-aliases")).toBe(
      false,
    );
  });

  it("exports the latest accepted VFX property commit instead of a stale profile cache", async () => {
    const stale = {
      id: "alpha",
      name: "Alpha Profile",
      currentEnvironment: "space",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases: {},
      vertigoSettings: {
        selectedEffects: { space: ["fx-stale"], ground: [] },
        showPlayerSay: false,
      },
    };
    const current = structuredClone(stale);
    current.vertigoSettings.selectedEffects.space = ["fx-current"];
    const { fixture, exporter } = createSource({
      profiles: { alpha: stale },
      currentProfile: "alpha",
    });

    fixture.eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: "alpha",
      profileId: "alpha",
      profile: stale,
      environment: "space",
      timestamp: Date.now(),
    });
    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: createDataCoordinatorState({
        authorityEpoch: 90,
        revision: 2,
        currentProfile: "alpha",
        currentProfileData: current,
        profiles: { alpha: current },
      }),
    });

    const aliasFile = await exporter.request("export:generate-alias-file", {
      profileId: "alpha",
    });

    expect(aliasFile).toContain("dynFxSetFXExlusionList fx-current");
    expect(aliasFile).not.toContain("fx-stale");
    expect(fixture.eventBus.hasListeners("rpc:vfx:get-virtual-aliases")).toBe(
      false,
    );
  });

  it("rejects missing profile identifiers instead of exporting the active profile", async () => {
    const current = structuredClone(
      goldenProject.data.profiles[goldenProject.data.currentProfile],
    );
    const { fixture, exporter } = createSource({
      profiles: { alpha: current },
      currentProfile: "alpha",
    });
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 90,
        revision: 1,
        currentProfile: "alpha",
        currentProfileData: current,
        profiles: { alpha: current },
      }),
    });

    await expect(
      exporter.request("export:generate-alias-file", {}),
    ).rejects.toThrow("Profile undefined not found");
    await expect(
      exporter.request("export:generate-keybind-file", {}),
    ).rejects.toThrow("Profile undefined not found in ExportService cache");
    expect(exporter.getProfileFromCache(undefined)).toBeNull();
  });

  it("does not resurrect a stale cached profile after an authoritative pre-ready replacement", async () => {
    const stale = {
      id: "alpha",
      name: "Alpha Profile",
      currentEnvironment: "space",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases: {},
      vertigoSettings: {
        selectedEffects: { space: ["fx-predecessor"], ground: [] },
        showPlayerSay: false,
      },
    };
    const { fixture, exporter } = createSource({
      profiles: { alpha: stale },
      currentProfile: "alpha",
    });
    fixture.eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: "alpha",
      profileId: "alpha",
      profile: stale,
      environment: "space",
      timestamp: Date.now(),
    });
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 91,
        ready: false,
        revision: 0,
      }),
    });

    await expect(
      exporter.request("export:generate-alias-file", { profileId: "alpha" }),
    ).rejects.toThrow("Profile alpha not found");
    expect(exporter.getProfileFromCache("alpha")).toBeNull();
  });

  it("passes translated generated-message preferences into profile-local export", async () => {
    const profile = {
      id: "translated",
      name: "Translated",
      currentEnvironment: "space",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases: {},
      vertigoSettings: {
        selectedEffects: { space: ["fx-translated"], ground: [] },
        showPlayerSay: true,
      },
    };
    const { exporter } = createSource({
      profiles: { translated: profile },
      currentProfile: "translated",
    });
    exporter.cache.preferences.translateGeneratedMessages = true;
    exporter.i18n = {
      t: (key) =>
        key === "vfx_suppression_loaded" ? "Suppression traduite" : key,
    };

    const aliasFile = await exporter.generateAliasFile(profile);

    expect(aliasFile).toContain("PlayerSay Suppression traduite");
    expect(aliasFile).not.toContain("PlayerSay VFX Suppression Loaded");
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
