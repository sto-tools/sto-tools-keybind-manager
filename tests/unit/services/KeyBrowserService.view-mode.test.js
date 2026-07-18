import { afterEach, describe, expect, it, vi } from "vitest";

import KeyBrowserService from "../../../src/js/components/services/KeyBrowserService.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const createStorage = (initial = {}) => {
  const entries = new Map(
    Object.entries(initial).map(([key, value]) => [key, String(value)]),
  );
  return {
    getItem: vi.fn((key) => entries.get(key) ?? null),
    setItem: vi.fn((key, value) => entries.set(key, String(value))),
    key: vi.fn((index) => [...entries.keys()][index] ?? null),
    get length() {
      return entries.size;
    },
  };
};

describe("KeyBrowserService owned view mode", () => {
  let fixture;
  let service;

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it.each([
    [undefined, "grid"],
    ["grid", "grid"],
    ["categorized", "categorized"],
    ["key-types", "key-types"],
    ["bindset-sections", "grid"],
    ["", "grid"],
    ["unknown", "grid"],
  ])("bootstraps persisted %j as %s without an eager rewrite", (raw, mode) => {
    fixture = createEventBusFixture();
    const localStorage = createStorage(
      raw === undefined ? {} : { keyViewMode: raw },
    );
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      localStorage,
    });

    service.init();

    expect(service.getCurrentState()).toMatchObject({ revision: 0, mode });
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem("keyViewMode")).toBe(raw ?? null);
  });

  it("cycles authoritative mode sequentially and publishes only after persistence", async () => {
    fixture = createEventBusFixture();
    const localStorage = createStorage();
    const ordering = [];
    const persist = localStorage.setItem.getMockImplementation();
    localStorage.setItem.mockImplementation((key, value) => {
      ordering.push(`persist:${key}:${value}`);
      return persist(key, value);
    });
    const states = [];
    fixture.eventBus.on("key-browser:state-changed", (state) => {
      ordering.push(`state:${state.mode}:${state.revision}`);
      states.push(state);
    });
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      localStorage,
    });
    service.init();
    await vi.waitFor(() => expect(states).toHaveLength(1));
    const authorityEpoch = service.getCurrentState().authorityEpoch;
    states.length = 0;
    ordering.length = 0;
    localStorage.getItem.mockClear();

    const results = [];
    for (let index = 0; index < 4; index += 1) {
      results.push(await service.request("key:cycle-view-mode"));
    }

    expect(results).toEqual([
      "categorized",
      "key-types",
      "grid",
      "categorized",
    ]);
    expect(ordering).toEqual([
      "persist:keyViewMode:categorized",
      "state:categorized:1",
      "persist:keyViewMode:key-types",
      "state:key-types:2",
      "persist:keyViewMode:grid",
      "state:grid:3",
      "persist:keyViewMode:categorized",
      "state:categorized:4",
    ]);
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(states.map(({ authorityEpoch: epoch }) => epoch)).toEqual([
      authorityEpoch,
      authorityEpoch,
      authorityEpoch,
      authorityEpoch,
    ]);
    expect(service.getCurrentState()).toMatchObject({
      authorityEpoch,
      revision: 4,
      mode: "categorized",
    });
  });

  it("leaves owner state and publications unchanged when persistence fails", async () => {
    fixture = createEventBusFixture();
    const localStorage = createStorage({ keyViewMode: "categorized" });
    const states = [];
    fixture.eventBus.on("key-browser:state-changed", (state) => {
      states.push(state);
    });
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      localStorage,
    });
    service.init();
    await vi.waitFor(() => expect(states).toHaveLength(1));
    const before = service.getCurrentState();
    states.length = 0;
    localStorage.setItem.mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    await expect(service.request("key:cycle-view-mode")).rejects.toThrow(
      "quota exceeded",
    );

    expect(service.getCurrentState()).toEqual(before);
    expect(states).toEqual([]);
    expect(localStorage.getItem("keyViewMode")).toBe("categorized");
  });

  it("computes a detached candidate before writing and never reads after it", () => {
    fixture = createEventBusFixture();
    const localStorage = createStorage();
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      localStorage,
    });
    service.init();
    const initial = service.getCurrentState();
    let persisted = false;
    const guardedState = {
      ...initial,
      collapsedCategories: {
        command: new Proxy([...initial.collapsedCategories.command], {
          get(target, property, receiver) {
            if (persisted) throw new Error("owner read after write");
            return Reflect.get(target, property, receiver);
          },
        }),
        keyType: [...initial.collapsedCategories.keyType],
      },
      collapsedBindsets: [...initial.collapsedBindsets],
    };
    service.viewState = guardedState;
    const read = localStorage.getItem.getMockImplementation();
    const persist = localStorage.setItem.getMockImplementation();
    localStorage.getItem.mockImplementation((key) => {
      if (persisted) throw new Error("storage read after write");
      return read(key);
    });
    localStorage.setItem.mockImplementation((key, value) => {
      expect(service.viewState).toBe(guardedState);
      expect(service.viewState.revision).toBe(0);
      const result = persist(key, value);
      persisted = true;
      return result;
    });

    expect(service.cycleKeyViewMode()).toBe("categorized");

    expect(service.getCurrentState()).toEqual({
      authorityEpoch: initial.authorityEpoch,
      revision: 1,
      mode: "categorized",
      collapsedCategories: { command: [], keyType: [] },
      collapsedBindsets: [],
    });
    expect(() => localStorage.getItem("keyViewMode")).toThrow(
      "storage read after write",
    );
  });
});
