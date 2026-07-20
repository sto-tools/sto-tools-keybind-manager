import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";
import VFXManagerUI from "../../../src/js/components/ui/VFXManagerUI.js";

const vfxEffectsFixture = {
  space: [
    { effect: "shield_bubble", label: "Shield Bubble" },
    { effect: "engine_glow", label: "Engine Glow" },
  ],
  ground: [
    { effect: "ground_sparkles", label: "Ground Sparkles" },
    { effect: "footprint_glow", label: "Footprint Glow" },
  ],
};

function createDomFixture() {
  // Set up a minimal DOM structure with VFX modal elements
  const container = document.createElement("div");
  container.innerHTML = `
    <div id="vertigoModal" class="modal">
      <div class="space-effects">
        <div id="spaceEffectsList"></div>
        <button id="spaceSelectAll">Select All Space</button>
        <button id="spaceClearAll">Clear All Space</button>
        <div id="spaceEffectCount">0</div>
        <div id="spaceAliasCommand">No space effects selected</div>
      </div>
      <div class="ground-effects">
        <div id="groundEffectsList"></div>
        <button id="groundSelectAll">Select All Ground</button>
        <button id="groundClearAll">Clear All Ground</button>
        <div id="groundEffectCount">0</div>
        <div id="groundAliasCommand">No ground effects selected</div>
      </div>
      <div class="playersay-settings">
        <input type="checkbox" id="vertigoShowPlayerSay">
      </div>
      <button id="saveVertigoBtn">Save</button>
    </div>
  `;
  document.body.appendChild(container);

  return {
    container,
    cleanup: () => {
      container.remove();
    },
  };
}

function createMockVFXManager() {
  return {
    selectedEffects: {
      space: new Set(),
      ground: new Set(),
    },
    showPlayerSay: false,

    isEffectSelected(environment, effect) {
      return this.selectedEffects[environment].has(effect);
    },

    toggleEffect(environment, effect) {
      if (this.isEffectSelected(environment, effect)) {
        this.selectedEffects[environment].delete(effect);
      } else {
        this.selectedEffects[environment].add(effect);
      }
    },

    selectAllEffects(environment) {
      vfxEffectsFixture[environment].forEach((effect) => {
        this.selectedEffects[environment].add(effect.effect);
      });
    },

    getEffectCount(environment) {
      return this.selectedEffects[environment].size;
    },

    generateAlias(environment) {
      const effects = Array.from(this.selectedEffects[environment]);
      if (effects.length === 0) return null;
      return `alias_${environment}_${effects.join("_")}`;
    },
  };
}

describe("VFXManagerUI", () => {
  let fixture, eventBusFixture, vfxManagerUI, dom, mockVFXManager, modalManager;

  beforeEach(() => {
    // DOM & eventBus
    dom = createDomFixture();
    fixture = createServiceFixture();
    mockVFXManager = createMockVFXManager();

    // Create EventBus fixture with custom onDom mock that simulates real behavior
    eventBusFixture = createEventBusFixture({
      trackEvents: true,
      mockEmit: false,
    });

    // Mock onDom to attach the local handler with real delegation semantics.
    eventBusFixture.eventBus.onDom = vi.fn((selector, event, handler) => {
      // Normalize selector like real EventBus - handle attribute selectors
      const finalSelector = /^[.#]/.test(selector)
        ? selector
        : /^\[/.test(selector)
          ? selector
          : `#${selector}`;

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

      return function detach() {
        document.removeEventListener(event, domHandler, true);
      };
    });

    modalManager = {
      show: vi.fn(),
      hide: vi.fn(),
      registerRegenerateCallback: vi.fn(),
      unregisterRegenerateCallback: vi.fn(),
    };
    vfxManagerUI = new VFXManagerUI({
      eventBus: eventBusFixture.eventBus,
      modalManager,
      i18n: { t: vi.fn((key) => key) },
      vfxEffects: vfxEffectsFixture,
    });
  });

  afterEach(() => {
    vfxManagerUI.destroy();
    dom.cleanup();
    fixture.destroy();
    eventBusFixture.destroy();
  });

  it("should initialize without errors", () => {
    expect(() => vfxManagerUI.init()).not.toThrow();
    expect(vfxManagerUI.domListenersSetup).toBe(true);
    // Verify DOM event listeners are tracked for automatic cleanup
    expect(vfxManagerUI.domEventListeners).toHaveLength(7); // 2 checkboxes + 4 buttons + 1 save button
    expect(modalManager.registerRegenerateCallback).toHaveBeenCalledWith(
      "vertigoModal",
      vfxManagerUI.regenerateModal,
    );
  });

  it("should set up eventBus.onDom listeners for checkboxes exactly once", () => {
    vfxManagerUI.init();

    // Verify onDom was called exactly once for effect checkboxes
    const effectCheckboxCalls =
      eventBusFixture.eventBus.onDom.mock.calls.filter(
        (call) => call[0] === ".effect-checkbox",
      ).length;
    expect(effectCheckboxCalls).toBe(1);

    // Verify onDom was called exactly once for PlayerSay checkbox
    const playerSayCalls = eventBusFixture.eventBus.onDom.mock.calls.filter(
      (call) => call[0] === "#vertigoShowPlayerSay",
    ).length;
    expect(playerSayCalls).toBe(1);
  });

  it("should not create duplicate listeners on multiple init calls", () => {
    vfxManagerUI.init();
    vfxManagerUI.init(); // Second init call
    vfxManagerUI.init(); // Third init call

    // Should still have exactly 7 detach functions (one per listener type)
    expect(vfxManagerUI.domEventListeners).toHaveLength(7);

    // onDom should be called exactly once per selector type
    const effectCheckboxCalls =
      eventBusFixture.eventBus.onDom.mock.calls.filter(
        (call) => call[0] === ".effect-checkbox",
      ).length;
    expect(effectCheckboxCalls).toBe(1);
  });

  it("should handle effect checkbox changes correctly", () => {
    vfxManagerUI.init();

    // Mock the vfxManager
    vfxManagerUI.vfxManager = mockVFXManager;

    // Simulate modal population to create checkboxes
    vfxManagerUI.handleModalPopulate({ vfxManager: mockVFXManager });

    // Find and click an effect checkbox
    const effectCheckbox = document.querySelector(
      '.effect-checkbox[data-environment="space"][data-effect="shield_bubble"]',
    );
    expect(effectCheckbox).toBeTruthy();

    effectCheckbox.checked = true;
    effectCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    // Verify effect was toggled
    expect(mockVFXManager.selectedEffects.space.size).toBe(1);
    expect(mockVFXManager.isEffectSelected("space", "shield_bubble")).toBe(
      true,
    );
  });

  it("should handle PlayerSay checkbox changes correctly", () => {
    vfxManagerUI.init();

    // Mock the vfxManager
    vfxManagerUI.vfxManager = mockVFXManager;

    // Find and click PlayerSay checkbox
    const playerSayCheckbox = document.getElementById("vertigoShowPlayerSay");
    expect(playerSayCheckbox).toBeTruthy();

    playerSayCheckbox.checked = true;
    playerSayCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    // Verify PlayerSay setting was updated
    expect(mockVFXManager.showPlayerSay).toBe(true);
  });

  it("should handle VFX button clicks correctly", () => {
    vfxManagerUI.init();

    // Mock the vfxManager
    vfxManagerUI.vfxManager = mockVFXManager;

    // Test space select all button
    const spaceSelectAllBtn = document.getElementById("spaceSelectAll");
    spaceSelectAllBtn.click();

    expect(mockVFXManager.selectedEffects.space.size).toBe(2); // Both space effects selected

    // Test space clear all button
    const spaceClearAllBtn = document.getElementById("spaceClearAll");
    spaceClearAllBtn.click();

    expect(mockVFXManager.selectedEffects.space.size).toBe(0);

    const groundSelectAllBtn = document.getElementById("groundSelectAll");
    groundSelectAllBtn.click();

    expect(mockVFXManager.selectedEffects.ground.size).toBe(2);

    const groundClearAllBtn = document.getElementById("groundClearAll");
    groundClearAllBtn.click();

    expect(mockVFXManager.selectedEffects.ground.size).toBe(0);
  });

  it("should populate modal with effects correctly", () => {
    vfxManagerUI.vfxManager = mockVFXManager;
    const catalogSnapshot = structuredClone(vfxEffectsFixture);

    // Populate modal
    vfxManagerUI.handleModalPopulate({ vfxManager: mockVFXManager });

    // Check that effect checkboxes were created
    const spaceCheckboxes = document.querySelectorAll(
      "#spaceEffectsList .effect-checkbox",
    );
    const groundCheckboxes = document.querySelectorAll(
      "#groundEffectsList .effect-checkbox",
    );

    expect(spaceCheckboxes.length).toBe(2);
    expect(groundCheckboxes.length).toBe(2);
    expect(
      Array.from(
        document.querySelectorAll("#spaceEffectsList .effect-name"),
        (element) => element.textContent,
      ),
    ).toEqual(["Engine Glow", "Shield Bubble"]);
    expect(
      Array.from(
        document.querySelectorAll("#groundEffectsList .effect-name"),
        (element) => element.textContent,
      ),
    ).toEqual(["Footprint Glow", "Ground Sparkles"]);
    expect(vfxEffectsFixture).toEqual(catalogSnapshot);

    // Check specific effects
    const shieldBubbleCheckbox = document.querySelector(
      '.effect-checkbox[data-effect="shield_bubble"]',
    );
    expect(shieldBubbleCheckbox).toBeTruthy();
    expect(shieldBubbleCheckbox.dataset.environment).toBe("space");
  });

  it("should update effect counts correctly", () => {
    vfxManagerUI.vfxManager = mockVFXManager;

    // Populate modal first
    vfxManagerUI.handleModalPopulate({ vfxManager: mockVFXManager });

    // Check initial counts
    const spaceCountEl = document.getElementById("spaceEffectCount");
    const groundCountEl = document.getElementById("groundEffectCount");

    expect(spaceCountEl.textContent).toBe("0 selected");
    expect(groundCountEl.textContent).toBe("0 selected");

    // Select an effect
    mockVFXManager.toggleEffect("space", "shield_bubble");
    vfxManagerUI.updateEffectCounts();

    expect(spaceCountEl.textContent).toBe("1 selected");
    expect(groundCountEl.textContent).toBe("0 selected");
  });

  it("should clean up listeners properly in onDestroy", () => {
    vfxManagerUI.init();

    // Store detach functions before cleanup
    const detachFunctions = [...vfxManagerUI.domEventListeners];
    expect(detachFunctions).toHaveLength(7);

    // Call destroy (which calls onDestroy and cleanupEventListeners)
    vfxManagerUI.destroy();

    // Verify automatic cleanup
    expect(vfxManagerUI.domEventListeners).toHaveLength(0);
    expect(vfxManagerUI.domListenersSetup).toBe(false);
  });

  it("should handle missing DOM elements gracefully", () => {
    // Remove some elements from DOM
    const saveButton = document.getElementById("saveVertigoBtn");
    saveButton.remove();

    expect(() => vfxManagerUI.init()).not.toThrow();

    // Should still have 7 detach functions (EventBus registers listeners even if elements don't exist)
    expect(vfxManagerUI.domEventListeners).toHaveLength(7);

    // But clicking should still work for existing elements
    const spaceSelectAllBtn = document.getElementById("spaceSelectAll");
    expect(() => spaceSelectAllBtn.click()).not.toThrow();
  });

  it("lifecycle-owns modal population and regeneration across re-init", () => {
    vfxManagerUI.init();
    expect(
      eventBusFixture.eventBus.getListenerCount("vfx:modal-populate"),
    ).toBe(1);

    vfxManagerUI.destroy();
    expect(
      eventBusFixture.eventBus.getListenerCount("vfx:modal-populate"),
    ).toBe(0);
    expect(modalManager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      "vertigoModal",
      vfxManagerUI.regenerateModal,
    );
    expect(vfxManagerUI.vfxManager).toBeNull();
    expect(vfxManagerUI.domListenersSetup).toBe(false);

    vfxManagerUI.init();
    expect(
      eventBusFixture.eventBus.getListenerCount("vfx:modal-populate"),
    ).toBe(1);
    expect(modalManager.registerRegenerateCallback).toHaveBeenCalledTimes(2);
    expect(vfxManagerUI.domEventListeners).toHaveLength(7);
  });

  it("regenerates from unsaved in-memory selections", () => {
    vfxManagerUI.init();
    vfxManagerUI.handleModalPopulate({ vfxManager: mockVFXManager });

    const unsavedCheckbox = document.querySelector(
      '.effect-checkbox[data-environment="space"][data-effect="engine_glow"]',
    );
    unsavedCheckbox.checked = true;
    unsavedCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
    expect(mockVFXManager.selectedEffects.space.has("engine_glow")).toBe(true);

    const regenerate = modalManager.registerRegenerateCallback.mock.calls
      .filter(([modalId]) => modalId === "vertigoModal")
      .at(-1)[1];
    regenerate();

    const regeneratedCheckbox = document.querySelector(
      '.effect-checkbox[data-environment="space"][data-effect="engine_glow"]',
    );
    expect(regeneratedCheckbox).not.toBe(unsavedCheckbox);
    expect(regeneratedCheckbox.checked).toBe(true);
    expect(mockVFXManager.selectedEffects.space.has("engine_glow")).toBe(true);
  });
});
