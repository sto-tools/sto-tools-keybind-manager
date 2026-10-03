import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandPresentationService from "../../../src/js/components/services/CommandPresentationService.js";
import KeyBrowserService from "../../../src/js/components/services/KeyBrowserService.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

const cohorts = [
  {
    name: "command presentation",
    Owner: CommandPresentationService,
    topic: "command-presentation:toggle-category",
    event: "command-presentation:state-changed",
    field: "presentationState",
    payload: (categoryId) => ({ categoryId }),
    direct: (owner, name) => owner.toggleCategory(name),
    names: (state) => state.collapsedCategories,
    data: () => ({ collapsedCategories: [], collapsedGroups: [] }),
  },
  {
    name: "key browser",
    Owner: KeyBrowserService,
    topic: "key:toggle-category",
    event: "key-browser:state-changed",
    field: "viewState",
    payload: (categoryId) => ({ categoryId, mode: "command" }),
    direct: (owner, name) => owner.toggleKeyCategory(name, "command"),
    names: (state) => state.collapsedCategories.command,
    data: () => ({
      mode: "grid",
      collapsedCategories: { command: [], keyType: [] },
      collapsedBindsets: [],
    }),
  },
];

describe.each(cohorts)("$name mutation protocol", (cohort) => {
  let fixture;
  let owner;
  const owners = [];
  beforeEach(async () => {
    fixture = await createRealEventBusFixture();
  });
  afterEach(() => {
    for (const instance of owners.splice(0).reverse()) instance.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  function setup() {
    const persistence = {
      load: vi.fn(cohort.data),
      replaceCategory: vi.fn(),
      replaceGroup: vi.fn(),
      replaceMode: vi.fn(),
      replaceBindset: vi.fn(),
      isCategoryCollapsed: vi.fn(() => false),
      isBindsetCollapsed: vi.fn(() => false),
    };
    owner = new cohort.Owner({ eventBus: fixture.eventBus, persistence });
    owners.push(owner);
    owner.init();
    return persistence;
  }

  it.each(["getter", "inherited", "symbol", "extra", "wrong-type", "hidden"])(
    "rejects %s ingress before predecessor capture or persistence",
    async (kind) => {
      const persistence = setup();
      const state = owner[cohort.field];
      const capture = vi.fn(() => state);
      Object.defineProperty(owner, cohort.field, {
        configurable: true,
        get: capture,
      });
      const getter = vi.fn(() => "system");
      let payload = cohort.payload("system");
      if (kind === "getter")
        Object.defineProperty(payload, "categoryId", {
          get: getter,
          enumerable: true,
        });
      if (kind === "inherited") payload = Object.create(payload);
      if (kind === "symbol") payload[Symbol("unknown")] = "x";
      if (kind === "extra") payload.extra = true;
      if (kind === "wrong-type") payload.categoryId = {};
      if (kind === "hidden")
        Object.defineProperty(payload, "extra", { value: true });
      await expect(owner.request(cohort.topic, payload)).rejects.toThrow(
        "invalid_mutation_request",
      );
      expect(getter).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
      expect(persistence.isCategoryCollapsed).not.toHaveBeenCalled();
      expect(persistence.replaceCategory).not.toHaveBeenCalled();
      expect(state.revision).toBe(0);
    },
  );

  it("rejects direct writer reentry without losing the outer accepted state", () => {
    const persistence = setup();
    const before = owner.getCurrentState();
    persistence.replaceCategory.mockImplementation(() => {
      expect(() => cohort.direct(owner, "inner")).toThrow(
        "operation_in_progress",
      );
      expect(owner.getCurrentState()).toEqual(before);
    });
    expect(cohort.direct(owner, "outer")).toBe(true);
    expect(persistence.replaceCategory).toHaveBeenCalledTimes(1);
    expect(owner.getCurrentState().revision).toBe(1);
    expect(cohort.names(owner.getCurrentState())).toEqual(["outer"]);
  });

  it("queues RPC reentry behind the writer rather than overwriting its candidate", async () => {
    const persistence = setup();
    let nested;
    persistence.replaceCategory.mockImplementationOnce(() => {
      nested = owner.request(cohort.topic, cohort.payload("inner"));
    });
    await expect(
      owner.request(cohort.topic, cohort.payload("outer")),
    ).resolves.toBe(true);
    await expect(nested).resolves.toBe(true);
    expect(owner.getCurrentState().revision).toBe(2);
    expect(cohort.names(owner.getCurrentState())).toEqual(["inner", "outer"]);
  });

  it("revokes destroyed direct capabilities without predecessor reads or writes", () => {
    const persistence = setup();
    owner.destroy();
    const state = owner[cohort.field];
    const capture = vi.fn(() => state);
    Object.defineProperty(owner, cohort.field, {
      configurable: true,
      get: capture,
    });
    expect(() => cohort.direct(owner, "stale")).toThrow("operation_cancelled");
    expect(capture).not.toHaveBeenCalled();
    expect(persistence.isCategoryCollapsed).not.toHaveBeenCalled();
    expect(persistence.replaceCategory).not.toHaveBeenCalled();
  });

  it("cancels adoption and publication when persistence destroys the owner", async () => {
    const persistence = setup();
    const before = owner.getCurrentState();
    const states = vi.fn();
    fixture.eventBus.on(cohort.event, states);
    persistence.replaceCategory.mockImplementationOnce(() => owner.destroy());
    await expect(
      owner.request(cohort.topic, cohort.payload("outer")),
    ).rejects.toThrow("operation_cancelled");
    expect(owner.getCurrentState()).toEqual(before);
    expect(states).not.toHaveBeenCalled();
  });

  it("loads a replacement only after a predecessor write returns and rejects its adoption", async () => {
    const persistence = setup();
    const oldState = owner.getCurrentState();
    const loadOrder = [];
    let replacement;
    persistence.replaceCategory.mockImplementationOnce(() => {
      loadOrder.push("write-enter");
      replacement = new cohort.Owner({
        eventBus: fixture.eventBus,
        persistence,
      });
      owners.push(replacement);
      replacement.init();
      persistence.load.mockImplementation(() => {
        loadOrder.push("replacement-load");
        const data = cohort.data();
        if (cohort.field === "viewState")
          data.collapsedCategories.command = ["outer"];
        else data.collapsedCategories = ["outer"];
        return data;
      });
      loadOrder.push("write-exit");
    });
    await expect(
      owner.request(cohort.topic, cohort.payload("outer")),
    ).rejects.toThrow("operation_cancelled");
    await replacement.initialStateReady;
    expect(owner.getCurrentState()).toEqual(oldState);
    expect(loadOrder).toEqual([
      "write-enter",
      "write-exit",
      "replacement-load",
    ]);
    expect(replacement.getCurrentState().revision).toBe(0);
    expect(cohort.names(replacement.getCurrentState())).toEqual(["outer"]);
    await expect(
      replacement.request(cohort.topic, cohort.payload("next")),
    ).resolves.toBe(true);
    expect(cohort.names(replacement.getCurrentState())).toEqual([
      "next",
      "outer",
    ]);
    expect(() => cohort.direct(owner, "stale")).toThrow("operation_cancelled");
  });

  it("lets a required publication listener await a subsequent queued action", async () => {
    setup();
    const publications = [];
    fixture.eventBus.on(cohort.event, (state) => {
      publications.push(state.revision);
      if (state.revision === 1)
        return owner.request(cohort.topic, cohort.payload("listener"));
    });
    await expect(
      owner.request(cohort.topic, cohort.payload("outer")),
    ).resolves.toBe(true);
    expect(publications).toEqual([1, 2]);
    expect(cohort.names(owner.getCurrentState())).toEqual([
      "listener",
      "outer",
    ]);
  });

  it("settles each reply independently while durable publications stay ordered", async () => {
    setup();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const publications = [];
    fixture.eventBus.on(cohort.event, (state) => {
      publications.push(state.revision);
      if (state.revision === 1) return gate;
    });
    let firstSettled = false;
    const first = owner
      .request(cohort.topic, cohort.payload("first"))
      .then((result) => {
        firstSettled = true;
        return result;
      });
    await expect(
      owner.request(cohort.topic, cohort.payload("second")),
    ).resolves.toBe(true);
    expect(firstSettled).toBe(false);
    expect(publications).toEqual([1, 2]);
    release();
    await expect(first).resolves.toBe(true);
    expect(publications).toEqual([1, 2]);
  });
});

describe("scalar action compatibility", () => {
  let fixture;
  let owner;
  beforeEach(async () => {
    fixture = await createRealEventBusFixture();
  });
  afterEach(() => {
    owner?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("validates mode-cycle and collapse envelopes without changing existing scalar semantics", async () => {
    const persistence = {
      load: () => cohorts[1].data(),
      replaceMode: vi.fn(),
      replaceCategory: vi.fn(),
      isCategoryCollapsed: vi.fn(() => false),
      replaceBindset: vi.fn(),
      isBindsetCollapsed: vi.fn(() => false),
    };
    owner = new KeyBrowserService({ eventBus: fixture.eventBus, persistence });
    owner.init();
    await expect(
      owner.request("key:cycle-view-mode", { mode: "grid" }),
    ).rejects.toThrow("invalid_mutation_request");
    await expect(
      owner.request("bindset:toggle-collapse", { bindsetName: 1 }),
    ).rejects.toThrow("invalid_mutation_request");
    expect(persistence.replaceMode).not.toHaveBeenCalled();
    expect(persistence.isBindsetCollapsed).not.toHaveBeenCalled();
    expect(owner.toggleKeyCategory("", "anything")).toBe(false);
    expect(owner.toggleBindsetCollapse(undefined)).toBe(false);
    expect(owner.toggleKeyCategory("__proto__", "anything")).toBe(true);
    expect(persistence.replaceCategory).toHaveBeenCalledWith(
      "__proto__",
      "anything",
      true,
    );
    expect(owner.cycleKeyViewMode()).toBe("categorized");
  });
});
