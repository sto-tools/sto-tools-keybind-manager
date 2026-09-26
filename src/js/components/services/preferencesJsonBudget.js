import {
  MAX_PROJECT_JSON_BYTES,
  MAX_PROJECT_JSON_DEPTH,
} from "./jsonDataBoundary.js";

/**
 * Check already-detached JSON data without serializing an expanded shared DAG.
 * Memoized subtree sizes count every occurrence, while subtree heights retain
 * the deepest expanded path. Never pass producer-owned objects to this helper.
 * @param {import('../../types/data-contracts.js').JsonValue} value
 * @param {number} [maxBytes]
 */
export function hasBoundedPreferencesJson(
  value,
  maxBytes = MAX_PROJECT_JSON_BYTES,
) {
  const invalid = Symbol("invalid-preferences-json-budget");
  /** @type {WeakMap<object, {bytes: number, depth: number}>} */
  const memo = new WeakMap();
  const ancestors = new WeakSet();

  /** @param {number} bytes */
  function bounded(bytes) {
    if (bytes > maxBytes) throw invalid;
    return bytes;
  }

  /** Exact JSON escaping and UTF-8 size, including unpaired-surrogate escapes.
   * @param {string} text
   */
  function stringBytes(text) {
    let bytes = bounded(text.length + 2);
    // Native scanning avoids a per-code-unit loop for unescaped ASCII. The
    // negated range also excludes astral code points under Unicode matching.
    if (!/["\\]|[^\x20-\x7f]/u.test(text)) return bytes;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code === 34 || code === 92) bytes += 1;
      else if (code < 32) bytes += [8, 9, 10, 12, 13].includes(code) ? 1 : 5;
      else if (code < 128) continue;
      else if (code < 2048) bytes += 1;
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          bytes += 2;
          index += 1;
        } else bytes += 5;
      } else if (code >= 0xdc00 && code <= 0xdfff) bytes += 5;
      else bytes += 2;
      bounded(bytes);
    }
    return bytes;
  }

  /** @param {import('../../types/data-contracts.js').JsonValue} item
   * @param {number} level
   * @returns {{bytes: number, depth: number}}
   */
  function measure(item, level) {
    if (level > MAX_PROJECT_JSON_DEPTH) throw invalid;
    if (typeof item === "string") return { bytes: stringBytes(item), depth: 0 };
    if (item === null || typeof item === "boolean")
      return { bytes: bounded(String(item).length), depth: 0 };
    if (typeof item === "number" && Number.isFinite(item))
      return { bytes: bounded(String(item).length), depth: 0 };
    if (typeof item !== "object" || item === null || ancestors.has(item))
      throw invalid;
    const cached = memo.get(item);
    if (cached) return cached;
    ancestors.add(item);
    let bytes = bounded(2);
    let depth = 0;
    const array = Array.isArray(item);
    const entries = Object.entries(item);
    for (const [index, [key, child]] of entries.entries()) {
      if (index > 0) bytes = bounded(bytes + 1);
      if (!array) bytes = bounded(bytes + stringBytes(key) + 1);
      const measured = measure(child, level + 1);
      bytes = bounded(bytes + measured.bytes);
      depth = Math.max(depth, measured.depth + 1);
      if (depth + level > MAX_PROJECT_JSON_DEPTH) throw invalid;
    }
    ancestors.delete(item);
    const result = { bytes, depth };
    memo.set(item, result);
    return result;
  }

  try {
    return (
      Number.isSafeInteger(maxBytes) &&
      maxBytes >= 0 &&
      measure(value, 0).bytes <= maxBytes
    );
  } catch {
    return false;
  }
}
