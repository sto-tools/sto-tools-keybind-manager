import { afterEach, beforeEach, describe, expect, it } from "vitest";

import KeyCaptureUI from "../../../src/js/components/ui/KeyCaptureUI.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("KeyCaptureUI modifier toggle behavior", () => {
  let fixture;
  let ui;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="keyPreviewDisplay"></div>
      <button data-key-code="ShiftLeft" class="vkey"></button>
      <button data-key-code="ShiftRight" class="vkey"></button>
      <input id="distinguishModifierSide" type="checkbox" />
      <button id="confirm-key-selection" disabled></button>
    `;
    fixture = createServiceFixture();
    ui = new KeyCaptureUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key, language: "en" },
    });
    ui.init();
    ui.session.begin();
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
  });

  it("keeps the session chord visible when a modifier is toggled on and off", () => {
    expect(ui.selectKey("G")).toBe(true);
    const preview = document.getElementById("keyPreviewDisplay");
    expect(preview?.textContent).toContain("G");

    ui.toggleVirtualModifier("ShiftLeft");
    ui.toggleVirtualModifier("ShiftLeft");

    expect(ui.session.selectedChord).toBe("G");
    expect(preview?.textContent).toContain("G");
    expect(preview?.textContent).not.toContain("no_key_selected");
  });
});
