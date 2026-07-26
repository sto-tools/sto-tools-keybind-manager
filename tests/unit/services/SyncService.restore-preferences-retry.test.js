import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SyncService from "../../../src/js/components/services/SyncService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const PROJECT_FILE = {
  content: '{"type":"project"}',
  fileName: "project.json",
};
const RELOAD_SUCCESS = {
  success: true,
  profiles: 1,
  currentProfile: "alpha",
  environment: "space",
};
const PREFERENCES_SUCCESS = {
  success: true,
  changed: true,
  revision: 3,
  effects: "applied",
};
const PREFERENCES_PENDING_RECEIPT = {
  success: false,
  error: "project_restore_reload_failed",
  params: { reason: "settings activation unavailable" },
  durable: true,
  currentProfile: "alpha",
  imported: { profiles: 1, settings: true },
  activation: { data: "complete", preferences: "pending" },
};

describe("SyncService restore Preferences retry", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: false });
    service = new SyncService({
      eventBus: fixture.eventBus,
      ui: { showToast: vi.fn() },
      fs: {},
      i18n: {
        t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
      },
    });
    service.init();
    vi.spyOn(service, "loadSyncFolderCapability").mockResolvedValue({
      success: true,
      state: "available",
      value: { raw: {} },
    });
    vi.spyOn(service, "checkSyncFolderPermission").mockResolvedValue({
      success: true,
      state: "granted",
    });
    service.stagePendingSyncDecision("import", PROJECT_FILE);
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("retries only pending Preferences activation after data completed", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(PREFERENCES_PENDING_RECEIPT)
      .mockResolvedValueOnce(PREFERENCES_SUCCESS);
    service.invokeRequest = request;
    let receiptAtSuccess;
    service.ui.showToast.mockImplementation((message) => {
      if (message === "project_imported_from_sync_folder") {
        receiptAtSuccess = structuredClone(
          service.pendingRestoreActivationReceipt,
        );
      }
    });

    await service.applyPendingSyncDecision();
    service.deferredImportContent = null;
    await service.applyPendingSyncDecision();

    expect(request.mock.calls).toEqual([
      ["project:restore-from-content", PROJECT_FILE, 0],
      [
        "preferences:activate-persisted-settings",
        { source: "project-restore" },
        0,
      ],
    ]);
    expect(receiptAtSuccess).toEqual({
      currentProfile: "alpha",
      imported: { profiles: 1, settings: true },
      activation: { data: "complete", preferences: "complete" },
    });
    expect(service.pendingRestoreActivationReceipt).toBeNull();
    expect(service.pendingSyncAction).toBeNull();
  });

  it("advances the receipt after data succeeds and never replays completed work", async () => {
    const bothPending = {
      ...PREFERENCES_PENDING_RECEIPT,
      params: { reason: "data activation unavailable" },
      activation: { data: "pending", preferences: "pending" },
    };
    const preferencesFailure = {
      success: false,
      error: "preferences_activation_failed",
      params: { reason: "settings activation unavailable" },
      retryable: true,
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce(bothPending)
      .mockResolvedValueOnce(RELOAD_SUCCESS)
      .mockResolvedValueOnce(preferencesFailure)
      .mockResolvedValueOnce(PREFERENCES_SUCCESS);
    service.invokeRequest = request;

    await service.applyPendingSyncDecision();
    await service.applyPendingSyncDecision();

    expect(service.pendingRestoreActivationReceipt).toEqual({
      currentProfile: "alpha",
      imported: { profiles: 1, settings: true },
      activation: { data: "complete", preferences: "pending" },
    });

    await service.applyPendingSyncDecision();

    expect(request.mock.calls.map(([topic]) => topic)).toEqual([
      "project:restore-from-content",
      "data:reload-state",
      "preferences:activate-persisted-settings",
      "preferences:activate-persisted-settings",
    ]);
    expect(service.pendingSyncAction).toBeNull();
  });

  it.each([
    ["malformed", { success: true }],
    ["transport rejection", new Error("preferences responder unavailable")],
    [
      "accessor-backed",
      Object.defineProperty({}, "success", {
        enumerable: true,
        get: () => true,
      }),
    ],
  ])(
    "retains Preferences-only activation for the %s case",
    async (_label, reply) => {
      const request = vi
        .fn()
        .mockResolvedValueOnce(PREFERENCES_PENDING_RECEIPT);
      if (reply instanceof Error) request.mockRejectedValueOnce(reply);
      else request.mockResolvedValueOnce(reply);
      service.invokeRequest = request;

      await service.applyPendingSyncDecision();
      await service.applyPendingSyncDecision();

      expect(service.pendingRestoreActivationReceipt).toEqual({
        currentProfile: "alpha",
        imported: { profiles: 1, settings: true },
        activation: { data: "complete", preferences: "pending" },
      });
      expect(service.pendingSyncAction).toBe("import");
      expect(request.mock.calls.map(([topic]) => topic)).toEqual([
        "project:restore-from-content",
        "preferences:activate-persisted-settings",
      ]);
    },
  );
});
