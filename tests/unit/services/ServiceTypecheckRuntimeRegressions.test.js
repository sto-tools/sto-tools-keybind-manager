import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BindsetSelectorService from "../../../src/js/components/services/BindsetSelectorService.js";
import CommandService from "../../../src/js/components/services/CommandService.js";
import ExportService from "../../../src/js/components/services/ExportService.js";
import ImportService from "../../../src/js/components/services/ImportService.js";
import VFXManagerService from "../../../src/js/components/services/VFXManagerService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("service typecheck runtime regressions", () => {
  let fixture;

  beforeEach(() => {
    fixture = createServiceFixture();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it("retains the UI supplied to CommandService", () => {
    const ui = { showToast: vi.fn() };
    const service = new CommandService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
      ui,
    });

    expect(service.ui).toBe(ui);
  });

  it("passes BindsetSelectorService event bus through the KeyService options object", () => {
    const service = new BindsetSelectorService({ eventBus: fixture.eventBus });

    expect(service.keyService.eventBus).toBe(fixture.eventBus);
  });

  it("does not shadow ComponentBase isInitialized in VFXManagerService", () => {
    const service = new VFXManagerService(fixture.eventBus, {
      t: (key) => key,
    });

    expect(service.isInitialized()).toBe(false);
    service.init();
    expect(service.isInitialized()).toBe(true);
  });

  it("delegates the legacy export import endpoint to ImportService", async () => {
    const file = new File(["profile"], "profile.json", {
      type: "application/json",
    });
    const importHandler = vi.fn().mockResolvedValue({ success: true });
    respond(fixture.eventBus, "import:from-file", importHandler);

    const service = new ExportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    service.init();

    await expect(
      service.request("export:import-from-file", { file }),
    ).resolves.toEqual({ success: true });
    expect(importHandler).toHaveBeenCalledWith({ file });
  });

  it("imports standalone profile JSON through automatic file detection", async () => {
    const service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    const file = {
      name: "captain.json",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          name: "Imported Captain",
          keys: { F1: ["FireAll"] },
        }),
      ),
    };

    const result = await service.importFromFile(file);

    expect(result).toMatchObject({ success: true });
    expect(fixture.storage.getProfile(result.profileId)).toMatchObject({
      name: "Imported Captain",
      builds: { space: { keys: { F1: ["FireAll"] } } },
    });
  });
});
