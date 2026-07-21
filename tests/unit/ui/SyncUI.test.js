import { afterEach, describe, expect, it, vi } from "vitest";

import SyncUI from "../../../src/js/components/ui/SyncUI.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("SyncUI", () => {
  let fixture;
  let ui;

  afterEach(() => {
    ui?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("waits without a transport deadline for the complete sync operation", async () => {
    fixture = createServiceFixture();
    ui = new SyncUI({
      eventBus: fixture.eventBus,
      ui: { showToast: vi.fn() },
    });
    ui.request = vi.fn().mockResolvedValue({ success: true });

    await ui.performSync("manual");

    expect(ui.request).toHaveBeenCalledExactlyOnceWith(
      "sync:sync-project",
      { source: "manual" },
      0,
    );
  });
});
