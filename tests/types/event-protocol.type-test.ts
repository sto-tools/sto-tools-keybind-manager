import eventBus from "../../src/js/core/eventBus.js";
import type {
  DynamicEventTopic,
  EventPayload,
  EventTopic,
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
type SelectionSnapshotIsRegisteredExactly = Expect<
  Equal<EventPayload<"selection:state-changed">, SelectionStateSnapshot>
>;

const bus: TypedEventBus = eventBus;

bus.hasListeners("toast:show");
// @ts-expect-error Listener callbacks are private implementation details.
bus.listeners;

bus.on("toast:show", (payload) => {
  payload.message.toUpperCase();
  payload.duration?.toFixed();
});
bus.emit("toast:show", { message: "Saved", type: "success" });
bus.emit("preferences:loaded", { settings: { language: "en" } });
bus.emit("storage:settings-changed", { settings: { autoSync: true } });
bus.emit("selection:state-changed", {
  selectedKey: "F1",
  selectedAlias: null,
  editingContext: null,
  cachedSelections: { space: "F1", ground: null, alias: null },
  currentEnvironment: "space",
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

// Listener-only compatibility topics cannot acquire invented producer shapes.
bus.on("bindset:modified", (payload) => {
  void payload;
});
// @ts-expect-error No producer authority exists for compatibility listeners.
bus.emit("bindset:modified", { bindsetName: "Primary Bindset" });

// DOM mirror topics remain confined to the DOM-listener surface.
bus.onDom(document, "click", "about-open");
bus.onDomDebounced(document, "input", (event) => event.type, 100);
// @ts-expect-error DOM mirror topics are not direct application events.
bus.on("about-open", () => undefined);

declare const untypedDomMirror: string;
// @ts-expect-error DOM mirror strings must be present in the captured surface.
bus.onDom(document, "click", untypedDomMirror);

// @ts-expect-error Literal topics must be present in EventProtocol.
bus.emit("not-a-registered-event", null);
// @ts-expect-error Non-null event payloads remain required.
bus.emit("toast:show");
// @ts-expect-error Known event payloads are checked at the call site.
bus.emit("toast:show", { message: "Saved" });

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
