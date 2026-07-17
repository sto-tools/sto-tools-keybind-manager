import eventBus from "../../src/js/core/eventBus.js";
import {
  createDataCoordinatorState,
  createPreferencesState,
} from "../fixtures/core/componentState.js";
import type {
  ComponentReplyTopic,
  ComponentState,
  ComponentStateReply,
  DataCoordinatorStateSnapshot,
  DataStateChangedPayload,
  DataStateChangeReason,
  DynamicEventTopic,
  EventPayload,
  EventTopic,
  KeyBrowserViewStateSnapshot,
  SelectionStateSnapshot,
  StoreEventTopic,
  TypedEventBus,
} from "../../src/js/types/events/index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;
type IsAny<Value> = 0 extends 1 & Value ? true : false;

type EventTopicsWithAnyPayload = {
  [Topic in EventTopic]: IsAny<EventPayload<Topic>> extends true
    ? Topic
    : never;
}[EventTopic];

type RegistryContainsNoAnyPayload = Expect<
  Equal<EventTopicsWithAnyPayload, never>
>;
type RetiredListenerTopics =
  | "bindset-manager:open"
  | "bindset-section:refresh-needed"
  | "bindset:active-changed"
  | "bindset:created"
  | "bindset:deleted"
  | "bindset:modified"
  | "current-profile:updated"
  | "key-view:toggle"
  | "key-view:update-toggle"
  | "key:selected"
  | "keys:filter"
  | "keys:show-all"
  | "mode-changed"
  | "parameter-edit:end"
  | "parameter-edit:start"
  | "profile-modified";
type RetiredListenersAreAbsent = Expect<
  Equal<Extract<EventTopic, RetiredListenerTopics>, never>
>;
type ToastPayloadIsRegistered = Expect<
  Equal<
    EventPayload<"toast:show">,
    {
      message: string;
      type:
        | "info"
        | "success"
        | "warning"
        | "error"
        | (string & { readonly __toastKindCompatibility?: never });
      duration?: number;
    }
  >
>;
type ClipboardEventIsRegistered = Expect<
  Equal<EventPayload<"ui:copy-to-clipboard">, { text: string }>
>;
type SelectionSnapshotIsRegisteredExactly = Expect<
  Equal<EventPayload<"selection:state-changed">, SelectionStateSnapshot>
>;
type SelectionLateJoinStateIsRegisteredExactly = Expect<
  Equal<ComponentState<"SelectionService">, SelectionStateSnapshot>
>;
type DataSnapshotIsRegisteredExactly = Expect<
  Equal<ComponentState<"DataCoordinator">, DataCoordinatorStateSnapshot>
>;
type DataStateEventIsRegisteredExactly = Expect<
  Equal<EventPayload<"data:state-changed">, DataStateChangedPayload>
>;
type KeyBrowserStateEventIsRegisteredExactly = Expect<
  Equal<EventPayload<"key-browser:state-changed">, KeyBrowserViewStateSnapshot>
>;
type KeyBrowserLateJoinStateIsRegisteredExactly = Expect<
  Equal<ComponentState<"KeyBrowserService">, KeyBrowserViewStateSnapshot>
>;
type DataStateReasonsAreClosed = Expect<
  Equal<
    DataStateChangeReason,
    | "initial-load"
    | "storage-reset"
    | "profile-switched"
    | "profile-created"
    | "profile-cloned"
    | "profile-renamed"
    | "profile-deleted"
    | "profile-updated"
    | "environment-changed"
    | "settings-updated"
    | "default-profiles-created"
    | "fallback-profiles-created"
    | "state-reloaded"
  >
>;

const bus: TypedEventBus = eventBus;
const dataCoordinatorState = createDataCoordinatorState();
const preferencesSettings = createPreferencesState().settings;
const keyBrowserViewState: KeyBrowserViewStateSnapshot = {
  authorityEpoch: 1,
  revision: 0,
  collapsedCategories: { command: ["system"], keyType: ["function"] },
  collapsedBindsets: ["Primary Bindset"],
};
dataCoordinatorState.authorityEpoch.toFixed();
keyBrowserViewState.authorityEpoch.toFixed();
keyBrowserViewState.revision.toFixed();

bus.hasListeners("toast:show");
// @ts-expect-error Listener callbacks are private implementation details.
bus.listeners;

bus.on("toast:show", (payload) => {
  payload.message.toUpperCase();
  payload.duration?.toFixed();
});
bus.emit("toast:show", { message: "Saved", type: "success" });
bus.on("ui:copy-to-clipboard", ({ text }) => text.toUpperCase());
bus.emit("ui:copy-to-clipboard", { text: "Copy me" });
bus.emit("preferences:loaded", { settings: preferencesSettings });
bus.emit("preferences:saved", { settings: preferencesSettings });
bus.emit("preferences:changed", {
  key: "language",
  value: "de",
  settings: { ...preferencesSettings, language: "de" },
});
bus.emit("preferences:changed", {
  changes: { language: "fr" },
  settings: { ...preferencesSettings, language: "fr" },
});
// @ts-expect-error Loaded events carry the complete authoritative snapshot.
bus.emit("preferences:loaded", { settings: { language: "en" } });
// @ts-expect-error Changed events retain their delta and carry a full snapshot.
bus.emit("preferences:changed", { key: "language", value: "de" });
bus.emit("storage:settings-changed", { settings: { autoSync: true } });
bus.emit("data:state-changed", {
  reason: "initial-load",
  state: dataCoordinatorState,
});
// @ts-expect-error Data state broadcasts require a closed publication reason.
bus.emit("data:state-changed", {
  reason: "unknown-change",
  state: dataCoordinatorState,
});
// @ts-expect-error Data state broadcasts require the complete snapshot envelope.
bus.emit("data:state-changed", { reason: "profile-updated" });
// @ts-expect-error Complete snapshots include authority, readiness, and revision.
bus.emit("data:state-changed", {
  reason: "profile-updated",
  state: {
    currentProfile: null,
    currentEnvironment: "space",
    currentProfileData: null,
    profiles: {},
    settings: {},
    metadata: { lastModified: null, version: "1.0.0" },
  },
});
bus.emit("selection:state-changed", {
  selectedKey: "F1",
  selectedAlias: null,
  editingContext: null,
  cachedSelections: { space: "F1", ground: null, alias: null },
  currentEnvironment: "space",
});
bus.emit("key-browser:state-changed", keyBrowserViewState);
// @ts-expect-error KeyBrowser state is a complete snapshot, not a category patch.
bus.emit("key-browser:state-changed", {
  authorityEpoch: 1,
  revision: 1,
  collapsedCategories: { command: ["system"] },
});
// @ts-expect-error KeyBrowser snapshots require owner ordering metadata.
bus.emit("key-browser:state-changed", {
  collapsedCategories: { command: [], keyType: [] },
  collapsedBindsets: [],
});
// @ts-expect-error Complete KeyBrowser state replaced the bindset collapse delta.
bus.emit("bindset-section:collapse-changed", {
  bindsetName: "Primary Bindset",
  isCollapsed: true,
});
// @ts-expect-error Selection snapshots require the complete owned state.
bus.emit("selection:state-changed", { selectedKey: "F1" });
// @ts-expect-error All three durable selection slots are required.
bus.emit("selection:state-changed", {
  selectedKey: null,
  selectedAlias: null,
  editingContext: null,
  cachedSelections: {},
  currentEnvironment: "space",
});

// Null-bearing topics may omit their payload at the runtime bus boundary.
bus.emit("about:show");
bus.emit("app:reset-failed", { error: new Error("reset failed") });

// @ts-expect-error Orphan compatibility listeners are retired from the registry.
bus.on("bindset:modified", (payload) => {
  void payload;
});
// @ts-expect-error Retired listener topics cannot acquire a producer.
bus.emit("bindset:modified", { bindsetName: "Primary Bindset" });
// @ts-expect-error Alias selection is owned by the paired alias action and canonical selection state.
bus.emit("alias-browser/alias-clicked", { name: "Engage" });
// @ts-expect-error Bindset membership consumes canonical key selection directly.
bus.emit("bindset-selector:set-selected-key", { key: "F1" });
// @ts-expect-error Key filtering is a direct UI projection.
bus.emit("key:filter", { filter: "" });
// @ts-expect-error VFX regeneration is a UI-owned modal callback, not a bus topic.
bus.emit("vfx:modal-regenerate-requested");

// DOM registration remains a typed local-handler surface.
bus.onDom(document, "click", (event) => event.type);
bus.onDomDebounced(document, "input", (event) => event.type, 100);
// @ts-expect-error Retired DOM mirror topics are not direct application events.
bus.on("about-open", () => undefined);

// @ts-expect-error DOM registrations require a local handler, not a bus topic.
bus.onDom(document, "click", "about-open");
// @ts-expect-error Debounced DOM registrations cannot restore the retired bus-topic argument.
bus.onDomDebounced(document, "input", "alias-filter", () => undefined, 100);

// @ts-expect-error Literal topics must be present in EventProtocol.
bus.emit("not-a-registered-event", null);
// @ts-expect-error Non-null event payloads remain required.
bus.emit("toast:show");
// @ts-expect-error Known event payloads are checked at the call site.
bus.emit("toast:show", { message: "Saved" });
// @ts-expect-error Clipboard event payloads require text.
bus.emit("ui:copy-to-clipboard", {});

declare const untypedTopic: string;
// @ts-expect-error Widened strings must be registered or explicitly branded.
bus.on(untypedTopic, () => undefined);
// @ts-expect-error Widened strings cannot bypass payload checking at emit.
bus.emit(untypedTopic, undefined);

declare const dynamicTopic: DynamicEventTopic<
  { value: number },
  "type-fixture"
>;
bus.on(dynamicTopic, (payload) => payload.value.toFixed());
bus.emit(dynamicTopic, { value: 1 });
// @ts-expect-error Branded dynamic topics carry their payload contract.
bus.emit(dynamicTopic, { value: "one" });

declare const componentReplyTopic: ComponentReplyTopic;
bus.on(componentReplyTopic, (reply) => {
  if (reply.sender === "SelectionService") {
    reply.state.selectedKey?.toUpperCase();
    reply.state.cachedSelections.space?.toUpperCase();
    // @ts-expect-error Sender narrowing excludes BindsetService state.
    reply.state.bindsets;
  } else if (reply.sender === "BindsetService") {
    reply.state.bindsets.map((name) => name.toUpperCase());
    // @ts-expect-error Sender narrowing excludes SelectionService state.
    reply.state.selectedKey;
  } else if (reply.sender === "KeyBrowserService") {
    reply.state.authorityEpoch.toFixed();
    reply.state.revision.toFixed();
    reply.state.collapsedCategories.command.map((id) => id.toUpperCase());
    reply.state.collapsedCategories.keyType.map((id) => id.toUpperCase());
    reply.state.collapsedBindsets.map((name) => name.toUpperCase());
    // @ts-expect-error Sender narrowing excludes SelectionService state.
    reply.state.selectedKey;
  }
});
bus.emit(componentReplyTopic, {
  sender: "DataCoordinator",
  state: dataCoordinatorState,
});
bus.emit(componentReplyTopic, {
  sender: "BindsetService",
  state: { bindsets: ["Primary Bindset"] },
});
bus.emit(componentReplyTopic, {
  sender: "SelectionService",
  state: {
    selectedKey: "F1",
    selectedAlias: null,
    editingContext: null,
    cachedSelections: { space: "F1", ground: null, alias: null },
    currentEnvironment: "space",
  },
});
bus.emit(componentReplyTopic, {
  sender: "KeyBrowserService",
  state: keyBrowserViewState,
});

const mismatchedComponentReply: ComponentStateReply = {
  sender: "SelectionService",
  // @ts-expect-error The state must belong to the discriminating sender.
  state: { bindsets: ["Primary Bindset"] },
};

const incompleteSelectionReply: ComponentStateReply = {
  sender: "SelectionService",
  // @ts-expect-error SelectionService replies require the complete snapshot.
  state: { selectedKey: "F1" },
};

declare const unionDynamicTopic: DynamicEventTopic<
  { value: number } | { value: string },
  "union-fixture"
>;
// @ts-expect-error A handler must accept every valid dynamic payload arm.
bus.on(unionDynamicTopic, (payload: { value: number }) => payload.value);

// @ts-expect-error A handler must accept nullable and legacy event arms.
bus.on("key-selected", (payload: { key: string }) => payload.key);

declare const storeTopic: StoreEventTopic<"currentMode">;
bus.emit(storeTopic, "space");

declare const stringValue: string;
// @ts-expect-error Structural transport strings must carry the dynamic brand.
bus.emit(`store:${stringValue}`, "space");

void ({} as RegistryContainsNoAnyPayload);
void ({} as ToastPayloadIsRegistered);
void ({} as SelectionLateJoinStateIsRegisteredExactly);
void ({} as DataSnapshotIsRegisteredExactly);
void ({} as DataStateEventIsRegisteredExactly);
void ({} as KeyBrowserStateEventIsRegisteredExactly);
void ({} as KeyBrowserLateJoinStateIsRegisteredExactly);
void ({} as DataStateReasonsAreClosed);
void mismatchedComponentReply;
void incompleteSelectionReply;
