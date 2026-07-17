import ComponentBase from "../ComponentBase.js";
import commandCategories from "../../data/commandCatalog.js";

/**
 * CommandLibraryService - Handles all command library business logic
 * Manages command definitions, command chains, and command operations
 */
export default class CommandLibraryService extends ComponentBase {
  /** @param {{ eventBus: import('./serviceTypes.js').EventBus, i18n: import('./serviceTypes.js').I18n, ui?: unknown, modalManager?: unknown }} options */
  constructor({ eventBus, i18n, ui, modalManager }) {
    super(eventBus);
    this.componentName = "CommandLibraryService";
    this.i18n = i18n;
    this.ui = ui;
    this.modalManager = modalManager;

    // Store detach functions for cleanup
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];

    this.setupRequestHandlers();
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond("command:filter-library", () => {
        this.filterCommandLibrary();
        return true;
      }),
    );
  }

  onInit() {
    this.setupRequestHandlers();
    this.setupEventListeners();
  }

  // Event Listeners
  setupEventListeners() {
    // Listen for environment changes (space ↔ ground ↔ alias)
    this.addEventListener(
      "environment:changed",
      (
        /** @type {string | { environment?: string } | null | undefined} */ data,
      ) => {
        const env = typeof data === "string" ? data : data?.environment;
        if (typeof window !== "undefined") {
          console.log(
            `[CommandLibraryService] environment:changed event received. data:`,
            data,
            `parsed env: ${env}`,
          );
        }
        if (env) {
          // ComponentBase handles this.cache.currentEnvironment automatically

          // REMOVED: Selection clearing now handled by SelectionService

          // Re-apply environment-based filtering whenever mode changes
          // (UI components may also re-apply text search afterwards)
          this.filterCommandLibrary();

          if (typeof window !== "undefined") {
            console.log(
              `[CommandLibraryService] after environment change to ${env}`,
            );
          }
        }
      },
    );

    // Listen for language changes and update i18n instance
    this.addEventListener("language:changed", async () => {
      // i18n instance is injected through constructor - no need to update from global

      // Clear parser cache to refresh translated display text
      try {
        await this.request("parser:clear-cache");
      } catch (error) {
        console.warn(
          "[CommandLibraryService] Could not clear parser cache:",
          error,
        );
      }

      // Signal that translated alias display names can now be rebuilt from the
      // accepted profile snapshot.
      this.emit("aliases-changed", {
        aliases: { ...(this.cache?.aliases || {}) },
      });
    });
  }

  // Filter command library based on current environment
  filterCommandLibrary() {
    try {
      const commandItems = /** @type {NodeListOf<HTMLElement>} */ (
        document.querySelectorAll(".command-item")
      );

      commandItems.forEach((item) => {
        const commandId = item.dataset.command;
        if (!commandId) return;

        // Find the command definition
        let commandDef = null;
        for (const catData of Object.values(commandCategories)) {
          if (catData.commands?.[commandId]) {
            commandDef = catData.commands[commandId];
            break;
          }
        }

        if (commandDef) {
          let isVisible;
          const currentEnvironment = this.cache?.currentEnvironment || "space";
          if (currentEnvironment === "alias") {
            // In alias mode, show all commands (env not relevant)
            isVisible = true;
          } else {
            // Respect environment property when present
            isVisible =
              !commandDef.environment ||
              commandDef.environment === currentEnvironment;
          }

          // Mark whether hidden by env filter for search logic
          item.dataset.envHidden = (!isVisible).toString();

          // Only change style if env filter dictates hiding/showing; don't un-hide items already hidden by search
          if (isVisible) {
            if (item.style.display === "" || item.style.display === "none") {
              // Use flex to preserve original layout
              item.style.display = "flex";
            }
          } else {
            item.style.display = "none";
          }
        }
      });

      // Hide/show categories based on whether they have visible commands
      const categories = /** @type {NodeListOf<HTMLElement>} */ (
        document.querySelectorAll(".category")
      );
      categories.forEach((category) => {
        const visibleCommands = category.querySelectorAll(
          '.command-item:not([style*="display: none"])',
        );
        const categoryVisible = visibleCommands.length > 0;
        category.style.display = categoryVisible ? "block" : "none";
      });
    } catch (error) {
      // Keep UI filtering non-fatal if DOM or catalog access fails.
      console.warn(
        "CommandLibraryService: filterCommandLibrary failed:",
        error,
      );
    }
  }

  // Cleanup method to detach all request/response handlers
  onDestroy() {
    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach((detach) => {
        if (typeof detach === "function") {
          detach();
        }
      });
      this._responseDetachFunctions = [];
    }
  }
}
