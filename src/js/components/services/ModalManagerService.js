import ComponentBase from "../ComponentBase.js";

const appWindow =
  typeof window === "undefined"
    ? null
    : /** @type {import('./serviceTypes.js').AppWindow} */ (window);

/**
 * ModalManagerService – centralised modal show/hide logic with i18n
 * regeneration support.
 */
export default class ModalManagerService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, i18n?: import('./serviceTypes.js').I18n }} [options] */
  constructor({ eventBus, i18n } = {}) {
    super(eventBus);
    this.componentName = "ModalManagerService";
    this.i18n = i18n;

    this.overlayId = "modalOverlay";
    /** @type {Record<string, () => void>} */
    this.regenerateCallbacks = {}; // modalId -> callback

    this.registerAllModalCallbacks();
    this.setupEventListeners();

    // Re-translate currently open modal whenever language changes
    if (this.i18n) {
      this.i18n.on("languageChanged", () => {
        const open = document.querySelector(".modal.active");
        if (!open) return;
        const modalId = open.id;
        if (this.regenerateCallbacks[modalId]) {
          this.regenerateCallbacks[modalId]();
          // Emit event for components that want to handle their own regeneration
          this.emit("modal:regenerated", { modalId });
        } else if (typeof appWindow?.applyTranslations === "function") {
          appWindow.applyTranslations(open);
        }
      });
    }
  }

  onInit() {
    console.log(`[${this.componentName}] Initialized`);
  }

  setupEventListeners() {
    // Modal control events
    this.addEventListener("modal:show", this.handleShowModal.bind(this));
    this.addEventListener("modal:hide", this.handleHideModal.bind(this));

    // Setup global DOM event listeners for modal close buttons
    this.setupGlobalModalEventListeners();
  }

  setupGlobalModalEventListeners() {
    // Global event delegation for modal close buttons
    document.addEventListener("click", (e) => {
      if (!(e.target instanceof Element)) return;
      // Handle data-modal attribute clicks (close buttons)
      const modalTarget = e.target.closest("[data-modal]");
      if (modalTarget) {
        const modalId = modalTarget.getAttribute("data-modal");
        if (modalId) {
          this.hide(modalId);
          e.preventDefault();
          e.stopPropagation();
        }
      }
    });

    // Escape key to close modals
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const activeModal = document.querySelector(".modal.active");
        if (activeModal) {
          this.hide(activeModal.id);
        }
      }
    });

    // Click outside modal to close (modal overlay)
    document.addEventListener("click", (e) => {
      if (!(e.target instanceof Element)) return;
      if (
        e.target.id === this.overlayId ||
        e.target.classList.contains("modal-overlay")
      ) {
        const activeModal = document.querySelector(".modal.active");
        if (activeModal) {
          this.hide(activeModal.id);
        }
      }
    });
  }

  /** @param {{ modalId: string }} message */
  async handleShowModal({ modalId }) {
    const result = this.show(modalId);
    this.emit("modal:shown", { modalId, success: result });
    return result;
  }

  /** @param {{ modalId: string }} message */
  async handleHideModal({ modalId }) {
    const result = this.hide(modalId);
    this.emit("modal:hidden", { modalId, success: result });
    return result;
  }

  // Utilities
  getOverlay() {
    return document.getElementById(this.overlayId);
  }

  /** @param {string | Element} id */
  show(id) {
    const modal = typeof id === "string" ? document.getElementById(id) : id;
    const overlay = this.getOverlay();
    if (!overlay || !modal) return false;

    overlay.classList.add("active");
    modal.classList.add("active");
    document.body.classList.add("modal-open");

    if (typeof appWindow?.applyTranslations === "function") {
      appWindow.applyTranslations(modal);
    }

    const firstInput = modal.querySelector("input, textarea, select");
    if (firstInput instanceof HTMLElement) {
      setTimeout(() => firstInput.focus(), 100);
    }

    // Emit modal:shown event for components that need to respond to modal opening
    const modalId = typeof id === "string" ? id : modal.id;
    this.emit("modal:shown", { modalId, success: true });

    return true;
  }

  /** @param {string | Element} id */
  hide(id) {
    const modal = typeof id === "string" ? document.getElementById(id) : id;
    const overlay = this.getOverlay();
    if (!overlay || !modal) return false;

    modal.classList.remove("active");

    // If no other modals active, hide overlay
    if (!document.querySelector(".modal.active")) {
      overlay.classList.remove("active");
      document.body.classList.remove("modal-open");
    }
    return true;
  }

  // Regeneration callbacks
  /** @param {string} modalId @param {() => void} cb */
  registerRegenerateCallback(modalId, cb) {
    this.regenerateCallbacks[modalId] = cb;
  }

  /** @param {string} modalId */
  unregisterRegenerateCallback(modalId) {
    delete this.regenerateCallbacks[modalId];
  }

  registerAllModalCallbacks() {
    // Parameter modal
    this.registerRegenerateCallback("parameterModal", () => {
      if (appWindow?.app?.populateParameterModal) {
        const modal = document.getElementById("parameterModal");
        const def = modal?.getAttribute("data-command-def");
        if (def) {
          try {
            appWindow.app.populateParameterModal(JSON.parse(def));
          } catch {
            return;
          }
        }
      }
    });

    // Key selection modal
    this.registerRegenerateCallback("keySelectionModal", () => {
      const modal = document.getElementById("keySelectionModal");
      const active = modal?.querySelector(".tab-content .tab-pane.active");
      if (active) {
        const tab = active.id.replace("Tab", "");
        appWindow?.app?.populateKeyTab?.(tab);
      }
    });

    // VFX/Vertigo modal - updated to use new VFX system
    this.registerRegenerateCallback("vertigoModal", () => {
      // Emit event for VFX UI to handle regeneration
      if (this.eventBus) {
        this.emit("vfx:modal-regenerate-requested");
      } else {
        // Fallback to legacy method
        appWindow?.app?.populateVertigoModal?.();
      }
    });

    // Profile modal
    this.registerRegenerateCallback("profileModal", () => {
      const modal = document.getElementById("profileModal");
      appWindow?.applyTranslations?.(modal);
    });

    // File explorer modal
    this.registerRegenerateCallback("fileExplorerModal", () => {
      appWindow?.stoFileExplorer?.refreshFileList?.();
    });

    // Export modal removed

    // About modal
    this.registerRegenerateCallback("aboutModal", () => {
      const modal = document.getElementById("aboutModal");
      appWindow?.applyTranslations?.(modal);
    });
  }
}
