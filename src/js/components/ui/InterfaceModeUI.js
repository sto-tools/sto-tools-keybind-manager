import UIComponentBase from "../UIComponentBase.js";
import { resolveDocument } from "./uiTypes.js";

const runtime = /** @type {import('./uiTypes.js').RuntimeGlobals} */ (
  globalThis
);

/**
 * @param {unknown} value
 * @returns {value is import('./uiTypes.js').Environment}
 */
function isEnvironment(value) {
  return value === "space" || value === "ground" || value === "alias";
}

/**
 * Validate the canonical environment broadcast before it reaches UI state.
 * @param {unknown} payload
 * @returns {import('./uiTypes.js').Environment | undefined}
 */
function environmentFromEvent(payload) {
  if (typeof payload !== "object" || payload === null) return undefined;
  const environment = Reflect.get(payload, "environment");
  return isEnvironment(environment) ? environment : undefined;
}

/**
 * InterfaceModeUI - Handles mode toggle button UI and display updates
 * Owns the space/ground/alias toggle buttons and manages their visual state
 */
export default class InterfaceModeUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   ui?: import('./uiTypes.js').UIServiceLike | null,
   *   profileUI?: import('./ProfileUI.js').default | null,
   *   document?: Document
   * }} [options]
   */
  constructor({
    eventBus: bus,
    ui = null,
    profileUI = null,
    document = typeof window !== "undefined" ? window.document : undefined,
  } = {}) {
    super(bus);
    this.componentName = "InterfaceModeUI";
    this.ui = ui || runtime.stoUI || null;
    this.profileUI = profileUI;
    this.document = resolveDocument(document);

    // Internal cached state
    /** @type {import('./uiTypes.js').Environment} */
    this._currentMode = "space";

    // Internal state
    this._uiListenersSetup = false;
    this._modeButtonsSetup = false;
  }

  // Component lifecycle hook - called by ComponentBase.init()
  onInit() {
    this.setupEventListeners();
    this.setupModeButtons();
  }

  // Setup event listeners for mode changes
  setupEventListeners() {
    if (this._uiListenersSetup) {
      return;
    }

    this.addEventListener("environment:changed", (d) => {
      const env = environmentFromEvent(d);
      if (env) {
        this._currentMode = env;
        this.updateModeUI(env);
      }
    });

    this._uiListenersSetup = true;
  }

  // Setup mode toggle buttons and their click handlers
  setupModeButtons() {
    if (this._modeButtonsSetup) {
      return;
    }

    // Use automatic cleanup pattern
    /** @type {import('./uiTypes.js').Environment[]} */
    const modes = ["space", "ground", "alias"];

    modes.forEach((mode) => {
      // Use this.onDom for automatic cleanup
      this.onDom(`[data-mode="${mode}"]`, "click", `mode-change-${mode}`, () =>
        this.handleModeButtonClick(mode),
      );
    });

    this._modeButtonsSetup = true;
  }

  // Handle mode button clicks
  /** @param {import('./uiTypes.js').Environment} mode */
  async handleModeButtonClick(mode) {
    try {
      // Use request-response pattern to switch environment
      const result = await this.request("environment:switch", { mode });
      if (!result.success) {
        console.error(
          "[InterfaceModeUI] Failed to switch environment:",
          result.error,
        );
      }
    } catch (error) {
      console.error("[InterfaceModeUI] Error switching environment:", error);
    }
  }

  // Update mode UI to reflect current mode
  /** @param {import('./uiTypes.js').Environment} currentMode */
  updateModeUI(currentMode) {
    // Update mode buttons using DOM queries
    /** @type {import('./uiTypes.js').Environment[]} */
    const modes = ["space", "ground", "alias"];
    modes.forEach((mode) => {
      const button = this.document.querySelector(`[data-mode="${mode}"]`);
      if (button) {
        button.classList.toggle("active", mode === currentMode);
      }
    });

    // Update key grid display
    this.updateKeyGridDisplay(currentMode);
  }

  // Update key grid display based on current mode
  /** @param {import('./uiTypes.js').Environment} currentMode */
  updateKeyGridDisplay(currentMode) {
    // Toggle visibility between key selector and alias selector depending on mode
    const keySelectorContainer = /** @type {HTMLElement | null} */ (
      this.document.querySelector(".key-selector-container")
    );
    const aliasSelectorContainer = this.document.getElementById(
      "aliasSelectorContainer",
    );

    if (currentMode === "alias") {
      if (keySelectorContainer) keySelectorContainer.style.display = "none";
      if (aliasSelectorContainer) aliasSelectorContainer.style.display = "";
    } else {
      // For space / ground modes show key selector and hide alias selector
      if (keySelectorContainer) keySelectorContainer.style.display = "";
      if (aliasSelectorContainer) aliasSelectorContainer.style.display = "none";

      this.emit("key:list-changed");
    }
  }

  // Get current mode from service
  get currentMode() {
    return this._currentMode;
  }

  // Set current mode (delegates to service)
  set currentMode(mode) {
    if (!isEnvironment(mode)) return;
    this._currentMode = mode;
    // Use request-response pattern to switch environment
    this.request("environment:switch", { mode }).catch((error) => {
      console.error(
        "[InterfaceModeUI] Error switching environment via setter:",
        error,
      );
    });
  }

  // Component lifecycle hook - called by ComponentBase
  onDestroy() {
    this._uiListenersSetup = false;
    this._modeButtonsSetup = false;
  }

  // Late-join handshake: keep UI in sync with service state even if the relevant events fired before we registered.
  /**
   * @param {import('../../types/events/component-state.js').ComponentStateReply} reply
   */
  handleInitialState({ sender, state }) {
    if (sender !== "InterfaceModeService") return;

    const { environment } = state;
    if (
      environment === "space" ||
      environment === "ground" ||
      environment === "alias"
    ) {
      this.updateModeUI(environment);
    }
  }
}
