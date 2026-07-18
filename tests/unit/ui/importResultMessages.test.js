import { describe, expect, it, vi } from "vitest";

import {
  buildKBFErrorMessage,
  buildKBFSuccessMessage,
  projectImportResultToast,
} from "../../../src/js/components/ui/importResultMessages.js";

function createTranslate() {
  return vi.fn((key, params) =>
    params === undefined ? key : `${key}:${JSON.stringify(params)}`,
  );
}

function createKBFSuccess(overrides = {}) {
  return {
    success: true,
    message: "kbf_import_completed",
    imported: { bindsets: 2, keys: 5, aliases: 3 },
    skipped: 0,
    overwritten: 0,
    cleared: 0,
    stats: {
      processedLayers: [1, 2, 3],
      skippedActivities: 0,
      totalActivities: 5,
      totalErrors: 0,
      totalWarnings: 0,
    },
    errors: [],
    warnings: [],
    bindsetNames: ["Master", "Combat"],
    masterBindset: {
      hasMasterBindset: true,
      masterBindsetName: "Master",
      mappedToPrimary: true,
      displayName: "Primary Bindset",
    },
    singleBindsetFile: {
      isSingleBindset: false,
      onlyBindsetIsMaster: false,
      requiresBindsetSelection: true,
      totalBindsetsAvailable: 2,
      selectedBindsetsCount: 2,
    },
    ...overrides,
  };
}

describe("projectImportResultToast", () => {
  it("projects keybind success using cleared conflict precedence", () => {
    const translate = createTranslate();

    expect(
      projectImportResultToast(
        {
          importType: "keybinds",
          result: {
            success: true,
            imported: { keys: 4 },
            skipped: 3,
            overwritten: 2,
            cleared: 6,
            errors: [],
            message: "import_completed_keybinds",
          },
        },
        translate,
      ),
    ).toEqual({
      message: 'import_result_overwrite_all:{"imported":4,"cleared":6}',
      type: "success",
    });
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("projects alias success using overwritten before skipped", () => {
    const translate = createTranslate();

    expect(
      projectImportResultToast(
        {
          importType: "aliases",
          result: {
            success: true,
            imported: { aliases: 3 },
            skipped: 4,
            overwritten: 2,
            cleared: 0,
            errors: [],
            message: "import_completed_aliases",
          },
        },
        translate,
      ),
    ).toEqual({
      message: 'import_result_overwrote:{"imported":3,"overwritten":2}',
      type: "success",
    });
  });

  it("projects skipped conflicts when no stronger result exists", () => {
    const translate = createTranslate();

    expect(
      projectImportResultToast(
        {
          importType: "keybinds",
          result: {
            success: true,
            imported: { keys: 2 },
            skipped: 3,
            overwritten: 0,
            cleared: 0,
            errors: [],
            message: "import_completed_keybinds",
          },
        },
        translate,
      ).message,
    ).toBe('import_result_skipped:{"imported":2,"skipped":3}');
  });

  it.each([
    ["keybinds", { keys: 0 }, "import_completed_keybinds"],
    ["aliases", { aliases: 0 }, "import_completed_aliases"],
  ])(
    "uses the %s success key and count fallback",
    (type, imported, message) => {
      const translate = createTranslate();

      const toast = projectImportResultToast(
        {
          importType: type,
          result: {
            success: true,
            imported,
            skipped: 0,
            overwritten: 0,
            cleared: 0,
            errors: [],
            message,
          },
        },
        translate,
      );

      expect(toast).toEqual({
        message: `${message}:{"count":0}`,
        type: "success",
      });
    },
  );

  it("translates text-import failures with their published params", () => {
    const translate = createTranslate();
    const params = { environment: "sector", validEnvironments: ["space"] };

    expect(
      projectImportResultToast(
        {
          importType: "keybinds",
          result: { success: false, error: "invalid_environment", params },
        },
        translate,
      ),
    ).toEqual({
      message: `invalid_environment:${JSON.stringify(params)}`,
      type: "error",
    });
  });

  it("retains the generic failure fallback for a missing result", () => {
    const translate = createTranslate();

    expect(
      projectImportResultToast(
        { importType: "aliases", result: undefined },
        translate,
      ),
    ).toEqual({ message: "import_failed", type: "error" });
  });
});

describe("buildKBFSuccessMessage", () => {
  it("projects the published counts into the base message", () => {
    const translate = createTranslate();

    expect(buildKBFSuccessMessage(createKBFSuccess(), translate)).toBe(
      'kbf_import_completed:{"bindsets":2,"keys":5,"aliases":3}',
    );
  });

  it("preserves conflict precedence and the detailed message order", () => {
    const translate = createTranslate();
    const result = createKBFSuccess({
      skipped: 4,
      overwritten: 3,
      cleared: 2,
      stats: {
        skippedActivities: 1,
        totalActivities: 5,
        totalErrors: 2,
        totalWarnings: 1,
      },
      errors: ["error one", "error two"],
      warnings: ["warning"],
    });

    expect(buildKBFSuccessMessage(result, translate)).toBe(
      'kbf_import_completed:{"bindsets":2,"keys":5,"aliases":3}\n' +
        'import_result_overwrite_all:{"imported":5,"cleared":2} • ' +
        'kbf_import_skipped_activities:{"count":1} • ' +
        'kbf_import_errors_encountered:{"count":2} • ' +
        'kbf_import_warnings_generated:{"count":1}',
    );
    expect(translate).not.toHaveBeenCalledWith(
      "import_result_overwrote",
      expect.anything(),
    );
    expect(translate).not.toHaveBeenCalledWith(
      "import_result_skipped",
      expect.anything(),
    );
  });

  it("falls back from zero stat totals to published diagnostic arrays", () => {
    const translate = createTranslate();
    const result = createKBFSuccess({
      errors: ["one"],
      warnings: ["one", "two"],
    });

    expect(buildKBFSuccessMessage(result, translate)).toContain(
      'kbf_import_errors_encountered:{"count":1} • ' +
        'kbf_import_warnings_generated:{"count":2}',
    );
  });

  it("does not project the unsupported processingTimeMs field", () => {
    const translate = createTranslate();
    const result = createKBFSuccess({
      stats: {
        skippedActivities: 0,
        totalActivities: 5,
        totalErrors: 0,
        totalWarnings: 0,
        processingTimeMs: 2500,
      },
    });

    expect(buildKBFSuccessMessage(result, translate)).not.toContain(
      "kbf_import_processing_time",
    );
    expect(translate).not.toHaveBeenCalledWith(
      "kbf_import_processing_time",
      expect.anything(),
    );
  });

  it("is selected by the unified KBF toast projection", () => {
    const translate = createTranslate();

    expect(
      projectImportResultToast(
        { importType: "kbf", result: createKBFSuccess() },
        translate,
      ),
    ).toEqual({
      message: 'kbf_import_completed:{"bindsets":2,"keys":5,"aliases":3}',
      type: "success",
    });
  });
});

describe("buildKBFErrorMessage", () => {
  it("translates the published error and params before its summary", () => {
    const translate = createTranslate();
    const params = { path: "$.bindsets", totalErrors: 3, totalWarnings: 2 };
    const result = {
      success: false,
      error: "invalid_kbf_parse_result",
      params,
      errors: ["one"],
      warnings: ["one"],
    };

    expect(buildKBFErrorMessage(result, translate)).toBe(
      `invalid_kbf_parse_result:${JSON.stringify(params)}\n` +
        'kbf_import_error_summary: kbf_import_total_errors:{"count":3} • ' +
        'kbf_import_total_warnings:{"count":2}',
    );
  });

  it("falls back to the published error and warning arrays", () => {
    const translate = createTranslate();
    const result = {
      success: false,
      error: "invalid_kbf_file_format",
      errors: ["one", "two"],
      warnings: ["one"],
    };

    expect(buildKBFErrorMessage(result, translate)).toBe(
      "invalid_kbf_file_format:{}\n" +
        'kbf_import_error_summary: kbf_import_total_errors:{"count":2} • ' +
        'kbf_import_total_warnings:{"count":1}',
    );
  });

  it("does not project unsupported processed or failed bindset fields", () => {
    const translate = createTranslate();
    const result = {
      success: false,
      error: "kbf_import_critical_error",
      errors: [],
      warnings: [],
      processedBindsets: ["Master"],
      failedBindsets: ["Combat"],
    };

    expect(buildKBFErrorMessage(result, translate)).toBe(
      "kbf_import_critical_error:{}",
    );
    expect(translate).not.toHaveBeenCalledWith(
      "kbf_import_bindsets_processed",
      expect.anything(),
    );
    expect(translate).not.toHaveBeenCalledWith(
      "kbf_import_bindsets_failed",
      expect.anything(),
    );
  });

  it("retains the KBF failure fallback and toast severity", () => {
    const translate = createTranslate();

    expect(
      projectImportResultToast(
        { importType: "kbf", result: undefined },
        translate,
      ),
    ).toEqual({ message: "import_failed:{}", type: "error" });
  });
});
