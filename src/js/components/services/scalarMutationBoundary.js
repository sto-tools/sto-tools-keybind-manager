import {
  materializeMutationRequest,
  requireMutationString,
} from "./mutationRequestBoundary.js";

/** @param {unknown} payload */
export function materializeCommandCategoryRequest(payload) {
  const input = materializeMutationRequest(payload, ["categoryId"]);
  return requireMutationString(input.categoryId);
}

/** @param {unknown} payload @returns {import('../../types/events/base.js').CommandGroupType} */
export function materializeCommandGroupRequest(payload) {
  const input = materializeMutationRequest(payload, ["groupType"]);
  const group = input.groupType;
  if (
    group !== "non-trayexec" &&
    group !== "palindromic" &&
    group !== "pivot"
  ) {
    throw new TypeError("invalid_mutation_request");
  }
  return group;
}

/** @param {unknown} payload */
export function materializeKeyCategoryRequest(payload) {
  const input = materializeMutationRequest(payload, ["categoryId", "mode"]);
  return {
    categoryId: requireMutationString(input.categoryId, { allowEmpty: true }),
    mode: requireMutationString(input.mode, { allowEmpty: true }),
  };
}

/** @param {unknown} payload */
export function materializeBindsetCollapseRequest(payload) {
  const input = materializeMutationRequest(payload, ["bindsetName"]);
  return requireMutationString(input.bindsetName, {
    optional: true,
    allowEmpty: true,
  });
}

/** @param {unknown} payload */
export function materializeScalarEmptyRequest(payload) {
  materializeMutationRequest(payload === undefined ? {} : payload, []);
}
