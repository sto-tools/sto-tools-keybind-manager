/** @typedef {'keybinds' | 'aliases' | 'kbf'} ImportType */
/** @typedef {'space' | 'ground'} ImportEnvironment */
/** @typedef {'merge_keep' | 'merge_overwrite' | 'overwrite_all'} ImportStrategy */
/** @typedef {import('../../types/rpc/import-export.js').KeybindImportResult} KeybindImportResult */
/** @typedef {import('../../types/rpc/aliases.js').AliasImportResult} AliasImportResult */
/** @typedef {import('../../types/rpc/import-export.js').KBFImportResult} KBFImportResult */
/** @typedef {import('../../types/rpc/import-export.js').KBFParseForUiResult} KBFParseResult */
/** @typedef {Extract<KBFParseResult, { valid: true }>} ValidKBFParseResult */
/** @typedef {Extract<KBFParseResult, { valid: false }>} InvalidKBFParseResult */
/** @typedef {import('../../types/kbf-boundary.js').KBFImportConfiguration} KBFImportConfiguration */
/**
 * @typedef {{
 *   environment: ImportEnvironment,
 *   strategy?: string | null
 * }} EnvironmentImportConfig
 */
/**
 * @typedef {{
 *   builds?: Partial<Record<ImportEnvironment, { keys?: Record<string, unknown> }>>,
 *   aliases?: Record<string, unknown>
 * }} ImportProfile
 */
/**
 * @typedef {(
 *   defaultEnvironment: string,
 *   type: 'keybinds' | 'kbf',
 *   context?: { bindsetsEnabled: boolean }
 * ) => Promise<EnvironmentImportConfig | null>} EnvironmentPrompt
 */
/** @typedef {() => Promise<string | null>} AliasStrategyPrompt */
/**
 * @typedef {(
 *   type: 'keys' | 'aliases',
 *   current: number,
 *   incoming: number,
 *   environment?: ImportEnvironment
 * ) => Promise<boolean>} OverwriteConfirmation
 */
/** @typedef {(parseResult: ValidKBFParseResult) => Promise<KBFImportConfiguration | null>} KBFConfigurationPrompt */
/** @typedef {import('../../types/rpc/transport.js').RpcRequester} Request */
/**
 * @typedef {{
 *   type: ImportType,
 *   content: string,
 *   profileId: string | null,
 *   currentEnvironment: string,
 *   profile?: ImportProfile | null,
 *   bindsetsEnabled?: boolean,
 *   promptEnvironment: EnvironmentPrompt,
 *   promptAliasStrategy: AliasStrategyPrompt,
 *   showOverwriteConfirmation: OverwriteConfirmation,
 *   promptEnhancedBindsetSelection: KBFConfigurationPrompt,
 *   request: Request
 * }} ImportWorkflowOptions
 */
/**
 * @typedef {
 *   | { status: 'completed', importType: 'keybinds', result: KeybindImportResult }
 *   | { status: 'completed', importType: 'aliases', result: AliasImportResult }
 *   | { status: 'completed', importType: 'kbf', result: KBFImportResult }
 *   | { status: 'cancelled', stage: 'environment' | 'strategy' | 'overwrite' | 'configuration' }
 *   | { status: 'invalid-kbf', parseResult: InvalidKBFParseResult }
 * } ImportWorkflowOutcome
 */

/**
 * Normalize form values to the three strategies accepted by ImportService.
 * Missing and unrecognized selections preserve the existing merge-safe default.
 *
 * @param {unknown} value
 * @returns {ImportStrategy}
 */
export function normalizeImportStrategy(value) {
  if (value === "merge_overwrite" || value === "overwrite_all") return value;
  return "merge_keep";
}

/**
 * Run the import decision and RPC sequence without owning DOM, component state,
 * or presentation. The caller supplies one accepted profile snapshot and all
 * user-interaction/application-boundary callbacks.
 *
 * @param {ImportWorkflowOptions} options
 * @returns {Promise<ImportWorkflowOutcome>}
 */
export async function runImportWorkflow({
  type,
  content,
  profileId,
  currentEnvironment,
  profile = null,
  bindsetsEnabled = true,
  promptEnvironment,
  promptAliasStrategy,
  showOverwriteConfirmation,
  promptEnhancedBindsetSelection,
  request,
}) {
  if (type === "keybinds") {
    const importConfig = await promptEnvironment(
      currentEnvironment,
      "keybinds",
    );
    if (!importConfig) return { status: "cancelled", stage: "environment" };

    const strategy = normalizeImportStrategy(importConfig.strategy);
    if (strategy === "overwrite_all") {
      const currentKeys = Object.keys(
        profile?.builds?.[importConfig.environment]?.keys ?? {},
      ).length;
      if (currentKeys > 0) {
        const confirmed = await showOverwriteConfirmation(
          "keys",
          currentKeys,
          0,
          importConfig.environment,
        );
        if (!confirmed) {
          return { status: "cancelled", stage: "overwrite" };
        }
      }
    }

    const result = await request(
      "import:keybind-file",
      {
        content,
        profileId,
        environment: importConfig.environment,
        strategy,
      },
      0,
    );
    return { status: "completed", importType: "keybinds", result };
  }

  if (type === "kbf") {
    const importConfig = await promptEnvironment(currentEnvironment, "kbf", {
      bindsetsEnabled,
    });
    if (!importConfig) return { status: "cancelled", stage: "environment" };

    const strategy = normalizeImportStrategy(importConfig.strategy);
    const parseResult = await request("parse-kbf-file", {
      content,
      environment: importConfig.environment,
    });
    if (!parseResult.valid) {
      return { status: "invalid-kbf", parseResult };
    }

    const configuration = await promptEnhancedBindsetSelection(parseResult);
    if (!configuration) {
      return { status: "cancelled", stage: "configuration" };
    }

    const result = await request(
      "import:kbf-file",
      {
        content,
        profileId,
        environment: importConfig.environment,
        strategy,
        configuration,
      },
      0,
    );
    return { status: "completed", importType: "kbf", result };
  }

  if (type === "aliases") {
    const selectedStrategy = await promptAliasStrategy();
    if (!selectedStrategy) {
      return { status: "cancelled", stage: "strategy" };
    }

    const strategy = normalizeImportStrategy(selectedStrategy);
    if (strategy === "overwrite_all") {
      const currentAliases = Object.keys(profile?.aliases ?? {}).length;
      if (currentAliases > 0) {
        const confirmed = await showOverwriteConfirmation(
          "aliases",
          currentAliases,
          0,
        );
        if (!confirmed) {
          return { status: "cancelled", stage: "overwrite" };
        }
      }
    }

    const result = await request(
      "import:alias-file",
      {
        content,
        profileId,
        strategy,
      },
      0,
    );
    return { status: "completed", importType: "aliases", result };
  }

  throw new TypeError(`Unsupported import type: ${String(type)}`);
}
