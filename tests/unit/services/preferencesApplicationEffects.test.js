import { afterEach, describe, expect, it, vi } from "vitest";

import { applyPreferenceEffects } from "../../../src/js/components/services/preferencesApplicationEffects.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";

describe("preferences application effects", () => {
  afterEach(() => {
    document.body.classList.remove("compact-view");
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  it("attempts unrelated theme and layout effects after localization failures", async () => {
    const settings = {
      ...createDefaultPreferencesSettings(),
      compactView: true,
      language: "de",
      theme: "dark",
    };
    const catalogFailure = new Error("catalog failed");
    const translationFailure = new Error("translations failed");
    const i18n = {
      language: "en",
      changeLanguage: vi.fn(async (language) => {
        i18n.language = language;
      }),
      t: (key) => key,
    };
    const localizeCommands = vi.fn(() => {
      throw catalogFailure;
    });
    const applyTranslations = vi.fn(() => {
      throw translationFailure;
    });
    const assertCurrent = vi.fn();

    await expect(
      applyPreferenceEffects({
        settings,
        i18n: /** @type {any} */ (i18n),
        localizeCommands,
        applyTranslations,
        localizeCommandCatalog: true,
        assertCurrent,
      }),
    ).rejects.toEqual(
      expect.objectContaining({ errors: [catalogFailure, translationFailure] }),
    );

    expect(i18n.changeLanguage).toHaveBeenCalledWith("de");
    expect(localizeCommands).toHaveBeenCalledOnce();
    expect(applyTranslations).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.body.classList).toContain("compact-view");
    expect(assertCurrent).toHaveBeenCalled();
  });

  it("rejects promise-returning translation capabilities without awaiting them", async () => {
    const settings = createDefaultPreferencesSettings();
    const applyTranslations = vi.fn(async () => undefined);

    await expect(
      applyPreferenceEffects({
        settings,
        localizeCommands: vi.fn(),
        applyTranslations,
        localizeCommandCatalog: false,
        assertCurrent: vi.fn(),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: "applyTranslations must be synchronous",
          }),
        ],
      }),
    );

    expect(applyTranslations).toHaveBeenCalledOnce();
  });
});
