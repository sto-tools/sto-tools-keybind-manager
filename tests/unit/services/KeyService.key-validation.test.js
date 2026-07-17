import { afterEach, beforeEach, describe, expect, it } from "vitest";

import KeyService from "../../../src/js/components/services/KeyService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("KeyService canonical key validation", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new KeyService({ eventBus: fixture.eventBus });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
  });

  it("accepts exact canonical single keys and rejects unknown spellings", async () => {
    await expect(service.isValidKeyName("F1")).resolves.toBe(true);
    await expect(service.isValidKeyName("Space")).resolves.toBe(true);
    await expect(service.isValidKeyName("enter")).resolves.toBe(true);
    await expect(service.isValidKeyName("Enter")).resolves.toBe(false);
    await expect(service.isValidKeyName("K1")).resolves.toBe(false);
    await expect(service.isValidKeyName("Key_123")).resolves.toBe(false);
    await expect(service.isValidKeyName("UnknownKey")).resolves.toBe(false);
  });

  it("normalizes chord components without broadening modifier aliases", async () => {
    await expect(service.isValidKeyName("control+space")).resolves.toBe(true);
    await expect(service.isValidKeyName(" ALT + F1 ")).resolves.toBe(true);
    await expect(service.isValidKeyName("CTRL+Space")).resolves.toBe(false);
    await expect(service.isValidKeyName("ALT+UnknownKey")).resolves.toBe(false);
  });

  it("enforces the established twenty-character limit", async () => {
    await expect(service.isValidKeyName("Control+Control+F10")).resolves.toBe(
      true,
    );
    await expect(
      service.isValidKeyName("Control+Control+F10+F1"),
    ).resolves.toBe(false);
  });

  it("does not depend on a validation-data responder", async () => {
    expect(fixture.eventBus.hasListeners("rpc:data:get-key-name-pattern")).toBe(
      false,
    );
    await expect(service.isValidKeyName("F2")).resolves.toBe(true);
  });
});
