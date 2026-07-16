import { createDataCoordinatorState } from "../core/componentState.js";

export const retiredEmptyStateTopic = "command:get-empty-state-info";

const translations = {
  alias_chain: "Alias chain",
  click_add_command_to_start_building_your_alias_chain:
    "Click Add Command to start building your alias chain for",
  click_add_command_to_start_building_your_command_chain:
    "Click Add Command to start building your command chain for",
  command_chain: "Command chain",
  generated_alias: "Generated alias",
  generated_command: "Generated command",
  no_alias_selected: "No alias selected",
  no_commands: "No commands",
  no_key_selected: "No key selected",
  select_a_key_to_edit: "Select a key to edit",
  select_a_key_to_see_the_generated_command:
    "Select a key to see the generated command",
  select_alias_from_left_panel: "Select an alias from the left panel",
  select_an_alias_to_edit: "Select an alias to edit",
  select_an_alias_to_see_the_generated_command:
    "Select an alias to see the generated command",
  select_key_from_left_panel: "Select a key from the left panel",
};

export const commandChainI18n = {
  t(key, options = {}) {
    if (key === "chain_for_key") {
      return `${options.chainType}: ${options.key}`;
    }
    return translations[key] || key;
  },
};

export function mountCommandChain() {
  document.body.innerHTML = `
    <section class="chain-header">
      <h3 id="chainTitle">Initial title</h3>
      <span id="commandCount">initial count</span>
      <span id="aliasCommandCount"></span>
      <span id="commandCountDisplay"><span data-i18n="commands"></span></span>
      <span id="aliasCommandCountDisplay"><span data-i18n="commands"></span></span>
    </section>
    <div class="generated-command">
      <label data-i18n="generated_command">Generated command</label>
      <pre id="commandPreview">Initial preview</pre>
    </div>
    <div id="generatedAlias" style="display: none">
      <pre id="aliasPreview"></pre>
    </div>
    <div id="bindsetSelectorContainer"><select id="bindsetSelect"></select></div>
    <button id="stabilizeExecutionOrderBtn"></button>
    <button id="deleteAliasChainBtn"></button>
    <button id="duplicateAliasChainBtn"></button>
    <button id="importFromKeyOrAliasBtn"></button>
    <button id="deleteKeyBtn"></button>
    <button id="duplicateKeyBtn"></button>
    <div id="commandList"><div id="initial-command-list">Initial list</div></div>
  `;
}

export function createCommandChainProfile({
  spaceKeys = {},
  groundKeys = {},
  aliases = {},
  bindsets = {},
  keybindMetadata = {},
  bindsetMetadata = {},
  aliasMetadata = {},
} = {}) {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: { keys: spaceKeys },
      ground: { keys: groundKeys },
    },
    aliases,
    bindsets,
    keybindMetadata,
    bindsetMetadata,
    aliasMetadata,
  };
}

export function createCommandChainCoordinatorState(
  profile,
  { authorityEpoch = 1, revision = 1, environment = "space" } = {},
) {
  return createDataCoordinatorState({
    authorityEpoch,
    ready: true,
    revision,
    currentProfile: profile.id,
    currentEnvironment: environment,
    currentProfileData: profile,
    profiles: { [profile.id]: profile },
  });
}

export function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

export function createCommandElement(command) {
  const element = document.createElement("div");
  element.className = "command-item-row";
  element.textContent = typeof command === "string" ? command : command.command;
  return element;
}
