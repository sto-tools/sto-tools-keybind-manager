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
component.addEventListener("ui:copy-to-clipboard", ({ text }) => {
  text.toUpperCase();
});
component.emit("ui:copy-to-clipboard", { text: "Copy me" });
component.addEventListener("key-browser:state-changed", (state) => {
  state.authorityEpoch.toFixed();
  state.revision.toFixed();
  state.collapsedCategories.command.map((id) => id.toUpperCase());
  state.collapsedCategories.keyType.map((id) => id.toUpperCase());
  state.collapsedBindsets.map((name) => name.toUpperCase());
});
component.emit("key-browser:state-changed", {
  authorityEpoch: 1,
  revision: 0,
  collapsedCategories: { command: [], keyType: ["function"] },
  collapsedBindsets: ["Primary Bindset"],
});
// @ts-expect-error KeyBrowser state requires both category namespaces.
component.emit("key-browser:state-changed", {
  authorityEpoch: 1,
  revision: 0,
  collapsedCategories: { command: [] },
  collapsedBindsets: [],
});
// @ts-expect-error KeyBrowser state requires owner ordering metadata.
component.emit("key-browser:state-changed", {
  collapsedCategories: { command: [], keyType: [] },
  collapsedBindsets: [],
});

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
  // @ts-expect-error Environment mutation is a direct DataCoordinator action.
  component.request("data:set-environment", { environment: "ground" });
  // @ts-expect-error Settings mutation is a direct DataCoordinator action.
  component.request("data:update-settings", { settings: { theme: "dark" } });
  // @ts-expect-error Built-in profile loading is called directly by its UI flow.
  component.request("data:load-default-data");
  // @ts-expect-error Parser metrics remain direct diagnostic instrumentation.
  component.request("parser:get-performance-metrics");
  // @ts-expect-error Alias import uses the canonical import action.
  component.request("alias:import-file", { content: "alias test test" });
  // @ts-expect-error The legacy export import bridge is retired.
  component.request("export:import-from-file", {
    file: new File([], "x.json"),
  });
  // @ts-expect-error Automatic file detection is not an application RPC.
  component.request("import:from-file", { file: new File([], "x.json") });
  // @ts-expect-error Clipboard requests use utility:copy-to-clipboard.
  component.request("ui:copy-to-clipboard", { text: "Copy me" });
  // @ts-expect-error Toast delivery uses the toast:show event.
  component.request("ui:show-toast", { message: "Saved" });
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
  // @ts-expect-error Bindset sections are projected from accepted owner snapshots.
  component.request("key:get-all-sectional");
  // @ts-expect-error Category collapse is part of KeyBrowserService owned state.
  component.request("key:get-category-state", {
    categoryId: "system",
    mode: "command",
  });
  // @ts-expect-error Command-chain empty state is projected from accepted cache state.
  component.request("command:get-empty-state-info");

  component.respond("parser:clear-cache", () => ({ success: true }));
  // @ts-expect-error Responder results are selected by their topic.
  component.respond("parser:clear-cache", () => ({ success: false }));
  // @ts-expect-error Retired settings state queries cannot regain responders.
  component.respond("data:get-settings", () => ({}));
  // @ts-expect-error Direct environment mutation cannot regain a responder.
  component.respond("data:set-environment", () => ({
    success: true,
    environment: "ground",
  }));
  // @ts-expect-error Direct settings mutation cannot regain a responder.
  component.respond("data:update-settings", () => ({
    success: true,
    settings: {},
  }));
  // @ts-expect-error Direct default loading cannot regain a responder.
  component.respond("data:load-default-data", () => ({
    success: true,
    profilesCreated: 1,
    currentProfile: "default",
  }));
  // @ts-expect-error Internal parser metrics cannot regain a responder.
  component.respond("parser:get-performance-metrics", () => []);
  // @ts-expect-error Alias import cannot regain its forwarding responder.
  component.respond("alias:import-file", () => undefined);
  // @ts-expect-error Export cannot regain its import forwarding responder.
  component.respond("export:import-from-file", () => undefined);
  // @ts-expect-error Automatic file detection cannot regain an RPC responder.
  component.respond("import:from-file", () => undefined);
  // @ts-expect-error Clipboard cannot regain the retired UI responder.
  component.respond("ui:copy-to-clipboard", () => undefined);
  // @ts-expect-error Toast delivery cannot regain a request/response responder.
  component.respond("ui:show-toast", () => undefined);
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
  // @ts-expect-error Retired sectional queries cannot regain responders.
  component.respond("key:get-all-sectional", () => ({}));
  // @ts-expect-error Retired category-state queries cannot regain responders.
  component.respond("key:get-category-state", () => false);
  // @ts-expect-error Retired empty-state queries cannot regain responders.
  component.respond("command:get-empty-state-info", () => ({}));
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
