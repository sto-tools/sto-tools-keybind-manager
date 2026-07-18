import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import { respond } from "../../src/js/core/requestResponse.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";

const profileId = "captain";
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

const encodeKBF = (value) => Buffer.from(value, "utf8").toString("base64");
const keysetKBF = readFileSync(
  join(process.cwd(), "tests/fixtures/kbf/keyset.KBF"),
  "utf8",
);

const createUnsafeKeyKBF = () => {
  const activity = encodeKBF("Activity:1;");
  const key = encodeKBF(
    `Key:__proto__;Control:0;Alt:0;Shift:0;Combo:;ACT:${activity};`,
  );
  const keyset = encodeKBF(`Name:Master;KEY:${key};`);
  return encodeKBF(`GROUPSET:1;KEYSET:${keyset};`);
};

describe("ImportService DataCoordinator coherence", () => {
  let eventBusFixture;
  let localStorageFixture;
  let storage;
  let coordinator;
  let service;

  beforeEach(async () => {
    eventBusFixture = createEventBusFixture();
    localStorageFixture = createLocalStorageFixture({
      initialData: {
        sto_keybind_manager: {
          currentProfile: profileId,
          profiles: { [profileId]: initialProfile },
          globalAliases: {},
          settings: {},
          version: "1.0.0",
          created: "2026-01-01T00:00:00.000Z",
          lastModified: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    storage = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: "1.0.0",
    });
    coordinator = new DataCoordinator({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
    });
    storage.init();
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });

    service = new ImportService({
      eventBus: eventBusFixture.eventBus,
      storage,
    });
    service.init();
    service.cache.preferences.bindsetsEnabled = true;
    respond(
      eventBusFixture.eventBus,
      "parser:parse-command-string",
      ({ commandString }) => ({
        commands: [{ command: commandString }],
        isMirrored: false,
      }),
    );
    await vi.waitFor(() => {
      expect(service.cache.dataState?.ready).toBe(true);
    });
  });

  afterEach(() => {
    service?.destroy();
    coordinator?.destroy();
    storage?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
  });

  async function expectCoherentCommit(
    runImport,
    assertProfile,
    environment,
    targetProfileId = profileId,
  ) {
    const beforeRevision = coordinator.getCurrentState().revision;
    eventBusFixture.clearEventHistory();

    const result = await runImport();
    expect(result.success).toBe(true);

    const history = eventBusFixture.getEventHistory();
    const stateEvents = history.filter(
      ({ event }) => event === "data:state-changed",
    );
    const legacyEvents = history.filter(
      ({ event }) => event === "profile:updated",
    );
    expect(stateEvents).toHaveLength(1);
    expect(legacyEvents).toHaveLength(1);
    expect(stateEvents[0].data).toMatchObject({
      reason: "profile-updated",
      state: { revision: beforeRevision + 1 },
    });
    expect(history.indexOf(stateEvents[0])).toBeLessThan(
      history.indexOf(legacyEvents[0]),
    );

    const state = coordinator.getCurrentState();
    expect(service.cache.dataState).toEqual(state);
    expect(legacyEvents[0].data).toMatchObject({
      profileId: targetProfileId,
      profile: state.profiles[targetProfileId],
    });
    if (environment === undefined) {
      expect(legacyEvents[0].data).not.toHaveProperty("environment");
    } else {
      expect(legacyEvents[0].data.environment).toBe(environment);
    }

    const ownerProfile = state.profiles[targetProfileId];
    const cachedProfile = storage.getProfile(targetProfileId);
    const durableProfile = JSON.parse(
      localStorage.getItem("sto_keybind_manager"),
    ).profiles[targetProfileId];
    assertProfile(ownerProfile);
    expect(cachedProfile).toEqual(ownerProfile);
    expect(durableProfile).toEqual(ownerProfile);
    expect(ownerProfile.lastModified).toBeTruthy();
  }

  it("commits a keybind import as one authoritative revision", async () => {
    await expectCoherentCommit(
      () => service.importKeybindFile('F1 "FireAll"', profileId, "space"),
      (profile) => expect(profile.builds.space.keys.F1).toEqual(["FireAll"]),
      "space",
    );
  });

  it("commits an alias import as one authoritative revision", async () => {
    await expectCoherentCommit(
      () => service.importAliasFile('alias Fire "FireAll"', profileId),
      (profile) =>
        expect(profile.aliases.Fire).toMatchObject({ commands: ["FireAll"] }),
    );
  });

  it("authoritatively creates a missing profile for keybind import", async () => {
    const targetProfileId = "new_keybind_profile";

    await expectCoherentCommit(
      () =>
        service.importKeybindFile(
          'F3 "Target_Enemy_Near"',
          targetProfileId,
          "ground",
        ),
      (profile) =>
        expect(profile.builds.ground.keys.F3).toEqual(["Target_Enemy_Near"]),
      "ground",
      targetProfileId,
    );

    expect(coordinator.getCurrentState().currentProfile).toBe(profileId);
  });

  it("authoritatively creates a missing profile for alias import", async () => {
    const targetProfileId = "new_alias_profile";

    await expectCoherentCommit(
      () =>
        service.importAliasFile(
          'alias FocusTarget "Target_Enemy_Near"',
          targetProfileId,
        ),
      (profile) =>
        expect(profile.aliases.FocusTarget).toMatchObject({
          commands: ["Target_Enemy_Near"],
        }),
      undefined,
      targetProfileId,
    );

    expect(coordinator.getCurrentState().currentProfile).toBe(profileId);
  });

  it("commits a KBF import as one authoritative revision", async () => {
    await expectCoherentCommit(
      () =>
        service.importKBFFile(
          keysetKBF,
          profileId,
          "space",
          { strategy: "merge_keep" },
          {
            selectedBindsets: ["master"],
            bindsetMappings: { master: "primary" },
            bindsetRenames: {},
          },
        ),
      (profile) => {
        expect(profile.builds.space.keys.Space).toContain(
          "+TrayExecByTray 0 0",
        );
        expect(profile.aliases.sto_kb_emotecycle_master_space_1).toMatchObject({
          commands: ["sto_kb_emotecycle_master_space_1_step0"],
          steps: ["sto_kb_emotecycle_master_space_1_step0"],
          currentIndex: 0,
        });
      },
      "space",
    );
  });

  it.each([
    ["unsafe nested key data", () => createUnsafeKeyKBF(), null],
    [
      "unsafe mapping destination",
      () => keysetKBF,
      {
        selectedBindsets: ["master"],
        bindsetMappings: { master: "custom" },
        bindsetRenames: { master: "__proto__" },
      },
    ],
  ])(
    "rejects %s without changing owner, cache, or durable state",
    async (_, getContent, configuration) => {
      const beforeState = structuredClone(coordinator.getCurrentState());
      const beforeCache = structuredClone(service.cache.dataState);
      const beforeDurable = localStorage.getItem("sto_keybind_manager");
      eventBusFixture.clearEventHistory();

      const result = await service.importKBFFile(
        getContent(),
        profileId,
        "space",
        { strategy: "merge_keep" },
        configuration,
      );

      expect(result).toMatchObject({ success: false });
      expect([
        "invalid_kbf_parse_result",
        "invalid_kbf_configuration",
      ]).toContain(result.error);
      expect(coordinator.getCurrentState()).toEqual(beforeState);
      expect(service.cache.dataState).toEqual(beforeCache);
      expect(localStorage.getItem("sto_keybind_manager")).toBe(beforeDurable);
      expect(
        eventBusFixture
          .getEventHistory()
          .filter(({ event }) =>
            ["data:state-changed", "profile:updated"].includes(event),
          ),
      ).toEqual([]);
    },
  );
});
