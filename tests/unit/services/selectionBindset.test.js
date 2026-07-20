import { afterEach, describe, expect, it, vi } from "vitest";
import { syncSelectionBindset } from "../../../src/js/components/services/selectionBindset.js";

function createService({
  bindsetsEnabled = true,
  bindToAliasMode = true,
  activeBindset = "Primary Bindset",
} = {}) {
  return {
    cache: {
      preferences: { bindsetsEnabled, bindToAliasMode },
      activeBindset,
    },
    request: vi.fn().mockResolvedValue({ success: true }),
  };
}

describe("selection bindset synchronization", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not synchronize bindsets for alias selection", async () => {
    const service = createService({ activeBindset: "Combat" });

    await syncSelectionBindset(/** @type {any} */ (service), "alias", null);

    expect(service.request).not.toHaveBeenCalled();
  });

  it.each([
    { bindsetsEnabled: false, bindToAliasMode: true },
    { bindsetsEnabled: true, bindToAliasMode: false },
  ])(
    "does not synchronize when preferences disable it",
    async (preferences) => {
      const service = createService({
        ...preferences,
        activeBindset: "Combat",
      });

      await syncSelectionBindset(/** @type {any} */ (service), "space", null);

      expect(service.request).not.toHaveBeenCalled();
    },
  );

  it.each([
    { activeBindset: "Combat", bindsetContext: "Combat" },
    { activeBindset: "Primary Bindset", bindsetContext: null },
  ])(
    "does not request an already-active target",
    async ({ activeBindset, bindsetContext }) => {
      const service = createService({ activeBindset });

      await syncSelectionBindset(
        /** @type {any} */ (service),
        "space",
        bindsetContext,
      );

      expect(service.request).not.toHaveBeenCalled();
    },
  );

  it("requests an explicit different bindset", async () => {
    const service = createService({ activeBindset: "Primary Bindset" });

    await syncSelectionBindset(
      /** @type {any} */ (service),
      "ground",
      "Combat",
    );

    expect(service.request).toHaveBeenCalledOnce();
    expect(service.request).toHaveBeenCalledWith(
      "bindset-selector:set-active-bindset",
      { bindset: "Combat" },
    );
  });

  it("returns a custom active bindset to Primary when context is absent", async () => {
    const service = createService({ activeBindset: "Combat" });

    await syncSelectionBindset(/** @type {any} */ (service), "space", null);

    expect(service.request).toHaveBeenCalledOnce();
    expect(service.request).toHaveBeenCalledWith(
      "bindset-selector:set-active-bindset",
      { bindset: "Primary Bindset" },
    );
  });

  it("swallows a rejected synchronization request and reports it", async () => {
    const error = new Error("owner rejected bindset");
    const service = createService({ activeBindset: "Combat" });
    service.request.mockRejectedValue(error);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      syncSelectionBindset(/** @type {any} */ (service), "space", null),
    ).resolves.toBeUndefined();

    expect(warning).toHaveBeenCalledWith(
      "[SelectionService] Failed to synchronize bindset context:",
      error,
    );
  });
});
