/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Convert model validation diagnostics into translation-keyed presentation.
 * The model retains developer-readable Error messages, while UI surfaces use
 * only this explicit i18n projection.
 *
 * @param {unknown} error
 * @returns {{ key: 'invalid_parameter_number' | 'invalid_parameter_boolean', params: { parameter: string, value: string } } | null}
 */
export function projectParameterValidationIssue(error) {
  if (!isRecord(error)) return null;
  const parameter =
    typeof error.parameterName === "string" ? error.parameterName : "";
  const value =
    typeof error.parameterValue === "string" ? error.parameterValue : "";

  if (error.code === "INVALID_PARAMETER_NUMBER") {
    return {
      key: "invalid_parameter_number",
      params: { parameter, value },
    };
  }
  if (error.code === "INVALID_PARAMETER_BOOLEAN") {
    return {
      key: "invalid_parameter_boolean",
      params: { parameter, value },
    };
  }
  return null;
}

/**
 * @param {unknown} error
 * @param {(key: string, options?: import('i18next').TOptions) => string} translate
 */
export function translateParameterValidationIssue(error, translate) {
  const issue = projectParameterValidationIssue(error);
  return issue
    ? translate(issue.key, issue.params)
    : translate("invalid_parameter_values");
}
