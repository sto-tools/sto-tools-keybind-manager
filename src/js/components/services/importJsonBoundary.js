/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Apply only the top-level gate needed before the legacy profile sanitizer.
 * Recursive profile validation is intentionally deferred to Phase 2.
 * @param {string} content
 * @returns {(Record<string, unknown> & { name: string }) | null}
 */
export function parseProfileJson(content) {
  const parsed = /** @type {unknown} */ (JSON.parse(content));
  if (
    !isJsonObject(parsed) ||
    typeof parsed.name !== "string" ||
    !parsed.name.trim()
  ) {
    return null;
  }
  return /** @type {Record<string, unknown> & { name: string }} */ (parsed);
}

/**
 * Apply only the project-envelope gate needed before legacy field handling.
 * Recursive project validation is intentionally deferred to Phase 2.
 * @param {string} content
 * @returns {{ type: 'project', data: Record<string, unknown> } | null}
 */
export function parseProjectJson(content) {
  const parsed = /** @type {unknown} */ (JSON.parse(content));
  if (
    !isJsonObject(parsed) ||
    parsed.type !== "project" ||
    !isJsonObject(parsed.data)
  ) {
    return null;
  }
  return { type: "project", data: parsed.data };
}
