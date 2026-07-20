import UIComponentBase from "../UIComponentBase.js";
import { resolveDocument, resolveI18n } from "./uiTypes.js";

const runtime = /** @type {import('./uiTypes.js').RuntimeGlobals} */ (
  globalThis
);

/*
 * BindsetManagerUI - Handles the bindset manager modal
 * Manages the bindset manager modal and its interactions
 */
export default class BindsetManagerUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   i18n?: import('./uiTypes.js').I18nLike,
   *   confirmDialog?: import('./uiTypes.js').ConfirmDialogLike | null,
   *   inputDialog?: import('./uiTypes.js').InputDialogLike | null,
   *   document?: Document
   * }} [options]
   */
  constructor({
    eventBus,
    i18n,
    confirmDialog = null,
    inputDialog = null,
    document = typeof window !== "undefined" ? window.document : undefined,
  } = {}) {
    super(eventBus);
    this.componentName = "BindsetManagerUI";
    this.i18n = resolveI18n(i18n);
    this.document = resolveDocument(document);
    this.confirmDialog = confirmDialog || runtime.confirmDialog || null;
    this.inputDialog = inputDialog;
    this.selectedBindset = null;
    this.listenersSetup = false;
  }

  async onInit() {
    this.setupEventListeners();
    this.render();
    this.addEventListener("bindsets:changed", () => {
      // ComponentBase automatically updates this.cache.bindsetNames
      this.render();
    });
  }

  setupEventListeners() {
    if (this.listenersSetup) return;
    this.listenersSetup = true;

    // Open modal
    this.onDom("bindsetManagerBtn", "click", () => {
      this.render();
      this.emit("modal:show", { modalId: "bindsetManagerModal" });
    });

    this.onDom("createBindsetBtn", "click", async () => {
      if (!this.inputDialog) return;

      const title = this.i18n.t("create_bindset");
      const message = this.i18n.t("enter_bindset_name");

      const name = await this.inputDialog.prompt(message, {
        title,
        placeholder: this.i18n.t("bindset_name"),
        validate: (value) => {
          const trimmed = value.trim();
          if (!trimmed) return this.i18n.t("name_required");
          if (this.cache.bindsetNames.includes(trimmed))
            return this.i18n.t("name_exists");
          return true;
        },
      });

      if (!name?.trim()) return;
      const res = await this.request("bindset:create", { name: name.trim() });
      if (!res?.success) this.showError(res.error);
    });

    this.onDom("renameBindsetBtn", "click", async () => {
      if (!this.selectedBindset || !this.inputDialog) return;

      const title = this.i18n.t("rename_bindset");
      const message = this.i18n.t("enter_new_name");

      const newName = await this.inputDialog.prompt(message, {
        title,
        defaultValue: this.selectedBindset,
        placeholder: this.i18n.t("bindset_name"),
        validate: (value) => {
          const trimmed = value.trim();
          if (!trimmed) return this.i18n.t("name_required");
          if (trimmed === this.selectedBindset)
            return this.i18n.t("name_unchanged");
          if (this.cache.bindsetNames.includes(trimmed))
            return this.i18n.t("name_exists");
          return true;
        },
      });

      if (!newName?.trim() || newName.trim() === this.selectedBindset) return;
      const res = await this.request("bindset:rename", {
        oldName: this.selectedBindset,
        newName: newName.trim(),
      });
      if (!res?.success) this.showError(res.error);
    });

    this.onDom("deleteBindsetBtn", "click", async () => {
      if (!this.selectedBindset || !this.confirmDialog) return;

      const message = this.i18n.t("confirm_delete_bindset", {
        name: this.selectedBindset,
      });
      const title = this.i18n.t("confirm_delete");

      if (
        await this.confirmDialog.confirm(
          message,
          title,
          "danger",
          "bindsetDelete",
        )
      ) {
        const res = await this.request("bindset:delete", {
          name: this.selectedBindset,
        });
        if (!res?.success) this.showError(res.error);
      }
    });
  }

  /** @param {string | undefined} err */
  showError(err) {
    /** @type {Record<string, string>} */
    const map = {
      invalid_name: "invalid_name",
      name_exists: "bindset_name_in_use",
      not_found: "not_found",
      not_empty: "bindset_not_empty",
    };
    const key = (err && map[err]) || "error";
    const el = this.document.getElementById("bindsetError");
    if (el) {
      el.textContent = this.i18n.t(key);
      el.style.display = "";
      setTimeout(() => {
        el.style.display = "none";
      }, 4000);
    }
  }

  async render() {
    const listUl = this.document.getElementById("bindsetList");
    if (!listUl) return;
    const names = this.cache.bindsetNames || [];
    listUl.innerHTML = "";
    names.forEach((name) => {
      const li = this.document.createElement("li");
      li.textContent = name;
      li.className =
        "bindset-item" + (name === this.selectedBindset ? " selected" : "");
      li.onclick = () => {
        this.selectedBindset = name === this.selectedBindset ? null : name;
        this.render();
      };
      listUl.appendChild(li);
    });
    const renameBtn = /** @type {HTMLButtonElement | null} */ (
      this.document.getElementById("renameBindsetBtn")
    );
    const deleteBtn = /** @type {HTMLButtonElement | null} */ (
      this.document.getElementById("deleteBindsetBtn")
    );
    const valid =
      this.selectedBindset && this.selectedBindset !== "Primary Bindset";
    if (renameBtn) renameBtn.disabled = !valid;
    if (deleteBtn) deleteBtn.disabled = !valid;
  }

  onDestroy() {
    this.listenersSetup = false;
  }

  // Late-join support
  /**
   * @param {import('../../types/events/component-state.js').ComponentStateReply} reply
   */
  handleInitialState({ state }) {
    if ("bindsets" in state && state.bindsets) {
      // ComponentBase automatically handles bindset names via bindsets:changed event
      // Re-render if UI already initialized
      if (this.isInitialized()) this.render();
    }
  }
}
