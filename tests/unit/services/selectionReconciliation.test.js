import { afterEach, describe, expect, it, vi } from "vitest";
import {
  publishActiveSelection,
  reconcileFailedSelection,
} from "../../../src/js/components/services/selectionReconciliation.js";

function createService({
  environment = "space",
  selectedKey = null,
  selectedAlias = null,
  cachedSelections = {},
  destroyed = false,
} = {}) {
  const publications = [];
  const service = {
    destroyed,
    selectionEnvironment: environment,
    cachedSelections,
    cache: { selectedKey, selectedAlias },
    broadcastState: vi.fn(() => {
      publications.push({
        topic: "selection:state-changed",
        selectedKey: service.cache.selectedKey,
        selectedAlias: service.cache.selectedAlias,
      });
    }),
    emit: vi.fn((topic, payload) => publications.push({ topic, payload })),
  };
  return { service, publications };
}

describe("selection reconciliation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("ignores a failed intent after the active environment has changed", () => {
    const { service, publications } = createService({
      environment: "ground",
      selectedKey: "G1",
      cachedSelections: { space: "F1", ground: "G1" },
    });

    reconcileFailedSelection(/** @type {any} */ (service), "space");

    expect(service.cache).toEqual({ selectedKey: "G1", selectedAlias: null });
    expect(publications).toEqual([]);
    expect(service.broadcastState).not.toHaveBeenCalled();
    expect(service.emit).not.toHaveBeenCalled();
  });

  it("ignores a failed intent after service destruction", () => {
    const { service } = createService({
      selectedKey: "F2",
      cachedSelections: { space: "F1" },
      destroyed: true,
    });

    reconcileFailedSelection(/** @type {any} */ (service), "space");

    expect(service.cache.selectedKey).toBe("F2");
    expect(service.broadcastState).not.toHaveBeenCalled();
    expect(service.emit).not.toHaveBeenCalled();
  });

  it("restores the cached key and publishes state before compatibility", () => {
    const { service, publications } = createService({
      selectedKey: "F2",
      cachedSelections: { space: "F1" },
    });

    reconcileFailedSelection(/** @type {any} */ (service), "space");

    expect(service.cache).toEqual({ selectedKey: "F1", selectedAlias: null });
    expect(publications).toEqual([
      {
        topic: "selection:state-changed",
        selectedKey: "F1",
        selectedAlias: null,
      },
      {
        topic: "key-selected",
        payload: {
          key: "F1",
          environment: "space",
          bindset: null,
          source: "SelectionService",
        },
      },
    ]);
  });

  it("publishes an alias projection and suppresses an unchanged projection", () => {
    const { service, publications } = createService({
      environment: "alias",
      selectedKey: "F1",
      cachedSelections: { alias: "Alpha" },
    });

    expect(
      publishActiveSelection(/** @type {any} */ (service), "alias", "Alpha"),
    ).toBe(true);
    expect(
      publishActiveSelection(/** @type {any} */ (service), "alias", "Alpha"),
    ).toBe(false);

    expect(publications).toEqual([
      {
        topic: "selection:state-changed",
        selectedKey: null,
        selectedAlias: "Alpha",
      },
      {
        topic: "alias-selected",
        payload: { name: "Alpha", source: "SelectionService" },
      },
    ]);
  });
});
