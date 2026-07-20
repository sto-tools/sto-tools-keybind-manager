// ImportService.js - Service for importing keybind files, alias files, and projects
// Uses STOCommandParser for parsing, handles application logic
import ComponentBase from "../ComponentBase.js";
import {
  normalizeToStringArray,
  normalizeToOptimizedString,
} from "../../lib/commandDisplayAdapter.js";
import { KBFParser } from "../../lib/KBFParser.js";
import { commitImportedProfile } from "./importProfileCommit.js";
import { importProjectToStorage } from "./projectImportOrchestrator.js";
import {
  decodeKBFImportConfiguration,
  decodeKBFParseResult,
} from "./kbfDataBoundary.js";
import { planKBFImport } from "./kbfImportPlanner.js";
import { projectKBFPreview } from "./kbfPreviewProjection.js";
import {
  aliasTextFailureResult,
  keybindTextFailureResult,
  materializeAliasText,
  materializeKeybindText,
} from "./textImportMaterializer.js";
import {
  planAliasTextImport,
  planKeybindTextImport,
} from "./textProfileImportPlanner.js";

const VALID_STRATEGIES = ["merge_keep", "merge_overwrite", "overwrite_all"];

/**
 * @param {string | undefined} strategy
 * @param {'merge_keep' | 'merge_overwrite' | 'overwrite_all'} [fallback]
 * @returns {'merge_keep' | 'merge_overwrite' | 'overwrite_all'}
 */
const resolveImportStrategy = (strategy, fallback = "merge_keep") =>
  /** @type {'merge_keep' | 'merge_overwrite' | 'overwrite_all'} */ (
    VALID_STRATEGIES.find((candidate) => candidate === strategy) || fallback
  );

/** @param {unknown} error */
const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

export default class ImportService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, storage?: import('./serviceTypes.js').Storage, i18n?: import('./serviceTypes.js').I18n, ui?: import('./serviceTypes.js').ToastUI }} [options] */
  constructor({ eventBus, storage, i18n, ui } = {}) {
    super(eventBus);
    this.componentName = "ImportService";
    this.storage = storage;
    this.i18n = i18n;
    this.ui = ui;
    this.kbfParser = new KBFParser({ eventBus });
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
  }

  /** @param {string} key @param {Record<string, unknown>} [options] */
  translate(key, options) {
    return this.i18n?.t(key, options) ?? key;
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    // Import operations
    this._responseDetachFunctions.push(
      this.respond(
        "import:keybind-file",
        ({ content, profileId, environment, options = {}, strategy }) =>
          this.importKeybindFile(content, profileId, environment, {
            ...options,
            strategy: resolveImportStrategy(strategy),
          }),
      ),
      this.respond(
        "import:alias-file",
        ({ content, profileId, options = {}, strategy }) =>
          this.importAliasFile(content, profileId, {
            ...options,
            strategy: resolveImportStrategy(strategy),
          }),
      ),
      this.respond(
        "import:kbf-file",
        ({
          content,
          profileId,
          environment,
          options = {},
          strategy,
          configuration,
        }) =>
          this.importKBFFile(
            content,
            profileId,
            environment,
            {
              ...(options ?? {}),
              strategy: VALID_STRATEGIES.includes(strategy || "")
                ? strategy
                : /** @type {{ strategy?: string }} */ (options ?? {})
                    .strategy || "merge_keep",
            },
            configuration,
          ),
      ),
      this.respond("import:project-file", ({ content, options = {} }) =>
        this.importProjectFile(content, options),
      ),
      this.respond("parse-kbf-file", ({ content, environment }) =>
        this.parseKBFFile(content, environment),
      ),
    );
  }

  // Parse keybind file content using STOFileHandler and STOCommandParser
  /**
   * @param {unknown} content
   * @returns {Promise<import('./serviceTypes.js').ParsedKeybindFile>}
   */
  async parseKeybindFile(content) {
    return materializeKeybindText(content, {
      parseCommand: (commandString) =>
        this.request("parser:parse-command-string", { commandString }),
      translate: (key, options) => this.translate(key, options),
    });
  }

  // Parse alias file content
  /**
   * @param {unknown} content
   * @returns {Promise<import('./serviceTypes.js').ParsedAliasFile>}
   */
  async parseAliasFile(content) {
    return materializeAliasText(content, (key, options) =>
      this.translate(key, options),
    );
  }

  // Import keybind file content
  /**
   * @param {unknown} content
   * @param {string | null | undefined} profileId
   * @param {string | undefined} environment
   * @param {{ strategy?: string }} [options]
   * @returns {Promise<import('../../types/rpc/import-export.js').KeybindImportResult>}
   */
  async importKeybindFile(
    content,
    profileId,
    environment = undefined,
    { strategy = "merge_keep" } = {},
  ) {
    try {
      const parsed = await this.parseKeybindFile(content);
      if (parsed.failure) return keybindTextFailureResult(parsed.failure);
      const keyCount = Object.keys(parsed.keybinds).length;

      if (keyCount === 0) {
        return { success: false, error: "no_keybinds_found_in_file" };
      }

      if (!this.storage) {
        return { success: false, error: "storage_not_available" };
      }

      if (!profileId) {
        return { success: false, error: "no_active_profile" };
      }

      // Validate environment parameter using established patterns (for consistency with KBF import)
      const validEnvironments = ["space", "ground"];
      if (!environment) {
        // Default to space if not provided, but log for awareness
        console.warn(
          "[ImportService] No environment specified for keybind import, defaulting to space",
        );
        environment = "space";
      } else if (!validEnvironments.includes(environment)) {
        return {
          success: false,
          error: "invalid_environment",
          params: {
            environment,
            validEnvironments,
          },
        };
      }

      const env = environment; // Environment is already validated above
      const plan = await planKeybindTextImport({
        profile: this.storage.getProfile(profileId),
        parsed,
        environment: env,
        strategy,
        capabilities: {
          parseCommand: (commandString) =>
            this.request("parser:parse-command-string", { commandString }),
          normalizeCommands: normalizeToStringArray,
          optimizeCommand: (command) =>
            normalizeToOptimizedString(command, {
              eventBus: this.eventBus || undefined,
            }),
        },
      });

      await commitImportedProfile(this, profileId, plan.nextProfile, env);

      const { nextProfile: _committedProfile, ...result } = plan;
      void _committedProfile;
      return result;
    } catch (error) {
      return {
        success: false,
        error: "import_failed",
        params: { reason: getErrorMessage(error) },
      };
    }
  }

  // Import alias file content
  /**
   * @param {unknown} content
   * @param {string | null | undefined} profileId
   * @param {{ strategy?: string }} [options]
   * @returns {Promise<import('../../types/rpc/aliases.js').AliasImportResult>}
   */
  async importAliasFile(content, profileId, { strategy = "merge_keep" } = {}) {
    try {
      const parsed = await this.parseAliasFile(content);
      if (parsed.failure) return aliasTextFailureResult(parsed.failure);
      // Count only non-generated aliases (exclude sto_kb_ prefix)
      const importableAliases = Object.keys(parsed.aliases).filter(
        (name) => !name.startsWith("sto_kb_"),
      );
      const aliasCount = importableAliases.length;

      if (aliasCount === 0) {
        return { success: false, error: "no_aliases_found_in_file" };
      }

      if (!this.storage || !profileId) {
        return { success: false, error: "no_active_profile" };
      }

      const plan = await planAliasTextImport({
        profile: this.storage.getProfile(profileId),
        parsed,
        strategy,
        optimizeCommand: (command) =>
          normalizeToOptimizedString(command, {
            eventBus: this.eventBus || undefined,
          }),
      });

      await commitImportedProfile(this, profileId, plan.nextProfile);

      const { nextProfile: _committedProfile, ...result } = plan;
      void _committedProfile;
      return result;
    } catch (error) {
      return {
        success: false,
        error: "import_failed",
        params: { reason: getErrorMessage(error) },
      };
    }
  }

  // Import KBF file content
  /**
   * @param {string} content
   * @param {string | null | undefined} profileId
   * @param {string | undefined} environment
   * @param {{ strategy?: string }} [options]
   * @param {import('./serviceTypes.js').KBFImportConfiguration | null | undefined} configuration
   * @returns {Promise<import('../../types/rpc/import-export.js').KBFImportResult>}
   */
  async importKBFFile(
    content,
    profileId,
    environment,
    { strategy = "merge_keep" } = {},
    configuration = null,
  ) {
    const errors = [];
    const warnings = [];

    // Basic validation
    if (!content || typeof content !== "string") {
      return {
        success: false,
        error: "invalid_kbf_file_content",
        message: "Invalid KBF file content: expected string data",
        errors: ["File content validation failed"],
      };
    }

    if (!this.storage) {
      return {
        success: false,
        error: "storage_not_available",
        message: "Storage service not available for KBF import",
      };
    }

    if (!profileId) {
      return {
        success: false,
        error: "no_active_profile",
        message: "No active profile specified for KBF import",
      };
    }

    // Validate environment
    const validEnvironments = ["space", "ground"];
    if (!environment) {
      environment = "space";
      warnings.push("No environment specified, defaulting to space");
    } else if (!validEnvironments.includes(environment)) {
      return {
        success: false,
        error: "invalid_environment",
        message: `Invalid environment "${environment}" specified for KBF import`,
        params: { environment, validEnvironments },
      };
    }
    const targetEnvironment = /** @type {'space' | 'ground'} */ (environment);

    const canonicalStrategy = resolveImportStrategy(strategy);

    try {
      // Basic format validation
      const validationResult = this.kbfParser.decoder.validateFormat(content);
      if (!validationResult.isValid || !validationResult.isKBF) {
        return {
          success: false,
          error: "invalid_kbf_file_format",
          message: "Invalid KBF file format",
          errors: validationResult.errors || [],
          warnings: validationResult.warnings || [],
        };
      }

      // Collect validation warnings
      if (validationResult.warnings) {
        warnings.push(...validationResult.warnings);
      }

      // Parse KBF file synchronously like other imports
      const rawParseResult = await this.kbfParser.parseFile(content, {
        targetEnvironment,
        includeMetadata: true,
      });
      const decodedParseResult = decodeKBFParseResult(rawParseResult);
      if (!decodedParseResult.success) {
        return {
          success: false,
          error: decodedParseResult.error,
          params: decodedParseResult.params,
        };
      }
      const parseResult = decodedParseResult.value;

      // Check for parsing errors and collect warnings
      if (parseResult.errors) {
        errors.push(
          ...parseResult.errors.map((err) =>
            typeof err === "string" ? err : err.message || String(err),
          ),
        );
      }
      if (parseResult.warnings) {
        warnings.push(
          ...parseResult.warnings.map((warn) =>
            typeof warn === "string" ? warn : warn.message || String(warn),
          ),
        );
      }

      const decodedConfiguration = decodeKBFImportConfiguration(
        configuration,
        Object.keys(parseResult.bindsets),
      );
      if (!decodedConfiguration.success) {
        return {
          success: false,
          error: decodedConfiguration.error,
          params: decodedConfiguration.params,
          errors,
          warnings,
        };
      }
      const canonicalConfiguration = decodedConfiguration.value;

      // Fail fast on fundamental structural corruption
      if (parseResult.stats.totalBindsets === 0) {
        return {
          success: false,
          error: "no_valid_bindsets_found",
          message: "KBF file contains no valid bindsets that could be imported",
          errors,
          warnings,
        };
      }

      // Get existing profile
      let profile = this.storage.getProfile(profileId);
      if (!profile) {
        return {
          success: false,
          error: "profile_not_found",
          message: `Profile with ID "${profileId}" not found`,
          errors,
          warnings,
        };
      }
      // PreferencesService publishes a complete settings snapshot during
      // startup and through the late-join handshake. Keep imports safe if this
      // service is ever invoked before either path has hydrated its cache.
      const configuredBindsetsEnabled = this.cache.preferences.bindsetsEnabled;
      const bindsetsEnabled =
        typeof configuredBindsetsEnabled === "boolean"
          ? configuredBindsetsEnabled
          : true;
      if (typeof configuredBindsetsEnabled !== "boolean") {
        warnings.push(
          "Could not retrieve bindsets preference, defaulting to enabled",
        );
      }

      const plan = planKBFImport({
        profile,
        parseResult,
        environment: targetEnvironment,
        strategy: canonicalStrategy,
        configuration: canonicalConfiguration,
        bindsetsEnabled,
      });
      if (!plan.success) return { ...plan, warnings };

      await commitImportedProfile(
        this,
        profileId,
        plan.nextProfile,
        targetEnvironment,
      );
      const { nextProfile: _committedProfile, ...result } = plan;
      void _committedProfile;
      return {
        ...result,
        message: "kbf_import_completed",
        errors,
        warnings,
        stats: {
          ...result.stats,
          totalErrors: errors.length,
          totalWarnings: warnings.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "kbf_import_critical_error",
        message: `Critical error during KBF import: ${getErrorMessage(error)}`,
        errors: [...errors, getErrorMessage(error)],
        warnings,
      };
    }
  }

  // Import a complete project file
  /**
   * @param {string} content
   * @param {{ importSettings?: boolean }} [options]
   * @returns {Promise<import('../../types/rpc/import-export.js').ProjectImportResult>}
   */
  async importProjectFile(content, options = {}) {
    return importProjectToStorage(this.storage, content, options);
  }

  /**
   * Parse KBF file for bindset information without importing data
   * @param {string} content - KBF file content to parse
   * @param {string | undefined} environment - Target environment (space/ground)
   * @returns {Promise<import('../../types/rpc/import-export.js').KBFParseForUiResult>}
   */
  async parseKBFFile(content, environment) {
    const errors = [];
    const warnings = [];

    // Basic validation
    if (!content || typeof content !== "string") {
      return {
        valid: false,
        error: "invalid_kbf_file_content",
        message: "Invalid KBF file content: expected string data",
        errors: ["File content validation failed"],
      };
    }

    // Validate environment
    const validEnvironments = ["space", "ground"];
    if (!environment) {
      environment = "space";
      warnings.push("No environment specified, defaulting to space");
    } else if (!validEnvironments.includes(environment)) {
      return {
        valid: false,
        error: "invalid_environment",
        message: `Invalid environment "${environment}" specified for KBF parsing`,
        params: { environment, validEnvironments },
      };
    }

    try {
      // Basic format validation
      const validationResult = this.kbfParser.decoder.validateFormat(content);
      if (!validationResult.isValid || !validationResult.isKBF) {
        return {
          valid: false,
          error: "invalid_kbf_file_format",
          message: "Invalid KBF file format",
          errors: validationResult.errors || [],
          warnings: validationResult.warnings || [],
        };
      }

      // Collect validation warnings
      if (validationResult.warnings) {
        warnings.push(...validationResult.warnings);
      }

      // Parse KBF file to extract bindset information without importing
      const rawParseResult = await this.kbfParser.parseFile(content, {
        targetEnvironment: environment,
        includeMetadata: true,
      });
      const decodedParseResult = decodeKBFParseResult(rawParseResult);
      if (!decodedParseResult.success) {
        return {
          valid: false,
          error: decodedParseResult.error,
          message: decodedParseResult.error,
          params: decodedParseResult.params,
        };
      }
      const parseResult = decodedParseResult.value;

      // Check for parsing errors and collect warnings
      if (parseResult.errors) {
        errors.push(
          ...parseResult.errors.map((err) =>
            typeof err === "string" ? err : err.message || String(err),
          ),
        );
      }
      if (parseResult.warnings) {
        warnings.push(
          ...parseResult.warnings.map((warn) =>
            typeof warn === "string" ? warn : warn.message || String(warn),
          ),
        );
      }

      // Fail fast on fundamental structural corruption
      if (parseResult.stats.totalBindsets === 0) {
        return {
          valid: false,
          error: "no_valid_bindsets_found",
          message: "KBF file contains no valid bindsets that could be imported",
          errors,
          warnings,
        };
      }

      return projectKBFPreview(
        parseResult,
        validationResult.estimatedSize,
        errors,
        warnings,
      );
    } catch (error) {
      return {
        valid: false,
        error: "kbf_parse_critical_error",
        message: `Critical error during KBF parsing: ${getErrorMessage(error)}`,
        errors: [...errors, getErrorMessage(error)],
        warnings,
      };
    }
  }

  onInit() {
    this.setupRequestHandlers();
  }

  onDestroy() {
    this._responseDetachFunctions.splice(0).forEach((detach) => detach());
  }
}
