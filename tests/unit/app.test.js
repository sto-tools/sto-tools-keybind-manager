import { afterEach, describe, expect, it, vi } from "vitest";

import STOToolsKeybindManager from "../../src/js/app.js";

describe("STOToolsKeybindManager dependencies", () => {
  const originalStorageService = window.storageService;
  const originalDataService = window.dataService;
  const originalStoUI = window.stoUI;

  afterEach(() => {
    window.storageService = originalStorageService;
    window.dataService = originalDataService;
    window.stoUI = originalStoUI;
  });

  it("keeps startup dependencies on the application instance", () => {
    const dependencies = {
      i18n: { t: (key) => key },
      storageService: { name: "storage" },
      ui: { showToast: () => {} },
      dataService: { name: "data" },
      syncService: { name: "sync" },
    };

    const app = new STOToolsKeybindManager(dependencies);

    expect(app.i18n).toBe(dependencies.i18n);
    expect(app.storageService).toBe(dependencies.storageService);
    expect(app.ui).toBe(dependencies.ui);
    expect(app.dataService).toBe(dependencies.dataService);
    expect(app.syncService).toBe(dependencies.syncService);
  });

  it("does not fall back to timing-dependent window globals", async () => {
    window.storageService = { name: "legacy storage" };
    window.dataService = { name: "legacy data" };
    window.stoUI = { showToast: () => {} };
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
