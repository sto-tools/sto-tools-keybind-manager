import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";
import { createServiceFixture } from "../../fixtures/index.js";

const absent = () => ({ status: "absent", settingsVerified: true });
const complete = () => ({
  status: "complete",
  settingsVerified: true,
  source: "legacy",
  exactPriorRootBackedUp: true,
  rootLayout: "settings-free",
});
const failed = (stage, error = "verification_failed") => ({
  status: "failed",
  settingsVerified: true,
  stage,
  error,
});

describe("Preferences startup structural migration readiness", () => {
  let fixture;
  let services;
  let effects;

  beforeEach(() => {
    fixture = createServiceFixture();
    services = [];
    effects = vi.fn();
  });
  afterEach(() => {
    for (const service of services.reverse()) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  function createService(startupMigration) {
    const service = new PreferencesService({
      startupMigration,
      settingsRepository: fixture.settingsRepository,
      eventBus: fixture.eventBus,
      localizeCommands: effects,
      applyTranslations: effects,
    });
    services.push(service);
    return service;
  }

  function expectBlocked(service, blockReason) {
    const state = service.getCurrentState();
    expect(state).toMatchObject({
      ready: false,
      blocked: true,
      readiness: "blocked",
      durability: "unverified",
      blockReason,
      revision: 0,
      settings: createDefaultPreferencesSettings(),
    });
    for (const operation of ["load", "replace", "clear"])
      expect(fixture.settingsRepository[operation]).not.toHaveBeenCalled();
    expect(effects).not.toHaveBeenCalled();
    for (const topic of [
      "rpc:preferences:activate-persisted-settings",
      "rpc:preferences:persist-sync-folder-settings",
      "rpc:preferences:save-settings",
      "rpc:preferences:set-setting",
      "rpc:preferences:set-settings",
      "theme:toggle",
      "language:change",
    ])
      expect(fixture.eventBus.hasListeners(topic), topic).toBe(false);
    for (const topic of [
      "preferences:saved",
      "preferences:loaded",
      "preferences:changed",
      "language:changed",
    ])
      expect(
        fixture.eventBusFixture.getEventsOfType(topic),
        topic,
      ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toEqual([
      expect.objectContaining({
        data: { reason: "startup-blocked", state },
      }),
    ]);
  }

  it.each([
    ["root read", failed("legacy_root_decode", "storage_read_failed")],
    ["backup", failed("legacy_root_backup", "backup_write_failed")],
    ["root rewrite", failed("canonical_root_commit", "storage_write_failed")],
    ["root readback", failed("canonical_root_verify")],
    ["settings read", failed("settings_read", "storage_read_failed")],
    ["settings verify", failed("settings_verify")],
    [
      "pending backup",
      {
        status: "pending",
        settingsVerified: true,
        stage: "legacy_root_backup",
      },
    ],
    [
      "pending root commit",
      {
        status: "pending",
        settingsVerified: true,
        stage: "canonical_root_commit",
      },
    ],
  ])(
    "blocks %s despite verified standalone settings",
    async (_name, receipt) => {
      const service = createService(receipt);
      const reason =
        receipt.error === "storage_read_failed"
          ? "storage_read_failed"
          : "verification_failed";
      service.init();
      await expect(service.initialStateReady).rejects.toThrow(reason);
      expectBlocked(service, reason);
    },
  );

  it.each([
    ["null", null],
    ["empty", {}],
    ["unknown status", { status: "ready", settingsVerified: true }],
    ["unverified absence", { status: "absent", settingsVerified: false }],
    ["incomplete completion", { status: "complete", settingsVerified: true }],
    ["open receipt", { ...absent(), privateData: "not metadata" }],
    ["preflight envelope", { mode: "preflight", receipt: absent() }],
  ])(
    "blocks a malformed %s receipt before repository access",
    async (_name, receipt) => {
      const service = createService(receipt);
      service.init();
      await expect(service.initialStateReady).rejects.toThrow(
        "verification_failed",
      );
      expectBlocked(service, "verification_failed");
    },
  );

  it("rejects accessor receipt fields without invoking them", async () => {
    const getter = vi.fn(() => "absent");
    const receipt = Object.defineProperty(
      { settingsVerified: true },
      "status",
      {
        enumerable: true,
        get: getter,
      },
    );
    const service = createService(receipt);
    service.init();
    await expect(service.initialStateReady).rejects.toThrow(
      "verification_failed",
    );
    expect(getter).not.toHaveBeenCalled();
    expectBlocked(service, "verification_failed");
  });

  it.each([
    ["absent", absent],
    ["complete", complete],
    ["independent owner without migration receipt", () => undefined],
  ])(
    "permits %s but still verifies the standalone owner startup",
    async (_name, makeReceipt) => {
      const service = createService(makeReceipt());
      service.init();
      await expect(service.initialStateReady).resolves.toMatchObject({
        ready: true,
        blocked: false,
        readiness: "ready",
        durability: "verified",
        revision: 1,
      });
      expect(fixture.settingsRepository.load).toHaveBeenCalledOnce();
      expect(fixture.settingsRepository.replace).toHaveBeenCalledOnce();
      expect(effects).toHaveBeenCalled();
      expect(fixture.eventBus.hasListeners("rpc:preferences:set-setting")).toBe(
        true,
      );
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
      ).toHaveLength(1);
    },
  );

  it("does not let a successful migration bypass later standalone read failure", async () => {
    fixture.settingsRepository.load.mockReturnValueOnce({
      status: "read_failed",
      error: "storage_read_failed",
      category: "security",
    });
    const service = createService(complete());
    service.init();
    await expect(service.initialStateReady).rejects.toThrow(
      "storage_read_failed",
    );
    expect(service.getCurrentState()).toMatchObject({
      ready: false,
      blocked: true,
      durability: "unverified",
    });
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
    expect(effects).not.toHaveBeenCalled();
  });

  it("captures detached receipts across caller mutation and reinitialization", async () => {
    const receipt = complete();
    const service = createService(receipt);
    Object.assign(receipt, failed("canonical_root_commit"));
    service.init();
    await service.initialStateReady;
    const firstEpoch = service.getCurrentState().authorityEpoch;
    service.destroy();
    service.init();
    await service.initialStateReady;
    expect(service.getCurrentState()).toMatchObject({
      ready: true,
      revision: 1,
    });
    expect(service.getCurrentState().authorityEpoch).toBeGreaterThan(
      firstEpoch,
    );
    expect(fixture.settingsRepository.replace).toHaveBeenCalledTimes(2);
  });

  it("retains a blocked migration across reinitialization until a new owner receives success", async () => {
    const receipt = failed("legacy_root_backup");
    const service = createService(receipt);
    Object.assign(receipt, absent());
    service.init();
    await expect(service.initialStateReady).rejects.toThrow(
      "verification_failed",
    );
    const firstEpoch = service.getCurrentState().authorityEpoch;
    service.destroy();
    fixture.eventBusFixture.clearEventHistory();
    service.init();
    await expect(service.initialStateReady).rejects.toThrow(
      "verification_failed",
    );
    expect(service.getCurrentState().authorityEpoch).toBeGreaterThan(
      firstEpoch,
    );
    expectBlocked(service, "verification_failed");
    service.destroy();
    const successor = createService(absent());
    successor.init();
    await expect(successor.initialStateReady).resolves.toMatchObject({
      ready: true,
    });
  });

  it("uses only the injected receipt and repository with poisoned ambient storage", async () => {
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    const getter = vi.fn(() => {
      throw new Error("ambient storage forbidden");
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: getter,
    });
    try {
      const service = createService(failed("canonical_root_commit"));
      service.init();
      await expect(service.initialStateReady).rejects.toThrow(
        "verification_failed",
      );
      expectBlocked(service, "verification_failed");
      expect(getter).not.toHaveBeenCalled();
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", previous);
      else delete globalThis.localStorage;
    }
  });
});
