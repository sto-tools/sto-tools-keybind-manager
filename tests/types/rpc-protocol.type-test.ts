import type {
  AliasAddResult,
  CommandParseResult,
  CombinedAlias,
  DynamicRpcTopic,
  ParameterBuildResult,
  ParsedCommand,
  Profile,
  RpcEmptyPayload,
  RpcHandler,
  RpcKnownTopic,
  RpcRequest,
  RpcResult,
  VirtualAlias,
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
type NoPayload = Expect<
  Equal<RpcRequest<"data:get-all-profiles">, RpcEmptyPayload>
>;
type ProfileResult = Expect<
  Equal<RpcResult<"data:get-all-profiles">, Record<string, Profile>>
>;
type ParameterCommandBuildResult = Expect<
  Equal<RpcResult<"parameter-command:build">, ParameterBuildResult>
>;
type CombinedAliasResult = Expect<
  Equal<
    RpcResult<"command:get-combined-aliases">,
    Record<string, CombinedAlias>
  >
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
const virtualAlias: VirtualAlias = {
  commands: [],
  description: "Generated VFX alias",
  type: "vfx-alias",
  virtual: true,
};
const combinedAliasHandler: RpcHandler<
  "command:get-combined-aliases"
> = () => ({
  generated: virtualAlias,
});
declare const responderOnlyOptionalHandler: RpcHandler<"data:get-command-category">;
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
  // @ts-expect-error Retired preference queries cannot be reintroduced by consumers.
  request(eventBus, "preferences:get-setting", { key: "autoSave" });
  // @ts-expect-error Retired preference snapshots cannot be reintroduced by consumers.
  request(eventBus, "preferences:get-settings");
  // @ts-expect-error Retired settings state queries cannot regain responders.
  respond(eventBus, "data:get-settings", () => ({}));
  // @ts-expect-error Retired preference queries cannot regain responders.
  respond(eventBus, "preferences:get-setting", () => true);
  // @ts-expect-error Retired preference snapshots cannot regain responders.
  respond(eventBus, "preferences:get-settings", () => ({}));
  // @ts-expect-error Retired state queries cannot be reintroduced by consumers.
  request(eventBus, "key:get-selected");
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
void combinedAliasHandler;
void exerciseCoreApi;
void (0 as unknown as ParameterCommandBuildResult);
void (0 as unknown as CombinedAliasResult);
void (0 as unknown as PreferenceInitResult);
