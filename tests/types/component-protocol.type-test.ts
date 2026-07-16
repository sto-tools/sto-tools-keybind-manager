import ComponentBase from "../../src/js/components/ComponentBase.js";
import eventBus from "../../src/js/core/eventBus.js";
import type { DynamicEventTopic } from "../../src/js/types/events/index.js";
import type { DynamicRpcTopic } from "../../src/js/types/rpc/index.js";

const component = new ComponentBase(eventBus);

component.addEventListener("toast:show", (payload) => {
  payload.message.toUpperCase();
  payload.duration?.toFixed();
});
component.emit("toast:show", { message: "Saved", type: "success" });

// @ts-expect-error Component event topics are registry-checked.
component.emit("toast:typo", { message: "Saved" });
// @ts-expect-error Component event payloads are registry-checked.
component.emit("toast:show", { message: "Saved" });

component.onDom(document, "click", "about-open", () => undefined);
// @ts-expect-error DOM mirrors and direct application events are separate.
component.onDom(document, "click", "toast:show", () => undefined);

async function exerciseComponentRpc() {
  const parsed = await component.request("parser:parse-command-string", {
    commandString: "FirePhasers",
  });
  parsed.commands;

  await component.request("parser:clear-cache");
  // @ts-expect-error Required RPC payloads cannot be omitted.
  component.request("parser:parse-command-string");
  // @ts-expect-error RPC payloads are selected by their topic.
  component.request("parser:parse-command-string", { commandString: 42 });
  // @ts-expect-error Settings snapshots are broadcast/cache state, not RPC state.
  component.request("data:get-settings");
  // @ts-expect-error Preference values are read from the component cache.
  component.request("preferences:get-setting", { key: "autoSave" });
  // @ts-expect-error Preference snapshots arrive through broadcasts and late join.
  component.request("preferences:get-settings");
  // @ts-expect-error Primary key maps come from accepted DataCoordinator snapshots.
  component.request("key:get-all");
  // @ts-expect-error Available bindsets arrive through cached owner state.
  component.request("bindset:get-available");
  // @ts-expect-error Bindset collapse reads remain internal service helpers.
  component.request("bindset:get-collapsed-state", {
    bindsetName: "Primary Bindset",
  });

  component.respond("parser:clear-cache", () => ({ success: true }));
  // @ts-expect-error Responder results are selected by their topic.
  component.respond("parser:clear-cache", () => ({ success: false }));
  // @ts-expect-error Retired settings state queries cannot regain responders.
  component.respond("data:get-settings", () => ({}));
  // @ts-expect-error Retired preference queries cannot regain responders.
  component.respond("preferences:get-setting", () => true);
  // @ts-expect-error Retired preference snapshots cannot regain responders.
  component.respond("preferences:get-settings", () => ({}));
  // @ts-expect-error Retired key-map queries cannot regain responders.
  component.respond("key:get-all", () => ({}));
  // @ts-expect-error Retired bindset-list queries cannot regain responders.
  component.respond("bindset:get-available", () => []);
  // @ts-expect-error Retired collapse-state queries cannot regain responders.
  component.respond("bindset:get-collapsed-state", () => false);
}

declare const dynamicEvent: DynamicEventTopic<
  { sequence: number },
  "component-fixture"
>;
component.emit(dynamicEvent, { sequence: 1 });
// @ts-expect-error Branded event topics retain their payload contract.
component.emit(dynamicEvent, { sequence: "one" });

declare const dynamicRpc: DynamicRpcTopic<
  { sequence: number },
  { accepted: boolean }
>;
component.request(dynamicRpc, { sequence: 1 });
component.respond(dynamicRpc, ({ sequence }) => ({ accepted: sequence > 0 }));
// @ts-expect-error Branded RPC topics retain their request contract.
component.request(dynamicRpc, { sequence: "one" });

declare const untypedTopic: string;
// @ts-expect-error Widened strings are not a component event escape hatch.
component.addEventListener(untypedTopic, () => undefined);
// @ts-expect-error Widened strings are not a component RPC escape hatch.
component.request(untypedTopic, {});

void exerciseComponentRpc;
