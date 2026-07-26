import { describe, expect, it, vi } from "vitest";

import {
  adoptPreferencesStateSnapshot,
  createPreferencesStateSnapshot,
  isPreferencesStateSnapshot,
  nextPreferencesStateAuthorityEpoch,
} from "../../../src/js/components/services/preferencesState.js";
import { createPreferencesState } from "../../fixtures/core/componentState.js";

describe("preferences state snapshots", () => {
  it("creates a detached recursively immutable complete snapshot", () => {
    const source = createPreferencesState({
      "plugin:layout": { panels: [{ visible: true }] },
    }).settings;
    const state = createPreferencesStateSnapshot(source, {
      authorityEpoch: nextPreferencesStateAuthorityEpoch(),
      ready: true,
      revision: 1,
    });

    source["plugin:layout"].panels[0].visible = false;

    expect(state.settings["plugin:layout"]).toEqual({
      panels: [{ visible: true }],
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.settings)).toBe(true);
    expect(Object.isFrozen(state.settings["plugin:layout"].panels[0])).toBe(
      true,
    );
  });

  it("orders adoption by owner epoch and then revision", () => {
    const pending = createPreferencesState(
      {},
      {
        authorityEpoch: 10,
        ready: false,
        revision: 0,
      },
    );
    const acceptedPending = adoptPreferencesStateSnapshot(pending, null);
    const ready = createPreferencesState(
      { language: "de" },
      { authorityEpoch: 10, ready: true, revision: 1 },
    );
    const acceptedReady = adoptPreferencesStateSnapshot(ready, acceptedPending);

    expect(acceptedPending).toMatchObject({ ready: false, revision: 0 });
    expect(acceptedReady).toMatchObject({ ready: true, revision: 1 });
    expect(
      adoptPreferencesStateSnapshot(structuredClone(ready), acceptedReady),
    ).toBeNull();
    expect(
      adoptPreferencesStateSnapshot(
        createPreferencesState(
          {},
          {
            authorityEpoch: 10,
            ready: false,
            revision: 0,
          },
        ),
        acceptedReady,
      ),
    ).toBeNull();

    const replacementPending = adoptPreferencesStateSnapshot(
      createPreferencesState(
        {},
        {
          authorityEpoch: 11,
          ready: false,
          revision: 0,
        },
      ),
      acceptedReady,
    );
    expect(replacementPending).toMatchObject({
      authorityEpoch: 11,
      ready: false,
      revision: 0,
    });
    expect(
      adoptPreferencesStateSnapshot(
        createPreferencesState(
          {},
          {
            authorityEpoch: 10,
            ready: true,
            revision: 99,
          },
        ),
        replacementPending,
      ),
    ).toBeNull();
  });

  it("treats malformed and unsafe external graphs as inert without invoking getters", () => {
    const getter = vi.fn(() => "dark");
    const accessorSettings = createPreferencesState().settings;
    Object.defineProperty(accessorSettings, "theme", {
      enumerable: true,
      get: getter,
    });
    const cyclicSettings = createPreferencesState().settings;
    cyclicSettings["plugin:cycle"] = cyclicSettings;
    class SnapshotRecord {
      constructor() {
        Object.assign(this, createPreferencesState());
      }
    }

    const invalid = [
      null,
      {},
      createPreferencesState({}, { authorityEpoch: 0 }),
      createPreferencesState({}, { revision: -1 }),
      createPreferencesState({}, { ready: false, revision: 1 }),
      createPreferencesState({}, { ready: true, revision: 0 }),
      { ...createPreferencesState(), extra: true },
      { ...createPreferencesState(), settings: [] },
      { ...createPreferencesState(), settings: accessorSettings },
      { ...createPreferencesState(), settings: cyclicSettings },
      createPreferencesState({ "plugin:callback": () => {} }),
      new SnapshotRecord(),
    ];

    for (const candidate of invalid) {
      expect(isPreferencesStateSnapshot(candidate)).toBe(false);
      expect(adoptPreferencesStateSnapshot(candidate, null)).toBeNull();
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects invalid producer snapshots", () => {
    expect(() =>
      createPreferencesStateSnapshot(/** @type {any} */ ({ language: "en" }), {
        authorityEpoch: 1,
        ready: true,
        revision: 1,
      }),
    ).toThrow("Invalid preferences state snapshot");
  });
});
