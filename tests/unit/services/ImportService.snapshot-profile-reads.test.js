import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../../src/js/components/services/ImportService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { completeKBFParseResult } from "../../fixtures/kbfParseResult.js";
import { createServiceFixture } from "../../fixtures/index.js";

const validParseResult = completeKBFParseResult({
  bindsets: { Master: { keys: { F1: ["FireAll"] }, metadata: {} } },
  aliases: {},
  stats: { totalBindsets: 1, processedLayers: [1] },
  errors: [],
  warnings: [],
});

describe("ImportService accepted profile snapshot reads", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new ImportService({ eventBus: fixture.eventBus });
    service.init();
    vi.spyOn(service.kbfParser.decoder, "validateFormat").mockReturnValue({
      isValid: true,
      isKBF: true,
      warnings: [],
    });
    vi.spyOn(service.kbfParser, "parseFile").mockResolvedValue(
      validParseResult,
    );
  });

  afterEach(() => {
    service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("returns profile_not_found from an accepted empty snapshot without a storage guard", async () => {
    service._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 3,
        ready: true,
        revision: 0,
        profiles: {},
      }),
    );

    await expect(
      service.importKBFFile("SGVsbG8=", "test-profile", "space"),
    ).resolves.toMatchObject({ success: false, error: "profile_not_found" });
  });

  it("fails closed when no data snapshot has been accepted", async () => {
    const result = await service.importKBFFile(
      "SGVsbG8=",
      "test-profile",
      "space",
    );

    expect(result).toMatchObject({
      success: false,
      error: "kbf_import_critical_error",
    });
    expect(result.errors).toContain("operation_cancelled");
  });
});
