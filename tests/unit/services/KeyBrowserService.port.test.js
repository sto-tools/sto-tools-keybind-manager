import { afterEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../../src/js/components/ComponentBase.js";
import KeyBrowserService from "../../../src/js/components/services/KeyBrowserService.js";
import { readKeyBrowserViewState } from "../../../src/js/components/services/keyBrowserViewState.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("KeyBrowserService domain persistence port", () => {
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

  function setup(
    data = {
      mode: "grid",
      collapsedCategories: { command: [], keyType: [] },
      collapsedBindsets: [],
    },
  ) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("ambient storage forbidden");
      },
    });
    fixture = createServiceFixture();
    const persistence = {
      load: vi.fn(() => data),
      replaceMode: vi.fn(),
      isCategoryCollapsed: vi.fn(() => false),
      replaceCategory: vi.fn(),
      isBindsetCollapsed: vi.fn(() => false),
      replaceBindset: vi.fn(),
    };
    owner = new KeyBrowserService({ eventBus: fixture.eventBus, persistence });
    return persistence;
  }

  it("loads detached complete state without exporting the private port", () => {
    const data = {
      mode: "categorized",
      collapsedCategories: { command: ["system"], keyType: ["function"] },
      collapsedBindsets: ["Tactical"],
    };
    const persistence = setup(data);
    const states = [];
    fixture.eventBus.on("key-browser:state-changed", (state) =>
      states.push(state),
    );
    owner.init();
    expect(persistence.load).toHaveBeenCalledTimes(2);
    expect(states).toEqual([
      { authorityEpoch: expect.any(Number), revision: 0, ...data },
    ]);
    data.collapsedCategories.command.push("port-only");
    states[0].collapsedBindsets.push("consumer-only");
    expect(owner.getCurrentState().collapsedCategories.command).toEqual([
      "system",
    ]);
    expect(owner.getCurrentState().collapsedBindsets).toEqual(["Tactical"]);
    expect(Object.values(owner)).not.toContain(persistence);
    expect(JSON.stringify(owner.getCurrentState())).not.toContain("load");
    class Probe extends ComponentBase {
      handleInitialState(reply) {
        if (reply.sender === "KeyBrowserService") this.received = reply.state;
      }
    }
    const probe = new Probe(fixture.eventBus);
    probe.init();
    expect(probe.received).toEqual(owner.getCurrentState());
    expect(probe.received).not.toBe(owner.viewState);
    expect(Object.values(probe.received)).not.toContain(persistence);
    probe.destroy();
  });

  it("uses fresh persisted category and bindset reads even when owner cache disagrees", () => {
    const persistence = setup();
    owner.init();
    persistence.isCategoryCollapsed
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    expect(owner.toggleKeyCategory("function", "type")).toBe(false);
    expect(owner.toggleKeyCategory("function", "key-type")).toBe(true);
    expect(persistence.isCategoryCollapsed.mock.calls).toEqual([
      ["function", "type"],
      ["function", "key-type"],
    ]);
    expect(persistence.replaceCategory.mock.calls).toEqual([
      ["function", "type", false],
      ["function", "key-type", true],
    ]);
    persistence.isBindsetCollapsed
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    expect(owner.toggleBindsetCollapse("__proto__")).toBe(false);
    expect(owner.toggleBindsetCollapse("__proto__")).toBe(true);
    expect(persistence.replaceBindset.mock.calls).toEqual([
      ["__proto__", false],
      ["__proto__", true],
    ]);
    expect(owner.getCurrentState()).toMatchObject({
      revision: 4,
      collapsedCategories: { command: [], keyType: ["function"] },
      collapsedBindsets: ["__proto__"],
    });
    expect(persistence.load).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["replaceMode", (service) => service.cycleKeyViewMode(), ["categorized"]],
    [
      "replaceCategory",
      (service) => service.toggleKeyCategory("system", "command"),
      ["system", "command", true],
    ],
    [
      "replaceBindset",
      (service) => service.toggleBindsetCollapse("Tactical"),
      ["Tactical", true],
    ],
  ])(
    "persists %s before committing or publishing and keeps write failure atomic",
    (method, action, args) => {
      const persistence = setup();
      owner.init();
      const before = owner.getCurrentState();
      const publish = vi.spyOn(owner, "publishViewState");
      persistence[method].mockImplementation(() => {
        expect(owner.getCurrentState()).toEqual(before);
        throw new Error("persist denied");
      });
      expect(() => action(owner)).toThrow("persist denied");
      expect(persistence[method]).toHaveBeenCalledExactlyOnceWith(...args);
      expect(owner.getCurrentState()).toEqual(before);
      expect(publish).not.toHaveBeenCalled();
      const order = [];
      persistence[method].mockImplementation(() => {
        expect(owner.getCurrentState()).toEqual(before);
        order.push("persist");
      });
      publish.mockImplementation(() => order.push("publish"));
      action(owner);
      expect(order).toEqual(["persist", "publish"]);
      expect(owner.getCurrentState().revision).toBe(1);
    },
  );

  it.each(["isCategoryCollapsed", "isBindsetCollapsed"])(
    "propagates %s failure before writes or publication",
    (method) => {
      const persistence = setup();
      const before = owner.getCurrentState();
      const publish = vi.spyOn(owner, "publishViewState");
      persistence[method].mockImplementation(() => {
        throw new Error("read denied");
      });
      expect(() =>
        method === "isCategoryCollapsed"
          ? owner.toggleKeyCategory("system")
          : owner.toggleBindsetCollapse("Tactical"),
      ).toThrow("read denied");
      expect(owner.getCurrentState()).toEqual(before);
      expect(persistence.replaceCategory).not.toHaveBeenCalled();
      expect(persistence.replaceBindset).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    },
  );

  it("preserves empty action no-ops without entering persistence", () => {
    const persistence = setup();
    expect(owner.toggleKeyCategory("")).toBe(false);
    expect(owner.toggleBindsetCollapse(undefined)).toBe(false);
    expect(persistence.isCategoryCollapsed).not.toHaveBeenCalled();
    expect(persistence.isBindsetCollapsed).not.toHaveBeenCalled();
    expect(persistence.replaceCategory).not.toHaveBeenCalled();
    expect(persistence.replaceBindset).not.toHaveBeenCalled();
  });

  it("propagates lifecycle load failure and requires explicit persistence", () => {
    const persistence = setup();
    const before = owner.getCurrentState();
    const publish = vi.spyOn(owner, "publishViewState");
    persistence.load.mockImplementation(() => {
      throw new Error("load denied");
    });
    expect(() => owner.onInit()).toThrow("load denied");
    expect(owner.getCurrentState()).toEqual(before);
    expect(publish).not.toHaveBeenCalled();
    expect(() => new KeyBrowserService({ eventBus: fixture.eventBus })).toThrow(
      TypeError,
    );
  });

  it("hydrates frozen pure data without storage access or mutation", () => {
    setup();
    const data = Object.freeze({
      mode: "key-types",
      collapsedCategories: Object.freeze({
        command: Object.freeze(["system", "aliases"]),
        keyType: Object.freeze(["function"]),
      }),
      collapsedBindsets: Object.freeze(["Zulu", "Alpha"]),
    });
    expect(
      readKeyBrowserViewState(data, { authorityEpoch: 8, revision: 0 }),
    ).toEqual({
      authorityEpoch: 8,
      revision: 0,
      mode: "key-types",
      collapsedCategories: {
        command: ["aliases", "system"],
        keyType: ["function"],
      },
      collapsedBindsets: ["Alpha", "Zulu"],
    });
  });
});
