import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BindsetSelectorUI from "../../../src/js/components/ui/BindsetSelectorUI.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

describe("BindsetSelectorUI", () => {
  let eventBusFixture;
  let container;
  let ui;

  beforeEach(async () => {
    eventBusFixture = await createRealEventBusFixture();
    container = document.createElement("div");
    container.id = "bindsetSelectorContainer";
    document.body.appendChild(container);

    ui = new BindsetSelectorUI({
      eventBus: eventBusFixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.isVisible = true;
  });

  afterEach(() => {
    if (!ui.destroyed) ui.destroy();
    document.getElementById("bindsetOptionsMenu")?.remove();
    container.remove();
    eventBusFixture.destroy();
  });

  it("opens the manager directly from its delegated link", () => {
    const shownModals = [];
    const detachModal = eventBusFixture.eventBus.on("modal:show", (payload) =>
      shownModals.push(payload),
    );
    const openManager = vi.spyOn(ui, "openBindsetManager");

    ui.init();
    ui.open();
    expect(ui.isOpen).toBe(true);

    document.getElementById("manageBindsetsLink").click();

    expect(openManager).toHaveBeenCalledOnce();
    expect(shownModals).toEqual([{ modalId: "bindsetManagerModal" }]);
    expect(ui.isOpen).toBe(false);
    expect(eventBusFixture.eventBus.hasListeners("bindset-manager:open")).toBe(
      false,
    );
    detachModal();
  });

  it("renders hidden and named membership states", () => {
    ui.isVisible = false;
    ui.render();
    expect(container.style.display).toBe("none");

    ui.isVisible = true;
    ui.cache.activeBindset = "Weapons";
    ui.cache.bindsetNames = ["Primary Bindset", "Weapons"];
    ui.keyBindsetMembership = new Map([
      ["Primary Bindset", true],
      ["Weapons", true],
    ]);
    ui.init();

    const primary = document.querySelector(
      '.bindset-option[data-bindset="Primary Bindset"]',
    );
    const weapons = document.querySelector(
      '.bindset-option[data-bindset="Weapons"]',
    );

    expect(container.style.display).toBe("block");
    expect(primary.classList.contains("active")).toBe(false);
    expect(primary.classList.contains("greyed-out")).toBe(false);
    expect(weapons.classList.contains("active")).toBe(true);
    expect(weapons.classList.contains("greyed-out")).toBe(false);
    expect(weapons.querySelector(".add-key-btn").disabled).toBe(true);
    expect(weapons.querySelector(".remove-key-btn").disabled).toBe(false);
  });

  it("selects available delegated options and ignores unavailable ones", () => {
    ui.cache.bindsetNames = ["Primary Bindset", "Weapons"];
    ui.keyBindsetMembership = new Map([["Weapons", true]]);
    ui.request = vi.fn().mockResolvedValue(undefined);
    ui.init();
    ui.open();

    document
      .querySelector('.bindset-option[data-bindset="Primary Bindset"]')
      .click();
    expect(ui.request).not.toHaveBeenCalled();
    expect(ui.isOpen).toBe(true);

    document.querySelector('.bindset-option[data-bindset="Weapons"]').click();
    expect(ui.request).toHaveBeenCalledWith(
      "bindset-selector:set-active-bindset",
      { bindset: "Weapons" },
    );
    expect(ui.isOpen).toBe(false);
  });
});
