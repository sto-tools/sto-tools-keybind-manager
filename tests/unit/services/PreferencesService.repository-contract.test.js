import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";
import { createServiceFixture } from "../../fixtures/index.js";

const committed = (value) => ({
  status: "committed",
  value: structuredClone(value),
  write: { status: "acknowledged" },
  verification: { status: "verified" },
});
const verificationFailed = () => ({
  status: "verification_failed",
  error: "verification_failed",
  write: { status: "acknowledged" },
  verification: {
    status: "failed",
    error: "verification_failed",
    reason: "read_failed",
  },
});

describe("Preferences repository ownership contract", () => {
  let fixture;
  let service;
  let effects;

  beforeEach(() => {
    fixture = createServiceFixture();
    effects = vi.fn();
    service = new PreferencesService({
      settingsRepository: fixture.settingsRepository,
      eventBus: fixture.eventBus,
      localizeCommands: effects,
      applyTranslations: effects,
    });
  });
  afterEach(() => {
    service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });
  async function start() {
    service.init();
    await service.initialStateReady;
    fixture.settingsRepository.replace.mockClear();
    fixture.settingsRepository.load.mockClear();
    fixture.settingsRepository.clear.mockClear();
    fixture.eventBusFixture.clearEventHistory();
    effects.mockClear();
  }

  function expectNoSuccess() {
    for (const topic of [
      "preferences:saved",
      "preferences:loaded",
      "preferences:changed",
      "language:changed",
    ]) {
      expect(
        fixture.eventBusFixture.getEventsOfType(topic),
        topic,
      ).toHaveLength(0);
    }
    expect(effects).not.toHaveBeenCalled();
  }

  it("adopts the exact detached verified repository value for ordinary mutations", async () => {
    await start();
    const accepted = {
      ...service.getSettings(),
      theme: "default",
      acceptedExtension: { value: 42 },
    };
    fixture.settingsRepository.replace.mockReturnValueOnce(committed(accepted));
    await expect(service.setSetting("theme", "dark")).resolves.toBe(true);
    expect(service.getSettings()).toEqual(accepted);
    expect(service.getCurrentState().settings).toEqual(accepted);
    accepted.acceptedExtension.value = 99;
    expect(service.getSetting("acceptedExtension")).toEqual({ value: 42 });
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:saved")[0].data
        .settings,
    ).toEqual(service.getSettings());
  });

  it.each([
    [false],
    [undefined],
    [{ status: "committed" }],
    [verificationFailed()],
  ])(
    "does not adopt, revise, apply, or announce a malformed/failed mutation receipt %j",
    async (receipt) => {
      await start();
      const before = service.getCurrentState();
      fixture.settingsRepository.replace.mockReturnValueOnce(receipt);
      await expect(service.setSetting("autoSave", false)).resolves.toBe(false);
      expect(service.getCurrentState()).toBe(before);
      expect(service.getSettings()).toEqual(before.settings);
      expectNoSuccess();
    },
  );

  it("validates mutation inputs before consulting readiness or accepted state", () => {
    const readiness = vi.spyOn(service, "_readyMutationGeneration");
    const getSettings = vi.spyOn(service, "getSettings");
    expect(() => service.setSettings({ autoSave: "invalid" })).toThrow(
      "Invalid preferences settings payload",
    );
    expect(() => service.commitSetting("unsafe", () => {})).toThrow();
    expect(() => service.commitSetting("version", false)).toThrow();
    expect(() =>
      service.persistSyncFolderSettings({ autoSync: false }),
    ).toThrow();
    expect(readiness).not.toHaveBeenCalled();
    expect(getSettings).not.toHaveBeenCalled();
  });

  it("stages compatible imported settings without adopting until one-shot activation", async () => {
    await start();
    await service.setExtensionSetting("version", "destination-version");
    await service.setExtensionSetting("firstRun", false);
    fixture.settingsRepository.replace.mockClear();
    fixture.eventBusFixture.clearEventHistory();
    effects.mockClear();
    const before = service.getCurrentState();
    let returned;
    await service.runExternalActivationTransition(
      "project-restore",
      async (activate, assertActive, persistImportedSettings) => {
        assertActive();
        returned = await persistImportedSettings({
          theme: "default",
          version: "imported-version",
          firstRun: true,
          extension: { items: [1] },
        });
        expect(returned.status).toBe("committed");
        expect(returned.value).toMatchObject({
          version: "destination-version",
          firstRun: false,
        });
        expect(service.getCurrentState()).toBe(before);
        expectNoSuccess();
        returned.value.extension.items.push(2);
        await expect(activate()).resolves.toMatchObject({ success: true });
        await expect(activate()).resolves.toMatchObject({
          success: false,
          params: { reason: "preferences_activation_already_used" },
        });
        await expect(
          persistImportedSettings({ theme: "dark" }),
        ).rejects.toThrow("preferences_import_persistence_unavailable");
      },
    );
    expect(fixture.settingsRepository.replace).toHaveBeenCalledOnce();
    expect(fixture.settingsRepository.load).not.toHaveBeenCalled();
    expect(service.getSettings()).toMatchObject({
      version: "destination-version",
      firstRun: false,
      extension: { items: [1] },
    });
  });

  it("uses imported version only when destination version is falsy and never imports firstRun", async () => {
    await start();
    await service.runExternalActivationTransition(
      "project-restore",
      async (activate, _assert, persist) => {
        const result = await persist({ version: "imported", firstRun: true });
        expect(result.value.version).toBe("imported");
        expect(result.value).not.toHaveProperty("firstRun");
        await activate();
      },
    );
  });

  it("rejects unsafe patches without reading owner state or attempting persistence", async () => {
    await start();
    const getter = vi.fn(() => true);
    const patch = Object.defineProperty({}, "autoSave", {
      enumerable: true,
      get: getter,
    });
    await service.runExternalActivationTransition(
      "project-restore",
      async (activate, _assert, persist) => {
        const readOwner = vi.spyOn(service, "getSettings");
        expect(await persist(patch)).toEqual({
          status: "rejected",
          error: "invalid_data",
          write: { status: "not_attempted" },
          verification: { status: "not_attempted" },
        });
        expect(readOwner).not.toHaveBeenCalled();
        await expect(persist({ theme: "default" })).rejects.toThrow(
          "preferences_import_persistence_unavailable",
        );
        await expect(activate()).resolves.toMatchObject({ success: false });
      },
    );
    expect(getter).not.toHaveBeenCalled();
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
  });

  it("retains exact failed-stage durability evidence and prevents activation replay", async () => {
    await start();
    const before = service.getCurrentState();
    fixture.settingsRepository.replace.mockReturnValueOnce(
      verificationFailed(),
    );
    await service.runExternalActivationTransition(
      "project-restore",
      async (activate, _assert, persist) => {
        expect(await persist({ theme: "default" })).toEqual(
          verificationFailed(),
        );
        await expect(activate()).resolves.toMatchObject({
          success: false,
          params: { reason: "preferences_settings_verification_failed" },
        });
      },
    );
    expect(fixture.settingsRepository.replace).toHaveBeenCalledOnce();
    expect(fixture.settingsRepository.load).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toBe(before);
    expectNoSuccess();
  });

  it("closes retained import capabilities and forbids them in reset leases", async () => {
    await start();
    let retained;
    await service.runExternalActivationTransition(
      "project-restore",
      (_activate, _assert, persist) => {
        retained = persist;
      },
    );
    await expect(retained({ theme: "default" })).rejects.toThrow(
      "operation_cancelled",
    );
    await service.runExternalActivationTransition(
      "application-reset",
      async (_activate, _assert, persist) => {
        await expect(persist({ theme: "default" })).rejects.toThrow(
          "preferences_import_persistence_unavailable",
        );
      },
    );
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
  });

  it("returns indeterminate stage evidence on repository throw without overriding the workflow receipt", async () => {
    await start();
    fixture.settingsRepository.replace.mockImplementationOnce(() => {
      throw new Error("private failure");
    });
    const outcome = await service.runExternalActivationTransition(
      "project-restore",
      async (_activate, _assert, persist) => {
        const stage = await persist({ theme: "default" });
        expect(stage).toEqual({
          status: "write_failed",
          error: "storage_write_failed",
          write: {
            status: "indeterminate",
            error: "storage_write_failed",
            category: "unknown",
          },
          verification: { status: "not_attempted" },
        });
        return {
          success: false,
          committedProfiles: ["first"],
          settings: stage,
        };
      },
    );
    expect(outcome.committedProfiles).toEqual(["first"]);
    expect(outcome.settings.write.status).toBe("indeterminate");
    expectNoSuccess();
  });

  it("drains a staged write and activation even when the lease callback does not await them", async () => {
    await start();
    const order = [];
    const replace = fixture.settingsRepository.replace.getMockImplementation();
    fixture.settingsRepository.replace.mockImplementation((value) => {
      order.push("write");
      return replace(value);
    });
    await service.runExternalActivationTransition(
      "project-restore",
      (activate, _assert, persist) => {
        void persist({ theme: "default" });
        void activate();
        order.push("callback-return");
      },
    );
    order.push("lease-return");
    expect(order).toEqual(["callback-return", "write", "lease-return"]);
    expect(service.getSetting("theme")).toBe("default");
    expect(fixture.settingsRepository.replace).toHaveBeenCalledOnce();
  });

  it("cancels staged activation when persistence replaces the owner lifecycle", async () => {
    await start();
    const before = service.getCurrentState();
    fixture.settingsRepository.replace.mockImplementationOnce((settings) => {
      service.destroy();
      return committed(settings);
    });
    await expect(
      service.runExternalActivationTransition(
        "project-restore",
        async (activate, _assert, persist) => {
          await persist({ theme: "default" });
          await activate();
        },
      ),
    ).rejects.toThrow("operation_cancelled");
    expect(service.getCurrentState()).toBe(before);
    expectNoSuccess();
  });

  it("closes new lease capability invocations while an already-started activation drains", async () => {
    await start();
    let release;
    let started;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const entered = new Promise((resolve) => {
      started = resolve;
    });
    const original = service.applySettings.bind(service);
    vi.spyOn(service, "applySettings").mockImplementationOnce(
      async (...args) => {
        started();
        await gate;
        return original(...args);
      },
    );
    let capabilities;
    const lease = service.runExternalActivationTransition(
      "project-restore",
      (activate, assertActive, persist) => {
        capabilities = { activate, assertActive, persist };
        void activate();
        return "callback-settled";
      },
    );
    await entered;
    await Promise.resolve();
    expect(() => capabilities.assertActive()).toThrow("operation_cancelled");
    await expect(capabilities.persist({ theme: "default" })).rejects.toThrow(
      "operation_cancelled",
    );
    await expect(capabilities.activate()).resolves.toMatchObject({
      success: false,
      error: "operation_cancelled",
    });
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
    release();
    await expect(lease).resolves.toBe("callback-settled");
  });

  it("does not adopt reset defaults when clear succeeds but defaults verification fails", async () => {
    await start();
    const before = service.getCurrentState();
    fixture.settingsRepository.replace.mockReturnValueOnce(
      verificationFailed(),
    );
    await expect(
      service.activatePersistedSettings("application-reset"),
    ).resolves.toMatchObject({
      success: false,
      params: { reason: "preferences_settings_verification_failed" },
    });
    expect(fixture.settingsRepository.clear).toHaveBeenCalledOnce();
    expect(fixture.settingsRepository.replace).toHaveBeenCalledOnce();
    expect(fixture.settingsRepository.load).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toBe(before);
    expectNoSuccess();
  });

  it("retains owner state after an indeterminate repository reset-clear receipt", async () => {
    await start();
    const before = service.getCurrentState();
    fixture.settingsRepository.clear.mockReturnValueOnce({
      status: "clear_failed",
      removal: {
        status: "indeterminate",
        error: "storage_write_failed",
        category: "security",
      },
    });

    await expect(
      service.activatePersistedSettings("application-reset"),
    ).resolves.toEqual({
      success: false,
      error: "preferences_activation_failed",
      params: { reason: "preferences_settings_clear_failed" },
      retryable: true,
    });

    expect(fixture.settingsRepository.clear).toHaveBeenCalledOnce();
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
    expect(fixture.settingsRepository.load).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toBe(before);
    expect(service.getSettings()).toEqual(before.settings);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
    expectNoSuccess();
  });

  it.each(["repair_required", "read_failed"])(
    "does not replay writes for project activation loading %s",
    async (status) => {
      await start();
      const before = service.getCurrentState();
      fixture.settingsRepository.load.mockReturnValueOnce(
        status === "read_failed"
          ? { status, error: "storage_read_failed", category: "unknown" }
          : {
              status,
              reason: "missing",
              value: createDefaultPreferencesSettings(),
            },
      );
      await expect(
        service.activatePersistedSettings("project-restore"),
      ).resolves.toMatchObject({ success: false });
      expect(service.getCurrentState()).toBe(before);
      expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
      expectNoSuccess();
    },
  );
});
