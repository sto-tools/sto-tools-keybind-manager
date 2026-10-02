import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ExportService from "../../src/js/components/services/ExportService.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import { respond, request } from "../../src/js/core/requestResponse.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";
import { createProjectRepository } from "./helpers/projectRepository.js";

const profileId = "captain";
const aliasDescription = "Legacy punctuation alias with no commands";
const quotedCommand = 'say "Round trip ready"';

const initialProfile = {
  name: "Captain",
  currentEnvironment: "space",
  migrationVersion: "2.1.1",
  builds: {
    space: { keys: {} },
    ground: { keys: {} },
  },
  aliases: {},
  bindsets: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
};

const exportedProfile = {
  ...initialProfile,
  builds: {
    space: {
      keys: {
        "`": [],
        F1: [quotedCommand],
      },
    },
    ground: { keys: {} },
  },
  aliases: {
    "legacy-name": {
      commands: [],
      description: aliasDescription,
    },
  },
};

describe("text export/import round trips", () => {
  let eventBusFixture;
  let localStorageFixture;
  let projectRepository;
  let coordinator;
  let exportService;
  let importService;
  let detachParser;

  beforeEach(async () => {
    eventBusFixture = createEventBusFixture();
    localStorageFixture = createLocalStorageFixture({
      initialData: {
        sto_keybind_manager: {
          currentProfile: profileId,
          profiles: { [profileId]: initialProfile },
          globalAliases: {},
          version: "1.0.0",
          created: "2026-01-01T00:00:00.000Z",
          lastModified: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    projectRepository = createProjectRepository({
      version: "1.0.0",
    });
    coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: eventBusFixture.eventBus,
      projectRepository,
      i18n: { t: (key) => key },
    });
    coordinator.init();

    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });

    detachParser = respond(
      eventBusFixture.eventBus,
      "parser:parse-command-string",
      ({ commandString }) => ({
        commands: commandString.trim()
          ? commandString
              .split(/\s*\$\$\s*/)
              .filter(Boolean)
              .map((command) => ({ command }))
          : [],
        isMirrored: false,
      }),
    );

    exportService = new ExportService({
      eventBus: eventBusFixture.eventBus,
      i18n: { t: (key) => key },
    });
    importService = new ImportService({
      eventBus: eventBusFixture.eventBus,
      i18n: { t: (key) => key },
    });
    exportService.init();
    importService.init();
    exportService.cache.preferences = {
      bindToAliasMode: false,
      bindsetsEnabled: false,
      translateGeneratedMessages: false,
    };
    importService.cache.preferences.bindsetsEnabled = true;

    await vi.waitFor(() => {
      expect(exportService.cache.dataState?.ready).toBe(true);
      expect(importService.cache.dataState?.ready).toBe(true);
    });
  });

  afterEach(() => {
    detachParser?.();
    importService?.destroy();
    exportService?.destroy();
    coordinator?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
  });

  it("rejects a stale planned import without overwriting a newer acknowledged owner edit", async () => {
    detachParser();
    let enterPlanner;
    let resumePlanner;
    const entered = new Promise((resolve) => {
      enterPlanner = resolve;
    });
    const resumed = new Promise((resolve) => {
      resumePlanner = resolve;
    });
    let calls = 0;
    detachParser = respond(
      eventBusFixture.eventBus,
      "parser:parse-command-string",
      async ({ commandString }) => {
        if (++calls === 2) {
          enterPlanner();
          await resumed;
        }
        return { commands: [{ command: commandString }], isMirrored: false };
      },
    );
    const before = coordinator.getCurrentState();
    const pending = importService.importKeybindFile(
      'F1 "FireAll"',
      profileId,
      "space",
    );
    await entered;
    await expect(
      request(eventBusFixture.eventBus, "data:update-profile", {
        profileId,
        properties: { description: "newer acknowledged edit" },
      }),
    ).resolves.toMatchObject({ success: true });
    const accepted = coordinator.getCurrentState();
    const rootRaw = localStorage.getItem("sto_keybind_manager");
    const backupRaw = localStorage.getItem("sto_keybind_manager_backup");
    const commit = vi.spyOn(projectRepository, "commit");
    eventBusFixture.clearEventHistory();
    resumePlanner();
    expect(await pending).toMatchObject({
      success: false,
      error: "import_failed",
    });
    expect(commit).not.toHaveBeenCalled();
    expect(coordinator.getCurrentState()).toBe(accepted);
    expect(accepted.revision).toBe(before.revision + 1);
    expect(accepted.profiles[profileId].description).toBe(
      "newer acknowledged edit",
    );
    expect(accepted.profiles[profileId].builds.space.keys).not.toHaveProperty(
      "F1",
    );
    expect(localStorage.getItem("sto_keybind_manager")).toBe(rootRaw);
    expect(localStorage.getItem("sto_keybind_manager_backup")).toBe(backupRaw);
    expect(eventBusFixture.getEventsOfType("data:state-changed")).toHaveLength(
      0,
    );
    expect(eventBusFixture.getEventsOfType("profile:updated")).toHaveLength(0);
  });

  it("round-trips exported empty keybinds and punctuation aliases through authoritative storage", async () => {
    const keybindText = await exportService.generateSTOKeybindFile(
      exportedProfile,
      { environment: "space" },
    );
    const aliasText = await exportService.generateAliasFile(exportedProfile);

    expect(keybindText).toContain('0x29 ""');
    expect(keybindText).toContain(`F1 "${quotedCommand}"`);
    expect(aliasText).toContain(
      `; ${aliasDescription}\nalias legacy-name <&  &>`,
    );

    const beforeRevision = coordinator.getCurrentState().revision;
    eventBusFixture.clearEventHistory();

    const keybindResult = await importService.importKeybindFile(
      keybindText,
      profileId,
      "space",
      { strategy: "overwrite_all" },
    );
    const aliasResult = await importService.importAliasFile(
      aliasText,
      profileId,
      { strategy: "overwrite_all" },
    );

    expect(keybindResult).toMatchObject({
      success: true,
      imported: { keys: 2 },
    });
    expect(aliasResult).toMatchObject({ success: true });
    expect(aliasResult.imported.aliases).toBeGreaterThanOrEqual(1);

    const history = eventBusFixture.getEventHistory();
    const ownershipEvents = history.filter(({ event }) =>
      ["data:state-changed", "profile:updated"].includes(event),
    );
    expect(ownershipEvents.map(({ event }) => event)).toEqual([
      "data:state-changed",
      "profile:updated",
      "data:state-changed",
      "profile:updated",
    ]);

    const stateEvents = ownershipEvents.filter(
      ({ event }) => event === "data:state-changed",
    );
    expect(stateEvents.map(({ data }) => data.reason)).toEqual([
      "profile-replaced",
      "profile-replaced",
    ]);
    expect(stateEvents.map(({ data }) => data.state.revision)).toEqual([
      beforeRevision + 1,
      beforeRevision + 2,
    ]);

    const legacyEvents = ownershipEvents.filter(
      ({ event }) => event === "profile:updated",
    );
    expect(legacyEvents[0].data).toMatchObject({
      profileId,
      environment: "space",
    });
    expect(legacyEvents[1].data).toMatchObject({ profileId });
    expect(legacyEvents[1].data).not.toHaveProperty("environment");

    const state = coordinator.getCurrentState();
    const ownerProfile = state.profiles[profileId];
    expect(ownerProfile.builds.space.keys["`"]).toEqual([]);
    expect(ownerProfile.builds.space.keys.F1).toEqual([quotedCommand]);
    expect(ownerProfile.aliases["legacy-name"]).toEqual({
      commands: [],
      description: aliasDescription,
    });

    expect(importService.cache.dataState).toEqual(state);
    expect(exportService.cache.dataState).toEqual(state);
    expect(exportService.getProfileFromCache(profileId)).toEqual(ownerProfile);
    expect(projectRepository.load().value.profiles[profileId]).toEqual(
      ownerProfile,
    );
    expect(
      JSON.parse(localStorage.getItem("sto_keybind_manager")).profiles[
        profileId
      ],
    ).toEqual(ownerProfile);
    expect(ownerProfile.lastModified).toBeTruthy();
  });
});
