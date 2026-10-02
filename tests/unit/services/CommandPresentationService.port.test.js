import { afterEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../../src/js/components/ComponentBase.js";
import CommandPresentationService from "../../../src/js/components/services/CommandPresentationService.js";
import { readCommandPresentationState } from "../../../src/js/components/services/commandPresentationState.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("CommandPresentationService domain persistence port", () => {
  let fixture;
  let owner;
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );

  afterEach(() => {
    owner?.destroy();
    fixture?.destroy();
    Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    vi.restoreAllMocks();
  });

  function setup(data = { collapsedCategories: [], collapsedGroups: [] }) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("ambient storage forbidden");
      },
    });
    fixture = createServiceFixture();
    const persistence = {
      load: vi.fn(() => data),
      replaceCategory: vi.fn(),
      replaceGroup: vi.fn(),
    };
    owner = new CommandPresentationService({
      eventBus: fixture.eventBus,
      persistence,
    });
    return persistence;
  }

  it("loads detached canonical state and keeps the private capability out of publication and late join", () => {
    const data = {
      collapsedCategories: ["system", "__proto__"],
      collapsedGroups: ["pivot", "non-trayexec"],
    };
    const persistence = setup(data);
    const states = [];
    fixture.eventBus.on("command-presentation:state-changed", (state) =>
      states.push(state),
    );
    owner.init();
    expect(persistence.load).toHaveBeenCalledTimes(2);
    expect(states).toEqual([
      {
        authorityEpoch: expect.any(Number),
        revision: 0,
        collapsedCategories: ["__proto__", "system"],
        collapsedGroups: ["non-trayexec", "pivot"],
      },
    ]);
    data.collapsedCategories.push("port-only");
    states[0].collapsedGroups.push("palindromic");
    expect(owner.getCurrentState().collapsedCategories).toEqual([
      "__proto__",
      "system",
    ]);
    expect(owner.getCurrentState().collapsedGroups).toEqual([
      "non-trayexec",
      "pivot",
    ]);
    expect(Object.values(owner)).not.toContain(persistence);
    expect(JSON.stringify(owner.getCurrentState())).not.toContain("load");
    class Probe extends ComponentBase {
      handleInitialState(reply) {
        if (reply.sender === "CommandPresentationService")
          this.received = reply.state;
      }
    }
    const probe = new Probe(fixture.eventBus);
    probe.init();
    expect(probe.received).toEqual(owner.getCurrentState());
    expect(probe.received).not.toBe(owner.presentationState);
    expect(Object.values(probe.received)).not.toContain(persistence);
    probe.destroy();
    expect(persistence.replaceCategory).not.toHaveBeenCalled();
    expect(persistence.replaceGroup).not.toHaveBeenCalled();
  });

  it("derives toggles from accepted owner state and persists the domain action before commit/publication", () => {
    const persistence = setup();
    owner.init();
    const before = owner.getCurrentState();
    const order = [];
    persistence.replaceCategory.mockImplementation((id, collapsed) => {
      expect(owner.getCurrentState()).toEqual(before);
      order.push(["persist", id, collapsed]);
    });
    fixture.eventBus.on("command-presentation:state-changed", () =>
      order.push(["publish"]),
    );
    expect(owner.toggleCategory("__proto__")).toBe(true);
    expect(order).toEqual([["persist", "__proto__", true], ["publish"]]);
    persistence.load.mockReturnValue({
      collapsedCategories: [],
      collapsedGroups: [],
    });
    persistence.replaceCategory.mockReset();
    expect(owner.toggleCategory("__proto__")).toBe(false);
    expect(persistence.replaceCategory).toHaveBeenCalledExactlyOnceWith(
      "__proto__",
      false,
    );
    expect(owner.toggleGroup("pivot")).toBe(true);
    expect(persistence.replaceGroup).toHaveBeenCalledExactlyOnceWith(
      "pivot",
      true,
    );
    expect(persistence.load).toHaveBeenCalledTimes(2);
  });

  it.each(["replaceCategory", "replaceGroup"])(
    "keeps %s rejection atomic",
    (method) => {
      const persistence = setup();
      owner.init();
      const before = owner.getCurrentState();
      const publish = vi.spyOn(owner, "publishState");
      persistence[method].mockImplementation(() => {
        throw new Error("persist denied");
      });
      expect(() =>
        method === "replaceCategory"
          ? owner.toggleCategory("system")
          : owner.toggleGroup("pivot"),
      ).toThrow("persist denied");
      expect(owner.getCurrentState()).toEqual(before);
      expect(publish).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid actions before crossing the port", () => {
    const persistence = setup();
    expect(() => owner.toggleCategory("")).toThrow(TypeError);
    expect(() => owner.toggleGroup("unknown")).toThrow(TypeError);
    expect(persistence.replaceCategory).not.toHaveBeenCalled();
    expect(persistence.replaceGroup).not.toHaveBeenCalled();
  });

  it("propagates lifecycle load failure without changing accepted state or publishing", () => {
    const persistence = setup();
    owner.init();
    const before = owner.getCurrentState();
    const publish = vi.spyOn(owner, "publishState");
    persistence.load.mockImplementation(() => {
      throw new Error("load denied");
    });
    expect(() => owner.onInit()).toThrow("load denied");
    expect(owner.getCurrentState()).toEqual(before);
    expect(publish).not.toHaveBeenCalled();
  });

  it("requires explicit persistence without consulting ambient storage", () => {
    setup();
    expect(
      () => new CommandPresentationService({ eventBus: fixture.eventBus }),
    ).toThrow(TypeError);
  });

  it("hydrates pure data without storage access or modifying adapter snapshots", () => {
    setup();
    const data = Object.freeze({
      collapsedCategories: Object.freeze(["system", "aliases"]),
      collapsedGroups: Object.freeze(["pivot", "non-trayexec"]),
    });
    expect(
      readCommandPresentationState(data, { authorityEpoch: 9, revision: 2 }),
    ).toEqual({
      authorityEpoch: 9,
      revision: 2,
      collapsedCategories: ["aliases", "system"],
      collapsedGroups: ["non-trayexec", "pivot"],
    });
  });
});
