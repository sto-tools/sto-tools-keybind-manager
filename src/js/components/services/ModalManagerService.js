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
    /** @type {(() => void) | null} */
    this.languageChangedHandler = null;
    /** @type {Array<() => void>} */
    this.fallbackDocumentListeners = [];

    this.registerAllModalCallbacks();
  }

  onInit() {
    this.setupEventListeners();
    this.setupLanguageListener();
    console.log(`[${this.componentName}] Initialized`);
  }

  onDestroy() {
    if (this.languageChangedHandler) {
      this.i18n?.off?.("languageChanged", this.languageChangedHandler);
      this.languageChangedHandler = null;
    }
    for (const detach of this.fallbackDocumentListeners.splice(0)) detach();
  }

  setupLanguageListener() {
    if (!this.i18n || this.languageChangedHandler) return;

    // Re-translate currently open modal whenever language changes.
    this.languageChangedHandler = () => {
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
    };
    this.i18n.on("languageChanged", this.languageChangedHandler);
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
    this.onDocument("click", (e) => {
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
    this.onDocument("keydown", (e) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        const activeModal = document.querySelector(".modal.active");
        if (activeModal) {
          this.hide(activeModal.id);
        }
      }
    });

    // Click outside modal to close (modal overlay)
    this.onDocument("click", (e) => {
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

  /**
   * Preserve the direct modal API's no-bus compatibility while using the
   * tracked event-bus DOM surface during normal application operation.
   *
   * @param {string} event
   * @param {(event: Event) => unknown} handler
   */
  onDocument(event, handler) {
    if (this.eventBus) {
      return this.onDom(document, event, handler);
    }

    document.addEventListener(event, handler);
    const detach = () => document.removeEventListener(event, handler);
    this.fallbackDocumentListeners.push(detach);
    return detach;
  }

  /** @param {{ modalId: string }} message */
  async handleShowModal({ modalId }) {
    return this.show(modalId);
  }

  /** @param {{ modalId: string }} message */
  async handleHideModal({ modalId }) {
    return this.hide(modalId);
  }

  // Utilities
  getOverlay() {
    return document.getElementById(this.overlayId);
  }

  /** @param {string | Element} id */
  show(id) {
    const modal = typeof id === "string" ? document.getElementById(id) : id;
    const overlay = this.getOverlay();
    const modalId = typeof id === "string" ? id : id.id;
    if (!overlay || !modal) {
      this.emit("modal:shown", { modalId, success: false });
      return false;
    }

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
    this.emit("modal:shown", { modalId, success: true });

    return true;
  }

  /** @param {string | Element} id */
  hide(id) {
    const modal = typeof id === "string" ? document.getElementById(id) : id;
    const overlay = this.getOverlay();
    const modalId = typeof id === "string" ? id : id.id;
    if (!overlay || !modal) {
      this.emit("modal:hidden", { modalId, success: false });
      return false;
    }

    modal.classList.remove("active");

    // If no other modals active, hide overlay
    if (!document.querySelector(".modal.active")) {
      overlay.classList.remove("active");
      document.body.classList.remove("modal-open");
    }
    this.emit("modal:hidden", { modalId, success: true });
    return true;
  }

  // Regeneration callbacks
  /** @param {string} modalId @param {() => void} cb */
  registerRegenerateCallback(modalId, cb) {
    this.regenerateCallbacks[modalId] = cb;
  }

  /** @param {string} modalId @param {(() => void) | undefined} [expectedCallback] */
  unregisterRegenerateCallback(modalId, expectedCallback) {
    if (
      expectedCallback &&
      this.regenerateCallbacks[modalId] !== expectedCallback
    ) {
      return;
    }
    delete this.regenerateCallbacks[modalId];
  }

  registerAllModalCallbacks() {
    // Profile modal
    this.registerRegenerateCallback("profileModal", () => {
      const modal = document.getElementById("profileModal");
      appWindow?.applyTranslations?.(modal);
    });

    // About modal
    this.registerRegenerateCallback("aboutModal", () => {
      const modal = document.getElementById("aboutModal");
      appWindow?.applyTranslations?.(modal);
    });
  }
}
