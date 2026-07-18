/** @typedef {import('./uiTypes.js').I18nLike['t']} Translate */
/** @typedef {import('../../types/rpc/import-export.js').KeybindImportResult} KeybindImportResult */
/** @typedef {import('../../types/rpc/aliases.js').AliasImportResult} AliasImportResult */
/** @typedef {import('../../types/rpc/import-export.js').KBFImportResult} KBFImportResult */
/** @typedef {Extract<KBFImportResult, { success: true }>} KBFImportSuccess */
/** @typedef {Extract<KBFImportResult, { success: false }>} KBFImportFailure */
/**
 * @typedef {
 *   | { importType: 'keybinds', result: KeybindImportResult | null | undefined }
 *   | { importType: 'aliases', result: AliasImportResult | null | undefined }
 *   | { importType: 'kbf', result: KBFImportResult | null | undefined }
 * } ImportResultProjection
 */
/** @typedef {{ message: string, type: 'success' | 'error' }} ImportResultToast */

/**
 * Project the shared keybind/alias conflict accounting into one translated
 * success message. ImportService has already validated this result at the RPC
 * boundary, so this helper intentionally contains no storage or UI behavior.
 *
 * @param {Extract<KeybindImportResult | AliasImportResult, { success: true }>} result
 * @param {Translate} translate
 */
function buildTextImportSuccessMessage(result, translate) {
  const imported =
    ("keys" in result.imported
      ? result.imported.keys
      : result.imported.aliases) || 0;
  const skipped = result.skipped || 0;
  const overwritten = result.overwritten || 0;
  const cleared = result.cleared || 0;

  if (cleared > 0) {
    return translate("import_result_overwrite_all", { imported, cleared });
  }
  if (overwritten > 0) {
    return translate("import_result_overwrote", { imported, overwritten });
  }
  if (skipped > 0) {
    return translate("import_result_skipped", { imported, skipped });
  }

  return translate(result.message ?? "import_completed", {
    count: imported,
  });
}

/**
 * Build the detailed message for a successful KBF import.
 *
 * Only fields published by KBFImportResult participate. In particular, the
 * historical processingTimeMs field was never produced by the RPC owner.
 *
 * @param {KBFImportSuccess} result
 * @param {Translate} translate
 */
export function buildKBFSuccessMessage(result, translate) {
  const { imported, skipped, overwritten, cleared, stats, errors, warnings } =
    result;
  let message = translate("kbf_import_completed", {
    bindsets: imported.bindsets || 0,
    keys: imported.keys || 0,
    aliases: imported.aliases || 0,
  });
  /** @type {string[]} */
  const additionalInfo = [];

  if (cleared > 0) {
    additionalInfo.push(
      translate("import_result_overwrite_all", {
        imported: imported.keys || 0,
        cleared,
      }),
    );
  } else if (overwritten > 0) {
    additionalInfo.push(
      translate("import_result_overwrote", {
        imported: imported.keys || 0,
        overwritten,
      }),
    );
  } else if (skipped > 0) {
    additionalInfo.push(
      translate("import_result_skipped", {
        imported: imported.keys || 0,
        skipped,
      }),
    );
  }

  const skippedActivities = stats.skippedActivities ?? 0;
  if (skippedActivities > 0) {
    additionalInfo.push(
      translate("kbf_import_skipped_activities", {
        count: skippedActivities,
      }),
    );
  }

  const totalErrors = stats.totalErrors || errors.length || 0;
  const totalWarnings = stats.totalWarnings || warnings.length || 0;
  if (totalErrors > 0) {
    additionalInfo.push(
      translate("kbf_import_errors_encountered", { count: totalErrors }),
    );
  }
  if (totalWarnings > 0) {
    additionalInfo.push(
      translate("kbf_import_warnings_generated", { count: totalWarnings }),
    );
  }

  if (additionalInfo.length > 0) {
    message += `\n${additionalInfo.join(" • ")}`;
  }
  return message;
}

/**
 * Read an optional numeric diagnostic count from the published params bag.
 *
 * @param {Record<string, unknown>} params
 * @param {'totalErrors' | 'totalWarnings'} field
 */
function diagnosticCount(params, field) {
  const value = params[field];
  return typeof value === "number" ? value : 0;
}

/**
 * Build the detailed message for a failed KBF import.
 *
 * The RPC failure contract publishes its error/warning arrays and optional
 * params, but not per-bindset processed/failed collections. Those historical
 * UI-only fields therefore do not affect this projection.
 *
 * @param {KBFImportFailure | null | undefined} result
 * @param {Translate} translate
 */
export function buildKBFErrorMessage(result, translate) {
  const params = result?.params ?? {};
  let message = translate(result?.error || "import_failed", params);
  /** @type {string[]} */
  const errorSummary = [];

  const totalErrors =
    diagnosticCount(params, "totalErrors") || result?.errors?.length || 0;
  const totalWarnings =
    diagnosticCount(params, "totalWarnings") || result?.warnings?.length || 0;

  if (totalErrors > 0) {
    errorSummary.push(
      translate("kbf_import_total_errors", { count: totalErrors }),
    );
  }
  if (totalWarnings > 0) {
    errorSummary.push(
      translate("kbf_import_total_warnings", { count: totalWarnings }),
    );
  }

  if (errorSummary.length > 0) {
    message += `\n${translate("kbf_import_error_summary")}: ${errorSummary.join(
      " • ",
    )}`;
  }
  return message;
}

/**
 * Project one import RPC result into the exact toast payload consumed by
 * ImportUI. A missing result retains the UI's established failure fallback.
 *
 * @param {ImportResultProjection} projection
 * @param {Translate} translate
 * @returns {ImportResultToast}
 */
export function projectImportResultToast(projection, translate) {
  const { result } = projection;
  if (result?.success) {
    const message =
      projection.importType === "kbf"
        ? buildKBFSuccessMessage(projection.result, translate)
        : buildTextImportSuccessMessage(projection.result, translate);
    return { message, type: "success" };
  }

  const message =
    projection.importType === "kbf"
      ? buildKBFErrorMessage(projection.result, translate)
      : translate(projection.result?.error ?? "import_failed", result?.params);
  return { message, type: "error" };
}
