import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { fingerprintWorkflowValue } from "../../../src/js/components/services/storageWorkflowReceipt.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("PreferencesService retained import activation", () => {
  let fixture;
  let service;

  beforeEach(async () => {
    fixture = createServiceFixture();
    service = new PreferencesService({
      settingsRepository: fixture.settingsRepository,
      eventBus: fixture.eventBus,
      i18n: {
        language: "en",
        t: (key) => key,
        changeLanguage: vi.fn(async () => {}),
      },
      localizeCommands: () => {},
      applyTranslations: () => {},
    });
    service.init();
    await service.initialStateReady;
    fixture.settingsRepository.load.mockClear();
    fixture.settingsRepository.replace.mockClear();
    fixture.settingsRepository.clear.mockClear();
  });

  afterEach(() => {
    service?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("adopts retained settings without a repository read or write", async () => {
    const retained = {
      ...service.getSettings(),
      theme: "default",
      language: "de",
      retainedExtension: { source: "durable-receipt" },
    };
    const fingerprint = fingerprintWorkflowValue(retained);
    fixture.settingsRepository.load.mockReturnValueOnce({
      status: "current",
      value: retained,
    });

    await expect(
      service.activateImportedSettings(retained, fingerprint),
    ).resolves.toMatchObject({ success: true, changed: true, revision: 2 });
    expect(fixture.settingsRepository.load).toHaveBeenCalledOnce();
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
    expect(fixture.settingsRepository.clear).not.toHaveBeenCalled();
    expect(service.getCurrentState().settings).toMatchObject({
      theme: "default",
      language: "de",
      retainedExtension: { source: "durable-receipt" },
    });
  });

  it("rejects mismatched retry material before repository access", async () => {
    const retained = service.getSettings();
    await expect(
      service.activateImportedSettings(retained, "fnv1a32:00000000:0"),
    ).resolves.toMatchObject({
      success: false,
      error: "preferences_activation_failed",
      retryable: true,
    });
    expect(fixture.settingsRepository.load).not.toHaveBeenCalled();
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
  });

  it("refuses retained activation when current durability has changed", async () => {
    const retained = { ...service.getSettings(), theme: "default" };
    fixture.settingsRepository.load.mockReturnValueOnce({
      status: "current",
      value: { ...retained, theme: "dark", language: "fr" },
    });

    await expect(
      service.activateImportedSettings(
        retained,
        fingerprintWorkflowValue(retained),
      ),
    ).resolves.toMatchObject({
      success: false,
      error: "preferences_activation_failed",
      retryable: true,
    });
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
    expect(service.getSettings().language).not.toBe("fr");
  });
});
