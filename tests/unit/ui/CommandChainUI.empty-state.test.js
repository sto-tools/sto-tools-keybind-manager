import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18next from "i18next";

import CommandChainUI from "../../../src/js/components/ui/CommandChainUI.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";
import {
  createCommandChainCoordinatorState,
  createCommandChainProfile,
  mountCommandChain,
} from "../../fixtures/ui/commandChain.js";

describe("CommandChainUI accepted-state empty projection", () => {
  let fixture;
  let ui;

  beforeEach(() => {
    mountCommandChain();
    fixture = createEventBusFixture();
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: i18next,
      ui: { showToast: vi.fn() },
    });
    ui.cache.preferences = {
      bindsetsEnabled: false,
      bindToAliasMode: false,
    };
    ui.cache.activeBindset = "Primary Bindset";
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function acceptProfile(currentProfileData, environment = "space") {
    ui._cacheDataState(
      createCommandChainCoordinatorState(currentProfileData, {
        authorityEpoch: 100,
        environment,
      }),
    );
    ui.cache.currentEnvironment = environment;
  }

  it.each([
    {
      environment: "space",
      title: "Select a key to edit",
      preview: "Select a key to see the generated command",
      cardTitle: "No Key Selected",
      description:
        "Select a key from the left panel to view and edit its command chain.",
      icon: "fas fa-keyboard",
    },
    {
      environment: "alias",
      title: "Select an alias to edit",
      preview: "Select an alias to see the generated command",
      cardTitle: "No Alias Selected",
      description:
        "Select an alias from the left panel to view and edit its command chain.",
      icon: "fas fa-mask",
    },
  ])(
    "renders the translated $environment no-selection state without querying a service",
    async ({ environment, title, preview, cardTitle, description, icon }) => {
      acceptProfile(createCommandChainProfile(), environment);
      ui.cache.selectedKey = null;
      ui.cache.selectedAlias = null;

      await ui.render();

      expect(document.getElementById("chainTitle").textContent).toBe(title);
      expect(document.getElementById("commandPreview").textContent).toBe(
        preview,
      );
      expect(document.getElementById("commandCount").textContent).toBe("0");
      expect(document.querySelector("#emptyState i").className).toBe(icon);
      expect(document.querySelector("#emptyState h4").textContent).toBe(
        cardTitle,
      );
      expect(document.querySelector("#emptyState p").textContent).toBe(
        description,
      );
      expect(ui.request).not.toHaveBeenCalled();
    },
  );

  it("renders an existing empty alias as text without creating injected elements", async () => {
    const aliasName = 'A&B <img src="x" onerror="globalThis.probed=true">';
    const aliases = Object.create(null);
    aliases[aliasName] = { commands: [] };
    acceptProfile(createCommandChainProfile({ aliases }), "alias");
    ui.cache.selectedAlias = aliasName;

    await ui.render();

    expect(document.getElementById("chainTitle").textContent).toBe(
      `Alias Chain for ${aliasName}`,
    );
    expect(document.querySelector("#emptyState h4").textContent).toBe(
      "No commands",
    );
    expect(document.querySelector("#emptyState p").textContent).toContain(
      aliasName,
    );
    expect(document.querySelector("#emptyState img")).toBeNull();
    expect(document.getElementById("commandPreview").textContent).toBe(
      `alias ${aliasName} <&  &>`,
    );
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("projects a stale key as no selection instead of leaking its old title", async () => {
    acceptProfile(createCommandChainProfile());
    ui.cache.selectedKey = "OldSpaceKey";

    await ui.render();

    expect(document.getElementById("chainTitle").textContent).toBe(
      "Select a key to edit",
    );
    expect(document.getElementById("chainTitle").textContent).not.toContain(
      "OldSpaceKey",
    );
    expect(document.querySelector("#emptyState h4").textContent).toBe(
      "No Key Selected",
    );
    expect(ui.request).not.toHaveBeenCalled();
  });
});
