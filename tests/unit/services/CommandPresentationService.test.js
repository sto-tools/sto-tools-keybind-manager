import { afterEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../../src/js/components/ComponentBase.js";
import CommandPresentationService from "../../../src/js/components/services/CommandPresentationService.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  const operations = [];
  return {
    operations,
    key: vi.fn((index) => [...entries.keys()][index] ?? null),
    getItem: vi.fn((key) => entries.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      operations.push(`set:${key}:${value}`);
      entries.set(key, String(value));
    }),
    removeItem: vi.fn((key) => {
      operations.push(`remove:${key}`);
      entries.delete(key);
    }),
    get length() {
      return entries.size;
    },
  };
}

describe("CommandPresentationService owned state", () => {
  let fixture;
  let service;

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("hydrates in construction and initialization, then publishes one detached snapshot", () => {
    fixture = createServiceFixture();
    const localStorage = createStorage({
      commandCategory_system_collapsed: "true",
      commandCategory_aliases_collapsed: "false",
      commandGroup_pivot_collapsed: "true",
    });
    const states = [];
    fixture.eventBus.on("command-presentation:state-changed", (state) => {
      states.push(state);
    });

    service = new CommandPresentationService({
      eventBus: fixture.eventBus,
      localStorage,
    });
    const constructionEpoch = service.getCurrentState().authorityEpoch;
    service.init();

    expect(localStorage.key).toHaveBeenCalledTimes(6);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(states).toEqual([
      {
        authorityEpoch: expect.any(Number),
        revision: 0,
        collapsedCategories: ["system"],
        collapsedGroups: ["pivot"],
      },
    ]);
    expect(states[0].authorityEpoch).toBeGreaterThan(constructionEpoch);
    expect(service.getCurrentState()).toEqual(states[0]);
    expect(service.getCurrentState()).not.toBe(states[0]);

    states[0].collapsedCategories.push("consumer-only");
    states[0].collapsedGroups.push("palindromic");
    expect(service.getCurrentState()).toEqual({
      authorityEpoch: states[0].authorityEpoch,
      revision: 0,
      collapsedCategories: ["system"],
      collapsedGroups: ["pivot"],
    });
  });

  it("derives actions only from owner state and persists before publishing", async () => {
    fixture = createServiceFixture();
    const localStorage = createStorage();
    const ordering = localStorage.operations;
    fixture.eventBus.on("command-presentation:state-changed", () => {
      ordering.push("state");
    });
    service = new CommandPresentationService({
      eventBus: fixture.eventBus,
      localStorage,
    });
    service.init();
    const authorityEpoch = service.getCurrentState().authorityEpoch;
    ordering.length = 0;
    localStorage.key.mockClear();
    localStorage.getItem.mockClear();

    await expect(
      service.request("command-presentation:toggle-category", {
        categoryId: "__proto__",
      }),
    ).resolves.toBe(true);
    await expect(
      service.request("command-presentation:toggle-category", {
        categoryId: "__proto__",
      }),
    ).resolves.toBe(false);
    await expect(
      service.request("command-presentation:toggle-group", {
        groupType: "pivot",
      }),
    ).resolves.toBe(true);
    await expect(
      service.request("command-presentation:toggle-group", {
        groupType: "pivot",
      }),
    ).resolves.toBe(false);

    expect(ordering).toEqual([
      "set:commandCategory___proto___collapsed:true",
      "state",
      "set:commandCategory___proto___collapsed:false",
      "state",
      "set:commandGroup_pivot_collapsed:true",
      "state",
      "remove:commandGroup_pivot_collapsed",
      "state",
    ]);
    expect(localStorage.key).not.toHaveBeenCalled();
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toEqual({
      authorityEpoch,
      revision: 4,
      collapsedCategories: [],
      collapsedGroups: [],
    });
  });

  it("precomputes and detaches the publication before entering persistence", async () => {
    fixture = createServiceFixture();
    const localStorage = createStorage();
    const states = [];
    fixture.eventBus.on("command-presentation:state-changed", (state) => {
      states.push(state);
    });
    service = new CommandPresentationService({
      eventBus: fixture.eventBus,
      localStorage,
    });
    service.init();
    states.length = 0;
    const persist = localStorage.setItem.getMockImplementation();
    localStorage.setItem.mockImplementation((key, value) => {
      service.presentationState.collapsedCategories.push("write-time-mutation");
      return persist(key, value);
    });

    await expect(
      service.request("command-presentation:toggle-category", {
        categoryId: "system",
      }),
    ).resolves.toBe(true);

    expect(states).toEqual([
      {
        authorityEpoch: service.getCurrentState().authorityEpoch,
        revision: 1,
        collapsedCategories: ["system"],
        collapsedGroups: [],
      },
    ]);
    expect(service.getCurrentState().collapsedCategories).toEqual(["system"]);
  });

  it.each([
    {
      name: "category set",
      initial: {},
      method: "setItem",
      topic: "command-presentation:toggle-category",
      payload: { categoryId: "system" },
    },
    {
      name: "group set",
      initial: {},
      method: "setItem",
      topic: "command-presentation:toggle-group",
      payload: { groupType: "pivot" },
    },
    {
      name: "group removal",
      initial: { commandGroup_pivot_collapsed: "true" },
      method: "removeItem",
      topic: "command-presentation:toggle-group",
      payload: { groupType: "pivot" },
    },
  ])(
    "keeps $name failure atomic",
    async ({ initial, method, topic, payload }) => {
      fixture = createServiceFixture();
      const localStorage = createStorage(initial);
      const states = [];
      fixture.eventBus.on("command-presentation:state-changed", (state) => {
        states.push(state);
      });
      service = new CommandPresentationService({
        eventBus: fixture.eventBus,
        localStorage,
      });
      service.init();
      const before = service.getCurrentState();
      states.length = 0;
      localStorage[method].mockImplementation(() => {
        throw new DOMException("quota", "QuotaExceededError");
      });

      await expect(service.request(topic, payload)).rejects.toThrow("quota");
      expect(service.getCurrentState()).toEqual(before);
      expect(states).toEqual([]);
    },
  );

  it("rejects invalid action names without persistence or publication", async () => {
    fixture = createServiceFixture();
    const localStorage = createStorage();
    const states = [];
    fixture.eventBus.on("command-presentation:state-changed", (state) => {
      states.push(state);
    });
    service = new CommandPresentationService({
      eventBus: fixture.eventBus,
      localStorage,
    });
    service.init();
    states.length = 0;

    await expect(
      service.request("command-presentation:toggle-category", {
        categoryId: "",
      }),
    ).rejects.toThrow("non-empty");
    await expect(
      service.request("command-presentation:toggle-group", {
        groupType: "unknown",
      }),
    ).rejects.toThrow("not supported");
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(states).toEqual([]);
  });

  it("serves the complete detached snapshot through late join", () => {
    fixture = createServiceFixture();
    const localStorage = createStorage({
      commandCategory_system_collapsed: "true",
      commandGroup_palindromic_collapsed: "true",
    });
    service = new CommandPresentationService({
      eventBus: fixture.eventBus,
      localStorage,
    });
    service.init();

    class Probe extends ComponentBase {
      constructor(eventBus) {
        super(eventBus);
        this.received = null;
      }

      handleInitialState(reply) {
        if (reply.sender === "CommandPresentationService") {
          this.received = reply.state;
        }
      }
    }

    const probe = new Probe(fixture.eventBus);
    probe.init();
    expect(probe.received).toEqual(service.getCurrentState());
    expect(probe.received).not.toBe(service.presentationState);
    probe.destroy();
  });
});
