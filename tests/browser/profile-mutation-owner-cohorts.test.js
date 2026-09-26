import { describe, expect, it, vi } from "vitest";
import { runtime } from "../fixtures/ui/applicationRuntime.js";
import { request } from "../../src/js/core/requestResponse.js";
import {
  PROJECT_BACKUP_KEY,
  PROJECT_ROOT_KEY,
} from "../fixtures/ui/projectStorage.js";

const profileName = "Browser Owner Cohort Probe";
const profileId = "browser_owner_cohort_probe";
const copyId = "browser_owner_cohort_copy";

function createKBF() {
  const activity = btoa("Activity:1;");
  const key = btoa(`Key:F24;Control:0;Alt:0;Shift:0;Combo:;ACT:${activity};`);
  return btoa(`GROUPSET:1;KEYSET:${btoa(`Name:Master;KEY:${key};`)};`);
}

/** Run against production composition, then restore exact prior raw storage. */
async function withIsolatedProfile(run) {
  const app = runtime();
  const { eventBus: bus, dataCoordinator: owner } = app;
  const previous = owner.getCurrentState();
  expect(previous.ready).toBe(true);
  const rawBefore = new Map([
    [PROJECT_ROOT_KEY, localStorage.getItem(PROJECT_ROOT_KEY)],
    [PROJECT_BACKUP_KEY, localStorage.getItem(PROJECT_BACKUP_KEY)],
    ["sto_keybind_settings", localStorage.getItem("sto_keybind_settings")],
  ]);
  const forbiddenQueries = [
    "data:get-profile",
    "data:get-state",
    "data:get-current-profile",
    "storage:get-profile",
    "alias:get-all",
    "vfx:get-virtual-aliases",
  ];
  for (const topic of forbiddenQueries)
    expect(bus.hasListeners(`rpc:${topic}`), topic).toBe(false);
  for (const consumer of [
    app.commandChainUI,
    app.keyBrowserUI,
    app.keyBrowserService,
  ]) {
    expect(consumer).not.toHaveProperty("projectRepository");
    expect(consumer).not.toHaveProperty("settingsRepository");
  }
  const emit = vi.spyOn(bus, "emit");

  const accepted = async (action, revisionDelta = 1) => {
    const before = owner.getCurrentState();
    const raw = localStorage.getItem(PROJECT_ROOT_KEY);
    const result = await action();
    const state = owner.getCurrentState();
    expect(state.authorityEpoch).toBe(before.authorityEpoch);
    expect(state.revision).toBe(before.revision + revisionDelta);
    expect(localStorage.getItem(PROJECT_ROOT_KEY)).not.toBe(raw);
    const durable = JSON.parse(localStorage.getItem(PROJECT_ROOT_KEY));
    expect(durable.profiles).toEqual(state.profiles);
    expect(durable.currentProfile).toBe(state.currentProfile);
    expect(JSON.parse(localStorage.getItem(PROJECT_BACKUP_KEY)).data).toBe(raw);
    await vi.waitFor(() =>
      expect(app.commandChainUI.cache.dataState).toBe(state),
    );
    return result;
  };
  try {
    expect(
      await accepted(() =>
        request(bus, "data:create-profile", {
          name: profileName,
          description: "isolated browser cohort",
          mode: "space",
        }),
      ),
    ).toMatchObject({ success: true, profileId });
    expect(
      await accepted(() => request(bus, "data:switch-profile", { profileId })),
    ).toMatchObject({ success: true });
    await vi.waitFor(() =>
      expect(document.getElementById("profileSelect").value).toBe(profileId),
    );
    await run({ ...app, bus, owner, accepted });
    expect(localStorage.getItem("sto_keybind_settings")).toBe(
      rawBefore.get("sto_keybind_settings"),
    );
    expect(emit.mock.calls.map(([topic]) => topic)).not.toEqual(
      expect.arrayContaining(forbiddenQueries.map((topic) => `rpc:${topic}`)),
    );
    for (const topic of forbiddenQueries)
      expect(
        emit.mock.calls.some(([emitted]) => emitted === `rpc:${topic}`),
        topic,
      ).toBe(false);
  } finally {
    emit.mockRestore();
    document.querySelector('[data-modal="vertigoModal"].modal-close')?.click();
    const originalRoot = rawBefore.get(PROJECT_ROOT_KEY);
    if (originalRoot === null) localStorage.removeItem(PROJECT_ROOT_KEY);
    else localStorage.setItem(PROJECT_ROOT_KEY, originalRoot);
    await request(bus, "data:reload-state");
    for (const [key, raw] of rawBefore) {
      if (raw === null) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    }
    await vi.waitFor(() => {
      expect(owner.getCurrentState().profiles).toEqual(previous.profiles);
      expect(document.getElementById("profileSelect").value).toBe(
        previous.currentProfile,
      );
    });
    for (const [key, raw] of rawBefore)
      expect(localStorage.getItem(key)).toBe(raw);
  }
}

describe("profile mutation cohorts through the checked production bundle", () => {
  it("routes key, command, selection and bindset mutations through accepted owner actions", async () => {
    await withIsolatedProfile(
      async ({ bus, owner, accepted, commandChainUI }) => {
        const previousSettings = {
          bindsetsEnabled:
            commandChainUI.cache.preferencesState.settings.bindsetsEnabled,
          bindToAliasMode:
            commandChainUI.cache.preferencesState.settings.bindToAliasMode,
        };
        try {
          expect(
            await request(bus, "preferences:set-settings", {
              bindsetsEnabled: true,
              bindToAliasMode: true,
            }),
          ).toBe(true);
          expect(
            await accepted(() => request(bus, "key:add", { key: "F23" })),
          ).toMatchObject({ success: true });
          await accepted(() =>
            bus.emit(
              "command:add",
              { key: "F23", command: "FireAll" },
              { synchronous: true },
            ),
          );
          expect(
            owner.getCurrentState().profiles[profileId].builds.space.keys.F23,
          ).toEqual(["FireAll"]);
          expect(
            await accepted(() => request(bus, "key:add", { key: "F24" })),
          ).toMatchObject({ success: true });
          expect(
            await accepted(() =>
              request(bus, "selection:select-key", {
                keyName: "F23",
                environment: "space",
              }),
            ),
          ).toBe("F23");
          expect(
            owner.getCurrentState().profiles[profileId].selections.space,
          ).toBe("F23");
          expect(commandChainUI.cache.selectedKey).toBe("F23");
          expect(
            await accepted(() =>
              request(bus, "bindset:create", { name: "BrowserCohort" }),
            ),
          ).toMatchObject({ success: true });
          expect(
            await accepted(() =>
              request(bus, "bindset-selector:add-key-to-bindset", {
                bindset: "BrowserCohort",
              }),
            ),
          ).toMatchObject({ success: true });
          expect(
            owner.getCurrentState().profiles[profileId].bindsets.BrowserCohort
              .space.keys.F23,
          ).toEqual([]);
          await vi.waitFor(() => {
            expect(commandChainUI.cache.activeBindset).toBe("BrowserCohort");
            expect(
              document.querySelector('[data-bindset="BrowserCohort"].active'),
            ).toBeTruthy();
          });
        } finally {
          expect(
            await request(bus, "preferences:set-settings", previousSettings),
          ).toBe(true);
        }
      },
    );
  });

  it("keeps profile CRUD, environment and default-data transitions durable and visible", async () => {
    await withIsolatedProfile(async ({ bus, owner, accepted }) => {
      expect(
        await accepted(() =>
          request(bus, "data:rename-profile", {
            profileId,
            newName: "Browser Cohort Renamed",
            description: "accepted rename",
          }),
        ),
      ).toMatchObject({ success: true });
      await vi.waitFor(() =>
        expect(
          document.querySelector(`#profileSelect option[value="${profileId}"]`)
            .textContent,
        ).toContain("Browser Cohort Renamed"),
      );
      expect(
        await accepted(() =>
          request(bus, "data:clone-profile", {
            sourceId: profileId,
            newName: "Browser Owner Cohort Copy",
          }),
        ),
      ).toMatchObject({ success: true, profileId: copyId });
      expect(
        await accepted(() =>
          request(bus, "environment:switch", { mode: "ground" }),
        ),
      ).toEqual({ success: true, mode: "ground" });
      expect(
        document.querySelector(".mode-btn.active").getAttribute("data-mode"),
      ).toBe("ground");
      expect(
        await accepted(() =>
          request(bus, "data:delete-profile", { profileId: copyId }),
        ),
      ).toMatchObject({ success: true });
      expect(owner.getCurrentState().profiles).not.toHaveProperty(copyId);
      const result = await accepted(() => owner.loadDefaultData());
      expect(result.success).toBe(true);
      expect(result.profilesCreated).toBeGreaterThan(0);
      await vi.waitFor(() =>
        expect(document.querySelectorAll("#profileSelect option").length).toBe(
          Object.keys(owner.getCurrentState().profiles).length,
        ),
      );
    });
  });

  it("commits text, KBF, alias and visible VFX edits without alternative state authorities", async () => {
    await withIsolatedProfile(async ({ bus, owner, accepted }) => {
      expect(
        await accepted(() =>
          request(bus, "import:keybind-file", {
            profileId,
            environment: "space",
            content: 'F23 "FireAll"',
            strategy: "merge_overwrite",
          }),
        ),
      ).toMatchObject({ success: true, imported: { keys: 1 } });
      expect(
        await accepted(() =>
          request(bus, "import:kbf-file", {
            profileId,
            environment: "space",
            content: createKBF(),
            strategy: "merge_overwrite",
            configuration: {
              selectedBindsets: ["master"],
              singleBindsetMode: true,
            },
          }),
        ),
      ).toMatchObject({ success: true, imported: { keys: 1 } });
      expect(
        owner.getCurrentState().profiles[profileId].builds.space.keys,
      ).toMatchObject({ F23: ["FireAll"], F24: ["target_clear"] });
      expect(
        await accepted(() =>
          request(bus, "alias:add", {
            name: "BrowserCohortAlias",
            description: "owner action",
          }),
        ),
      ).toMatchObject({ success: true });
      expect(
        await accepted(() =>
          request(bus, "alias:duplicate-with-name", {
            sourceName: "BrowserCohortAlias",
            newName: "BrowserCohortCopy",
          }),
        ),
      ).toMatchObject({ success: true });
      expect(
        await accepted(() =>
          request(bus, "alias:delete", { name: "BrowserCohortCopy" }),
        ),
      ).toMatchObject({ success: true });
      document.getElementById("vertigoBtn").click();
      await vi.waitFor(() =>
        expect(document.getElementById("vertigoModal").classList).toContain(
          "active",
        ),
      );
      const effect = document.querySelector(
        '#spaceEffectsList input[data-environment="space"]',
      );
      expect(effect).toBeInstanceOf(HTMLInputElement);
      effect.click();
      const selectedEffect = effect.dataset.effect;
      expect(effect.checked).toBe(true);
      await accepted(async () => {
        document.getElementById("saveVertigoBtn").click();
        await vi.waitFor(() =>
          expect(
            document.getElementById("vertigoModal").classList,
          ).not.toContain("active"),
        );
      });
      expect(
        owner.getCurrentState().profiles[profileId].vertigoSettings,
      ).toEqual({
        selectedEffects: { space: [selectedEffect], ground: [] },
        showPlayerSay: false,
      });
    });
  });
});
