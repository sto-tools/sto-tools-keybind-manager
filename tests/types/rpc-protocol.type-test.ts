import type {
  AliasAddResult,
  CommandParseResult,
  DynamicRpcTopic,
  ParameterBuildResult,
  ParsedCommand,
  RpcHandler,
  RpcKnownTopic,
  RpcRequest,
  RpcResult,
} from "../../src/js/types/rpc/index.js";
import type { ExtensionPreferenceKey } from "../../src/js/types/events/base.js";
import { extensionPreferenceKey } from "../../src/js/components/services/preferenceKeys.js";
import eventBus from "../../src/js/core/eventBus.js";
import { request, respond } from "../../src/js/core/requestResponse.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

type AliasRequest = Expect<
  Equal<RpcRequest<"alias:add">, { name?: string; description?: string }>
>;
type AliasResult = Expect<Equal<RpcResult<"alias:add">, AliasAddResult>>;
type ParameterCommandBuildResult = Expect<
  Equal<RpcResult<"parameter-command:build">, ParameterBuildResult>
>;
type KnownTopic = Expect<
  "parser:clear-cache" extends RpcKnownTopic ? true : false
>;
type PreferenceInitResult = Expect<
  Equal<RpcResult<"preferences:init">, undefined>
>;

const aliasHandler: RpcHandler<"alias:add"> = (payload = {}) =>
  payload.name
    ? {
        success: true,
        message: "alias_created",
        data: { name: payload.name },
      }
    : { success: false, error: "invalid_alias_name" };

const noPayloadHandler: RpcHandler<"parser:clear-cache"> = () => ({
  success: true,
});

// @ts-expect-error Alias success responses require the returned alias name.
const invalidAliasHandler: RpcHandler<"alias:add"> = () => ({
  success: true,
  message: "alias_created",
});

// @ts-expect-error Removed defect topics are not part of the corrected registry.
type RemovedTopic = RpcRequest<"data:get-aliases">;
// @ts-expect-error Selection snapshots are broadcast/cache state, not RPCs.
type RemovedSelectedKeyQuery = RpcRequest<"key:get-selected">;
// @ts-expect-error Late-join hydration replaces the legacy selection state RPC.
type RemovedSelectionStateQuery = RpcRequest<"selection:get-state">;
// @ts-expect-error Cached selections are part of the selection snapshot.
type RemovedCachedSelectionQuery = RpcRequest<"selection:get-cached">;
// @ts-expect-error Editing context changes are broadcast state.
type RemovedEditingContextQuery = RpcRequest<"selection:get-editing-context">;
// @ts-expect-error The selected item is held in each component cache.
type RemovedSelectedItemQuery = RpcRequest<"selection:get-selected">;
// @ts-expect-error Settings are broadcast/cache state, not DataCoordinator RPC state.
type RemovedDataSettingsQuery = RpcRequest<"data:get-settings">;
// @ts-expect-error Individual preferences are read from each component cache.
type RemovedPreferenceSettingQuery = RpcRequest<"preferences:get-setting">;
// @ts-expect-error Preference snapshots arrive through broadcasts and late join.
type RemovedPreferencesSettingsQuery = RpcRequest<"preferences:get-settings">;
// @ts-expect-error Complete DataCoordinator state is broadcast and cached.
type RemovedDataStateQuery = RpcRequest<"data:get-current-state">;
// @ts-expect-error Profile maps are projected from the accepted data snapshot.
type RemovedAllProfilesQuery = RpcRequest<"data:get-all-profiles">;
// @ts-expect-error Environment key maps are projected from cached data state.
type RemovedDataKeysQuery = RpcRequest<"data:get-keys">;
// @ts-expect-error Primary command lists are projected from cached data state.
type RemovedDataKeyCommandsQuery = RpcRequest<"data:get-key-commands">;
// @ts-expect-error Named bindset commands are projected from cached data state.
type RemovedBindsetKeyCommandsQuery = RpcRequest<"bindset:get-key-commands">;
// @ts-expect-error Primary key maps are projected from the accepted data snapshot.
type RemovedAllKeysQuery = RpcRequest<"key:get-all">;
// @ts-expect-error Available bindsets are broadcast and cached owner state.
type RemovedAvailableBindsetsQuery = RpcRequest<"bindset:get-available">;
// @ts-expect-error Collapsed state is an internal localStorage projection.
type RemovedCollapsedStateQuery = RpcRequest<"bindset:get-collapsed-state">;
// @ts-expect-error Bindset sections are projected from accepted owner snapshots.
type RemovedSectionalKeysQuery = RpcRequest<"key:get-all-sectional">;
// @ts-expect-error Category collapse is part of KeyBrowserService owned state.
type RemovedCategoryStateQuery = RpcRequest<"key:get-category-state">;
// @ts-expect-error Alias maps are projected from the accepted data snapshot.
type RemovedAliasMapQuery = RpcRequest<"alias:get-all">;
// @ts-expect-error Selected command lists are projected from cached state.
type RemovedSelectedCommandsQuery = RpcRequest<"command:get-for-selected-key">;
// @ts-expect-error Import sources are projected from one accepted snapshot.
type RemovedImportSourcesQuery = RpcRequest<"command:get-import-sources">;
// @ts-expect-error Stabilization state is projected from profile metadata.
type RemovedCommandStabilizedQuery = RpcRequest<"command:is-stabilized">;
// @ts-expect-error Command-chain stabilization uses the shared projection.
type RemovedChainStabilizedQuery = RpcRequest<"command-chain:is-stabilized">;
// @ts-expect-error Command-chain empty state is projected from accepted cache state.
type RemovedCommandEmptyStateQuery = RpcRequest<"command:get-empty-state-info">;
// @ts-expect-error Combined aliases are projected from accepted profile state.
type RemovedCombinedAliasesQuery = RpcRequest<"command:get-combined-aliases">;
// @ts-expect-error Virtual VFX aliases are projected from explicit settings.
type RemovedVirtualVFXAliasesQuery = RpcRequest<"vfx:get-virtual-aliases">;
// @ts-expect-error Alias validation is owned by direct alias libraries.
type RemovedAliasNamePatternQuery = RpcRequest<"data:get-alias-name-pattern">;
// @ts-expect-error Specialized categories are read from the complete catalog.
type RemovedCombatCategoryQuery = RpcRequest<"data:get-combat-category">;
// @ts-expect-error Category lookups have no production RPC consumer.
type RemovedCommandCategoryQuery = RpcRequest<"data:get-command-category">;
// @ts-expect-error Definition lookups have no production RPC consumer.
type RemovedCommandDefinitionQuery = RpcRequest<"data:get-command-definition">;
// @ts-expect-error Specialized categories are read from the complete catalog.
type RemovedCommunicationQuery = RpcRequest<"data:get-communication-category">;
// @ts-expect-error Callers use the validated default-profile map.
type RemovedDefaultProfileQuery = RpcRequest<"data:get-default-profile">;
// @ts-expect-error Complete default profiles are selected from the imported catalog.
type RemovedDefaultProfilesQuery = RpcRequest<"data:get-default-profiles">;
// @ts-expect-error Key validation imports the canonical STO key list directly.
type RemovedKeyNamePatternQuery = RpcRequest<"data:get-key-name-pattern">;
// @ts-expect-error Specialized categories are read from the complete catalog.
type RemovedTrayCategoryQuery = RpcRequest<"data:get-tray-category">;
// @ts-expect-error Validation behavior is owned by direct validation libraries.
type RemovedValidationQuery = RpcRequest<"data:get-validation-patterns">;
// @ts-expect-error The legacy parameter-definition facade has no production requester.
type RemovedParameterQuery = RpcRequest<"parameter-command:find-definition">;
// @ts-expect-error Command definitions are projected from the imported catalog.
type RemovedCatalogDefinitionQuery = RpcRequest<"command:find-definition">;
// @ts-expect-error Command categories are projected from the imported catalog.
type RemovedCommandCategoriesQuery = RpcRequest<"command:get-categories">;
// @ts-expect-error Command warnings are projected from the imported catalog.
type RemovedCommandWarningQuery = RpcRequest<"command:get-warning">;
// @ts-expect-error Exact command lookup uses the imported catalog.
type RemovedCommandByNameQuery = RpcRequest<"data:find-command-by-name">;
// @ts-expect-error The complete command catalog is imported directly.
type RemovedCommandCatalogQuery = RpcRequest<"data:get-commands">;
// @ts-expect-error Catalog availability is guaranteed by its module import.
type RemovedHasCommandsQuery = RpcRequest<"data:has-commands">;
// @ts-expect-error Bindset membership lookup remains an internal service helper.
type NoBindsetLookup = RpcRequest<"bindset-selector:find-key-in-bindset">;
// @ts-expect-error Environment compatibility is called directly inside command import.
type NoCommandCompat = RpcRequest<"command:check-environment-compatibility">;
// @ts-expect-error Command-library IDs have no supported RPC consumer.
type RemovedCommandIdQuery = RpcRequest<"command:generate-id">;
// @ts-expect-error The placeholder validator is superseded by command-chain validation.
type RemovedCommandValidationQuery = RpcRequest<"command:validate">;
// @ts-expect-error Export key extraction remains an internal export helper.
type RemovedExportKeyExtractionQuery = RpcRequest<"export:extract-keys">;
// @ts-expect-error Standalone KBF validation is superseded by canonical parse/import paths.
type RemovedKbfValidationQuery = RpcRequest<"import:validate-kbf-file">;
// @ts-expect-error Standalone keybind validation is superseded by canonical import paths.
type RemovedKeybindValidationQuery = RpcRequest<"import:validate-keybind-file">;
// @ts-expect-error Key comparison remains an internal sort helper.
type RemovedKeyComparisonQuery = RpcRequest<"key:compare">;
// @ts-expect-error Key filtering is owned by the UI projection.
type RemovedKeyFilterQuery = RpcRequest<"key:filter">;
// @ts-expect-error Showing every key is owned by the UI projection.
type RemovedShowAllKeysQuery = RpcRequest<"key:show-all">;
// @ts-expect-error Parameter command IDs are generated directly during construction.
type NoParameterId = RpcRequest<"parameter-command:generate-id">;
// @ts-expect-error Environment mutation is a direct DataCoordinator action.
type RemovedEnvironmentAction = RpcRequest<"data:set-environment">;
// @ts-expect-error Settings mutation is a direct DataCoordinator action.
type RemovedSettingsAction = RpcRequest<"data:update-settings">;
// @ts-expect-error Built-in profile loading is called directly by its UI flow.
type RemovedDefaultDataAction = RpcRequest<"data:load-default-data">;
// @ts-expect-error Parser metrics remain direct diagnostic instrumentation.
type RemovedParserMetricsQuery = RpcRequest<"parser:get-performance-metrics">;

declare const dynamicTopic: DynamicRpcTopic<
  { value: number },
  { accepted: boolean }
>;
declare const parseResponse: CommandParseResult;
declare const parsedCommand: ParsedCommand;
declare const forwardedTopic: string;

const parameterBuildHandler: RpcHandler<"parameter-command:build"> = () => [
  parsedCommand,
];
declare const responderOnlyOptionalHandler: RpcHandler<"ui:copy-to-clipboard">;
responderOnlyOptionalHandler();

type DynamicTopicRemainsBranded = Expect<
  Equal<typeof dynamicTopic extends string ? true : false, true>
>;

async function exerciseCoreApi() {
  const parseResult = await request(eventBus, "parser:parse-command-string", {
    commandString: "FirePhasers",
    options: { generateDisplayText: true },
  });
  type ParsedResult = Expect<Equal<typeof parseResult, CommandParseResult>>;

  // @ts-expect-error Registered required-payload topics cannot omit the payload.
  request(eventBus, "parser:parse-command-string");
  // @ts-expect-error Registered payloads are validated against the topic contract.
  request(eventBus, "parser:parse-command-string", { commandString: 42 });

  const clearResult = await request(eventBus, "parser:clear-cache");
  type ClearResult = Expect<Equal<typeof clearResult, { success: true }>>;
  await request(eventBus, "parser:clear-cache", {});
  await request(eventBus, "parser:clear-cache", undefined, 25);
  // @ts-expect-error No-payload topics reject non-empty payload objects.
  request(eventBus, "parser:clear-cache", { unexpected: true });

  const restoreResult = await request(eventBus, "project:restore-from-content");
  if (restoreResult.success) {
    const importedProfiles: number = restoreResult.imported.profiles;
    void importedProfiles;
  }
  // @ts-expect-error Optional payloads are still validated when supplied.
  request(eventBus, "project:restore-from-content", { content: 42 });

  await request(eventBus, "preferences:set-setting", {
    key: "autoSave",
    value: false,
  });
  const pluginLayoutKey: ExtensionPreferenceKey =
    extensionPreferenceKey("plugin:layout");
  await request(eventBus, "preferences:set-setting", {
    key: pluginLayoutKey,
    value: { density: "compact" },
    extension: true,
  });
  await request(eventBus, "preferences:set-settings", {
    autoSave: true,
    maxUndoSteps: 100,
    "plugin:layout": { density: "comfortable" },
  });
  await request(eventBus, "data:update-profile", {
    profileId: "captain",
    updates: {
      replacement: {
        name: "Imported Captain",
        builds: { space: { keys: {} }, ground: { keys: {} } },
      },
      updateSource: "type-fixture",
    },
  });
  await request(eventBus, "data:update-profile", {
    profileId: "imported-captain",
    createIfMissing: true,
    updates: {
      replacement: {
        name: "Imported Captain",
        builds: { space: { keys: {} }, ground: { keys: {} } },
      },
      updateSource: "ImportService",
    },
  });
  // @ts-expect-error Missing-profile creation requires a complete replacement.
  request(eventBus, "data:update-profile", {
    profileId: "imported-captain",
    createIfMissing: true,
    updates: { properties: { description: "not an upsert" } },
  });
  // @ts-expect-error createIfMissing is an explicit literal capability.
  request(eventBus, "data:update-profile", {
    profileId: "imported-captain",
    createIfMissing: false,
    updates: {
      replacement: {
        name: "Imported Captain",
        builds: { space: { keys: {} }, ground: { keys: {} } },
      },
    },
  });
  // @ts-expect-error Full-profile replacement is an explicit typed operation.
  request(eventBus, "data:update-profile", {
    profileId: "captain",
    updates: { replacement: "not-a-profile" },
  });
  // @ts-expect-error Known preference keys determine their accepted value type.
  request(eventBus, "preferences:set-setting", {
    key: "autoSave",
    value: "yes",
  });
  // @ts-expect-error Known keys cannot bypass their value type via the extension path.
  request(eventBus, "preferences:set-setting", {
    key: "autoSave",
    value: "yes",
    extension: true,
  });
  // @ts-expect-error Unknown preference keys require the explicit extension path.
  request(eventBus, "preferences:set-setting", {
    key: "plugin:layout",
    value: "compact",
  });
  // @ts-expect-error Bulk mutations retain known preference value types.
  request(eventBus, "preferences:set-settings", { autoSave: "yes" });

  const dynamicResult = await request(eventBus, dynamicTopic, { value: 1 });
  type DynamicResult = Expect<
    Equal<typeof dynamicResult, { accepted: boolean }>
  >;
  respond(eventBus, dynamicTopic, ({ value }) => ({ accepted: value > 0 }));

  respond(eventBus, "parser:parse-command-string", (payload) => {
    const commandString: string = payload.commandString;
    void commandString;
    return parseResponse;
  });
  respond(eventBus, "parser:clear-cache", () => ({ success: true }));
  respond(eventBus, "export:sync-to-folder", async ({ dirHandle }) => {
    void dirHandle;
    return undefined;
  });
  respond(eventBus, "preferences:init", () => undefined);
  // @ts-expect-error No-result responders cannot accidentally publish a value.
  respond(eventBus, "preferences:init", () => true);
  // @ts-expect-error Registered responders must return the topic result type.
  respond(eventBus, "parser:parse-command-string", () => ({ success: true }));

  // @ts-expect-error Unregistered literals require an explicitly branded topic.
  request(eventBus, "parser:typo", {});
  // @ts-expect-error Settings snapshots are no longer requestable from DataCoordinator.
  request(eventBus, "data:get-settings");
  // @ts-expect-error Environment mutation is a direct DataCoordinator action.
  request(eventBus, "data:set-environment", { environment: "ground" });
  // @ts-expect-error Settings mutation is a direct DataCoordinator action.
  request(eventBus, "data:update-settings", { settings: { theme: "dark" } });
  // @ts-expect-error Built-in profile loading is not an application RPC.
  request(eventBus, "data:load-default-data");
  // @ts-expect-error Parser metrics are inspected directly by diagnostics and tests.
  request(eventBus, "parser:get-performance-metrics");
  // @ts-expect-error Retired preference queries cannot be reintroduced by consumers.
  request(eventBus, "preferences:get-setting", { key: "autoSave" });
  // @ts-expect-error Retired preference snapshots cannot be reintroduced by consumers.
  request(eventBus, "preferences:get-settings");
  // @ts-expect-error Retired settings state queries cannot regain responders.
  respond(eventBus, "data:get-settings", () => ({}));
  // @ts-expect-error Direct environment mutation cannot regain a responder.
  respond(eventBus, "data:set-environment", () => ({
    success: true,
    environment: "ground",
  }));
  // @ts-expect-error Direct settings mutation cannot regain a responder.
  respond(eventBus, "data:update-settings", () => ({
    success: true,
    settings: {},
  }));
  // @ts-expect-error Direct default loading cannot regain a responder.
  respond(eventBus, "data:load-default-data", () => ({
    success: true,
    profilesCreated: 1,
    currentProfile: "default",
  }));
  // @ts-expect-error Internal parser metrics cannot regain a responder.
  respond(eventBus, "parser:get-performance-metrics", () => []);
  // @ts-expect-error Retired preference queries cannot regain responders.
  respond(eventBus, "preferences:get-setting", () => true);
  // @ts-expect-error Retired preference snapshots cannot regain responders.
  respond(eventBus, "preferences:get-settings", () => ({}));
  // @ts-expect-error Retired state queries cannot be reintroduced by consumers.
  request(eventBus, "key:get-selected");
  // @ts-expect-error Key maps are selected from the accepted DataCoordinator snapshot.
  request(eventBus, "key:get-all");
  // @ts-expect-error Bindset names are broadcast and cached rather than queried.
  request(eventBus, "bindset:get-available");
  // @ts-expect-error Bindset collapse state remains an internal service helper.
  request(eventBus, "bindset:get-collapsed-state", {
    bindsetName: "Primary Bindset",
  });
  // @ts-expect-error Retired key-map queries cannot regain responders.
  respond(eventBus, "key:get-all", () => ({}));
  // @ts-expect-error Retired bindset-list queries cannot regain responders.
  respond(eventBus, "bindset:get-available", () => []);
  // @ts-expect-error Retired collapse-state queries cannot regain responders.
  respond(eventBus, "bindset:get-collapsed-state", () => false);
  // @ts-expect-error Retired sectional queries cannot be reintroduced by consumers.
  request(eventBus, "key:get-all-sectional");
  // @ts-expect-error Retired category-state queries cannot be reintroduced by consumers.
  request(eventBus, "key:get-category-state", {
    categoryId: "system",
    mode: "command",
  });
  // @ts-expect-error Retired sectional queries cannot regain responders.
  respond(eventBus, "key:get-all-sectional", () => ({}));
  // @ts-expect-error Retired category-state queries cannot regain responders.
  respond(eventBus, "key:get-category-state", () => false);
  // @ts-expect-error Combined alias state is a local projection, not a query.
  request(eventBus, "command:get-combined-aliases");
  // @ts-expect-error Retired combined-alias queries cannot regain responders.
  respond(eventBus, "command:get-combined-aliases", () => ({}));
  // @ts-expect-error Virtual VFX aliases are projected from explicit settings.
  request(eventBus, "vfx:get-virtual-aliases");
  // @ts-expect-error Retired VFX state queries cannot regain responders.
  respond(eventBus, "vfx:get-virtual-aliases", () => ({}));
  // @ts-expect-error Retired alias-pattern queries cannot be requested.
  request(eventBus, "data:get-alias-name-pattern");
  // @ts-expect-error Retired alias-pattern queries cannot regain responders.
  respond(eventBus, "data:get-alias-name-pattern", () => /./);
  // @ts-expect-error Retired specialized-category queries cannot be requested.
  request(eventBus, "data:get-combat-category");
  // @ts-expect-error Retired specialized-category queries cannot regain responders.
  respond(eventBus, "data:get-combat-category", () => null);
  // @ts-expect-error Retired category queries cannot be requested.
  request(eventBus, "data:get-command-category", { categoryId: "system" });
  // @ts-expect-error Retired category queries cannot regain responders.
  respond(eventBus, "data:get-command-category", () => null);
  // @ts-expect-error Retired definition queries cannot be requested.
  request(eventBus, "data:get-command-definition", {
    categoryId: "system",
    commandId: "refine_dilithium",
  });
  // @ts-expect-error Retired definition queries cannot regain responders.
  respond(eventBus, "data:get-command-definition", () => null);
  // @ts-expect-error Retired specialized-category queries cannot be requested.
  request(eventBus, "data:get-communication-category");
  // @ts-expect-error Retired specialized-category queries cannot regain responders.
  respond(eventBus, "data:get-communication-category", () => null);
  // @ts-expect-error Retired singular-default queries cannot be requested.
  request(eventBus, "data:get-default-profile", { profileId: "default" });
  // @ts-expect-error Retired singular-default queries cannot regain responders.
  respond(eventBus, "data:get-default-profile", () => null);
  // @ts-expect-error Retired key-pattern queries cannot be requested.
  request(eventBus, "data:get-key-name-pattern");
  // @ts-expect-error Retired key-pattern queries cannot regain responders.
  respond(eventBus, "data:get-key-name-pattern", () => "USE_STO_KEY_NAMES");
  // @ts-expect-error Retired specialized-category queries cannot be requested.
  request(eventBus, "data:get-tray-category");
  // @ts-expect-error Retired specialized-category queries cannot regain responders.
  respond(eventBus, "data:get-tray-category", () => null);
  // @ts-expect-error Retired validation-pattern queries cannot be requested.
  request(eventBus, "data:get-validation-patterns");
  // @ts-expect-error Retired validation-pattern queries cannot regain responders.
  respond(eventBus, "data:get-validation-patterns", () => ({}));
  // @ts-expect-error Retired parameter-definition queries cannot be requested.
  request(eventBus, "parameter-command:find-definition", {
    commandString: "Target Enemy",
  });
  // @ts-expect-error Retired parameter-definition queries cannot regain responders.
  respond(eventBus, "parameter-command:find-definition", () => null);
  // @ts-expect-error Retired definition queries cannot be requested.
  request(eventBus, "command:find-definition", { command: "FireAll" });
  // @ts-expect-error Retired definition queries cannot regain responders.
  respond(eventBus, "command:find-definition", () => null);
  // @ts-expect-error Retired category queries cannot be requested.
  request(eventBus, "command:get-categories");
  // @ts-expect-error Retired category queries cannot regain responders.
  respond(eventBus, "command:get-categories", () => ({}));
  // @ts-expect-error Retired warning queries cannot be requested.
  request(eventBus, "command:get-warning", { command: "FireAll" });
  // @ts-expect-error Retired warning queries cannot regain responders.
  respond(eventBus, "command:get-warning", () => null);
  // @ts-expect-error Retired exact-name queries cannot be requested.
  request(eventBus, "data:find-command-by-name", { command: "FireAll" });
  // @ts-expect-error Retired exact-name queries cannot regain responders.
  respond(eventBus, "data:find-command-by-name", () => null);
  // @ts-expect-error Retired catalog queries cannot be requested.
  request(eventBus, "data:get-commands");
  // @ts-expect-error Retired catalog queries cannot regain responders.
  respond(eventBus, "data:get-commands", () => ({}));
  // @ts-expect-error Retired catalog-presence queries cannot be requested.
  request(eventBus, "data:has-commands");
  // @ts-expect-error Retired catalog-presence queries cannot regain responders.
  respond(eventBus, "data:has-commands", () => true);
  // @ts-expect-error Retired default-profile queries cannot be requested.
  request(eventBus, "data:get-default-profiles");
  // @ts-expect-error Retired default-profile queries cannot regain responders.
  respond(eventBus, "data:get-default-profiles", () => ({}));
  // @ts-expect-error Internal bindset lookup helpers are not requestable.
  request(eventBus, "bindset-selector:find-key-in-bindset", {
    keysObject: { F1: ["FireAll"] },
    selectedKey: "F1",
  });
  // @ts-expect-error Internal bindset lookup helpers cannot regain responders.
  respond(eventBus, "bindset-selector:find-key-in-bindset", () => []);
  // @ts-expect-error Command compatibility is not an application RPC.
  request(eventBus, "command:check-environment-compatibility", {
    command: "FireAll",
    environment: "space",
  });
  // @ts-expect-error Command compatibility cannot regain an RPC responder.
  respond(eventBus, "command:check-environment-compatibility", () => true);
  // @ts-expect-error Command-library IDs are not requested over RPC.
  request(eventBus, "command:generate-id");
  // @ts-expect-error Command-library ID generation cannot regain a responder.
  respond(eventBus, "command:generate-id", () => "cmd_1");
  // @ts-expect-error The retired placeholder command validator is not requestable.
  request(eventBus, "command:validate", { command: "FireAll" });
  // @ts-expect-error The retired placeholder validator cannot regain a responder.
  respond(eventBus, "command:validate", () => ({ valid: true }));
  // @ts-expect-error Export key extraction is an internal helper.
  request(eventBus, "export:extract-keys", {
    profile: {},
    environment: "space",
  });
  // @ts-expect-error Export key extraction cannot regain a responder.
  respond(eventBus, "export:extract-keys", () => ({}));
  // @ts-expect-error Standalone KBF validation is not requestable.
  request(eventBus, "import:validate-kbf-file", { content: "KBF" });
  // @ts-expect-error Standalone KBF validation cannot regain a responder.
  respond(eventBus, "import:validate-kbf-file", () => ({
    valid: false,
    errors: [],
  }));
  // @ts-expect-error Standalone keybind validation is not requestable.
  request(eventBus, "import:validate-keybind-file", {
    content: 'F1 "FireAll"',
  });
  // @ts-expect-error Standalone keybind validation cannot regain a responder.
  respond(eventBus, "import:validate-keybind-file", () => ({ valid: false }));
  // @ts-expect-error Key comparison remains internal to sorting projections.
  request(eventBus, "key:compare", { keyA: "F1", keyB: "F2" });
  // @ts-expect-error Key comparison cannot regain a responder.
  respond(eventBus, "key:compare", () => -1);
  // @ts-expect-error UI filtering is not requestable as a key-service RPC.
  request(eventBus, "key:filter", { keys: ["F1"], filter: "F" });
  // @ts-expect-error UI filtering cannot regain a key-service responder.
  respond(eventBus, "key:filter", () => []);
  // @ts-expect-error Showing every key is a direct UI projection.
  request(eventBus, "key:show-all", { keys: ["F1"] });
  // @ts-expect-error Showing every key cannot regain a responder.
  respond(eventBus, "key:show-all", () => []);
  // @ts-expect-error Parameter command IDs are generated directly.
  request(eventBus, "parameter-command:generate-id");
  // @ts-expect-error Parameter command ID generation cannot regain a responder.
  respond(eventBus, "parameter-command:generate-id", () => "cmd_1");
  // @ts-expect-error Widened strings are not an untyped forwarding escape.
  request(eventBus, forwardedTopic, {});

  void (0 as unknown as ParsedResult);
  void (0 as unknown as ClearResult);
  void (0 as unknown as DynamicResult);
}

void aliasHandler;
void noPayloadHandler;
void invalidAliasHandler;
void parameterBuildHandler;
void exerciseCoreApi;
void (0 as unknown as ParameterCommandBuildResult);
void (0 as unknown as PreferenceInitResult);
