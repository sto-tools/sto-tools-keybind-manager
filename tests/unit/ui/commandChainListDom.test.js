import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import {
  createCommandChainRow,
  createCommandGroupSeparator,
} from "../../../src/js/components/ui/commandChainListDom.js";

function createRowView(overrides = {}) {
  return {
    index: 2,
    renderToken: "11",
    groupType: "palindromic",
    number: "1",
    displayName: "Displayed command",
    displayIcon: "⚡",
    commandType: "tray",
    commandTypeClass: "tray",
    customizable: true,
    parameterTitle: "Translated parameters",
    warning: { key: "warning_key", text: "Translated warning" },
    actions: [
      {
        kind: "edit",
        title: "Translated edit",
        iconClass: "fas fa-edit",
      },
      {
        kind: "delete",
        title: "Translated delete",
        iconClass: "fas fa-times",
        danger: true,
      },
      {
        kind: "toggle-palindromic",
        title: "Translated toggle",
        iconClass: "fas fa-balance-scale",
        active: true,
        commandIndex: 2,
        dataAction: "commandchain-palindromic-toggle",
      },
      {
        kind: "move-up",
        title: "Translated up",
        iconClass: "fas fa-chevron-up",
        disabled: true,
      },
      {
        kind: "move-down",
        title: "Translated down",
        iconClass: "fas fa-chevron-down",
      },
    ],
    ...overrides,
  };
}

describe("command-chain inert list DOM", () => {
  it("builds a translated group button without parsing dynamic copy", () => {
    const title = '<img src=x onerror="globalThis.compromised=true">';
    const hint = "<b>hint</b>";
    const separator = createCommandGroupSeparator(document, {
      groupType: "pivot",
      title,
      hint,
      count: 2,
      collapsed: true,
      renderToken: "7",
    });
    const header = separator.querySelector(".group-header");

    expect(separator.dataset.group).toBe("pivot");
    expect(header).toBeInstanceOf(HTMLButtonElement);
    expect(header.type).toBe("button");
    expect(header.dataset.renderToken).toBe("7");
    expect(header.dataset.action).toBe("commandchain-group-header");
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(header.querySelector(".group-title").textContent).toBe(title);
    expect(header.querySelector(".group-hint").textContent).toBe(hint);
    expect(header.querySelector(".group-count").textContent).toBe("(2)");
    expect(separator.querySelector("img, b")).toBeNull();
  });

  it("materializes exact datasets, translated actions, and accessibility state", () => {
    const row = createCommandChainRow(document, createRowView());
    const buttons = [...row.querySelectorAll(".command-action-btn")];

    expect(row.dataset).toMatchObject({
      index: "2",
      renderToken: "11",
      group: "palindromic",
      parameters: "true",
    });
    expect(row.draggable).toBe(true);
    expect(row.classList.contains("customizable")).toBe(true);
    expect(row.querySelector(".command-number").textContent).toBe("1");
    expect(row.querySelector(".command-icon").textContent).toBe("⚡");
    expect(row.querySelector(".command-text").childNodes[0].textContent).toBe(
      "Displayed command",
    );
    expect(row.querySelector(".param-indicator").title).toBe(
      "Translated parameters",
    );
    expect(row.querySelector(".command-warning-icon").title).toBe(
      "Translated warning",
    );
    expect(row.querySelector(".command-type").classList.contains("tray")).toBe(
      true,
    );
    expect(buttons.map(({ title }) => title)).toEqual([
      "Translated edit",
      "Translated delete",
      "Translated toggle",
      "Translated up",
      "Translated down",
    ]);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(
      buttons.map(({ title }) => title),
    );
    expect(row.querySelector(".btn-delete").classList).toContain(
      "command-action-btn-danger",
    );
    expect(row.querySelector(".btn-palindromic-toggle").dataset).toMatchObject({
      commandIndex: "2",
      action: "commandchain-palindromic-toggle",
    });
    expect(
      row.querySelector(".btn-palindromic-toggle").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(row.querySelector(".btn-up").disabled).toBe(true);
    expect(row.querySelector(".btn-down").disabled).toBe(false);
  });

  it("keeps parser, catalog, and translation-shaped HTML inert", () => {
    const row = createCommandChainRow(
      document,
      createRowView({
        displayName: '<img src=x onerror="globalThis.nameHit=true">',
        displayIcon: "<b>icon</b>",
        commandType: '<svg onload="globalThis.typeHit=true">',
        commandTypeClass: null,
        parameterTitle: 'Parameters" onmouseover="globalThis.paramHit=true',
        warning: {
          key: "warning_key",
          text: 'Warning" onmouseover="globalThis.warningHit=true',
        },
      }),
    );

    expect(row.querySelector("img, b, svg")).toBeNull();
    expect(row.querySelector(".command-text").textContent).toContain(
      '<img src=x onerror="globalThis.nameHit=true">',
    );
    expect(row.querySelector(".command-icon").textContent).toBe("<b>icon</b>");
    expect(row.querySelector(".command-type").textContent).toBe(
      '<svg onload="globalThis.typeHit=true">',
    );
    expect(row.querySelector("[onerror], [onload], [onmouseover]")).toBeNull();
  });

  it("uses only the injected document realm and preserves edit placeholders", () => {
    const foreignDom = new JSDOM("<!doctype html><body></body>");
    const foreignDocument = foreignDom.window.document;
    const row = createCommandChainRow(
      foreignDocument,
      createRowView({
        customizable: false,
        parameterTitle: "",
        warning: null,
        actions: [
          {
            kind: "edit",
            title: "",
            iconClass: "fas fa-edit",
            disabled: true,
            placeholder: true,
          },
        ],
      }),
    );
    const edit = row.querySelector(".btn-edit");

    expect(row.ownerDocument).toBe(foreignDocument);
    expect(edit.disabled).toBe(true);
    expect(edit.classList.contains("btn-placeholder")).toBe(true);
    expect(edit.getAttribute("aria-hidden")).toBe("true");
    expect(edit.style.visibility).toBe("hidden");
    expect(row.querySelector(".param-indicator")).toBeNull();
    foreignDom.window.close();
  });
});
