import { describe, expect, it, vi } from "vitest";

import STOToolsKeybindManager from "../../src/js/app.js";

describe("STOToolsKeybindManager dependencies", () => {
  it("keeps startup dependencies on the application instance", () => {
    const dependencies = {
      i18n: { t: (key) => key },
      storageService: { name: "storage" },
      ui: { showToast: () => {} },
      syncService: { name: "sync" },
      applyTranslations: () => {},
    };

    const app = new STOToolsKeybindManager(dependencies);

    expect(app.i18n).toBe(dependencies.i18n);
    expect(app.storageService).toBe(dependencies.storageService);
    expect(app.ui).toBe(dependencies.ui);
    expect(app.syncService).toBe(dependencies.syncService);
    expect(app.applyTranslations).toBe(dependencies.applyTranslations);
  });

  it("requires injected startup dependencies", async () => {
    const showToast = vi.fn();

    const app = new STOToolsKeybindManager({
      i18n: { t: (key) => key },
      ui: { showToast },
    });

    await expect(app.init()).rejects.toThrow(
      "Required dependencies not loaded",
    );
    expect(showToast).toHaveBeenCalledWith(
      "failed_to_load_application",
      "error",
    );
  });
});
