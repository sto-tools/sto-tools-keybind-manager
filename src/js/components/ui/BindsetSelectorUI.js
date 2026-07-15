import UIComponentBase from "../UIComponentBase.js";
import { selectedKeyFromPayload } from "../../core/eventPayloads.js";
import { eventElement, resolveDocument, resolveI18n } from "./uiTypes.js";

const runtime = /** @type {import('./uiTypes.js').RuntimeGlobals} */ (
  globalThis
);

/*
 * BindsetSelectorUI - Handles the bindset selector UI
 * Manages the bindset selector UI and its interactions
 */
export default class BindsetSelectorUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   confirmDialog?: import('./uiTypes.js').ConfirmDialogLike | null,
   *   document?: Document,
   *   i18n?: import('./uiTypes.js').I18nLike
   * }} [options]
   */
  constructor({
    eventBus,
    confirmDialog = null,
    document = typeof window !== "undefined" ? window.document : undefined,
    i18n,
  } = {}) {
    super(eventBus);
    this.componentName = "BindsetSelectorUI";
    this.document = resolveDocument(document);
    this.confirmDialog = confirmDialog || runtime.confirmDialog || null;
    this.i18n = resolveI18n(i18n);

    this.containerId = "bindsetSelectorContainer";
    this.isOpen = false;
    this.service = null;

    /** @type {Map<string, boolean>} */
    this.keyBindsetMembership = new Map();
    this.isVisible = false;
  }

  async onInit() {
    this.setupEventListeners();
    this.render();
  }

  setupEventListeners() {
    if (this.eventListenersSetup) return;
    this.eventListenersSetup = true;

    // Listen for service state changes
    this.addEventListener("bindset-selector:active-changed", () => {
      // ComponentBase automatically updates this.cache.activeBindset
      this.render();
    });

    this.addEventListener(
      "bindset-selector:membership-updated",
      ({ membership }) => {
        // ComponentBase automatically updates this.cache.selectedKey
        console.log(
          `[BindsetSelectorUI] membership-updated received:`,
          Object.fromEntries(membership),
        );
        console.log(
          `[BindsetSelectorUI] current cache.selectedKey:`,
          this.cache.selectedKey,
        );
        console.log(
          `[BindsetSelectorUI] Primary Bindset membership:`,
          membership.get("Primary Bindset"),
        );

        this.keyBindsetMembership = membership;
        this.render();
      },
    );

    this.addEventListener(
      "bindset-selector:visibility-changed",
      ({ visible }) => {
        this.isVisible = visible;
        this.render();
      },
    );

    this.addEventListener("bindsets:changed", ({ names }) => {
      console.log("[BindsetSelectorUI] bindsets:changed received:", names);
      // ComponentBase automatically updates this.cache.bindsetNames
      this.render();
    });

    // Listen for key selection changes
    this.addEventListener("key:selected", (payload) => {
      const key = selectedKeyFromPayload(payload);
      console.log(
        `[BindsetSelectorUI] key:selected received: key="${key}", current cache.selectedKey="${this.cache.selectedKey}"`,
      );
      // ComponentBase handles this.cache.selectedKey automatically via key-selected events
      if (key !== null) this.request("bindset-selector:set-key", { key });
    });

    // Listen for environment changes - service handles this directly
    this.addEventListener("environment:changed", ({ environment }) => {
      console.log(
        "[BindsetSelectorUI] environment:changed received:",
        environment,
      );
      // Service handles environment changes directly, UI just needs to re-render
      this.render();
    });

    // Listen for bindset manager open requests
    this.addEventListener("bindset-manager:open", () => {
      this.openBindsetManager();
    });

    // DOM Event Listeners using EventBus onDom facility
    // Button events - use element selectors with EventBus delegation
    this.onDom("bindsetSelectorBtn", "click", "bindset-toggle", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Bindset selection events - use delegation on the dropdown menu
    this.onDom(
      "#bindsetOptionsMenu",
      "click",
      "bindset-option-selected",
      (e) => {
        const target = eventElement(e);
        const option = target?.closest(".bindset-option");
        if (
          option instanceof HTMLElement &&
          !target?.closest(".toolbar-group")
        ) {
          // Don't allow selection of greyed-out bindsets (where key doesn't exist)
          if (option.classList.contains("greyed-out")) {
            return;
          }
          const bindset = option.dataset.bindset;
          this.request("bindset-selector:set-active-bindset", { bindset });
          this.close();
        }
      },
    );

    // Add key buttons - handle click events on add-key-btn class
    this.onDom("#bindsetOptionsMenu", "click", "bindset-add-key", (e) => {
      const addBtn = eventElement(e)?.closest(".add-key-btn");
      if (addBtn instanceof HTMLButtonElement && !addBtn.disabled) {
        e.preventDefault();
        e.stopPropagation();
        const bindset = addBtn.dataset.bindset;
        this.showAddKeyConfirmation(bindset);
      }
    });

    // Remove key buttons - handle click events on remove-key-btn class
    this.onDom("#bindsetOptionsMenu", "click", "bindset-remove-key", (e) => {
      const removeBtn = eventElement(e)?.closest(".remove-key-btn");
      if (removeBtn instanceof HTMLButtonElement && !removeBtn.disabled) {
        e.preventDefault();
        e.stopPropagation();
        const bindset = removeBtn.dataset.bindset;
        this.showRemoveKeyConfirmation(bindset);
      }
    });

    // Manage bindsets link - use element selector
    this.onDom("manageBindsetsLink", "click", "bindset-manage", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openBindsetManager();
      this.close();
    });

    // Document events - use document with proper cleanup and unique bus events
    this.onDom(this.document, "click", "bindset-outside-click", (e) => {
      const target = eventElement(e);
      // Close if click is outside both the container and the dropdown menu
      if (
        !target?.closest(`#${this.containerId}`) &&
        !target?.closest("#bindsetOptionsMenu")
      ) {
        this.close();
      }
    });

    this.onDom(this.document, "keydown", "bindset-escape", (e) => {
      if (e instanceof KeyboardEvent && e.key === "Escape" && this.isOpen) {
        this.close();
      }
    });
  }

  render() {
    const container = this.document?.getElementById(this.containerId);
    if (!container) {
      console.log("[BindsetSelectorUI] Container not found:", this.containerId);
      return;
    }

    console.log(
      "[BindsetSelectorUI] render() called - isVisible:",
      this.isVisible,
      "bindsetNames:",
      this.cache.bindsetNames,
    );

    if (!this.isVisible) {
      container.style.display = "none";
      return;
    }

    container.style.display = "block";
    container.innerHTML = this.generateDropdownHTML();

    // Create dropdown menu as child of body to avoid overflow issues
    this.createDropdownMenu();
  }

  generateDropdownHTML() {
    // Only return the button HTML - dropdown will be created separately
    let html = `
      <button class="toolbar-btn" id="bindsetSelectorBtn" title="${this.i18n.t("select_bindset")}">
        <i class="fas fa-tags"></i>
      </button>
    `;

    return html;
  }

  generateDropdownMenuHTML() {
    const activeBindset = this.cache.activeBindset;

    let html = `
      <div id="bindsetOptionsMenu" class="bindset-dropdown-menu" style="display: none;">
    `;

    // Primary Bindset (no toolbar)
    const isPrimaryActive = activeBindset === "Primary Bindset";
    const hasPrimaryKey =
      this.keyBindsetMembership.get("Primary Bindset") || false;
    const primaryGreyedOut = !hasPrimaryKey ? "greyed-out" : "";

    html += `
      <div class="bindset-option ${isPrimaryActive ? "active" : ""} ${primaryGreyedOut}" data-bindset="Primary Bindset">
        <span class="bindset-name">${this.i18n.t("primary_bindset")}</span>
      </div>
    `;

    // Other bindsets with toolbar
    this.cache.bindsetNames.forEach((bindset) => {
      if (bindset === "Primary Bindset") return;

      const isActive = activeBindset === bindset;
      const hasKey = this.keyBindsetMembership.get(bindset) || false;
      const greyedOut = !hasKey ? "greyed-out" : "";

      console.log(
        `[BindsetSelectorUI] Bindset: ${bindset}, hasKey: ${hasKey}, selectedKey: ${this.cache.selectedKey}`,
      );

      html += `
        <div class="bindset-option ${isActive ? "active" : ""} ${greyedOut}" data-bindset="${bindset}">
          <span class="bindset-name">${this.escapeHtml(bindset)}</span>
          <div class="toolbar-group">
            <button class="toolbar-btn-small add-key-btn" 
                    data-bindset="${this.escapeHtml(bindset)}" 
                    title="${this.i18n.t("add_key_to_bindset")}"
                    ${hasKey ? "disabled" : ""}>
              <i class="fas fa-plus"></i>
            </button>
            <button class="toolbar-btn-small remove-key-btn" 
                    data-bindset="${this.escapeHtml(bindset)}" 
                    title="${this.i18n.t("remove_key_from_bindset")}"
                    ${!hasKey ? "disabled" : ""}>
              <i class="fas fa-minus"></i>
            </button>
          </div>
        </div>
      `;
    });

    html += `
        <div class="bindset-dropdown-footer">
          <a href="#" id="manageBindsetsLink" class="text-link">[${this.i18n.t("manage_bindsets")}]</a>
        </div>
      </div>
    `;

    return html;
  }

  createDropdownMenu() {
    // Remove existing dropdown menu if it exists
    const existingMenu = this.document?.getElementById("bindsetOptionsMenu");
    if (existingMenu) {
      existingMenu.remove();
    }

    // Create new dropdown menu and append to body
    const menuHTML = this.generateDropdownMenuHTML();
    const tempDiv = this.document?.createElement("div");
    if (tempDiv) {
      tempDiv.innerHTML = menuHTML;
      const menu = tempDiv.firstElementChild;
      if (menu) {
        this.document.body.appendChild(menu);
      }
    }
  }

  /** @param {string | undefined} bindsetName */
  async showAddKeyConfirmation(bindsetName) {
    if (!bindsetName) return;
    const message = this.i18n.t("add_key_to_bindset_confirm", {
      key: this.cache.selectedKey,
      bindset: bindsetName,
    });

    let confirmed = false;

    if (this.confirmDialog) {
      const title = this.i18n.t("confirm_add");
      confirmed = await this.confirmDialog.confirm(
        message,
        title,
        "info",
        "bindsetAddKey",
      );
    } else {
      // Fallback to window.confirm when confirmDialog is not available
      confirmed = window.confirm(message);
    }

    if (confirmed) {
      this.request("bindset-selector:add-key-to-bindset", {
        bindset: bindsetName,
      })
        .then((result) => {
          if (!result?.success) {
            this.showError(result?.error || "add_failed");
          }
        })
        .catch((error) => {
          console.error("[BindsetSelectorUI] Add key error:", error);
          this.showError("add_failed");
        });
    }
    this.close();
  }

  /** @param {string | undefined} bindsetName */
  async showRemoveKeyConfirmation(bindsetName) {
    if (!bindsetName) return;
    const message = this.i18n.t("remove_key_from_bindset_confirm", {
      key: this.cache.selectedKey,
      bindset: bindsetName,
    });

    let confirmed = false;

    if (this.confirmDialog) {
      const title = this.i18n.t("confirm_remove");
      confirmed = await this.confirmDialog.confirm(
        message,
        title,
        "warning",
        "bindsetRemoveKey",
      );
    } else {
      // Fallback to window.confirm when confirmDialog is not available
      confirmed = window.confirm(message);
    }

    if (confirmed) {
      this.request("bindset-selector:remove-key-from-bindset", {
        bindset: bindsetName,
      })
        .then((result) => {
          if (!result?.success) {
            this.showError(result?.error || "remove_failed");
          }
        })
        .catch((error) => {
          console.error("[BindsetSelectorUI] Remove key error:", error);
          this.showError("remove_failed");
        });
    }
    this.close();
  }

  /** @param {string} errorKey */
  showError(errorKey) {
    const message = this.i18n.t(`error_${errorKey}`);

    // Use toast system (ComponentBase always has eventBus)
    this.emit("toast:show", {
      type: "error",
      message: message,
      duration: 3000,
    });
  }

  openBindsetManager() {
    this.emit("modal:show", { modalId: "bindsetManagerModal" });
  }

  toggleDropdown() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    const menu = this.document?.getElementById("bindsetOptionsMenu");
    const btn = this.document?.getElementById("bindsetSelectorBtn");
    if (menu && btn) {
      // Position the dropdown relative to the button
      const rect = btn.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.display = "block";
      this.isOpen = true;
    }
  }

  close() {
    const menu = this.document?.getElementById("bindsetOptionsMenu");
    if (menu) {
      menu.style.display = "none";
      this.isOpen = false;
    }
  }

  /** @param {string} text */
  escapeHtml(text) {
    const div = this.document?.createElement("div");
    if (div) {
      div.textContent = text;
      return div.innerHTML;
    }
    return String(text).replace(/[&<>"']/g, (match) => {
      /** @type {Record<string, string>} */
      const escapeMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return escapeMap[match];
    });
  }

  // Late-join state handler
  /**
   * @param {string} sender
   * @param {{ keyBindsetMembership?: Map<string, boolean>, shouldDisplay?: boolean } | null | undefined} state
   */
  handleInitialState(sender, state) {
    if (sender === "BindsetSelectorService" && state) {
      console.log(
        "[BindsetSelectorUI] handleInitialState from BindsetSelectorService:",
        state,
      );
      // ComponentBase automatically handles selectedKey and activeBindset
      // Only update UI-specific state
      this.keyBindsetMembership = state.keyBindsetMembership || new Map();
      this.isVisible = state.shouldDisplay || false;
      this.render();
    }
  }
}
