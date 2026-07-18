import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildKeyCaptureBindsetPickerHtml,
  buildKeyCaptureModalHtml,
  projectKeyCaptureConfirmEnabled,
  projectKeyCapturePreview,
  projectKeyCaptureState,
  renderKeyCaptureModal,
  syncKeyCaptureSelect,
} from "../../../src/js/components/ui/keyCaptureModalDom.js";

const translate = (key) => `t:${key}`;

describe("keyCaptureModalDom", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="keySelectionModal">
        <div class="modal-body"></div>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("builds the translated modal shell from explicit state", () => {
    const html = buildKeyCaptureModalHtml({
      translate,
      showBindsetPicker: true,
      bindsetNames: ["Primary Bindset", "Ground"],
      targetBindset: "Ground",
    });

    expect(html).toContain('data-i18n="press_any_key_combination"');
    expect(html).toContain("t:press_any_key_combination");
    expect(html).toContain('id="keyboardLayoutSelector"');
    expect(html).toContain('value="de">QWERTZ (German)');
    expect(html).toContain('<option value="Ground" selected>Ground</option>');
    expect(html).toContain('id="confirm-key-selection" disabled');
  });

  it("omits the bindset picker when the controller disables it", () => {
    expect(
      buildKeyCaptureBindsetPickerHtml({
        translate,
        showBindsetPicker: false,
        bindsetNames: ["Primary Bindset"],
        targetBindset: "Primary Bindset",
      }),
    ).toBe("");
  });

  it("falls back to Primary Bindset and escapes profile-owned names", () => {
    const fallback = buildKeyCaptureBindsetPickerHtml({
      translate,
      showBindsetPicker: true,
      bindsetNames: [],
      targetBindset: "Primary Bindset",
    });
    expect(fallback).toContain(
      '<option value="Primary Bindset" selected>Primary Bindset</option>',
    );

    const unsafe = '<img src=x onerror="alert(1)">';
    const escaped = buildKeyCaptureBindsetPickerHtml({
      translate,
      showBindsetPicker: true,
      bindsetNames: [unsafe],
      targetBindset: unsafe,
    });
    expect(escaped).not.toContain("<img");
    expect(escaped).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("renders into the modal body and reports an absent target", () => {
    expect(
      renderKeyCaptureModal({
        document,
        translate,
        showBindsetPicker: false,
        bindsetNames: [],
        targetBindset: "Primary Bindset",
      }),
    ).toBe(true);
    expect(document.querySelector(".hybrid-key-capture")).not.toBeNull();

    document.getElementById("keySelectionModal").remove();
    expect(
      renderKeyCaptureModal({
        document,
        translate,
        showBindsetPicker: false,
        bindsetNames: [],
        targetBindset: "Primary Bindset",
      }),
    ).toBe(false);
  });

  it("projects capture state without retaining controller state", () => {
    renderKeyCaptureModal({
      document,
      translate,
      showBindsetPicker: false,
      bindsetNames: [],
      targetBindset: "Primary Bindset",
    });

    projectKeyCaptureState(document, translate, true);
    expect(document.getElementById("captureIndicator").classList).toContain(
      "active",
    );
    expect(document.getElementById("virtualKeyboard").classList).toContain(
      "disabled",
    );
    expect(document.getElementById("toggleCaptureMode").textContent).toBe(
      "t:switch_to_manual",
    );
    expect(
      document.getElementById("toggleCaptureMode").getAttribute("data-i18n"),
    ).toBe("switch_to_manual");

    projectKeyCaptureState(document, translate, false);
    expect(document.getElementById("captureIndicator").classList).not.toContain(
      "active",
    );
    expect(document.getElementById("virtualKeyboard").classList).not.toContain(
      "disabled",
    );
    expect(document.getElementById("toggleCaptureMode").textContent).toBe(
      "t:start_capture",
    );
    expect(
      document.getElementById("toggleCaptureMode").getAttribute("data-i18n"),
    ).toBe("start_capture");
  });

  it("materializes chord parts as text instead of interpreting captured markup", () => {
    renderKeyCaptureModal({
      document,
      translate,
      showBindsetPicker: false,
      bindsetNames: [],
      targetBindset: "Primary Bindset",
    });

    projectKeyCapturePreview(document, translate, "Ctrl+<img src=x>");

    const preview = document.getElementById("keyPreviewDisplay");
    expect(preview.querySelector("img")).toBeNull();
    expect(
      [...preview.querySelectorAll("kbd")].map((node) => node.textContent),
    ).toEqual(["Ctrl", "<img src=x>"]);
    expect(preview.querySelector(".plus")?.textContent).toBe("+");
  });

  it("restores the translated empty preview", () => {
    renderKeyCaptureModal({
      document,
      translate,
      showBindsetPicker: false,
      bindsetNames: [],
      targetBindset: "Primary Bindset",
    });
    projectKeyCapturePreview(document, translate, "F7");
    projectKeyCapturePreview(document, translate, "");

    const empty = document.querySelector("#keyPreviewDisplay .no-selection");
    expect(empty?.dataset.i18n).toBe("no_key_selected");
    expect(empty?.textContent).toBe("t:no_key_selected");
  });

  it("projects confirm and selector values when their targets exist", () => {
    renderKeyCaptureModal({
      document,
      translate,
      showBindsetPicker: true,
      bindsetNames: ["Primary Bindset", "Ground"],
      targetBindset: "Primary Bindset",
    });

    projectKeyCaptureConfirmEnabled(document, true);
    syncKeyCaptureSelect(document, "keyboardLayoutSelector", "fr");
    syncKeyCaptureSelect(document, "bindsetTargetSelector", "Ground");

    expect(document.getElementById("confirm-key-selection").disabled).toBe(
      false,
    );
    expect(document.getElementById("keyboardLayoutSelector").value).toBe("fr");
    expect(document.getElementById("bindsetTargetSelector").value).toBe(
      "Ground",
    );

    expect(() => {
      projectKeyCaptureConfirmEnabled(document, false);
      syncKeyCaptureSelect(document, "missing", "value");
    }).not.toThrow();
    expect(document.getElementById("confirm-key-selection").disabled).toBe(
      true,
    );
  });
});
