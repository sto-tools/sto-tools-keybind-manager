// ImportService.js - Service for importing keybind files, alias files, and projects
// Uses STOCommandParser for parsing, handles application logic
import ComponentBase from "../ComponentBase.js";
import {
  captureProfileMutationContext as captureContext,
  assertProfileMutationContext,
} from "./profileMutationContext.js";
import {
  normalizeToStringArray,
  normalizeToOptimizedString,
} from "../../lib/commandDisplayAdapter.js";
import { KBFParser } from "../../lib/KBFParser.js";
import {
  commitImportedProfile,
  materializeProfileImportInput,
  dispatchProfileImportRequest,
  appendImportDiagnostics,
  resolveImportBindsetsEnabled,
} from "./importProfileCommit.js";
import {
  importPreparedProjectWithSettlement,
  importProjectWithPreferencesTransition,
} from "./projectImportOrchestrator.js";
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
import { getSnapshotProfile } from "./dataState.js";
import { materializeMutationRequest } from "./mutationRequestBoundary.js";

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
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, replaceProjectFromImport?: ((projectData: import('../../types/data-contracts.js').CanonicalProjectData, options?: {persistImportedSettings?: import('./preferencesOwnerMutationOperations.js').PersistImportedPreferences}) => Promise<unknown> | unknown) | null, replaceProjectFromImportWithSettlement?: import('../../types/storage-contracts.js').ImportedProjectOwnerCompletionAction | null, i18n?: import('./serviceTypes.js').I18n, ui?: import('./serviceTypes.js').ToastUI, runPreferencesTransition?: import('./PreferencesService.js').default['runExternalActivationTransition'] | null }} [options] */
  constructor({
    eventBus,
    replaceProjectFromImport = null,
    replaceProjectFromImportWithSettlement = null,
    i18n,
    ui,
    runPreferencesTransition = null,
  } = {}) {
    super(eventBus);
    this.componentName = "ImportService";
    this.replaceProjectFromImport = replaceProjectFromImport;
    this.replaceProjectFromImportWithSettlement =
      replaceProjectFromImportWithSettlement;
    this.i18n = i18n;
    this.ui = ui;
    this.runPreferencesTransition = runPreferencesTransition;
    this.kbfParser = new KBFParser({ eventBus });
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    this._mutationGeneration = 0;
  }

  /** @param {string} key @param {Record<string, unknown>} [options] */
  translate(key, options) {
    return this.i18n?.t(key, options) ?? key;
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    // Import operations
    this._responseDetachFunctions.push(
      this.respond("import:keybind-file", (payload) =>
        dispatchProfileImportRequest(this, "keybind", payload),
      ),
      this.respond("import:alias-file", (payload) =>
        dispatchProfileImportRequest(this, "alias", payload),
      ),
      this.respond("import:kbf-file", (payload) =>
        dispatchProfileImportRequest(this, "kbf", payload),
      ),
      this.respond("import:project-file", (payload) => {
        const request = materializeMutationRequest(payload, [
          "content",
          "options",
        ]);
        return this.importProjectFile(
          request.content,
          request.options === undefined ? {} : request.options,
        );
      }),
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
    options = {},
  ) {
    try {
      const input = materializeProfileImportInput(
        { content, profileId, environment, options },
        "keybind",
      );
      const { strategy } = input;
      profileId = input.profileId;
      environment = input.environment;
      content = input.content;
      const generation = this._mutationGeneration;
      const parsed = await this.parseKeybindFile(content);
      if (parsed.failure) return keybindTextFailureResult(parsed.failure);
      const keyCount = Object.keys(parsed.keybinds).length;

      if (keyCount === 0) {
        return { success: false, error: "no_keybinds_found_in_file" };
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
      const context = captureContext(this, generation, profileId);
      assertProfileMutationContext(this, context, this._mutationGeneration);
      const plan = await planKeybindTextImport({
        profile: getSnapshotProfile(this.cache.dataState, profileId),
        profileId,
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

      await commitImportedProfile(
        this,
        profileId,
        plan.nextProfile,
        env,
        context,
      );

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
  async importAliasFile(content, profileId, options = {}) {
    try {
      const input = materializeProfileImportInput(
        { content, profileId, options },
        "alias",
      );
      const { strategy } = input;
      profileId = input.profileId;
      content = input.content;
      const generation = this._mutationGeneration;
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

      if (!profileId) {
        return { success: false, error: "no_active_profile" };
      }

      const context = captureContext(this, generation, profileId);
      assertProfileMutationContext(this, context, this._mutationGeneration);
      const plan = await planAliasTextImport({
        profile: getSnapshotProfile(this.cache.dataState, profileId),
        profileId,
        parsed,
        strategy,
        optimizeCommand: (command) =>
          normalizeToOptimizedString(command, {
            eventBus: this.eventBus || undefined,
          }),
      });

      await commitImportedProfile(
        this,
        profileId,
        plan.nextProfile,
        undefined,
        context,
      );

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
   * @param {unknown} content
   * @param {string | null | undefined} profileId
   * @param {string | undefined} environment
   * @param {{ strategy?: string }} [options]
   * @param {unknown} configuration
   * @returns {Promise<import('../../types/rpc/import-export.js').KBFImportResult>}
   */
  async importKBFFile(
    content,
    profileId,
    environment,
    options = {},
    configuration = null,
  ) {
    /** @type {string[]} */
    const errors = [];
    const warnings = [];

    let strategy;
    try {
      const input = materializeProfileImportInput(
        { content, profileId, environment, options, configuration },
        "kbf",
      );
      strategy = input.strategy;
      profileId = input.profileId;
      environment = input.environment;
      configuration = input.configuration;
      content = input.content;
    } catch {
      return { success: false, error: "invalid_kbf_file_content" };
    }

    // Basic validation
    if (!content || typeof content !== "string") {
      return {
        success: false,
        error: "invalid_kbf_file_content",
        message: "Invalid KBF file content: expected string data",
        errors: ["File content validation failed"],
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
    const generation = this._mutationGeneration;

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
      if (validationResult.warnings)
        warnings.push(...validationResult.warnings);

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
      appendImportDiagnostics(errors, warnings, parseResult);

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
      const context = captureContext(this, generation, profileId);
      assertProfileMutationContext(this, context, this._mutationGeneration);
      const profile = getSnapshotProfile(this.cache.dataState, profileId);
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
      const bindsetsEnabled = resolveImportBindsetsEnabled(
        this.cache.preferences.bindsetsEnabled,
        warnings,
      );

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
        context,
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
   * @param {unknown} content
   * @param {unknown} [options]
   * @returns {Promise<import('../../types/rpc/import-export.js').ProjectImportResult>}
   */
  async importProjectFile(content, options = {}) {
    return importProjectWithPreferencesTransition(this, content, options);
  }

  /**
   * Direct composition capability for a caller already holding the Preferences
   * lease. It never acquires a second lease or activates the staged settings.
   * @param {unknown} prepared A value returned by prepareProjectImport.
   * @param {import('./preferencesOwnerMutationOperations.js').PersistImportedPreferences} [persistImportedSettings]
   * @returns {Promise<unknown>}
   */
  async importProjectWithinPreferencesTransition(
    prepared,
    persistImportedSettings,
  ) {
    return importPreparedProjectWithSettlement(
      this.replaceProjectFromImportWithSettlement,
      prepared,
      persistImportedSettings,
      this.replaceProjectFromImport,
    );
  }

  /**
   * Parse KBF file for bindset information without importing data
   * @param {string} content - KBF file content to parse
   * @param {string | undefined} environment - Target environment (space/ground)
   * @returns {Promise<import('../../types/rpc/import-export.js').KBFParseForUiResult>}
   */
  async parseKBFFile(content, environment) {
    /** @type {string[]} */
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
      if (validationResult.warnings)
        warnings.push(...validationResult.warnings);

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
      appendImportDiagnostics(errors, warnings, parseResult);

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
    this._mutationGeneration += 1;
    this.setupRequestHandlers();
  }

  onDestroy() {
    this._mutationGeneration += 1;
    this._responseDetachFunctions.splice(0).forEach((detach) => detach());
  }
}
