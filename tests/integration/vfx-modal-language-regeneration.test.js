import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ModalManagerService from "../../src/js/components/services/ModalManagerService.js";
import VFXManagerService from "../../src/js/components/services/VFXManagerService.js";
import VFXManagerUI from "../../src/js/components/ui/VFXManagerUI.js";
import { createDataCoordinatorState } from "../fixtures/core/componentState.js";
import { createRealServiceFixture } from "../fixtures/index.js";

const vfxEffectsFixture = {
  space: [
    { effect: "Bloom", label: "Bloom" },
    { effect: "EngineGlow", label: "Engine Glow" },
  ],
  ground: [{ effect: "GroundSmoke", label: "Ground Smoke" }],
};

function mountVFXModal() {
  document.body.innerHTML = `
    <div id="modalOverlay"></div>
    <div id="vertigoModal" class="modal">
      <div id="spaceEffectsList"></div>
      <button id="spaceSelectAll">Select all space effects</button>
      <button id="spaceClearAll">Clear space effects</button>
      <div id="spaceEffectCount"></div>
      <div id="spaceAliasCommand"></div>
      <div id="groundEffectsList"></div>
      <button id="groundSelectAll">Select all ground effects</button>
      <button id="groundClearAll">Clear ground effects</button>
      <div id="groundEffectCount"></div>
      <div id="groundAliasCommand"></div>
      <input id="vertigoShowPlayerSay" type="checkbox">
      <button id="saveVertigoBtn">Save</button>
    </div>
  `;
}

function createI18nFixture() {
  const languageChangedListeners = new Set();
  return {
    i18n: {
      t: (key) => key,
      on(event, listener) {
        if (event === "languageChanged") {
          languageChangedListeners.add(listener);
        }
      },
      off(event, listener) {
        if (event === "languageChanged") {
          languageChangedListeners.delete(listener);
        }
      },
    },
    changeLanguage() {
      for (const listener of languageChangedListeners) listener();
    },
  };
}

function profileWithSavedVFX() {
  return {
    id: "alpha",
    name: "Alpha",
    currentEnvironment: "space",
    builds: { space: { keys: {} }, ground: { keys: {} } },
    aliases: {},
    vertigoSettings: {
      selectedEffects: { space: ["Bloom"], ground: [] },
      showPlayerSay: false,
    },
  };
}

describe("VFX modal language regeneration", () => {
  let fixture;
  let modalManager;
  let vfxManager;
  let vfxUI;

  beforeEach(async () => {
    fixture = await createRealServiceFixture();
    mountVFXModal();
  });

  afterEach(() => {
    if (vfxUI && !vfxUI.destroyed) vfxUI.destroy();
    if (vfxManager && !vfxManager.destroyed) vfxManager.destroy();
    if (modalManager && !modalManager.destroyed) modalManager.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("repopulates the active modal without discarding unsaved selections", async () => {
    const i18nFixture = createI18nFixture();
    modalManager = new ModalManagerService({
      eventBus: fixture.eventBus,
      i18n: i18nFixture.i18n,
    });
    vfxManager = new VFXManagerService(
      fixture.eventBus,
      i18nFixture.i18n,
      vfxEffectsFixture,
    );
    vfxUI = new VFXManagerUI({
      eventBus: fixture.eventBus,
      modalManager,
      i18n: i18nFixture.i18n,
      vfxEffects: vfxEffectsFixture,
    });
    const showModal = vi.fn();
    const regenerated = vi.fn();
    const detachShow = fixture.eventBus.on("vfx:show-modal", showModal);
    const detachRegenerated = fixture.eventBus.on(
      "modal:regenerated",
      regenerated,
    );

    modalManager.init();
    vfxManager.init();
    vfxUI.init();
    await fixture.eventBus.emit(
      "data:state-changed",
      {
        reason: "initial-load",
        state: createDataCoordinatorState({
          currentProfileData: profileWithSavedVFX(),
        }),
      },
      { synchronous: true },
    );
    await fixture.eventBus.emit("vfx:show-modal", null, {
      synchronous: true,
    });

    expect(showModal).toHaveBeenCalledOnce();
    expect(document.getElementById("vertigoModal")?.classList).toContain(
      "active",
    );
    const unsavedEffect = document.querySelector(
      '.effect-checkbox[data-environment="space"][data-effect="EngineGlow"]',
    );
    const playerSay = document.getElementById("vertigoShowPlayerSay");
    unsavedEffect.checked = true;
    unsavedEffect.dispatchEvent(new Event("change", { bubbles: true }));
    playerSay.checked = true;
    playerSay.dispatchEvent(new Event("change", { bubbles: true }));
    expect(Array.from(vfxManager.selectedEffects.space)).toEqual([
      "Bloom",
      "EngineGlow",
    ]);
    expect(vfxManager.showPlayerSay).toBe(true);

    i18nFixture.changeLanguage();

    const regeneratedEffect = document.querySelector(
      '.effect-checkbox[data-environment="space"][data-effect="EngineGlow"]',
    );
    expect(regeneratedEffect).not.toBe(unsavedEffect);
    expect(regeneratedEffect.checked).toBe(true);
    expect(document.getElementById("vertigoShowPlayerSay")?.checked).toBe(true);
    expect(Array.from(vfxManager.selectedEffects.space)).toEqual([
      "Bloom",
      "EngineGlow",
    ]);
    expect(vfxManager.showPlayerSay).toBe(true);
    expect(showModal).toHaveBeenCalledOnce();
    expect(regenerated).toHaveBeenCalledWith({ modalId: "vertigoModal" });

    detachShow();
    detachRegenerated();
  });
});
