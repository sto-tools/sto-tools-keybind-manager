import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KeyCaptureUI from "../../../src/js/components/ui/KeyCaptureUI.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("KeyCaptureUI unsafe key detection", () => {
  let fixture;
  let ui;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="keyPreviewDisplay"></div>
      <button id="confirm-key-selection"></button>
    `;
    fixture = createServiceFixture();
    ui = new KeyCaptureUI({
      eventBus: fixture.eventBus,
      document,
      i18n: {
        language: "en",
        t: (key, params = {}) => `${key}:${params.key || ""}`,
      },
    });
    ui.init();
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("keeps exact case-insensitive unsafe detection", () => {
    expect(ui.isUnsafeChord("Alt+F4")).toBe(true);
    expect(ui.isUnsafeChord("lalt+f4")).toBe(true);
    expect(ui.isUnsafeChord("Ctrl+A")).toBe(false);
  });

  it("rejects an unsafe chord without advancing the modal draft", () => {
    ui.session.begin();
    const toast = vi.spyOn(ui, "showToast");

    expect(ui.selectKey("Alt+F4")).toBe(false);

    expect(ui.session.selectedChord).toBeNull();
    expect(toast).toHaveBeenCalledWith("unsafe_keybind:Alt+F4", "error");
    expect(document.getElementById("keyPreviewDisplay")?.textContent).toContain(
      "no_key_selected:",
    );
    expect(document.getElementById("confirm-key-selection")?.disabled).toBe(
      true,
    );
  });
});
