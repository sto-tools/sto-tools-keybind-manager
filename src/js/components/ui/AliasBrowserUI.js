import UIComponentBase from "../UIComponentBase.js";
import eventBus from "../../core/eventBus.js";
import {
  isAliasNameAllowed,
  isAliasNamePatternValid,
} from "../../lib/aliasNameValidator.js";
import { escapeHtml } from "../../lib/htmlEscape.js";
import { getSnapshotUserAliases } from "../services/dataState.js";
import { resolveDocument, resolveI18n } from "./uiTypes.js";

const runtime = /** @type {import('./uiTypes.js').RuntimeGlobals} */ (
  globalThis
);

/**
 * @typedef {{
 *   commands?: string | import('../services/serviceTypes.js').StoredCommand[],
 *   description?: string
 * }} AliasRecord
 */
/** @typedef {Record<string, AliasRecord>} AliasMap */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is import('../services/serviceTypes.js').StoredCommand} */
function isStoredCommand(value) {
  return (
    typeof value === "string" ||
    (isRecord(value) &&
      (typeof value.command === "string" || typeof value.text === "string"))
  );
}

/** @param {unknown} value @returns {value is AliasRecord} */
function isAliasRecord(value) {
  if (!isRecord(value)) return false;
  if (
    value.description !== undefined &&
    typeof value.description !== "string"
  ) {
    return false;
  }
  return (
    value.commands === undefined ||
    typeof value.commands === "string" ||
    (Array.isArray(value.commands) && value.commands.every(isStoredCommand))
  );
}

/** @param {unknown} value @returns {AliasMap} */
function normalizeAliasEntries(value) {
  /** @type {AliasMap} */
  const aliases = {};
  if (!isRecord(value)) return aliases;
  for (const [name, alias] of Object.entries(value)) {
    if (isAliasRecord(alias)) aliases[name] = alias;
  }
  return aliases;
}

/** @param {unknown} response @returns {AliasMap} */
function normalizeAliasMap(response) {
  const value =
    isRecord(response) && "aliases" in response ? response.aliases : response;
  return normalizeAliasEntries(value);
}

/** Helper to generate a non-colliding suggested alias name */
/**
 * @param {string} original
 * @param {Record<string, unknown>} [existingAliases]
 */
function generateSuggestedAlias(original, existingAliases = {}) {
  let base = `${original}_copy`;
  let suggestion = base;
  let counter = 1;
  while (existingAliases[suggestion]) {
    suggestion = `${base}${counter}`;
    counter++;
  }
  return suggestion;
}

export default class AliasBrowserUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   confirmDialog?: import('./uiTypes.js').ConfirmDialogLike | null,
   *   document?: Document,
   *   i18n?: import('./uiTypes.js').I18nLike
   * }} [options]
   */
  constructor({
    eventBus: bus = eventBus,
    modalManager = null,
    confirmDialog = null,
    document = typeof window !== "undefined" ? window.document : undefined,
    i18n,
  } = {}) {
    super(bus);
    this.componentName = "AliasBrowserUI";
    this.modalManager = modalManager;
    this.confirmDialog = confirmDialog || runtime.confirmDialog || null;
    this.document = resolveDocument(document);
    this.i18n = resolveI18n(i18n);
  }

  async onInit() {
    // Initialize cached selected alias
    /** @type {string | null} */
    this._selectedAliasName = null;

    this.setupEventListeners();

    // React to alias list or selection changes
    this.eventBus?.on("aliases-changed", () => {
      // Aliases changed, updating display
      this.render();
    });
    this.eventBus?.on("alias-selected", (data) => {
      this._selectedAliasName = data.name;
      this.render();
    });

    // Listen for profile changes to refresh alias list
    this.addEventListener("profile:switched", () => {
      this._selectedAliasName = null; // Clear selection when switching profiles
      this.render();
    });

    // Toggle visibility based on current environment
    this.eventBus?.on("environment:changed", (d) => {
      const env = d.environment;
      // Environment changed, updating visibility
      this.toggleVisibility(env);
    });

    // Initial render & visibility - now handled through late-join handshake
    // The late-join handshake will handle environment synchronization
    await this.render();
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return;
    }
    this.eventListenersSetup = true;

    // Alias management DOM events
    this.onDom("addAliasChainBtn", "click", () => {
      this.createAliasModal();
    });

    this.onDom("deleteAliasChainBtn", "click", () => {
      if (this._selectedAliasName) {
        this.confirmDeleteAlias(this._selectedAliasName);
      }
    });

    this.onDom("duplicateAliasChainBtn", "click", () => {
      if (this._selectedAliasName) {
        this.duplicateAlias(this._selectedAliasName);
      }
    });

    // Debounced alias search input via eventBus helper
    this.onDomDebounced(
      "aliasFilter",
      "input",
      (e) => {
        const input = /** @type {HTMLInputElement} */ (e.target);
        this.filterAliases(input.value);
      },
      250,
    );

    // keydown Escape/Enter
    this.onDom("aliasFilter", "keydown", (e) => {
      if (!(e instanceof KeyboardEvent)) return;
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (e.key === "Escape") {
        input.value = "";
        input.classList.remove("expanded");
        this.filterAliases("");
      } else if (e.key === "Enter") {
        input.classList.remove("expanded");
        input.blur();
      }
    });

    // show all aliases button
    this.onDom("showAllAliasesBtn", "click", () => {
      const input = /** @type {HTMLInputElement | null} */ (
        this.document.getElementById("aliasFilter")
      );
      if (input) input.value = "";
      this.filterAliases("");
    });

    this.onDom("aliasSearchBtn", "click", () => {
      this.toggleAliasSearch();
    });
  }

  /**
   * Confirm deletion of an alias
   */
  /** @param {string} aliasName */
  async confirmDeleteAlias(aliasName) {
    if (!aliasName || !this.confirmDialog) return;

    const message = this.i18n.t("confirm_delete_alias", {
      aliasName: aliasName,
    });
    const title = this.i18n.t("confirm_delete");

    if (
      await this.confirmDialog.confirm(message, title, "danger", "aliasDelete")
    ) {
      // Call alias service directly and show toast based on result
      const result = await this.request("alias:delete", { name: aliasName });

      if (result?.success) {
        const successMessage = this.i18n.t(result?.message || "alias_deleted", {
          name: aliasName,
        });
        this.showToast(successMessage, "success");
      } else {
        const params = result?.params || { aliasName };
        const reason = params.reason || "Unknown error";
        const errorMessage = this.i18n.t(
          result?.error || "failed_to_delete_alias",
          { name: aliasName, reason },
        );
        this.showToast(errorMessage, "error");
      }
    }
  }

  /**
   * Open duplicate alias modal allowing the user to specify the target name.
   */
  /** @param {string} aliasName */
  async duplicateAlias(aliasName) {
    if (!aliasName || !this.modalManager) return;

    const snapshot = this.cache.dataState;
    const aliasMap = normalizeAliasMap(getSnapshotUserAliases(snapshot));
    this.cache.aliases = aliasMap;
    const suggested = generateSuggestedAlias(aliasName, aliasMap);

    // Get modal elements
    const modal = this.document.getElementById("aliasDuplicateModal");
    if (!modal) return;

    const input = /** @type {HTMLInputElement | null} */ (
      modal.querySelector("#duplicateAliasNameInput")
    );
    const okBtn = /** @type {HTMLButtonElement | null} */ (
      modal.querySelector("#confirmDuplicateAliasBtn")
    );
    const warnEl = /** @type {HTMLElement | null} */ (
      modal.querySelector("#duplicateAliasValidation")
    );
    if (!input || !okBtn || !warnEl) return;

    const validate = () => {
      const val = (input.value || "").trim();
      const duplicate = aliasMap[val];
      let errorKey = null;
      if (!val) errorKey = "invalid_alias_name";
      else if (!isAliasNamePatternValid(val)) errorKey = "invalid_alias_name";
      else if (!isAliasNameAllowed(val)) errorKey = "reserved_command_name";
      else if (duplicate) errorKey = "alias_name_in_use";

      warnEl.textContent = errorKey ? this.i18n.t(errorKey) : "";
      const invalid = !!errorKey;
      warnEl.style.display = invalid ? "" : "none";
      okBtn.disabled = invalid;
    };

    // Prefill
    input.value = suggested;
    warnEl.style.display = "none";

    // Attach event listeners once
    const inputHandler = () => validate();
    input.removeEventListener("input", inputHandler);
    input.addEventListener("input", inputHandler);

    okBtn.onclick = async () => {
      const target = input.value.trim();
      if (!target || aliasMap[target]) return; // should not happen due to validation
      this.modalManager?.hide?.("aliasDuplicateModal");

      // Call alias service directly and show toast based on result
      const result = await this.request("alias:duplicate-with-name", {
        sourceName: aliasName,
        newName: target,
      });
      if (result?.success) {
        const successMessage = this.i18n.t(
          result?.message || "alias_duplicated",
          { from: aliasName, to: target },
        );
        this.showToast(successMessage, "success");
        // Update local cache optimistically so UI reflects the new alias immediately
        this.cache.aliases = {
          ...aliasMap,
          [target]: JSON.parse(JSON.stringify(aliasMap[aliasName])),
        };
        this.render().catch(() => {});
      } else {
        const params = result?.params || { sourceName: aliasName };
        const reason = params.reason || "Unknown error";
        const errorMessage = this.i18n.t(
          result?.error || "failed_to_duplicate_alias",
          { sourceName: aliasName, reason },
        );
        this.showToast(errorMessage, "error");
      }
    };

    // Show modal
    this.modalManager.show("aliasDuplicateModal");
    // Initial validation
    validate();
  }

  async render() {
    const grid = this.document.getElementById("aliasGrid");
    if (!grid) return;

    const snapshot = this.cache.dataState;
    const aliases = normalizeAliasMap(getSnapshotUserAliases(snapshot));
    this.cache.aliases = aliases;
    // Use cached selected alias from event listeners instead of polling

    const entries = Object.entries(aliases);

    if (entries.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-mask"></i>
          <h4 data-i18n="no_aliases_defined">${this.i18n.t("no_aliases_defined")}</h4>
          <p data-i18n="create_alias_to_get_started">${this.i18n.t("create_alias_to_get_started")}</p>
        </div>`;
      return;
    }

    grid.classList.remove("categorized");
    grid.innerHTML = entries
      .map(([name, alias]) => this.createAliasElement(name, alias))
      .join("");

    // Use EventBus for automatic cleanup
    if (typeof grid.querySelectorAll === "function") {
      grid.querySelectorAll(".alias-item").forEach((item) => {
        this.onDom(item, "click", async () => {
          const aliasItem = /** @type {HTMLElement} */ (item);
          const aliasName = aliasItem.dataset.alias;
          if (!aliasName) return;
          // Use correct parameter name for SelectionService
          await this.request("alias:select", {
            aliasName,
          });
        });
      });
    }
  }

  /**
   * @param {string} name
   * @param {AliasRecord} alias
   */
  createAliasElement(name, alias) {
    // Handle both legacy string format and new canonical string array format
    // Also supports rich command objects with metadata (e.g., { command: 'cmd', palindromicGeneration: false })
    let commandCount = 0;
    if (Array.isArray(alias.commands)) {
      // Extract command strings from both string and rich object formats
      commandCount = alias.commands.filter((cmd) => {
        // Handle null/undefined
        if (!cmd) return false;

        // Handle string format
        if (typeof cmd === "string") {
          return cmd.trim().length > 0;
        }

        // Handle rich object format: { command: 'string', ...metadata }
        if (typeof cmd === "object" && cmd.command) {
          const cmdStr = cmd.command;
          return (
            cmdStr && typeof cmdStr === "string" && cmdStr.trim().length > 0
          );
        }

        // Ignore other types (numbers, booleans, etc.)
        return false;
      }).length;
    } else if (typeof alias.commands === "string" && alias.commands.trim()) {
      // Legacy string format - split by $$
      commandCount = alias.commands.trim().split(/\s*\$\$/).length;
    }

    const selectedName = this._selectedAliasName || null;
    const isSelected = selectedName === name;
    const description = alias.description || "";
    const escapedName = escapeHtml(name);
    const escapedDescription = escapeHtml(description);
    const lengthClass =
      name.length <= 8
        ? "short"
        : name.length <= 12
          ? "medium"
          : name.length <= 16
            ? "long"
            : "extra-long";

    // Use consistent CSS classes: 'alias-item' (to match tests) and 'active' (to match selection pattern)
    return `
      <div class="alias-item ${isSelected ? "active" : ""}" data-alias="${escapedName}" data-length="${lengthClass}" title="${escapedDescription}">
        <div class="alias-name">${escapedName}</div>
        <div class="alias-command-count">${commandCount} <span data-i18n="${commandCount === 1 ? "command_singular" : "commands"}">${this.i18n.t(commandCount === 1 ? "command_singular" : "commands")}</span></div>
      </div>`;
  }

  /** @param {string | undefined} env */
  toggleVisibility(env) {
    const container =
      this.document.getElementById("aliasSelectorContainer") ||
      this.document.getElementById("aliasGrid")?.parentElement?.parentElement;
    if (!container) return;

    const shouldShow = env === "alias";
    // Toggling alias browser visibility

    container.style.display = shouldShow ? "" : "none";
  }

  /* ------------------------------------------------------------
   * Late-join: when other components send us their state snapshot we
   * immediately sync our visibility so that the UI is correct on first
   * paint even if the environment was set long before this UI initialised.
   * ---------------------------------------------------------- */
  /**
   * @param {import('../../types/events/component-state.js').ComponentStateReply} reply
   */
  handleInitialState({ sender, state }) {
    // Handle environment state from InterfaceModeService or other components
    const environment =
      ("environment" in state ? state.environment : undefined) ||
      ("currentEnvironment" in state ? state.currentEnvironment : undefined);
    if (environment) {
      console.log(
        "[AliasBrowserUI] handleInitialState from",
        sender,
        "environment:",
        environment,
      );
      this.toggleVisibility(environment);
    }
  }

  // Show create alias modal
  async createAliasModal() {
    if (!this.modalManager) return;
    const modalManager = this.modalManager;

    const snapshot = this.cache.dataState;
    const aliases = normalizeAliasMap(getSnapshotUserAliases(snapshot));

    const modal = this.document.getElementById("aliasCreationModal");
    if (!modal) return;

    const input = /** @type {HTMLInputElement | null} */ (
      modal.querySelector("#newAliasNameInput")
    );
    const okBtn = /** @type {HTMLButtonElement | null} */ (
      modal.querySelector("#confirmCreateAliasBtn")
    );
    const warnEl = /** @type {HTMLElement | null} */ (
      modal.querySelector("#createAliasValidation")
    );
    if (!input || !okBtn || !warnEl) return;

    const validate = () => {
      const val = (input.value || "").trim();
      let errorKey = null;
      if (!val) errorKey = "invalid_alias_name";
      else if (!isAliasNamePatternValid(val)) errorKey = "invalid_alias_name";
      else if (!isAliasNameAllowed(val)) errorKey = "reserved_command_name";
      else if (aliases[val]) errorKey = "alias_name_in_use";

      warnEl.textContent = errorKey ? this.i18n.t(errorKey) : "";
      const invalid = !!errorKey;
      warnEl.style.display = invalid ? "" : "none";
      okBtn.disabled = invalid;
    };

    input.value = "";
    warnEl.style.display = "none";
    input.removeEventListener("input", validate);
    input.addEventListener("input", validate);

    // Clear any existing onclick handler to prevent stacking
    okBtn.onclick = null;
    okBtn.onclick = async () => {
      const name = input.value.trim();
      if (!name) return;
      modalManager.hide("aliasCreationModal");

      // Validate alias name first to provide better error messages
      const isValidName = await this.request("alias:validate-name", { name });
      if (!isValidName) {
        this.showToast("Invalid alias name", "error");
        return;
      }

      // Use event-driven alias creation to enable auto-selection
      // The service will handle profile and duplicate checks
      const result = await this.request("alias-browser:create", {
        name,
        description: "",
      });
      if (result?.success) {
        const successMessage = this.i18n.t(result?.message || "alias_created", {
          name,
        });
        this.showToast(successMessage, "success");
      } else if (result?.error) {
        const errorMessage = this.i18n.t(result.error, result.params);
        this.showToast(errorMessage, "error");
      } else {
        this.showToast("Failed to create alias", "error");
      }
    };

    modalManager.show("aliasCreationModal");
    validate();
  }

  // Filter aliases by term
  filterAliases(value = "") {
    const filter = (value || "").toString().toLowerCase();
    const grid = this.document.getElementById("aliasGrid");
    if (!grid) return;

    const items = grid.querySelectorAll(".alias-item");
    items.forEach((item) => {
      const aliasItem = /** @type {HTMLElement} */ (item);
      const name = (aliasItem.dataset.alias || "").toLowerCase();
      const visible = !filter || name.includes(filter);
      aliasItem.style.display = visible ? "flex" : "none";
    });

    // Update search button active state for accessibility
    const searchBtn = this.document.getElementById("aliasSearchBtn");
    if (searchBtn) {
      const active = !!filter;
      searchBtn.classList.toggle("active", active);
      searchBtn.setAttribute("aria-pressed", String(active));
    }
  }

  // Toggle alias search input
  toggleAliasSearch() {
    const doc =
      this.document ||
      (typeof window !== "undefined" ? window.document : undefined);
    if (!doc) return;
    const input = /** @type {HTMLInputElement | null} */ (
      doc.getElementById("aliasFilter")
    );
    if (!input) return;
    const expanded = input.classList.toggle("expanded");
    if (expanded) {
      input.focus();
    } else {
      input.blur();
    }
  }
}
