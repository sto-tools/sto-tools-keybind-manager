import { expect, vi } from "vitest";
import {
  ROOT,
  confirm,
  selectKey,
  setInput,
  withApplication,
} from "./applicationRuntime.js";

export async function shellAndMenus() {
  await withApplication(async (app) => {
    expect(
      app
        .element('h1 [data-i18n="sto_tools_keybind_manager"]')
        .textContent.trim(),
    ).toBe(app.document.title.trim());
    expect(app.document.title.trim()).not.toBe("");
    expect(app.element("#appVersion").textContent.trim()).not.toBe("");
    expect(app.element("#settingsBtn").title.trim()).not.toBe("");
    expect(
      app.element('[data-command="refine_dilithium"]').closest(".category")
        .dataset.category,
    ).toBe("system");
    expect(
      app.element('[data-command="refine_dilithium"]').textContent,
    ).toContain("Refine Dilithium");
    const menu = app.element("#settingsBtn").closest(".dropdown");
    app.element("#settingsBtn").click();
    expect(menu.classList.contains("active")).toBe(true);
    app.document.body.click();
    expect(menu.classList.contains("active")).toBe(false);
    expect(app.element("#profileSelect").value).toBe("captain");
  });
}

export async function bindsetDialog({ create = false } = {}) {
  await withApplication(async (app) => {
    expect(app.window.inputDialog).toBeUndefined();
    app.element("#bindsetManagerBtn").click();
    expect(
      app.element("#bindsetManagerModal").classList.contains("active"),
    ).toBe(true);
    app.element("#createBindsetBtn").click();
    await vi.waitFor(() =>
      expect(app.document.querySelector("#inputModal")).toBeTruthy(),
    );
    if (create) {
      setInput(app, "#inputModal .input-field", "Browser Cohort");
      app.element("#inputModal .input-submit").click();
      await vi.waitFor(() =>
        expect(
          app.root().profiles.captain.bindsets["Browser Cohort"],
        ).toMatchObject({ space: { keys: {} }, ground: { keys: {} } }),
      );
      expect(app.element("#bindsetList").textContent).toContain(
        "Browser Cohort",
      );
    } else {
      const before = localStorage.getItem(ROOT);
      app.element("#inputModal .input-cancel").click();
      await vi.waitFor(() =>
        expect(app.document.querySelector("#inputModal")).toBeNull(),
      );
      expect(localStorage.getItem(ROOT)).toBe(before);
    }
  });
}

export async function profileConstruction() {
  await withApplication(async (app) => {
    app.element("#newProfileBtn").click();
    setInput(app, "#profileName", "Browser Profile Construction Probe");
    setInput(app, "#profileDescription", "Checked bundle profile");
    app.element("#saveProfileBtn").click();
    await vi.waitFor(() => {
      expect(
        app.root().profiles.browser_profile_construction_probe,
      ).toMatchObject({
        name: "Browser Profile Construction Probe",
        description: "Checked bundle profile",
        builds: { space: { keys: {} }, ground: { keys: {} } },
      });
      expect(app.element("#profileSelect").value).toBe(
        "browser_profile_construction_probe",
      );
    });
    app.element("#cloneProfileBtn").click();
    setInput(app, "#profileName", "Browser Profile Construction Copy");
    app.element("#saveProfileBtn").click();
    await vi.waitFor(() =>
      expect(app.root().profiles.browser_profile_construction_copy.name).toBe(
        "Browser Profile Construction Copy",
      ),
    );
    const profileSelect = app.element("#profileSelect");
    profileSelect.value = "browser_profile_construction_copy";
    profileSelect.dispatchEvent(
      new app.window.Event("change", { bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(app.root().currentProfile).toBe(
        "browser_profile_construction_copy",
      ),
    );
    app.element("#renameProfileBtn").click();
    setInput(app, "#profileName", "Renamed Copy");
    app.element("#saveProfileBtn").click();
    await vi.waitFor(() =>
      expect(app.root().profiles.browser_profile_construction_copy.name).toBe(
        "Renamed Copy",
      ),
    );
    app.element("#deleteProfileBtn").click();
    await confirm(app);
    await vi.waitFor(() =>
      expect(app.root().profiles).not.toHaveProperty(
        "browser_profile_construction_copy",
      ),
    );
    expect(app.root()).not.toHaveProperty("settings");
  });
}

export async function defaultProfiles() {
  await withApplication(async (app) => {
    app.element("#settingsBtn").click();
    app.element("#loadDefaultDataBtn").click();
    await vi.waitFor(() =>
      expect(Object.keys(app.root().profiles)).toContain("default"),
    );
    expect(app.root().profiles.default).toMatchObject({
      name: "Default",
      builds: {
        space: { keys: expect.any(Object) },
        ground: { keys: expect.any(Object) },
      },
    });
    expect(
      [...app.element("#profileSelect").options].some(
        (option) => option.value === "default",
      ),
    ).toBe(true);
  });
}

export async function explorer({ stale = false } = {}) {
  await withApplication(async (app) => {
    const before = localStorage.getItem(ROOT);
    if (stale)
      localStorage.setItem(
        ROOT,
        JSON.stringify({
          currentProfile: "storage-poison",
          profiles: { "storage-poison": { name: "Storage Poison" } },
        }),
      );
    app.element("#fileExplorerBtn").click();
    expect(app.element("#fileExplorerModal").classList.contains("active")).toBe(
      true,
    );
    expect(
      [...app.document.querySelectorAll("#fileTree > .profile")].map(
        (node) => node.dataset.profileid,
      ),
    ).toEqual(["captain"]);
    expect(app.element("#fileTree").textContent).not.toContain(
      "Storage Poison",
    );
    app
      .element(
        '#fileExplorerModal .modal-close[data-modal="fileExplorerModal"]',
      )
      .click();
    expect(app.element("#fileExplorerModal").classList.contains("active")).toBe(
      false,
    );
    localStorage.setItem(ROOT, before);
  });
}

export async function visibleConvergence() {
  await withApplication(async (app) => {
    await selectKey(app);
    expect(app.element("#chainTitle").textContent).toContain("F1");
    expect(app.document.querySelectorAll(".command-item-row")).toHaveLength(1);
    expect(app.root().profiles.captain.selections.space).toBe("F1");
    app.element("#fileExplorerBtn").click();
    expect(
      app.element('#fileTree .profile[data-profileid="captain"]').textContent,
    ).toContain("Captain");
    expect(app.element("#profileSelect").value).toBe("captain");
  });
}

export async function emptyStates() {
  await withApplication(async (app) => {
    app.element("#addKeyBtn").click();
    await vi.waitFor(() =>
      expect(
        app.element("#keySelectionModal").classList.contains("active"),
      ).toBe(true),
    );
    app.document.dispatchEvent(
      new app.window.KeyboardEvent("keydown", {
        key: "F24",
        code: "F24",
        bubbles: true,
        cancelable: true,
      }),
    );
    await vi.waitFor(() =>
      expect(app.element("#keyPreviewDisplay").textContent).toContain("F24"),
    );
    app.element("#confirm-key-selection").click();
    await vi.waitFor(() =>
      expect(app.root().profiles.captain.builds.space.keys.F24).toEqual([]),
    );
    await selectKey(app, "F24");
    expect(app.document.querySelectorAll(".command-item-row")).toHaveLength(0);
    expect(app.element("#commandList").textContent.trim()).not.toBe("");
    await createAlias(app, "BrowserEmptyAlias");
    app.element('[data-mode="alias"]').click();
    await vi.waitFor(() =>
      expect(
        app.element('[data-mode="alias"]').classList.contains("active"),
      ).toBe(true),
    );
    app
      .element('#aliasGrid .alias-item[data-alias="BrowserEmptyAlias"]')
      .click();
    await vi.waitFor(() =>
      expect(app.element("#chainTitle").textContent).toContain(
        "BrowserEmptyAlias",
      ),
    );
    expect(app.document.querySelectorAll(".command-item-row")).toHaveLength(0);
    expect(app.element("#commandList").textContent.trim()).not.toBe("");
  });
}

async function createAlias(app, name) {
  if (!app.element('[data-mode="alias"]').classList.contains("active")) {
    app.element('[data-mode="alias"]').click();
    await vi.waitFor(() =>
      expect(
        app.element('[data-mode="alias"]').classList.contains("active"),
      ).toBe(true),
    );
  }
  app.element("#addAliasChainBtn").click();
  setInput(app, "#newAliasNameInput", name);
  app.element("#confirmCreateAliasBtn").click();
  await vi.waitFor(() =>
    expect(app.root().profiles.captain.aliases[name]).toBeTruthy(),
  );
}

export async function aliasAndVfxEdits() {
  await withApplication(async (app) => {
    await createAlias(app, "BrowserCohortAlias");
    app.element('[data-mode="alias"]').click();
    await vi.waitFor(() =>
      expect(
        app.element('[data-mode="alias"]').classList.contains("active"),
      ).toBe(true),
    );
    app
      .element('#aliasGrid .alias-item[data-alias="BrowserCohortAlias"]')
      .click();
    await vi.waitFor(() =>
      expect(app.element("#chainTitle").textContent).toContain(
        "BrowserCohortAlias",
      ),
    );
    app.element("#duplicateAliasChainBtn").click();
    setInput(app, "#duplicateAliasNameInput", "BrowserCohortCopy");
    app.element("#confirmDuplicateAliasBtn").click();
    await vi.waitFor(() =>
      expect(
        app.root().profiles.captain.aliases.BrowserCohortCopy,
      ).toBeTruthy(),
    );
    app
      .element('#aliasGrid .alias-item[data-alias="BrowserCohortCopy"]')
      .click();
    await vi.waitFor(() => {
      expect(app.element("#chainTitle").textContent).toContain(
        "BrowserCohortCopy",
      );
      expect(app.element("#deleteAliasChainBtn").disabled).toBe(false);
    });
    app.element("#deleteAliasChainBtn").click();
    await confirm(app);
    await vi.waitFor(() =>
      expect(app.root().profiles.captain.aliases).not.toHaveProperty(
        "BrowserCohortCopy",
      ),
    );
    app.element("#vertigoBtn").click();
    await vi.waitFor(() =>
      expect(app.element("#vertigoModal").classList.contains("active")).toBe(
        true,
      ),
    );
    const effect = app.element(
      '#spaceEffectsList input[data-environment="space"]',
    );
    effect.click();
    expect(effect.checked).toBe(true);
    app.element("#saveVertigoBtn").click();
    await vi.waitFor(() =>
      expect(app.root().profiles.captain.vertigoSettings).toEqual({
        selectedEffects: { space: [effect.dataset.effect], ground: [] },
        showPlayerSay: false,
      }),
    );
    expect(app.element("#vertigoModal").classList.contains("active")).toBe(
      false,
    );
  });
}
