import ComponentBase from "../ComponentBase.js";

/**
 * @param {unknown} value
 * @returns {value is import('./serviceTypes.js').ProfileData}
 */
function isProfileData(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const profile = /** @type {Record<string, unknown>} */ (value);
  if (typeof profile.name !== "string" || !profile.name.trim()) return false;
  if (
    profile.description !== undefined &&
    typeof profile.description !== "string"
  ) {
    return false;
  }
  if (
    profile.currentEnvironment !== undefined &&
    typeof profile.currentEnvironment !== "string"
  ) {
    return false;
  }
  if (
    profile.builds !== undefined &&
    (typeof profile.builds !== "object" ||
      profile.builds === null ||
      Array.isArray(profile.builds))
  ) {
    return false;
  }

  return true;
}

/**
 * Validate the externally supplied STO_DATA profile dictionary before it
 * crosses the RPC boundary.
 * @param {Record<string, unknown> | undefined} profiles
 * @returns {Record<string, import('./serviceTypes.js').ProfileData>}
 */
function validProfiles(profiles) {
  /** @type {Record<string, import('./serviceTypes.js').ProfileData>} */
  const result = {};
  for (const [profileId, profile] of Object.entries(profiles || {})) {
    if (isProfileData(profile)) result[profileId] = profile;
  }
  return result;
}

/**
 * DataService - Centralizes access to STO_DATA using request/response pattern
 * Eliminates direct globalThis.STO_DATA references throughout the codebase
 * All communication happens via event bus request/response
 */
export default class DataService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, data?: import('./serviceTypes.js').STOData | null }} [options] */
  constructor({ eventBus, data = null } = {}) {
    super(eventBus);
    this.componentName = "DataService";

    /** @type {import('./serviceTypes.js').STOData} */
    this.data = data || {};

    // Track response handlers for cleanup
    /** @type {Array<() => void>} */
    this.responseHandlers = [];
  }

  onInit() {
    // Set up request/response handlers for data access
    this.responseHandlers.push(
      this.respond("data:get-commands", () => {
        return this.data.commands || {};
      }),
    );

    this.responseHandlers.push(
      this.respond(
        "data:find-command-by-name",
        ({ command } = /** @type {{ command?: string }} */ ({})) => {
          if (!this.data.commands || !command) return null;

          // Search for command in library

          // Search through all categories to find the command
          for (const [categoryId, category] of Object.entries(
            this.data.commands,
          )) {
            if (category.commands) {
              for (const [commandId, commandDef] of Object.entries(
                category.commands,
              )) {
                if (commandDef.command === command) {
                  // Command found in library
                  return {
                    ...commandDef,
                    categoryId,
                    commandId,
                  };
                }
              }
            }
          }

          // Command not found in library
          return null;
        },
      ),
    );

    this.responseHandlers.push(
      this.respond("data:has-commands", () => {
        return !!(this.data && this.data.commands);
      }),
    );

    this.responseHandlers.push(
      this.respond("data:get-default-profiles", () => {
        return validProfiles(this.data.defaultProfiles);
      }),
    );
  }

  onDestroy() {
    // Clean up response handlers
    this.responseHandlers.forEach((detach) => {
      if (typeof detach === "function") {
        detach();
      }
    });
    this.responseHandlers = [];
  }

  // Provide current state for late-join handshake
  /** @returns {import('../../types/events/component-state.js').ComponentState<'DataService'>} */
  getCurrentState() {
    return {
      defaultProfiles: validProfiles(this.data.defaultProfiles),
      hasCommands: !!(this.data && this.data.commands),
      dataAvailable: Object.keys(this.data).length > 0,
    };
  }
}
