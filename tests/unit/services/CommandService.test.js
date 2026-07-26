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

  it("does not read or retain retired constructor dependencies", () => {
    /** @type {(string | symbol)[]} */
    const reads = [];
    const options = new Proxy(
      {
        eventBus: fixture.eventBus,
        i18n: service.i18n,
      },
      {
        get(target, property, receiver) {
          reads.push(property);
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const candidate = new CommandService(options);

    expect(reads).not.toContain("storage");
    expect(reads).not.toContain("profileService");
    expect(reads).not.toContain("modalManager");
    expect(service).not.toHaveProperty("storage");
    expect(service).not.toHaveProperty("profileService");
    expect(service).not.toHaveProperty("modalManager");

    candidate.destroy();
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
