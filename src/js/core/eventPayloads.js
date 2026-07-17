/**
 * Resolve the selected key from the canonical payload or the retained legacy
 * `{ name }` compatibility arm.
 *
 * @param {unknown} payload
 * @returns {string | null}
 */
export function selectedKeyFromPayload(payload) {
  if (typeof payload !== "object" || payload === null) return null;
  const key = Reflect.get(payload, "key");
  if (typeof key === "string" || key === null) return key;
  const name = Reflect.get(payload, "name");
  return typeof name === "string" ? name : null;
}

/**
 * Resolve the active bindset from the canonical payload or the retained legacy
 * `{ name }` compatibility arm.
 *
 * @param {unknown} payload
 * @returns {string | undefined}
 */
export function activeBindsetFromPayload(payload) {
  if (typeof payload !== "object" || payload === null) return undefined;
  const bindset = Reflect.get(payload, "bindset");
  if (typeof bindset === "string") return bindset;
  const name = Reflect.get(payload, "name");
  return typeof name === "string" ? name : undefined;
}
