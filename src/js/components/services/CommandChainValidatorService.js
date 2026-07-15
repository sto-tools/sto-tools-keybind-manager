import ComponentBase from "../ComponentBase.js";
import RULES from "./validators/index.js";

/**
 * CommandChainValidatorService
 *
 * Listens for `command-chain:validate` events (triggered by CommandUI)
 * and performs length-based validation of the generated keybind line.
 *
 * Current rules (can be expanded later):
 *   • If preview length >= 990 – emit error + toast (red)
 *   • If preview length >= 900 – emit warning + toast (yellow)
 *   • Otherwise emit success (green)
 */
export default class CommandChainValidatorService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, i18n?: import('./serviceTypes.js').I18n, ui?: import('./serviceTypes.js').ToastUI | null }} [options] */
  constructor({ eventBus, i18n, ui = null } = {}) {
    super(eventBus);
    this.componentName = "CommandChainValidatorService";
    this.i18n = i18n;
    this.ui = ui;
    this._busy = false;
    /** @type {Record<string, 'error' | 'warning' | 'success'>} */
    this._severityCache = {};
  }

  // Lifecycle
  onInit() {
    // Listen for validate events coming from the UI
    this.addEventListener(
      "command-chain:validate",
      async ({ key, stabilized, isAlias }) => {
        if (!key) return;
        await this.validateChain(key, stabilized, isAlias);
      },
    );
  }

  // Public validation entry
  /**
   * @param {string} key
   * @param {boolean | undefined} stabilizedFlag
   * @param {boolean | undefined} aliasFlag
   */
  async validateChain(key, stabilizedFlag = undefined, aliasFlag = undefined) {
    if (this._busy) return;
    this._busy = true;
    try {
      // Retrieve the command list for the CURRENTLY SELECTED key
      const commands = await this.request("command:get-for-selected-key");

      // Normalize commands – even an empty/null response should allow validation rules
      if (!Array.isArray(commands)) {
        console.warn(
          "[CommandChainValidatorService] No commands array returned – proceeding with empty list",
        );
      }
      const safeCommands = Array.isArray(commands) ? commands : [];

      // Generate the exact preview line used in the command-chain editor
      const previewUnstabilized = await this.request(
        "command:generate-command-preview",
        {
          key,
          commands: safeCommands,
          stabilize: false,
        },
      );

      // Determine if stabilization (mirroring) is enabled for this key
      const stabilized = stabilizedFlag !== undefined ? stabilizedFlag : false;
      const isAlias = aliasFlag !== undefined ? aliasFlag : false;

      /** @type {number} */
      let length;
      /** @type {string} */
      let generatedCommand;
      if (stabilized && safeCommands.length > 1) {
        const previewStabilized = await this.request(
          "command:generate-command-preview",
          {
            key,
            commands: safeCommands,
            stabilize: true,
          },
        );

        length = previewStabilized.length;
        generatedCommand = previewStabilized;
      } else {
        length = previewUnstabilized.length;
        generatedCommand = previewUnstabilized;
      }

      // Run modular validators (a rule may return a single issue or an array)
      const ctx = {
        key,
        commands: safeCommands,
        length,
        stabilized,
        isAlias,
        generatedCommand,
      };
      const issues = RULES.flatMap((r) => {
        const res = r.run(ctx);
        if (!res) return [];
        return Array.isArray(res) ? res : [res];
      });

      const errors = issues.filter((i) => i.severity === "error");
      const warnings = issues.filter((i) => i.severity === "warning");

      const severity = errors.length
        ? "error"
        : warnings.length
          ? "warning"
          : "success";

      this.emit("command-chain:validation-result", {
        key,
        length,
        severity,
        warnings,
        errors,
      });

      this._severityCache[key] = severity;
    } catch (error) {
      console.error(
        "[CommandChainValidatorService] validateChain failed:",
        error,
      );
    } finally {
      this._busy = false;
    }
  }
}
