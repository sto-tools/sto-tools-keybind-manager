import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import CommandService from "../../../src/js/components/services/CommandService.js";

describe("CommandService command catalog compatibility", () => {
  let fixture, service;

  beforeEach(() => {
    fixture = createServiceFixture();
    const i18nStub = { t: (k) => k };
    service = new CommandService({
      eventBus: fixture.eventBus,
      i18n: i18nStub,
    });
    service.init();
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
  });

  it("checks environment restrictions through the imported command catalog", async () => {
    await expect(service.isCommandCompatible("FireAll", "space")).resolves.toBe(
      true,
    );
    await expect(
      service.isCommandCompatible("FireAll", "ground"),
    ).resolves.toBe(false);
    await expect(service.isCommandCompatible("aim", "ground")).resolves.toBe(
      true,
    );
    await expect(service.isCommandCompatible("aim", "space")).resolves.toBe(
      false,
    );
  });

  it("keeps universal and unknown commands compatible", async () => {
    await expect(
      service.isCommandCompatible("Target_Enemy_Near", "ground"),
    ).resolves.toBe(true);
    await expect(
      service.isCommandCompatible("UnknownCommand", "space"),
    ).resolves.toBe(true);
  });
});
