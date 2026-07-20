import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandService from "../../../src/js/components/services/CommandService.js";
import VFXManagerService from "../../../src/js/components/services/VFXManagerService.js";
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

  it("does not shadow ComponentBase isInitialized in VFXManagerService", () => {
    const service = new VFXManagerService(fixture.eventBus, {
      t: (key) => key,
    });

    expect(service.isInitialized()).toBe(false);
    service.init();
    expect(service.isInitialized()).toBe(true);
  });
});
