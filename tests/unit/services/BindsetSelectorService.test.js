import { afterEach, beforeEach, describe, expect, it } from "vitest";

import BindsetSelectorService from "../../../src/js/components/services/BindsetSelectorService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("BindsetSelectorService key lookup", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new BindsetSelectorService({ eventBus: fixture.eventBus });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
  });

  it("does not expose its internal lookup helper as an RPC", () => {
    expect(
      fixture.eventBus.hasListeners("rpc:bindset-selector:find-key-in-bindset"),
    ).toBe(false);
  });

  it("preserves exact lookup for primary and named bindset membership", async () => {
    const primaryCommands = ["FireAll"];
    const namedCommands = ["Target_Enemy_Near"];

    expect(service.findKeyInBindset({ F1: primaryCommands }, "F1")).toBe(
      primaryCommands,
    );
    expect(service.findKeyInBindset({ F1: primaryCommands }, "F2")).toBeNull();
    expect(service.findKeyInBindset(undefined, "F1")).toBeNull();

    service.cache.selectedKey = "F1";
    service.cache.currentEnvironment = "space";
    service.cache.profile = {
      builds: { space: { keys: { F1: primaryCommands } } },
      bindsets: {
        Weapons: { space: { keys: { F1: namedCommands } } },
      },
    };

    await expect(service.keyExistsInBindset("Primary Bindset")).resolves.toBe(
      true,
    );
    await expect(service.keyExistsInBindset("Weapons")).resolves.toBe(true);
    await expect(service.keyExistsInBindset("Missing")).resolves.toBe(false);
  });
});
