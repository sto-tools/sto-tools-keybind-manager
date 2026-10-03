import ComponentBase from "../ComponentBase.js";
import { formatAliasLine, formatKeybindLine } from "../../lib/STOFormatter.js";
import { normalizeToOptimizedString } from "../../lib/commandDisplayAdapter.js";
import { projectVirtualVFXAliases } from "./vfxAliasProjection.js";
import { getSnapshotProfile, getSnapshotProfiles } from "./dataState.js";
import { materializeSyncProject } from "./syncProjectMaterializer.js";
import { requireCapabilityRequest } from "./capabilityRequestBoundary.js";
import { planMirroredCommandSequence } from "./commandTransformationPlanner.js";
import {
  renderAliasFileHeader,
  renderKeybindFileHeader,
} from "./exportFileHeaders.js";

/** @typedef {import('./serviceTypes.js').ServicePreferences & { translateGeneratedMessages?: boolean }} ExportPreferences */

/**
 * ExportService – encapsulates all business-logic for exporting / importing
 * profiles, keybind data and project archives.
 */
export default class ExportService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, currentArtifactSerializer?: import('../../types/storage-contracts.js').CurrentProjectArtifactSerializerPort, i18n?: import('./serviceTypes.js').I18n }} [options] */
  constructor({ eventBus, currentArtifactSerializer, i18n } = {}) {
    super(eventBus);
    this.componentName = "ExportService";
    this.currentArtifactSerializer = currentArtifactSerializer ?? null;
    this.i18n = i18n;
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
  }

  /**
   * @param {string} key
   * @param {Record<string, unknown>} [options]
   */
  translate(key, options = {}) {
    return this.i18n?.t(key, options) ?? key;
  }

  onInit() {
    this.setupRequestHandlers();
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    // Export generation requests

    this._responseDetachFunctions.push(
      this.respond(
        "export:generate-filename",
        async ({ profile, extension, environment }) =>
          await this.generateFileName(profile, extension, environment),
      ),
      this.respond("export:generate-alias-filename", ({ profile, extension }) =>
        this.generateAliasFileName(profile, extension),
      ),
      this.respond(
        "export:generate-keybind-file",
        async ({ profileId, environment = "space", syncMode = false }) => {
          const prof = this.getProfileFromCache(profileId);
          if (!prof || typeof prof.name !== "string")
            throw new Error(
              `Profile ${profileId} not found in ExportService cache`,
            );
          const exportProfile =
            /** @type {import('./serviceTypes.js').ProfileData & { name: string }} */ (
              /** @type {unknown} */ (prof)
            );
          return await this.generateSTOKeybindFile(exportProfile, {
            environment,
            syncMode,
          });
        },
      ),
      this.respond("export:generate-alias-file", async ({ profileId }) => {
        const prof = this.getProfileFromCache(profileId);
        if (!prof || typeof prof.name !== "string") {
          throw new Error(`Profile ${profileId} not found`);
        }
        const exportProfile =
          /** @type {import('./serviceTypes.js').ProfileData & { name: string }} */ (
            /** @type {unknown} */ (prof)
          );
        return await this.generateAliasFile(exportProfile);
      }),
      this.respond("export:sync-to-folder", async (payload) => {
        const dirHandle = requireCapabilityRequest(payload, "dirHandle");
        return this.syncToFolder(dirHandle).then(() => undefined);
      }),
    );
  }

  // Check if bind-to-alias mode is enabled from cached preferences (internal method)
  /** @param {ExportPreferences | undefined} [preferences] */
  _getBindToAliasMode(preferences = this.cache?.preferences) {
    return preferences?.bindToAliasMode || false;
  }

  // Check if bindsets feature is enabled from cached preferences (internal method)
  /** @param {ExportPreferences | undefined} [preferences] */
  _getBindsetsEnabled(preferences = this.cache?.preferences) {
    return preferences?.bindsetsEnabled || false;
  }

  // Sanitize a bindset name into a valid alias component (lower snake)
  sanitizeBindsetName(name = "") {
    if (!name) return "";
    let s = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (/^[0-9]/.test(s)) s = `bs_${s}`;
    return s;
  }

  // Generate alias name for a key within a specific bindset
  // Primary bindset returns same as generateBindToAliasName()
  /**
   * @param {string} environment
   * @param {string | null | undefined} bindsetName
   * @param {string} keyName
   */
  async generateBindsetAliasName(environment, bindsetName, keyName) {
    const { generateBindToAliasName } = await import(
      "../../lib/aliasNameValidator.js"
    );
    const generateName =
      /** @type {(environment: string, keyName: string, bindsetName?: string | null) => string} */ (
        generateBindToAliasName
      );

    // For primary bindset, use the standard bind-to-alias name (already has sto_kb_ prefix)
    if (!bindsetName || bindsetName === "Primary Bindset") {
      return generateName(environment, keyName);
    }

    // For custom bindsets, use the generateBindToAliasName with bindsetName parameter
    return generateName(environment, keyName, bindsetName);
  }

  // Keybind file generation
  /**
   * @param {import('./serviceTypes.js').ProfileData & { name: string }} profile
   * @param {{ environment?: string, syncMode?: boolean, preferences?: ExportPreferences, translate?: (key: string, options?: Record<string, unknown>) => string }} [options]
   */
  async generateSTOKeybindFile(profile, options = {}) {
    const {
      environment = "space",
      syncMode = false,
      preferences = this.cache.preferences,
      translate = (key, translateOptions) =>
        this.translate(key, translateOptions),
    } = options;
    const keys = this.extractKeys(profile, environment);

    const hasKeys = keys && Object.keys(keys).length > 0;

    if (!hasKeys) {
      return "; " + translate("no_keybinds_to_export") + "\n";
    }

    const filename = `${profile.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${environment}.txt`;
    let content = renderKeybindFileHeader({
      profileName: profile.name,
      environment,
      keyCount: Object.keys(keys).length,
      filename,
      translate,
    });

    // Add keybind section
    content += await this.generateKeybindSection(keys, {
      environment,
      profile,
      syncMode,
      preferences,
      translate,
    });

    // Add footer
    //content += this.generateFileFooter()

    return content;
  }

  /**
   * @param {Record<string, import('./serviceTypes.js').StoredCommand[]>} keys
   * @param {{ environment?: string, profile?: import('./serviceTypes.js').ProfileData, syncMode?: boolean, preferences?: ExportPreferences, translate?: (key: string, options?: Record<string, unknown>) => string }} [options]
   */
  async generateKeybindSection(keys, options = {}) {
    const {
      environment = "space",
      profile,
      preferences = this.cache.preferences,
      translate = (key, translateOptions) =>
        this.translate(key, translateOptions),
    } = options;

    if (!keys || Object.keys(keys).length === 0) {
      return "; " + translate("no_keybinds_to_export") + "\n";
    }

    // Check if bind-to-alias mode is enabled
    const bindToAliasMode = this._getBindToAliasMode(preferences);

    let content = `; ==============================================================================\n`;
    content += `; ${environment.toUpperCase()} KEYBINDS\n`;
    content += `; ==============================================================================\n\n`;

    if (bindToAliasMode) {
      // In bind-to-alias mode, only generate keybind lines that call the aliases
      // The actual alias definitions should be handled in generateAliasFile
      const { generateBindToAliasName } = await import(
        "../../lib/aliasNameValidator.js"
      );

      content += `; ${translate("export_generated_aliases_note")}\n`;
      content += `; ${translate("export_alias_definitions_note")}\n`;
      content += `; ------------------------------------------------------------------------------\n`;

      // Generate keybind lines that call the aliases
      for (const key of Object.keys(keys)) {
        // Always generate a keybind line that calls its alias – even when the
        // command list is empty – so that "defined-but-empty" keybinds are
        // preserved in exported files.
        const aliasName = generateBindToAliasName(environment, key);
        if (!aliasName) continue;
        // Encode the key for export (e.g., backtick becomes 0x29)
        const { encodeKeyForExport } = await import("../../lib/keyEncoding.js");
        const encodedKey = encodeKeyForExport(key);
        content += `${encodedKey} "${aliasName}"\n`;
      }
    } else {
      // Original behavior - generate keybind commands directly
      for (const [key, commands] of Object.entries(keys)) {
        let cmds = commands || [];
        const shouldStabilize =
          profile?.keybindMetadata &&
          profile.keybindMetadata[environment] &&
          profile.keybindMetadata[environment][key] &&
          profile.keybindMetadata[environment][key].stabilizeExecutionOrder;

        if (shouldStabilize && Array.isArray(cmds) && cmds.length > 1) {
          cmds = planMirroredCommandSequence(cmds);
        }

        // Optimise each command string
        const optimisedCmds = [];
        for (const cmd of cmds) {
          const opt = await normalizeToOptimizedString(cmd, {
            eventBus: this.eventBus || undefined,
          });
          optimisedCmds.push(opt);
        }

        content += formatKeybindLine(key, optimisedCmds);
      }
    }

    content += "\n";
    return content;
  }

  /* ---------------------------------------------------------- */
  /* Alias file generation                                      */
  /* ---------------------------------------------------------- */
  /**
   * @param {import('./serviceTypes.js').ProfileData & { name: string }} profile
   * @param {{preferences?: ExportPreferences, translate?: (key: string, options?: Record<string, unknown>) => string}} [options]
   */
  async generateAliasFile(profile, options = {}) {
    const {
      preferences = this.cache.preferences,
      translate = (key, translateOptions) =>
        this.translate(key, translateOptions),
    } = options;
    const aliases = profile.aliases || {};

    // Export from the explicit profile argument so folder sync cannot leak the
    // active profile's VFX draft or saved settings into another profile.
    const vfxAliases = projectVirtualVFXAliases(profile.vertigoSettings, {
      translate,
      translateGeneratedMessages:
        preferences.translateGeneratedMessages === true,
    });

    // Check if bind-to-alias mode is enabled and add generated aliases
    const bindToAliasMode = this._getBindToAliasMode(preferences);
    /** @type {Record<string, import('./serviceTypes.js').AliasDefinition>} */
    const generatedAliases = {};

    if (bindToAliasMode) {
      // Generate aliases from keybinds when bind-to-alias mode is enabled
      const { generateBindToAliasName } = await import(
        "../../lib/aliasNameValidator.js"
      );

      // Process all environments to generate aliases
      const environments = ["space", "ground"];
      for (const environment of environments) {
        const keys = this.extractKeys(profile, environment);
        if (!keys || Object.keys(keys).length === 0) continue;

        for (const [key, commands] of Object.entries(keys)) {
          const aliasName = generateBindToAliasName(environment, key);
          if (!aliasName) continue;

          // Use an empty array when commands is falsy to allow generation of
          // empty alias definitions.
          let cmds = commands || [];
          const shouldStabilize =
            profile.keybindMetadata &&
            profile.keybindMetadata[environment] &&
            profile.keybindMetadata[environment][key] &&
            profile.keybindMetadata[environment][key].stabilizeExecutionOrder;

          if (
            shouldStabilize &&
            Array.isArray(commands) &&
            commands.length > 1
          ) {
            cmds = planMirroredCommandSequence(commands);
          }

          // Store as generated alias
          generatedAliases[aliasName] = {
            name: aliasName,
            commands: cmds,
            description: `Generated alias for ${environment} key: ${key}`,
            isGenerated: true,
          };
        }
      }
    }

    // --------------------------------------------------------
    // Bindsets support – generate aliases per bindset & loaders
    // --------------------------------------------------------
    const bindsetsEnabled = this._getBindsetsEnabled(preferences);
    /** @type {Record<string, import('./serviceTypes.js').AliasDefinition>} */
    const bindsetAliases = {};
    /** @type {Record<string, import('./serviceTypes.js').AliasDefinition>} */
    const loaderAliases = {};

    if (bindsetsEnabled) {
      const bindsets = profile.bindsets || {};
      const bindsetNames = Object.keys(bindsets);

      const environments = ["space", "ground"];
      for (const environment of environments) {
        // Collect union of all keys across bindsets and primary build
        const primaryKeys = Object.keys(
          profile.builds?.[environment]?.keys || {},
        );
        const keyUnion = new Set(primaryKeys);

        for (const bsName of bindsetNames) {
          const bsKeys = Object.keys(
            bindsets[bsName]?.[environment]?.keys || {},
          );
          bsKeys.forEach((k) => keyUnion.add(k));
        }

        // Generate per-bindset key aliases (non-primary)
        for (const bsName of bindsetNames) {
          const bsKeys = bindsets[bsName]?.[environment]?.keys || {};
          for (const [key, commands] of Object.entries(bsKeys)) {
            // Ensure array
            let cmds = commands || [];
            if (!Array.isArray(cmds)) cmds = [cmds];

            // Mirror when stabilization enabled for this bindset key
            const shouldStabilize =
              profile.bindsetMetadata &&
              profile.bindsetMetadata[bsName] &&
              profile.bindsetMetadata[bsName][environment] &&
              profile.bindsetMetadata[bsName][environment][key] &&
              profile.bindsetMetadata[bsName][environment][key]
                .stabilizeExecutionOrder;

            if (shouldStabilize && cmds.length > 1) {
              cmds = planMirroredCommandSequence(cmds);
            }

            const aliasName = await this.generateBindsetAliasName(
              environment,
              bsName,
              key,
            );
            if (!aliasName) continue;

            bindsetAliases[aliasName] = {
              name: aliasName,
              commands: cmds,
              description: `Bindset ${bsName} – ${environment} key ${key}`,
              isGenerated: true,
            };
          }
        }

        // Build loader aliases for EACH bindset (including Primary Bindset)
        const allBindsetForLoaders = ["Primary Bindset", ...bindsetNames];
        for (const bsName of allBindsetForLoaders) {
          const loaderAliasName = `sto_kb_bindset_enable_${environment}_${this.sanitizeBindsetName(bsName)}`;

          // Build command string for loader alias: series of bind commands separated by $$
          const bindCmds = [];
          for (const key of keyUnion) {
            let targetAliasName;
            const inBs =
              bsName !== "Primary Bindset" &&
              bindsets[bsName]?.[environment]?.keys?.[key];
            const inPrimary = profile.builds?.[environment]?.keys?.[key];

            // Determine if we need to rebind this key in loader
            if (bsName === "Primary Bindset") {
              // For Primary Bindset loader: only reset keys that exist in custom bindsets
              // Check if this key exists in any non-primary bindset
              const existsInCustomBindset = bindsetNames.some(
                (customBsName) =>
                  bindsets[customBsName]?.[environment]?.keys?.[key],
              );

              if (existsInCustomBindset) {
                if (inPrimary) {
                  // Key exists in both primary and custom bindsets - reset to primary
                  targetAliasName = await this.generateBindsetAliasName(
                    environment,
                    "Primary Bindset",
                    key,
                  );
                } else {
                  // Key exists only in custom bindsets, not in primary - unbind it
                  bindCmds.push(`unbind ${key}`);
                  continue;
                }
              }
              // If key doesn't exist in any custom bindset, skip it (no need to reset)
            } else {
              // For custom bindset loaders: only bind keys that exist in this specific bindset
              if (inBs) {
                targetAliasName = await this.generateBindsetAliasName(
                  environment,
                  bsName,
                  key,
                );
              }
            }

            if (targetAliasName) {
              // Encode the key for export (e.g., backtick becomes 0x29)
              const { encodeKeyForExport } = await import(
                "../../lib/keyEncoding.js"
              );
              const encodedKey = encodeKeyForExport(key);
              bindCmds.push(`bind ${encodedKey} "${targetAliasName}"`);
            }
          }

          if (bindCmds.length > 0) {
            const cmdStr = bindCmds.join(" $$ ");
            loaderAliases[loaderAliasName] = {
              name: loaderAliasName,
              commands: [cmdStr],
              description: `Enable ${bsName} for ${environment}`,
              isLoader: true,
              category: "Bindsets",
            };
          }
        }
      }
    }

    // Combine all aliases: user aliases, VFX aliases, generated bind-to-alias, bindset key aliases and loader aliases
    /** @type {Record<string, import('./serviceTypes.js').AliasDefinition>} */
    const allAliases = {
      ...aliases,
      ...vfxAliases,
      ...generatedAliases,
      ...bindsetAliases,
      ...loaderAliases,
    };

    if (Object.keys(allAliases).length === 0) {
      return "; " + translate("no_aliases_to_export") + "\n";
    }

    let content = renderAliasFileHeader({
      profileName: profile.name,
      aliasCount: Object.keys(profile.aliases || {}).length,
      translate,
    });

    // Add note about generated aliases if any exist
    if (Object.keys(generatedAliases).length > 0) {
      content += `; ${translate("export_user_and_generated_aliases")}\n`;
      content += `; ${translate("export_generated_aliases_count", { count: Object.keys(generatedAliases).length })}\n`;
      content += `; ================================================================\n\n`;
    }

    // Generate alias content directly (sorted)
    const sorted = Object.entries(allAliases).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    for (const [name, alias] of sorted) {
      let commandsArray = Array.isArray(alias.commands) ? alias.commands : [];

      // Apply mirroring if aliasMetadata says so (but not for generated aliases, they're already processed)
      const shouldStabilize =
        !alias.isGenerated &&
        !alias.isLoader &&
        profile.aliasMetadata &&
        profile.aliasMetadata[name] &&
        profile.aliasMetadata[name].stabilizeExecutionOrder;

      if (shouldStabilize && commandsArray.length > 1) {
        // PROPERLY normalize: preserve existing objects, convert strings to objects
        const cmdParts = commandsArray
          .map((/** @type {import('./serviceTypes.js').StoredCommand} */ c) => {
            if (typeof c === "string") {
              return { command: c }; // String → object
            } else if (c && typeof c.command === "string") {
              return c; // Already an object, preserve metadata
            }
            return "";
          })
          .filter(Boolean);

        const mirroredStr = await this.request(
          "command:generate-mirrored-commands",
          { commands: cmdParts },
        );
        commandsArray = mirroredStr.split(/\s*\$\$\s*/).filter(Boolean);
      } else {
        // ALSO normalize when not stabilizing - extract command strings from objects
        commandsArray = commandsArray
          .map((/** @type {import('./serviceTypes.js').StoredCommand} */ c) => {
            if (typeof c === "string") {
              return c;
            } else if (c && typeof c.command === "string") {
              return c.command; // Extract command string from object
            }
            return "";
          })
          .filter(Boolean);
      }

      // Optimise each command (e.g., TrayExecByTray / TrayExecByTrayWithBackup)
      const optimisedCommands = [];
      for (const cmd of commandsArray) {
        // normalise + optimise each command string
        const opt = await normalizeToOptimizedString(cmd, {
          eventBus: this.eventBus || undefined,
        });
        optimisedCommands.push(opt);
      }

      // Pass array directly to formatAliasLine which will handle joining
      content += formatAliasLine(name, {
        ...alias,
        commands: optimisedCommands,
      });
      content += "\n";
    }

    return content;
  }

  /* ---------------------------------------------------------- */
  /* Sync to folder                                            */
  /* ---------------------------------------------------------- */
  /** @param {unknown} dirHandle */
  async syncToFolder(dirHandle) {
    return materializeSyncProject(this, dirHandle);
  }

  /**
   * @param {import('./serviceTypes.js').ProfileData & { name: string }} profile
   * @param {string} extension
   * @param {string} environment
   */
  generateFileName(
    profile,
    extension,
    environment = profile.currentEnvironment || "space",
  ) {
    const sanitized = profile.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
    return `${sanitized}_${environment}_${timestamp}.${extension}`;
  }

  /**
   * @param {import('./serviceTypes.js').ProfileData & { name: string }} profile
   * @param {string} extension
   */
  generateAliasFileName(profile, extension) {
    const sanitized = profile.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${sanitized}_aliases.${extension}`;
  }

  /**
   * @param {import('./serviceTypes.js').ProfileData} [profile]
   * @param {string} environment
   */
  extractKeys(profile = {}, environment = "space") {
    // Handle flat structure first (for direct calls with extracted keys)
    if (profile.keys && !profile.builds) {
      return profile.keys;
    }

    // Handle builds structure
    if (
      profile.builds &&
      profile.builds[environment] &&
      profile.builds[environment].keys
    ) {
      return profile.builds[environment].keys;
    }

    // Handle legacy keybinds structure
    if (profile.keybinds && profile.keybinds[environment]) {
      return profile.keybinds[environment];
    }

    return {};
  }

  // Late-join state sync
  /** @returns {import('../../types/events/component-state.js').ComponentState<'ExportService'>} */
  getCurrentState() {
    return {
      currentProfile: this.cache.currentProfile,
      currentEnvironment: this.cache.currentEnvironment,
      profiles: getSnapshotProfiles(this.cache.dataState),
    };
  }

  // Utility
  /** @param {string | undefined} profileId */
  getProfileFromCache(profileId) {
    if (!profileId) return null;
    return getSnapshotProfile(this.cache.dataState, profileId);
  }

  onDestroy() {
    for (const detach of this._responseDetachFunctions) {
      detach();
    }
    this._responseDetachFunctions = [];
  }
}
