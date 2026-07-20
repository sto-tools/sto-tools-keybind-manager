import { afterEach, describe, expect, it, vi } from "vitest";

import { STOError } from "../../../src/js/core/errors.js";
import {
  captureParameterFormDraft,
  createParameterModal,
  normalizeBooleanParameterInput,
  projectParameterPreview,
  readParameterFormValues,
  renderParameterModal,
} from "../../../src/js/components/ui/parameterCommandModalDom.js";

const translations = {
  add_command: "Add Command",
  cancel: "Cancel",
  configure_colon: "Configure:",
  edit_colon: "Edit:",
  generated_command: "Generated Command:",
  invalid_parameter_values: "Invalid parameter values",
  parameter_configuration: "Parameter Configuration",
  parameter_value: "Parameter value",
  save: "Save",
  stotrayexecbytray_description: "STOTrayExecByTray (shows key binding on UI)",
  trayexecbytray_description: "TrayExecByTray (no UI indication)",
  "verb.local": "Local",
  "verb.zone": "Zone",
  "command_definitions.raw_placeholder": "Enter any STO command",
  "command_parameters.count.label": "Count",
  "command_parameters.count.help": "How many times",
  direct_name: "Direct translated label",
};

/** @param {string} key */
function translate(key) {
  return translations[key] ?? "";
}

function commandDefinition() {
  return {
    name: 'Target <img id="command-name-probe">',
    parameters: {
      rawCommand: {
        type: "text",
        label: "Command:",
        help: "Raw command text",
        default: "Target_Enemy_Near",
        placeholder: "command_definitions.raw_placeholder",
      },
      count: {
        type: "number",
        default: 3,
        min: 0,
        max: 10,
        step: 0.5,
      },
      active: {
        type: "boolean",
        label: "Active",
        default: 2,
        min: 0,
        max: 1,
        step: 1,
      },
      verb: {
        type: "select",
        label: "Channel",
        help: "Chat channel",
        default: "zone",
        options: ["local", "zone"],
      },
      command_type: {
        type: "select",
        label: "Command type",
        help: "Execution mode",
        default: "STOTrayExecByTray",
        options: ["STOTrayExecByTray", "TrayExecByTray"],
      },
      fallback_name: {
        type: "text",
        default: '<svg id="default-value-probe">',
        placeholder: '<img id="placeholder-probe">',
      },
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("parameterCommandModalDom shell and rendering", () => {
  it("creates the exact translated detached modal shell without listeners", () => {
    const addListener = vi.spyOn(EventTarget.prototype, "addEventListener");
    const modal = createParameterModal({ document, translate });

    expect(modal.isConnected).toBe(false);
    expect(modal.id).toBe("parameterModal");
    expect(modal.className).toBe("modal");
    const content = modal.querySelector(":scope > .modal-content");
    expect(content).not.toBeNull();
    expect([...content.children].map((child) => child.className)).toEqual([
      "modal-header",
      "modal-body",
      "modal-footer",
    ]);
    expect(modal.querySelector(".modal-header")?.children).toHaveLength(2);
    expect(modal.querySelector(".modal-body")?.children).toHaveLength(2);
    expect(modal.querySelector(".modal-footer")?.children).toHaveLength(2);
    expect(modal.querySelector("#parameterModalTitle")?.textContent).toBe(
      "Parameter Configuration",
    );
    expect(
      modal.querySelector("#parameterModalTitle")?.getAttribute("data-i18n"),
    ).toBe("parameter_configuration");
    expect(
      modal.querySelector(".command-preview-modal label")?.textContent,
    ).toBe("Generated Command:");
    expect(modal.querySelector("#saveParameterCommandBtn")?.textContent).toBe(
      "Add Command",
    );
    expect(
      modal.querySelector(
        '.modal-close[data-modal="parameterModal"] .fa-times',
      ),
    ).not.toBeNull();
    expect(
      modal.querySelector('.btn-secondary[data-modal="parameterModal"]')
        ?.textContent,
    ).toBe("Cancel");
    expect(addListener).not.toHaveBeenCalled();
  });

  it("renders ordered controls with shipped defaults, attributes, and precedence", () => {
    const addListener = vi.spyOn(EventTarget.prototype, "addEventListener");
    const modal = createParameterModal({ document, translate });
    const { container, saveButton, preview } = renderParameterModal({
      document,
      modal,
      translate,
      commandDef: commandDefinition(),
      editing: false,
    });

    expect(container).toBe(modal.querySelector("#parameterInputs"));
    expect(saveButton).toBe(modal.querySelector("#saveParameterCommandBtn"));
    expect(preview).toBe(modal.querySelector("#parameterCommandPreview"));
    expect(modal.querySelector("#parameterModalTitle")?.textContent).toBe(
      'Configure: Target <img id="command-name-probe">',
    );
    expect(modal.querySelector("#command-name-probe")).toBeNull();
    expect(saveButton.textContent).toBe("Add Command");

    const groups = [...container.querySelectorAll(":scope > .form-group")];
    expect(groups).toHaveLength(6);
    expect(
      groups.map((group) => [...group.children].map((child) => child.tagName)),
    ).toEqual([
      ["LABEL", "INPUT", "SMALL"],
      ["LABEL", "INPUT", "SMALL"],
      ["LABEL", "INPUT", "SMALL"],
      ["LABEL", "SELECT", "SMALL"],
      ["LABEL", "SELECT", "SMALL"],
      ["LABEL", "INPUT", "SMALL"],
    ]);
    expect(
      groups.map((group) => {
        const label = /** @type {HTMLLabelElement} */ (
          group.querySelector("label")
        );
        const control = /** @type {HTMLInputElement | HTMLSelectElement} */ (
          group.querySelector("input, select")
        );
        return [label.htmlFor, control.id, control.name];
      }),
    ).toEqual([
      ["param_rawCommand", "param_rawCommand", "rawCommand"],
      ["param_count", "param_count", "count"],
      ["param_active", "param_active", "active"],
      ["param_verb", "param_verb", "verb"],
      ["param_command_type", "param_command_type", "command_type"],
      ["param_fallback_name", "param_fallback_name", "fallback_name"],
    ]);

    const raw = /** @type {HTMLInputElement} */ (
      modal.querySelector("#param_rawCommand")
    );
    expect(raw.type).toBe("text");
    expect(raw.name).toBe("rawCommand");
    expect(raw.value).toBe("Target_Enemy_Near");
    expect(raw.placeholder).toBe("Enter any STO command");
    expect(groups[0].querySelector("label")?.textContent).toBe("Command:");
    expect(groups[0].querySelector("small")?.textContent).toBe(
      "Raw command text",
    );

    const count = /** @type {HTMLInputElement} */ (
      modal.querySelector("#param_count")
    );
    expect(count.type).toBe("number");
    expect(count.value).toBe("3");
    expect([count.min, count.max, count.step]).toEqual(["0", "10", "0.5"]);
    expect(groups[1].querySelector("label")?.textContent).toBe("Count");
    expect(groups[1].querySelector("small")?.textContent).toBe(
      "How many times",
    );
    const active = /** @type {HTMLInputElement} */ (
      modal.querySelector("#param_active")
    );
    expect([
      active.type,
      active.value,
      active.min,
      active.max,
      active.step,
    ]).toEqual(["number", "2", "0", "1", "1"]);

    const verb = /** @type {HTMLSelectElement} */ (
      modal.querySelector("#param_verb")
    );
    expect(verb.value).toBe("zone");
    expect([...verb.options].map((option) => option.textContent)).toEqual([
      "Local",
      "Zone",
    ]);
    const commandType = /** @type {HTMLSelectElement} */ (
      modal.querySelector("#param_command_type")
    );
    expect(
      [...commandType.options].map((option) => option.textContent),
    ).toEqual([
      "STOTrayExecByTray (shows key binding on UI)",
      "TrayExecByTray (no UI indication)",
    ]);

    expect(groups[5].querySelector("label")?.textContent).toBe("Fallback Name");
    expect(groups[5].querySelector("small")?.textContent).toBe(
      "Parameter value",
    );
    const fallback = /** @type {HTMLInputElement} */ (
      modal.querySelector("#param_fallback_name")
    );
    expect(fallback.value).toBe('<svg id="default-value-probe">');
    expect(fallback.placeholder).toBe('<img id="placeholder-probe">');
    expect(modal.querySelector("svg")).toBeNull();
    expect(modal.querySelector("img")).toBeNull();
    expect(addListener).not.toHaveBeenCalled();
  });

  it("uses the direct parameter-name translation before formatted fallback", () => {
    const modal = createParameterModal({ document, translate });
    renderParameterModal({
      document,
      modal,
      translate,
      commandDef: {
        name: "Direct label",
        parameters: { direct_name: { type: "text" } },
      },
      editing: false,
    });

    expect(
      modal.querySelector("label[for='param_direct_name']")?.textContent,
    ).toBe("Direct translated label");
  });

  it("constructs and renders exclusively in an injected document realm", () => {
    const injectedDocument = document.implementation.createHTMLDocument(
      "parameter-modal-test",
    );
    const modal = createParameterModal({
      document: injectedDocument,
      translate,
    });
    renderParameterModal({
      document: injectedDocument,
      modal,
      translate,
      commandDef: commandDefinition(),
      editing: false,
    });

    expect(modal.ownerDocument).toBe(injectedDocument);
    expect(
      [...modal.querySelectorAll("*")].every(
        (element) => element.ownerDocument === injectedDocument,
      ),
    ).toBe(true);
    expect(document.getElementById("parameterModal")).toBeNull();
  });

  it("restores exact edit drafts and updates translated edit chrome", () => {
    const modal = createParameterModal({ document, translate });
    renderParameterModal({
      document,
      modal,
      translate,
      commandDef: commandDefinition(),
      editing: true,
      draft: {
        rawCommand: "",
        count: 0,
        active: 0,
        verb: "local",
        command_type: "TrayExecByTray",
      },
    });

    expect(modal.querySelector("#parameterModalTitle")?.textContent).toBe(
      'Edit: Target <img id="command-name-probe">',
    );
    expect(modal.querySelector("#saveParameterCommandBtn")?.textContent).toBe(
      "Save",
    );
    expect(
      /** @type {HTMLInputElement} */ (modal.querySelector("#param_rawCommand"))
        .value,
    ).toBe("");
    expect(
      /** @type {HTMLInputElement} */ (modal.querySelector("#param_count"))
        .value,
    ).toBe("0");
    expect(
      /** @type {HTMLInputElement} */ (modal.querySelector("#param_active"))
        .value,
    ).toBe("0");
    expect(
      /** @type {HTMLSelectElement} */ (modal.querySelector("#param_verb"))
        .value,
    ).toBe("local");
    expect(
      /** @type {HTMLSelectElement} */ (
        modal.querySelector("#param_command_type")
      ).value,
    ).toBe("TrayExecByTray");
  });
});

describe("parameterCommandModalDom form and preview projections", () => {
  function render(draft = {}) {
    const modal = createParameterModal({ document, translate });
    renderParameterModal({
      document,
      modal,
      translate,
      commandDef: commandDefinition(),
      editing: false,
      draft,
    });
    return modal;
  }

  it("captures string drafts and reads typed parameter values", () => {
    const modal = render({
      rawCommand: "CamReset",
      count: "4.5",
      active: "-3",
      verb: "local",
      command_type: "TrayExecByTray",
      fallback_name: "kept",
    });

    expect(captureParameterFormDraft(modal)).toEqual({
      rawCommand: "CamReset",
      count: "4.5",
      active: "-3",
      verb: "local",
      command_type: "TrayExecByTray",
      fallback_name: "kept",
    });
    expect(readParameterFormValues(modal, commandDefinition())).toEqual({
      rawCommand: "CamReset",
      count: 4.5,
      active: 1,
      verb: "local",
      command_type: "TrayExecByTray",
      fallback_name: "kept",
    });
  });

  it("retains empty numeric values and ignores unnamed controls", () => {
    const modal = render({ count: "", active: "" });
    const unnamed = document.createElement("input");
    unnamed.value = "ignored";
    modal.querySelector("#parameterInputs")?.appendChild(unnamed);

    expect(readParameterFormValues(modal, commandDefinition())).toMatchObject({
      count: undefined,
      active: undefined,
    });
    expect(Object.keys(captureParameterFormDraft(modal))).not.toContain("");
  });

  it("surfaces the parser error contract for malformed numeric controls", () => {
    const modal = render();
    const count = /** @type {HTMLInputElement} */ (
      modal.querySelector("#param_count")
    );
    Object.defineProperty(count, "value", {
      configurable: true,
      value: "not-a-number",
    });

    expect(() => readParameterFormValues(modal, commandDefinition())).toThrow(
      STOError,
    );
    expect(() => readParameterFormValues(modal, commandDefinition())).toThrow(
      "Invalid number for count: 'not-a-number' is not a valid number",
    );
  });

  it("normalizes only boolean inputs and leaves malformed text available for validation", () => {
    const modal = render();
    const active = /** @type {HTMLInputElement} */ (
      modal.querySelector("#param_active")
    );
    const count = /** @type {HTMLInputElement} */ (
      modal.querySelector("#param_count")
    );

    active.value = "2";
    expect(normalizeBooleanParameterInput(active, commandDefinition())).toBe(
      true,
    );
    expect(active.value).toBe("1");
    active.value = "0";
    normalizeBooleanParameterInput(active, commandDefinition());
    expect(active.value).toBe("0");
    Object.defineProperty(active, "value", {
      configurable: true,
      value: "invalid",
      writable: true,
    });
    normalizeBooleanParameterInput(active, commandDefinition());
    expect(active.value).toBe("invalid");

    count.value = "8";
    expect(normalizeBooleanParameterInput(count, commandDefinition())).toBe(
      false,
    );
    expect(count.value).toBe("8");
    expect(normalizeBooleanParameterInput(null, commandDefinition())).toBe(
      false,
    );
  });

  it("projects inert preview text with explicit and omitted color policy", () => {
    const modal = render();
    const preview = /** @type {HTMLDivElement} */ (
      modal.querySelector("#parameterCommandPreview")
    );

    expect(
      projectParameterPreview(modal, {
        text: '<img id="preview-probe">',
        error: true,
      }),
    ).toBe(true);
    expect(preview.textContent).toBe('<img id="preview-probe">');
    expect(preview.querySelector("img")).toBeNull();
    expect(preview.style.color).toBe("rgb(214, 48, 49)");

    projectParameterPreview(modal, { text: "Expected raw-command error" });
    expect(preview.style.color).toBe("rgb(214, 48, 49)");
    projectParameterPreview(modal, { text: "Built", error: false });
    expect(preview.style.color).toBe("");

    preview.remove();
    expect(
      projectParameterPreview(modal, { text: "Missing", error: true }),
    ).toBe(false);
  });
});
