import { afterEach, describe, expect, it } from "vitest";

import { decodeProjectJson } from "../../../src/js/components/services/importJsonBoundary.js";
import AliasBrowserUI from "../../../src/js/components/ui/AliasBrowserUI.js";
import BindsetDeleteConfirmUI from "../../../src/js/components/ui/BindsetDeleteConfirmUI.js";
import BindsetSelectorUI from "../../../src/js/components/ui/BindsetSelectorUI.js";
import { createKeyBrowserKeyElement } from "../../../src/js/components/ui/keyBrowserGridDom.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";

const aliasName = 'Alias"><img id="injected-alias" src="x" onerror="alert(1)">';
const aliasDescription = 'Description" onmouseover="alert(2)';
const keyName = 'CTRL+<img id="injected-key" src="x" onerror="alert(3)">';
const bindsetName =
  'Weapons"><img id="injected-bindset" src="x" onerror="alert(4)">';

function decodeImportedProfile() {
  const decoded = decodeProjectJson(
    JSON.stringify({
      type: "project",
      data: {
        currentProfile: "imported",
        profiles: {
          imported: {
            name: "Imported Profile",
            builds: {
              space: { keys: { [keyName]: ["FireAll"] } },
              ground: { keys: {} },
            },
            aliases: {
              [aliasName]: {
                commands: ["FireAll"],
                description: aliasDescription,
              },
            },
            bindsets: {
              [bindsetName]: {
                space: { keys: { F1: ["FireAll"] } },
              },
            },
          },
        },
      },
    }),
  );

  expect(decoded.success).toBe(true);
  if (!decoded.success) throw new Error("Expected project fixture to decode");

  const profile = decoded.value.data.profiles?.imported;
  if (!profile) throw new Error("Expected imported profile in fixture");
  return profile;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("project-controlled names rendered as HTML", () => {
  it("renders imported alias names and descriptions as inert text", async () => {
    const profile = decodeImportedProfile();
    const grid = document.createElement("div");
    grid.id = "aliasGrid";
    document.body.appendChild(grid);

    const ui = new AliasBrowserUI({
      eventBus: null,
      document,
      i18n: { t: (key) => key },
    });
    ui.cache.dataState = createDataCoordinatorState({
      currentProfile: "imported",
      currentProfileData: profile,
      profiles: { imported: profile },
    });

    await ui.render();

    const aliasItem = grid.querySelector(".alias-item");
    expect(aliasItem).not.toBeNull();
    expect(grid.querySelector("#injected-alias")).toBeNull();
    expect(aliasItem.hasAttribute("onmouseover")).toBe(false);
    expect(aliasItem.dataset.alias).toBe(aliasName);
    expect(aliasItem.getAttribute("title")).toBe(aliasDescription);
    expect(aliasItem.querySelector(".alias-name").textContent).toBe(aliasName);
  });

  it("keeps imported key labels inert while preserving plus-line breaks", () => {
    const profile = decodeImportedProfile();
    const keyItem = createKeyBrowserKeyElement(
      document,
      {
        t: (key) => (key === "command_singular" ? "command" : key),
      },
      keyName,
      profile.builds.space.keys[keyName],
      false,
    );
    const label = keyItem.querySelector(".key-label");

    expect(keyItem.querySelector("#injected-key")).toBeNull();
    expect(keyItem.dataset.key).toBe(keyName);
    expect(keyItem.title).toBe(`${keyName}: 1 command`);
    expect(label.textContent).toBe(keyName);
    expect(label.querySelectorAll("br")).toHaveLength(1);
  });

  it("keeps imported bindset names inert in every dropdown data attribute", () => {
    const profile = decodeImportedProfile();
    const ui = new BindsetSelectorUI({
      document,
      i18n: { t: (key) => key },
    });
    ui.cache.bindsetNames = [
      "Primary Bindset",
      ...Object.keys(profile.bindsets),
    ];
    ui.keyBindsetMembership = new Map([[bindsetName, true]]);

    const host = document.createElement("div");
    host.innerHTML = ui.generateDropdownMenuHTML();
    const option = [...host.querySelectorAll(".bindset-option")].find(
      (element) => element.dataset.bindset === bindsetName,
    );

    expect(option).toBeDefined();
    expect(host.querySelector("#injected-bindset")).toBeNull();
    expect(option.querySelector(".bindset-name").textContent).toBe(bindsetName);
    expect(option.querySelector(".add-key-btn").dataset.bindset).toBe(
      bindsetName,
    );
    expect(option.querySelector(".remove-key-btn").dataset.bindset).toBe(
      bindsetName,
    );
  });

  it("keeps imported bindset names inert in destructive confirmation text", () => {
    const profile = decodeImportedProfile();
    const importedName = Object.keys(profile.bindsets)[0];
    const ui = new BindsetDeleteConfirmUI({
      document,
      i18n: {
        t: (key, params) =>
          key === "bindset_delete_warning"
            ? `Delete ${params?.name} with ${params?.count} key`
            : key,
      },
    });

    const modal = ui.createModal(importedName, 1);

    expect(modal.querySelector("#injected-bindset")).toBeNull();
    expect(
      modal.querySelector(".bindset-delete-warning").textContent,
    ).toContain(importedName);
  });
});
