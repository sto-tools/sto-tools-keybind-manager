import { afterEach, describe, expect, it, vi } from "vitest";
import CommandService from "../../../src/js/components/services/CommandService.js";
import CommandChainService from "../../../src/js/components/services/CommandChainService.js";
import KeyService from "../../../src/js/components/services/KeyService.js";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import BindsetService from "../../../src/js/components/services/BindsetService.js";
import BindsetSelectorService from "../../../src/js/components/services/BindsetSelectorService.js";
import { request } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

const actions = [
  [CommandService, "command:delete", "key"],
  [CommandService, "command:move", "key"],
  [CommandService, "command:import-from-source", "sourceValue"],
  [CommandChainService, "command:set-stabilize", "name"],
  [KeyService, "key:add", "key"],
  [KeyService, "key:delete", "key"],
  [KeyService, "key:duplicate-with-name", "sourceKey"],
  [SelectionService, "selection:select-key", "keyName"],
  [SelectionService, "selection:select-alias", "aliasName"],
  [SelectionService, "key:select", "keyName"],
  [SelectionService, "alias:select", "aliasName"],
  [BindsetService, "bindset:create", "name"],
  [BindsetService, "bindset:clone", "sourceBindset"],
  [BindsetService, "bindset:rename", "oldName"],
  [BindsetService, "bindset:delete", "name"],
  [BindsetService, "bindset:delete-with-keys", "name"],
  [BindsetSelectorService, "bindset-selector:add-key-to-bindset", "bindset"],
  [
    BindsetSelectorService,
    "bindset-selector:remove-key-from-bindset",
    "bindset",
  ],
  [BindsetSelectorService, "bindset-selector:set-active-bindset", "bindset"],
];

describe("command/key/selection/bindset request ingress", () => {
  let fixture, service, restoreCache;
  afterEach(async () => {
    restoreCache?.();
    service?.destroy();
    await service?.selectionPersistenceSettled;
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  function start(Service) {
    fixture = createServiceFixture();
    service = new Service({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    service.init();
    service.request = vi.fn();
    const cache = service.cache;
    const read = vi.fn(() => {
      throw new Error("cache touched before validation");
    });
    Object.defineProperty(service, "cache", { configurable: true, get: read });
    restoreCache = () =>
      Object.defineProperty(service, "cache", {
        configurable: true,
        writable: true,
        value: cache,
      });
    return read;
  }

  it.each(actions)(
    "rejects accessor input for %s %s before any cache read",
    async (Service, topic, field) => {
      const read = start(Service);
      const getter = vi.fn(() => "F1");
      const payload = Object.defineProperty({}, field, {
        enumerable: true,
        get: getter,
      });
      await request(fixture.eventBus, topic, payload).catch(() => undefined);
      expect(getter).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(service.request).not.toHaveBeenCalled();
    },
  );

  it.each(actions)(
    "rejects cyclic input for %s %s before any cache read",
    async (Service, topic, field) => {
      const read = start(Service);
      const payload = {};
      payload[field] = payload;
      await request(fixture.eventBus, topic, payload).catch(() => undefined);
      expect(read).not.toHaveBeenCalled();
      expect(service.request).not.toHaveBeenCalled();
    },
  );

  it.each(actions)(
    "rejects wrong scalar fields for %s %s before any cache read",
    async (Service, topic, field) => {
      const read = start(Service);
      await request(fixture.eventBus, topic, { [field]: 42 }).catch(
        () => undefined,
      );
      expect(read).not.toHaveBeenCalled();
      expect(service.request).not.toHaveBeenCalled();
    },
  );

  it.each(["add", "edit"])(
    "detaches the %s command event before the command queue",
    async (type) => {
      const read = start(CommandService);
      const queue = vi.spyOn(service, "_enqueueCommandMutation");
      const getter = vi.fn(() => "FireAll");
      const command = Object.defineProperty({}, "command", {
        enumerable: true,
        get: getter,
      });
      const payload =
        type === "add"
          ? { key: "F1", command }
          : { key: "F1", index: 0, updatedCommand: command };
      await expect(service._handleCommandRequest(type, payload)).resolves.toBe(
        false,
      );
      expect(getter).not.toHaveBeenCalled();
      expect(queue).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("rejects an oversized extension before command queue capture", async () => {
    const read = start(CommandService);
    const queue = vi.spyOn(service, "_enqueueCommandMutation");
    await expect(
      service.addCommand("F1", {
        command: "FireAll",
        extension: "x".repeat(16 * 1024 * 1024),
      }),
    ).resolves.toBe(false);
    expect(queue).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps trusted selection cancellation callbacks off the public request surface", async () => {
    const read = start(SelectionService);
    const isCurrent = vi.fn(() => true);
    await expect(
      request(fixture.eventBus, "selection:select-key", {
        keyName: "F1",
        isCurrent,
      }),
    ).rejects.toThrow();
    expect(isCurrent).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
