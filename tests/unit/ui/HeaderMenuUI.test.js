import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";
import HeaderMenuUI from "../../../src/js/components/ui/HeaderMenuUI.js";

function createDomFixture() {
  // Set up a minimal DOM structure similar to real header menus
  const container = document.createElement("div");
  container.innerHTML = `
    <div class="dropdown" id="settingsDropdown">
      <button id="settingsBtn">Settings</button>
    </div>
    <div class="dropdown" id="importDropdown">
      <button id="importMenuBtn">Import</button>
    </div>
    <div class="dropdown" id="languageDropdown">
      <button id="languageMenuBtn">Language</button>
      <button data-lang="en">EN</button>
      <button data-lang="de">DE</button>
    </div>
    <button id="fileExplorerBtn">Explorer</button>
    <button id="resetAppBtn">Reset</button>`;
  document.body.appendChild(container);
  return {
    container,
    cleanup: () => container.remove(),
  };
}

describe("HeaderMenuUI", () => {
  let fixture, eventBusFixture, ui, dom;

  beforeEach(() => {
    // DOM & eventBus
    dom = createDomFixture();
    fixture = createServiceFixture();

    // Create EventBus fixture with custom onDom mock that simulates real behavior
    eventBusFixture = createEventBusFixture({
      trackEvents: true,
      mockEmit: false,
    });

    // Mock onDom to attach the local handler with real delegation semantics.
    eventBusFixture.eventBus.onDom = vi.fn((target, event, handler) => {
      // Handle string selector (delegated)
      if (typeof target === "string") {
        // Normalize selector like real EventBus - handle attribute selectors
        const finalSelector = /^[.#]/.test(target)
          ? target
          : /^\[/.test(target)
            ? target
            : `#${target}`;

        // Add actual DOM listener
        const domHandler = (e) => {
          const match = e.target.closest(finalSelector);
          if (match) {
            try {
              handler(e);
            } catch (error) {
              console.error(error);
            }
          }
        };

        document.addEventListener(event, domHandler, true);

        return () => {
          document.removeEventListener(event, domHandler, true);
        };
      }

      // Handle direct element/document reference
      if (target && target.addEventListener) {
        const domHandler = (e) => {
          try {
            handler(e);
          } catch (error) {
            console.error(error);
          }
        };

        target.addEventListener(event, domHandler);

        return () => {
          target.removeEventListener(event, domHandler);
        };
      }

      return () => {};
    });

    ui = new HeaderMenuUI({ eventBus: eventBusFixture.eventBus, document });
    ui.init();
  });

  afterEach(() => {
    ui.destroy();
    dom.cleanup();
    fixture.destroy();
    eventBusFixture.destroy();
  });

  it("should toggle dropdown active state", () => {
    const settingsDropdown = document.getElementById("settingsDropdown");

    expect(settingsDropdown.classList.contains("active")).toBe(false);
    ui.toggleSettingsMenu();
    expect(settingsDropdown.classList.contains("active")).toBe(true);
    ui.toggleSettingsMenu();
    expect(settingsDropdown.classList.contains("active")).toBe(false);
  });

  it("should ensure only one dropdown is active at a time", () => {
    const settingsDropdown = document.getElementById("settingsDropdown");
    const importDropdown = document.getElementById("importDropdown");

    ui.toggleSettingsMenu();
    expect(settingsDropdown.classList.contains("active")).toBe(true);
    expect(importDropdown.classList.contains("active")).toBe(false);

    ui.toggleImportMenu();
    expect(importDropdown.classList.contains("active")).toBe(true);
    expect(settingsDropdown.classList.contains("active")).toBe(false);
  });

  it("should emit language:change event when language button clicked", () => {
    const deBtn = document.querySelector('[data-lang="de"]');
    deBtn.click();

    eventBusFixture.expectEventCount("language:change", 1);
    eventBusFixture.expectEvent("language:change", { language: "de" });

    // Verify onDom was called exactly once for [data-lang] during init
    const langOnDomCalls = eventBusFixture.eventBus.onDom.mock.calls.filter(
      (call) => call[0] === "[data-lang]",
    ).length;
    expect(langOnDomCalls).toBe(1); // Should be called once during component init
  });

  it("routes Explorer through its canonical event without the retired export action", () => {
    document.getElementById("fileExplorerBtn").click();

    eventBusFixture.expectEventCount("file-explorer:open", 1);
    expect(
      eventBusFixture.eventBus.onDom.mock.calls.filter(
        ([target]) => target === "exportKeybindsBtn",
      ),
    ).toHaveLength(0);
  });

  it("restores exactly one Explorer emitter across reinit and replacement", () => {
    const explorerButton = document.getElementById("fileExplorerBtn");

    explorerButton.click();
    eventBusFixture.expectEventCount("file-explorer:open", 1);

    ui.destroy();
    explorerButton.click();
    eventBusFixture.expectEventCount("file-explorer:open", 1);

    ui.init();
    explorerButton.click();
    eventBusFixture.expectEventCount("file-explorer:open", 2);

    ui.destroy();
    const replacement = new HeaderMenuUI({
      eventBus: eventBusFixture.eventBus,
      document,
    });
    replacement.init();
    ui = replacement;

    explorerButton.click();
    eventBusFixture.expectEventCount("file-explorer:open", 3);
  });

  it("awaits the reset action without a timeout and shows success only after acknowledgement", async () => {
    const confirmDialog = {
      confirm: vi.fn().mockResolvedValue(true),
    };
    ui.destroy();
    ui = new HeaderMenuUI({
      eventBus: eventBusFixture.eventBus,
      document,
      confirmDialog,
      i18n: { t: (key) => key },
    });
    ui.init();
    const request = vi
      .spyOn(ui, "request")
      .mockResolvedValue({ success: true, receipt: {} });
    const toast = vi.spyOn(ui, "showToast");

    await ui.confirmResetApp();

    expect(confirmDialog.confirm).toHaveBeenCalledWith(
      "confirm_reset_application",
      "confirm_reset_app",
      "danger",
      "resetApplication",
    );
    expect(request).toHaveBeenCalledWith("application:reset", {}, 0);
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      "application_reset_successfully",
      "success",
    );
    eventBusFixture.expectEventCount("app:reset-confirmed", 0);
  });

  it.each([
    ["declined confirmation", false, { success: true }],
    ["structured reset failure", true, { success: false }],
  ])("shows no reset toast for %s", async (_label, confirmed, result) => {
    const confirmDialog = {
      confirm: vi.fn().mockResolvedValue(confirmed),
    };
    ui.destroy();
    ui = new HeaderMenuUI({
      eventBus: eventBusFixture.eventBus,
      document,
      confirmDialog,
      i18n: { t: (key) => key },
    });
    ui.init();
    const request = vi.spyOn(ui, "request").mockResolvedValue(result);
    const toast = vi.spyOn(ui, "showToast");

    await ui.confirmResetApp();

    expect(request).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    expect(toast).not.toHaveBeenCalled();
  });

  it("does not request or toast when a pending confirmation outlives the UI", async () => {
    let resolveConfirmation = () => {};
    const confirmation = new Promise((resolve) => {
      resolveConfirmation = resolve;
    });
    const confirmDialog = { confirm: vi.fn(() => confirmation) };
    ui.destroy();
    ui = new HeaderMenuUI({
      eventBus: eventBusFixture.eventBus,
      document,
      confirmDialog,
      i18n: { t: (key) => key },
    });
    ui.init();
    const request = vi.spyOn(ui, "request");
    const toast = vi.spyOn(ui, "showToast");

    const pending = ui.confirmResetApp();
    ui.destroy();
    resolveConfirmation(true);
    await pending;

    expect(request).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
