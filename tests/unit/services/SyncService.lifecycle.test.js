import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SyncService from "../../../src/js/components/services/SyncService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("SyncService lifecycle ownership", () => {
  let fixture;
  let service;
  let services;
  let dependencies;

  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: false });
    services = [];
    dependencies = {
      eventBus: fixture.eventBus,
      ui: { showToast: vi.fn() },
      fs: {
        saveDirectoryHandle: vi.fn(),
        getDirectoryHandle: vi.fn(),
      },
      i18n: { t: vi.fn((key) => key) },
    };
    service = new SyncService(dependencies);
    services.push(service);
    service.init();
  });

  afterEach(() => {
    services.forEach((candidate) => {
      if (!candidate.destroyed) candidate.destroy();
    });
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("owns its responder and workflow subscriptions across reinit and replacement", async () => {
    const expectedCounts = {
      "rpc:sync:sync-project": 1,
      "preferences:saved": 2,
      "modal:hidden": 1,
      "sto-app-ready": 1,
    };
    const expectOwner = (multiplier) => {
      for (const [topic, count] of Object.entries(expectedCounts)) {
        expect(fixture.eventBus.getListenerCount(topic), topic).toBe(
          count * multiplier,
        );
      }
    };
    const predecessorSync = vi
      .spyOn(service, "syncProject")
      .mockResolvedValue({ success: true });

    service.init();
    expectOwner(1);
    await expect(
      service.request("sync:sync-project", { source: "manual" }),
    ).resolves.toEqual({ success: true });
    expect(predecessorSync).toHaveBeenCalledWith("manual");

    service.destroy();
    expectOwner(0);
    service.init();
    expectOwner(1);
    service.destroy();
    expectOwner(0);

    const replacement = new SyncService(dependencies);
    services.push(replacement);
    const replacementSync = vi
      .spyOn(replacement, "syncProject")
      .mockResolvedValue({ success: true });

    replacement.init();
    expectOwner(1);
    await expect(
      replacement.request("sync:sync-project", { source: "auto" }),
    ).resolves.toEqual({ success: true });
    expect(replacementSync).toHaveBeenCalledWith("auto");
    expect(predecessorSync).toHaveBeenCalledOnce();
  });
});
