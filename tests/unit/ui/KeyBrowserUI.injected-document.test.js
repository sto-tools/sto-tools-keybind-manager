import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import KeyBrowserUI from "../../../src/js/components/ui/KeyBrowserUI.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

const keyBrowserMarkup = `
  <div class="key-selector-container">
    <button id="addKeyBtn"></button>
    <button id="deleteKeyBtn"></button>
    <button id="duplicateKeyBtn"></button>
    <button id="toggleKeyViewBtn"><i></i></button>
    <button id="keySearchBtn" aria-pressed="false"></button>
    <button id="showAllKeysBtn"></button>
    <input id="keyFilter">
    <div id="keyGrid">
      <button class="key-item" data-action="select-key" data-key="F7">
        <span class="key-label">F7</span>
      </button>
    </div>
  </div>
`;

describe("KeyBrowserUI injected document", () => {
  let fixture;
  let realm;
  let ui;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    realm?.window.close();
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("binds delegated, toolbar, and filter listeners only to the injected realm", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = keyBrowserMarkup;
    realm = new JSDOM(
      `<!doctype html><html><body>${keyBrowserMarkup}</body></html>`,
      { url: "https://injected.example" },
    );
    const injectedDocument = realm.window.document;
    const injectedGrid = injectedDocument.getElementById("keyGrid");
    const injectedFilter = injectedDocument.getElementById("keyFilter");
    const ambientFilter = document.getElementById("keyFilter");
    const modalManager = { show: vi.fn(), hide: vi.fn() };
    fixture = await createRealEventBusFixture();
    const onDom = vi.spyOn(fixture.eventBus, "onDom");
    const onDomDebounced = vi.spyOn(fixture.eventBus, "onDomDebounced");
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document: injectedDocument,
      i18n: { t: (key) => key },
      modalManager,
      bindsetDeleteConfirm: {
        confirm: vi.fn(async () => false),
        cancelActiveConfirmation: vi.fn(),
      },
    });
    const request = vi.spyOn(ui, "request").mockResolvedValue({
      success: true,
    });

    expect(injectedGrid).not.toBeInstanceOf(HTMLElement);
    expect(injectedFilter).not.toBeInstanceOf(HTMLInputElement);
    ui.init();

    expect(onDom).toHaveBeenCalledWith(
      injectedGrid,
      "click",
      expect.any(Function),
    );
    expect(onDom).toHaveBeenCalledWith(
      injectedDocument,
      "click",
      expect.any(Function),
    );
    expect(onDomDebounced).toHaveBeenCalledWith(
      injectedFilter,
      "input",
      expect.any(Function),
      250,
    );
    expect(onDom.mock.calls.some(([target]) => target === document)).toBe(
      false,
    );
    expect(
      onDomDebounced.mock.calls.some(([target]) => target === ambientFilter),
    ).toBe(false);

    document.getElementById("addKeyBtn").click();
    expect(modalManager.show).not.toHaveBeenCalled();
    injectedDocument.getElementById("addKeyBtn").click();
    expect(modalManager.show).toHaveBeenCalledExactlyOnceWith(
      "keySelectionModal",
    );

    document.getElementById("keySearchBtn").click();
    expect(ambientFilter.classList).not.toContain("expanded");
    injectedDocument.getElementById("keySearchBtn").click();
    expect(injectedFilter.classList).toContain("expanded");

    injectedFilter.value = "missing";
    injectedFilter.dispatchEvent(
      new realm.window.Event("input", { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(injectedGrid.querySelector('[data-key="F7"]').style.display).toBe(
      "none",
    );
    expect(document.querySelector('[data-key="F7"]').style.display).toBe("");

    const dataState = {};
    ui.cache.dataState = dataState;
    ui._committedGridContext = { dataState, environment: "ground" };
    document.querySelector(".key-label").click();
    expect(request).not.toHaveBeenCalled();
    injectedDocument.querySelector(".key-label").click();
    expect(request).toHaveBeenCalledExactlyOnceWith("key:select", {
      keyName: "F7",
      environment: "ground",
      bindset: null,
    });
  });
});
