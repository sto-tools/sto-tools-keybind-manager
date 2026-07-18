/** @typedef {import('../services/serviceTypes.js').ProfileData} KeyProfile */
/**
 * @typedef {{
 *   prompt: (message: string, options: {
 *     title?: string,
 *     placeholder?: string,
 *     defaultValue?: string,
 *     validate?: (value: string) => true | string
 *   }) => Promise<string | null | undefined>
 * }} InputDialog
 */
/**
 * @typedef {{
 *   confirm: (message: string, title?: string, variant?: 'warning' | 'danger' | 'info' | 'success', context?: string) => Promise<boolean>
 * }} ConfirmDialog
 */
/**
 * @typedef {{
 *   confirm: (name: string, keyCount: number, context: string) => Promise<boolean>
 * }} BindsetDeleteConfirm
 */
/** @typedef {{ t: (key: string, params?: Record<string, unknown>) => string }} I18n */
/**
 * @typedef {{
 *   title?: string,
 *   placeholder?: string,
 *   defaultValue?: string,
 *   validate?: (value: string) => true | string
 * }} InputDialogOptions
 */
/**
 * @typedef {
 *   | { topic: 'bindset:create', payload: { name: string } }
 *   | { topic: 'bindset:clone', payload: { sourceBindset: string, targetBindset: string } }
 *   | { topic: 'bindset:rename', payload: { oldName: string, newName: string } }
 * } BindsetMutationPlan
 */
/**
 * @typedef {
 *   | { topic: 'bindset:delete', payload: { name: string }, keyCount: 0 }
 *   | { topic: 'bindset:delete-with-keys', payload: { name: string }, keyCount: number }
 * } BindsetDeletionPlan
 */

/**
 * Count keys from one accepted profile snapshot. This is deliberately a read,
 * never a mutation disguised as a service probe.
 *
 * @param {KeyProfile | null | undefined} profile
 * @param {string} bindsetName
 */
export function countBindsetKeys(profile, bindsetName) {
  const bindset = profile?.bindsets?.[bindsetName];
  if (!bindset) return 0;
  return ["space", "ground"].reduce((total, environment) => {
    const environmentData = bindset[environment];
    return total + Object.keys(environmentData?.keys ?? {}).length;
  }, 0);
}

/** @param {unknown} error */
export function bindsetErrorTranslationKey(error) {
  if (error === "invalid_name") return "invalid_name";
  if (error === "name_exists") return "bindset_name_in_use";
  if (error === "not_found") return "not_found";
  if (error === "not_empty") return "bindset_not_empty";
  return "error";
}

/**
 * @param {string} value
 * @param {{ existingNames: string[], sourceName?: string, i18n: I18n }} context
 * @returns {true | string}
 */
export function validateBindsetName(
  value,
  { existingNames, sourceName, i18n },
) {
  const trimmed = value.trim();
  if (!trimmed) return i18n.t("name_required");
  if (sourceName && trimmed === sourceName) return i18n.t("name_unchanged");
  if (existingNames.includes(trimmed)) return i18n.t("name_exists");
  return true;
}

/**
 * Ask for one bindset mutation and return inert action data. The lifecycle
 * controller performs the resulting RPC.
 *
 * @param {{
 *   operation: 'create' | 'clone' | 'rename',
 *   sourceName?: string,
 *   existingNames: string[],
 *   inputDialog: InputDialog | null,
 *   i18n: I18n
 * }} options
 * @returns {Promise<BindsetMutationPlan | null>}
 */
export async function planBindsetMutation({
  operation,
  sourceName,
  existingNames,
  inputDialog,
  i18n,
}) {
  if (!inputDialog) return null;

  const titleKey = `${operation}_bindset`;
  /** @type {InputDialogOptions} */
  const promptOptions = {
    title: i18n.t(titleKey),
    placeholder: i18n.t("bindset_name"),
    validate: /** @param {string} value */ (value) =>
      validateBindsetName(value, { existingNames, sourceName, i18n }),
  };

  if (operation === "clone" && sourceName) {
    promptOptions.defaultValue =
      sourceName === "Primary Bindset"
        ? i18n.t("primary_bindset_copy_default")
        : `${sourceName} ${i18n.t("copy_suffix")}`;
  } else if (operation === "rename" && sourceName) {
    promptOptions.defaultValue = sourceName;
  }

  const name = await inputDialog.prompt(
    i18n.t("enter_bindset_name"),
    promptOptions,
  );
  const trimmed = name?.trim();
  if (!trimmed || (sourceName && trimmed === sourceName)) return null;

  if (operation === "create") {
    return { topic: "bindset:create", payload: { name: trimmed } };
  }
  if (operation === "clone" && sourceName) {
    return {
      topic: "bindset:clone",
      payload: { sourceBindset: sourceName, targetBindset: trimmed },
    };
  }
  if (operation === "rename" && sourceName) {
    return {
      topic: "bindset:rename",
      payload: { oldName: sourceName, newName: trimmed },
    };
  }
  return null;
}

/**
 * Confirm deletion against the same captured profile snapshot that supplied
 * the displayed bindset. No RPC is issued here.
 *
 * @param {{
 *   profile: KeyProfile | null | undefined,
 *   bindsetName: string,
 *   confirmDialog: ConfirmDialog | null,
 *   bindsetDeleteConfirm: BindsetDeleteConfirm,
 *   i18n: I18n
 * }} options
 * @returns {Promise<BindsetDeletionPlan | null>}
 */
export async function planBindsetDeletion({
  profile,
  bindsetName,
  confirmDialog,
  bindsetDeleteConfirm,
  i18n,
}) {
  if (!bindsetName) return null;
  const keyCount = countBindsetKeys(profile, bindsetName);

  if (keyCount > 0) {
    const confirmed = await bindsetDeleteConfirm.confirm(
      bindsetName,
      keyCount,
      "bindsetDelete",
    );
    return confirmed
      ? {
          topic: "bindset:delete-with-keys",
          payload: { name: bindsetName },
          keyCount,
        }
      : null;
  }

  if (!confirmDialog) return null;
  const confirmed = await confirmDialog.confirm(
    i18n.t("confirm_delete_bindset", { name: bindsetName }),
    i18n.t("confirm_delete"),
    "danger",
    "bindsetDelete",
  );
  return confirmed
    ? {
        topic: "bindset:delete",
        payload: { name: bindsetName },
        keyCount: 0,
      }
    : null;
}
