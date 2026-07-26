const dialogTypes = new Set(["warning", "danger", "info", "success"]);
const requestKeys = ["message", "title", "type", "context"];

/** @param {unknown} value */
function isRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Materialize the exact public dialog RPC envelope without invoking accessors
 * or retaining caller-owned state.
 *
 * @param {unknown} value
 * @returns {import('../../types/rpc/ui.js').UiDialogRequest}
 */
export function materializeUiDialogRequest(value) {
  try {
    if (!isRecord(value)) throw new TypeError();
    const record = /** @type {object} */ (value);
    const keys = Reflect.ownKeys(record);
    if (
      keys.length !== requestKeys.length ||
      requestKeys.some((key) => !keys.includes(key))
    ) {
      throw new TypeError();
    }

    /** @type {Record<string, string>} */
    const fields = {};
    for (const key of requestKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (
        !descriptor ||
        descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
        typeof descriptor.value !== "string"
      ) {
        throw new TypeError();
      }
      fields[key] = descriptor.value;
    }
    if (!dialogTypes.has(fields.type)) throw new TypeError();

    return Object.freeze({
      message: fields.message,
      title: fields.title,
      type: /** @type {import('../../types/rpc/ui.js').UiDialogType} */ (
        fields.type
      ),
      context: fields.context,
    });
  } catch {
    throw new TypeError("invalid_ui_dialog_request");
  }
}
