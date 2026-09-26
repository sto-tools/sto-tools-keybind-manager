import {
  requireProfileUpdateResult,
  materializeMutationRequest,
  requireMutationString,
} from "./mutationRequestBoundary.js";
import {
  assertProfileMutationContext,
  canPublishProfileMutation,
} from "./profileMutationContext.js";
/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */
/** @typedef {import('./serviceTypes.js').ProfileOperations} ProfileOperations */

/** @param {string[]} errors @param {string[]} warnings @param {import('../../types/kbf-boundary.js').KBFParseResult} parsed */
export function appendImportDiagnostics(errors, warnings, parsed) {
  const message = (
    /** @type {import('../../types/kbf-boundary.js').KBFDiagnostic} */ value,
  ) => (typeof value === "string" ? value : value.message || String(value));
  if (parsed.errors) errors.push(...parsed.errors.map(message));
  if (parsed.warnings) warnings.push(...parsed.warnings.map(message));
}

/** @param {unknown} value @param {string[]} warnings */
export function resolveImportBindsetsEnabled(value, warnings) {
  if (typeof value === "boolean") return value;
  warnings.push(
    "Could not retrieve bindsets preference, defaulting to enabled",
  );
  return true;
}

/** @param {unknown} payload @param {'keybind'|'alias'|'kbf'} kind @param {boolean} [rpc] */
export function materializeProfileImportInput(payload, kind, rpc = false) {
  const fields = [
    "content",
    "profileId",
    "options",
    ...(kind !== "alias" ? ["environment"] : []),
    ...(kind === "kbf" ? ["configuration"] : []),
    ...(rpc ? ["strategy"] : []),
  ];
  const input = materializeMutationRequest(payload, fields);
  const rawOptions =
    input.options === undefined || (kind === "kbf" && input.options === null)
      ? {}
      : input.options;
  const options = materializeMutationRequest(
    rawOptions,
    kind === "kbf" && rawOptions && typeof rawOptions === "object"
      ? Object.keys(rawOptions)
      : ["strategy"],
  );
  const optionStrategy = requireMutationString(options.strategy, {
    optional: true,
    allowEmpty: true,
  });
  const topStrategy = requireMutationString(input.strategy, {
    optional: true,
    allowEmpty: true,
  });
  const allowed = ["merge_keep", "merge_overwrite", "overwrite_all"];
  const strategy = rpc
    ? ((allowed.includes(topStrategy ?? "")
        ? topStrategy
        : kind === "kbf"
          ? optionStrategy
          : undefined) ?? "merge_keep")
    : (optionStrategy ?? "merge_keep");
  return {
    content: input.content,
    profileId: requireMutationString(input.profileId, {
      optional: true,
      nullable: true,
      allowEmpty: true,
    }),
    environment: requireMutationString(input.environment, {
      optional: true,
      allowEmpty: true,
    }),
    strategy,
    configuration: input.configuration,
  };
}

/** @overload @param {import('./ImportService.js').default} service @param {'keybind'} kind @param {unknown} payload @returns {Promise<import('../../types/rpc/import-export.js').KeybindImportResult>} */
/** @overload @param {import('./ImportService.js').default} service @param {'alias'} kind @param {unknown} payload @returns {Promise<import('../../types/rpc/aliases.js').AliasImportResult>} */
/** @overload @param {import('./ImportService.js').default} service @param {'kbf'} kind @param {unknown} payload @returns {Promise<import('../../types/rpc/import-export.js').KBFImportResult>} */
/** @param {import('./ImportService.js').default} service @param {'keybind'|'alias'|'kbf'} kind @param {unknown} payload */
export async function dispatchProfileImportRequest(service, kind, payload) {
  try {
    const input = materializeProfileImportInput(payload, kind, true);
    const options = { strategy: input.strategy };
    if (kind === "alias")
      return service.importAliasFile(input.content, input.profileId, options);
    if (kind === "keybind")
      return service.importKeybindFile(
        input.content,
        input.profileId,
        input.environment,
        options,
      );
    return service.importKBFFile(
      input.content,
      input.profileId,
      input.environment,
      options,
      input.configuration,
    );
  } catch {
    if (kind === "kbf")
      return /** @type {const} */ ({
        success: false,
        error: "invalid_kbf_file_content",
      });
    return /** @type {const} */ ({ success: false, error: "import_failed" });
  }
}

/**
 * Commit an imported profile through DataCoordinator, then publish the one
 * legacy notification that import consumers still require. A typed complete
 * replacement deliberately avoids DataCoordinator's structural compatibility
 * notification, so this helper remains the sole legacy producer for imports.
 *
 * @param {import('./ImportService.js').default} service
 * @param {string} profileId
 * @param {ProfileData} profile
 * @param {string | undefined} environment
 * @param {import('./profileMutationContext.js').ProfileMutationContext} context
 * @returns {Promise<ProfileData>}
 */
export async function commitImportedProfile(
  service,
  profileId,
  profile,
  environment,
  context,
) {
  /** @type {ProfileOperations & { replacement: ProfileData }} */
  const updates = {
    replacement: structuredClone(profile),
    updateSource: "ImportService",
  };

  let result;
  try {
    assertProfileMutationContext(service, context, service._mutationGeneration);
    result = await service.request("data:update-profile", {
      profileId,
      updates,
      createIfMissing: true,
      precondition: context.precondition,
    });
  } catch {
    throw new Error(service.translate("storage_write_failed"));
  }

  const committedProfile = requireProfileUpdateResult(result).profile;
  const payload = { profileId, profile: committedProfile };
  if (
    canPublishProfileMutation(service, context, service._mutationGeneration) &&
    (service.cache.dataState?.revision ?? 0) <=
      context.precondition.revision + 1
  ) {
    service.emit(
      "profile:updated",
      environment === undefined ? payload : { ...payload, environment },
    );
  }

  return committedProfile;
}
