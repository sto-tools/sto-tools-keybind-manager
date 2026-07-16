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

describe("KeyBrowserService owned view state", () => {
  let fixture;
  let service;

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("publishes persisted category and bindset collapse as complete initial state", async () => {
    fixture = createEventBusFixture();
    const localStorage = createStorage({
      keyCategory_system_collapsed: "true",
      keyTypeCategory_function_collapsed: "true",
      bindsetSection_Tactical_collapsed: "true",
    });
    const states = [];
    fixture.eventBus.on("key-browser:state-changed", (state) => {
      states.push(state);
    });
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
      localStorage,
    });

    service.init();

    await vi.waitFor(() => expect(states).toHaveLength(1));
    const expected = {
      authorityEpoch: expect.any(Number),
      revision: 0,
      collapsedCategories: {
        command: ["system"],
        keyType: ["function"],
      },
      collapsedBindsets: ["Tactical"],
    };
    expect(states).toEqual([expected]);
    expect(service.getCurrentState()).toEqual(expected);
    expect(states[0].authorityEpoch).toBeGreaterThanOrEqual(1);
    expect(service.getCurrentState()).not.toBe(states[0]);
    expect(service.getCurrentState().collapsedCategories.command).not.toBe(
      states[0].collapsedCategories.command,
    );
  });

  it("persists category state before replacing and broadcasting its snapshot", async () => {
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
      ordering.push("state");
      states.push(state);
    });
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
      localStorage,
    });
    service.init();
    await vi.waitFor(() => expect(states).toHaveLength(1));
    const authorityEpoch = states[0].authorityEpoch;
    states.length = 0;
    ordering.length = 0;

    await expect(
      service.request("key:toggle-category", {
        categoryId: "system",
        mode: "command",
      }),
    ).resolves.toBe(true);

    expect(ordering).toEqual([
      "persist:keyCategory_system_collapsed:true",
      "state",
    ]);
    expect(states).toEqual([
      {
        authorityEpoch,
        revision: 1,
        collapsedCategories: { command: ["system"], keyType: [] },
        collapsedBindsets: [],
      },
    ]);

    states.length = 0;
    ordering.length = 0;
    await expect(
      service.request("key:toggle-category", {
        categoryId: "system",
        mode: "command",
      }),
    ).resolves.toBe(false);
    expect(ordering).toEqual([
      "persist:keyCategory_system_collapsed:false",
      "state",
    ]);
    expect(states).toEqual([
      {
        authorityEpoch,
        revision: 2,
        collapsedCategories: { command: [], keyType: [] },
        collapsedBindsets: [],
      },
    ]);
  });

  it("persists bindset collapse before publishing its complete state", async () => {
    fixture = createEventBusFixture();
    const localStorage = createStorage();
    const ordering = [];
    const persist = localStorage.setItem.getMockImplementation();
    localStorage.setItem.mockImplementation((key, value) => {
      ordering.push(`persist:${key}:${value}`);
      return persist(key, value);
    });
    fixture.eventBus.on("key-browser:state-changed", () => {
      ordering.push("state");
    });
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
      localStorage,
    });
    service.init();
    await vi.waitFor(() => expect(ordering).toContain("state"));
    const authorityEpoch = service.getCurrentState().authorityEpoch;
    ordering.length = 0;

    await expect(
      service.request("bindset:toggle-collapse", {
        bindsetName: "Tactical",
      }),
    ).resolves.toBe(true);

    expect(ordering).toEqual([
      "persist:bindsetSection_Tactical_collapsed:true",
      "state",
    ]);
    expect(service.getCurrentState()).toEqual({
      authorityEpoch,
      revision: 1,
      collapsedCategories: { command: [], keyType: [] },
      collapsedBindsets: ["Tactical"],
    });
  });

  it("keeps owner state and broadcasts unchanged when persistence fails", async () => {
    fixture = createEventBusFixture();
    const localStorage = createStorage({
      keyCategory_existing_collapsed: "true",
    });
    const states = [];
    fixture.eventBus.on("key-browser:state-changed", (state) => {
      states.push(state);
    });
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
      localStorage,
    });
    service.init();
    await vi.waitFor(() => expect(states).toHaveLength(1));
    const before = service.getCurrentState();
    states.length = 0;
    localStorage.setItem.mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    await expect(
      service.request("key:toggle-category", {
        categoryId: "system",
        mode: "command",
      }),
    ).rejects.toThrow("quota exceeded");
    await expect(
      service.request("bindset:toggle-collapse", {
        bindsetName: "Tactical",
      }),
    ).rejects.toThrow("quota exceeded");

    expect(service.getCurrentState()).toEqual(before);
    expect(states).toEqual([]);
  });

  it.each([
    {
      name: "category",
      storageKey: "keyCategory_system_collapsed",
      mutate: (owner) => owner.toggleKeyCategory("system", "command"),
      expectedCategories: { command: ["system"], keyType: [] },
      expectedBindsets: [],
    },
    {
      name: "bindset",
      storageKey: "bindsetSection_Tactical_collapsed",
      mutate: (owner) => owner.toggleBindsetCollapse("Tactical"),
      expectedCategories: { command: [], keyType: [] },
      expectedBindsets: ["Tactical"],
    },
  ])(
    "commits and broadcasts a $name transition without reading storage after the write",
    ({ storageKey, mutate, expectedCategories, expectedBindsets }) => {
      fixture = createEventBusFixture();
      const localStorage = createStorage();
      const read = localStorage.getItem.getMockImplementation();
      const enumerate = localStorage.key.getMockImplementation();
      const persist = localStorage.setItem.getMockImplementation();
      const length = Object.getOwnPropertyDescriptor(
        localStorage,
        "length",
      )?.get;
      let readsPoisoned = false;
      localStorage.getItem.mockImplementation((key) => {
        if (readsPoisoned) throw new Error("post-write read denied");
        return read(key);
      });
      localStorage.key.mockImplementation((index) => {
        if (readsPoisoned) throw new Error("post-write enumeration denied");
        return enumerate(index);
      });
      Object.defineProperty(localStorage, "length", {
        configurable: true,
        get() {
          if (readsPoisoned) {
            throw new Error("post-write enumeration denied");
          }
          return length?.call(localStorage) ?? 0;
        },
      });
      localStorage.setItem.mockImplementation((key, value) => {
        const result = persist(key, value);
        readsPoisoned = true;
        return result;
      });
      const states = [];
      fixture.eventBus.on("key-browser:state-changed", (state) => {
        states.push(state);
      });
      service = new KeyBrowserService({
        eventBus: fixture.eventBus,
        localStorage,
      });
      service.init();
      const initial = service.getCurrentState();
      states.length = 0;

      expect(mutate(service)).toBe(true);

      expect(localStorage.setItem).toHaveBeenLastCalledWith(storageKey, "true");
      expect(() => localStorage.getItem(storageKey)).toThrow(
        "post-write read denied",
      );
      expect(() => localStorage.key(0)).toThrow(
        "post-write enumeration denied",
      );
      expect(service.getCurrentState()).toEqual({
        authorityEpoch: initial.authorityEpoch,
        revision: 1,
        collapsedCategories: expectedCategories,
        collapsedBindsets: expectedBindsets,
      });
      expect(states).toEqual([service.getCurrentState()]);
    },
  );

  it.each([
    {
      name: "category",
      storageKey: "keyCategory_system_collapsed",
      mutate: (owner) => owner.toggleKeyCategory("system", "command"),
      expectedCategories: { command: ["system"], keyType: [] },
      expectedBindsets: [],
    },
    {
      name: "bindset",
      storageKey: "bindsetSection_Tactical_collapsed",
      mutate: (owner) => owner.toggleBindsetCollapse("Tactical"),
      expectedCategories: { command: [], keyType: [] },
      expectedBindsets: ["Tactical"],
    },
  ])(
    "constructs the next $name snapshot before writing but commits it only after the write",
    ({ storageKey, mutate, expectedCategories, expectedBindsets }) => {
      fixture = createEventBusFixture();
      const localStorage = createStorage();
      const states = [];
      fixture.eventBus.on("key-browser:state-changed", (state) => {
        states.push(state);
      });
      service = new KeyBrowserService({
        eventBus: fixture.eventBus,
        localStorage,
      });
      service.init();
      const initial = service.getCurrentState();
      states.length = 0;

      let ownerReadsPoisoned = false;
      const guardedArray = (values) =>
        new Proxy([...values], {
          get(target, property, receiver) {
            if (ownerReadsPoisoned) {
              throw new Error("owner snapshot read after durable write");
            }
            return Reflect.get(target, property, receiver);
          },
        });
      const guardedState = {
        authorityEpoch: initial.authorityEpoch,
        revision: initial.revision,
        collapsedCategories: {
          command: guardedArray(initial.collapsedCategories.command),
          keyType: guardedArray(initial.collapsedCategories.keyType),
        },
        collapsedBindsets: guardedArray(initial.collapsedBindsets),
      };
      service.viewState = guardedState;

      const persist = localStorage.setItem.getMockImplementation();
      localStorage.setItem.mockImplementation((key, value) => {
        expect(service.viewState).toBe(guardedState);
        expect(service.viewState.revision).toBe(0);
        expect(states).toEqual([]);
        const result = persist(key, value);
        ownerReadsPoisoned = true;
        return result;
      });

      expect(() => mutate(service)).not.toThrow();

      expect(localStorage.setItem).toHaveBeenLastCalledWith(storageKey, "true");
      expect(service.getCurrentState()).toEqual({
        authorityEpoch: initial.authorityEpoch,
        revision: 1,
        collapsedCategories: expectedCategories,
        collapsedBindsets: expectedBindsets,
      });
      expect(states).toEqual([service.getCurrentState()]);
    },
  );

  it("starts a fresh revision-zero authority when the same instance re-initializes", () => {
    fixture = createEventBusFixture();
    const localStorage = createStorage();
    const states = [];
    fixture.eventBus.on("key-browser:state-changed", (state) => {
      states.push(state);
    });
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      localStorage,
    });

    service.init();
    const firstAuthority = service.getCurrentState().authorityEpoch;
    expect(service.getCurrentState().revision).toBe(0);
    expect(service.toggleKeyCategory("system", "command")).toBe(true);
    expect(service.getCurrentState()).toMatchObject({
      authorityEpoch: firstAuthority,
      revision: 1,
    });

    service.destroy();
    service.init();

    expect(service.getCurrentState()).toEqual({
      authorityEpoch: expect.any(Number),
      revision: 0,
      collapsedCategories: { command: ["system"], keyType: [] },
      collapsedBindsets: [],
    });
    expect(service.getCurrentState().authorityEpoch).toBeGreaterThan(
      firstAuthority,
    );
    expect(states.at(-1)).toEqual(service.getCurrentState());
  });
});
