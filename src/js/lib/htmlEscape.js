/** @type {Readonly<Record<string, string>>} */
const HTML_ESCAPE_MAP = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

/**
 * Escape an untrusted value for use as HTML text or in a quoted HTML attribute.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) => HTML_ESCAPE_MAP[character],
  );
}
