import { afterEach, describe, expect, it, vi } from "vitest";

import KeyBrowserUI from "../../../src/js/components/ui/KeyBrowserUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const keyBrowserState = {
  authorityEpoch: 10,
  revision: 1,
  mode: "grid",
  collapsedCategories: { command: [], keyType: [] },
  collapsedBindsets: [],
};

function createProfile({
  id = "captain",
  spaceKeys = { F1: ["FireAll"] },
  groundKeys = { G1: ["Aim"] },
} = {}) {
  return {
    id,
    name: id,
    currentEnvironment: "space",
    builds: {
      space: { keys: spaceKeys },
      ground: { keys: groundKeys },
    },
    aliases: {},
    bindsets: {
      Tactical: {
        space: { keys: {} },
        ground: { keys: {} },
      },
    },
  };
}

function stateFor(profile, { revision = 1, environment = "space" } = {}) {
  return createDataCoordinatorState({
    authorityEpoch: 20,
    revision,
    currentProfile: profile.id,
    currentEnvironment: environment,
    currentProfileData: profile,
    profiles: { [profile.id]: profile },
  });
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("KeyBrowserUI action authority", () => {
  let fixture;
  let ui;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("does not delete a key after its confirmation snapshot is replaced", async () => {
    fixture = createEventBusFixture();
    const confirmation = deferred();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
      confirmDialog: { confirm: vi.fn(() => confirmation.promise) },
    });
    const profile = createProfile();
    ui._cacheDataState(stateFor(profile, { revision: 1 }));
    ui.request = vi.fn().mockResolvedValue({ success: true });

    const deletion = ui.confirmDeleteKey("F1");
    ui._cacheDataState(stateFor(profile, { revision: 2 }));
    confirmation.resolve(true);

    await expect(deletion).resolves.toBe(false);
    expect(ui.request).not.toHaveBeenCalled();
  });

  it.each([
    ["create", undefined, "Science"],
    ["clone", "Tactical", "Tactical Copy"],
    ["rename", "Tactical", "Science"],
  ])(
    "does not issue a bindset %s after its prompt snapshot is replaced",
    async (operation, sourceName, proposedName) => {
      fixture = createEventBusFixture();
      const prompt = deferred();
      ui = new KeyBrowserUI({
        eventBus: fixture.eventBus,
        document,
        i18n: { t: (key) => key },
        inputDialog: { prompt: vi.fn(() => prompt.promise) },
      });
      const profile = createProfile();
      ui._cacheDataState(stateFor(profile, { revision: 1 }));
      ui.cache.bindsetNames = ["Primary Bindset", "Tactical"];
      ui.request = vi.fn().mockResolvedValue({ success: true });

      const mutation = ui.runBindsetMutation(operation, sourceName);
      ui._cacheDataState(stateFor(profile, { revision: 2 }));
      prompt.resolve(proposedName);

      await expect(mutation).resolves.toBe(false);
      expect(ui.request).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      transition: "profile",
      initialProfile: createProfile({ id: "alpha" }),
      initialEnvironment: "space",
      replacementProfile: createProfile({
        id: "beta",
        spaceKeys: { F9: ["FirePhasers"] },
      }),
      replacementEnvironment: "space",
      expectedReplacementKey: "F9",
    },
    {
      transition: "environment",
      initialProfile: createProfile(),
      initialEnvironment: "space",
      replacementProfile: createProfile(),
      replacementEnvironment: "ground",
      expectedReplacementKey: "G1",
    },
  ])(
    "rejects an old-grid key click during delayed $transition replacement",
    async ({
      initialProfile,
      initialEnvironment,
      replacementProfile,
      replacementEnvironment,
      expectedReplacementKey,
    }) => {
      document.body.innerHTML = '<div id="keyGrid"></div>';
      fixture = createEventBusFixture();
      ui = new KeyBrowserUI({
        eventBus: fixture.eventBus,
        document,
        i18n: { t: (key) => key },
      });
      ui.cache.keyBrowserViewState = structuredClone(keyBrowserState);
      ui._cacheDataState(
        stateFor(initialProfile, {
          revision: 1,
          environment: initialEnvironment,
        }),
      );

      const delayedSort = deferred();
      let delaySort = false;
      ui.request = vi.fn((topic, payload) => {
        if (topic === "key:sort") {
          if (!delaySort) return Promise.resolve([...payload.keys]);
          return delayedSort.promise;
        }
        if (topic === "key:select") return Promise.resolve(payload.keyName);
        throw new Error(`Unexpected request: ${topic}`);
      });

      await ui.render();
      const oldKey = document.querySelector('#keyGrid [data-key="F1"]');
      expect(oldKey).toBeInstanceOf(HTMLElement);

      ui._cacheDataState(
        stateFor(replacementProfile, {
          revision: 2,
          environment: replacementEnvironment,
        }),
      );
      delaySort = true;
      const replacementRender = ui.render();
      expect(oldKey?.isConnected).toBe(true);

      await ui.handleGridClick({ target: oldKey });

      expect(
        ui.request.mock.calls.filter(([topic]) => topic === "key:select"),
      ).toEqual([]);

      delayedSort.resolve([expectedReplacementKey]);
      await replacementRender;
      expect(
        document.querySelector(
          `#keyGrid [data-key="${expectedReplacementKey}"]`,
        ),
      ).not.toBeNull();
    },
  );
});
