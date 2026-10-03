import { expect, vi } from "vitest";
import {
  ROOT,
  confirm,
  faultWrites,
  selectKey,
  seededProject,
  setInput,
  withApplication,
} from "./applicationRuntime.js";

export async function environmentSwitch() {
  await withApplication(async (app) => {
    const before = localStorage.getItem(ROOT);
    const active = app.element(".mode-btn.active").dataset.mode;
    const target = active === "ground" ? "space" : "ground";
    const writes = faultWrites(app);
    app.element(`[data-mode="${target}"]`).click();
    await vi.waitFor(() =>
      expect(writes.mock.calls.some(([key]) => key === ROOT)).toBe(true),
    );
    await vi.waitFor(() =>
      expect(
        app.diagnostics().domains.find((row) => row.domain === "project")
          .lastOperation.status,
      ).toBe("write_failed"),
    );
    expect(localStorage.getItem(ROOT)).toBe(before);
    expect(app.element(".mode-btn.active").dataset.mode).toBe(active);
    writes.mockRestore();
    app.element(`[data-mode="${target}"]`).click();
    await vi.waitFor(() => {
      expect(app.root().profiles.captain.currentEnvironment).toBe(target);
      expect(app.element(".mode-btn.active").dataset.mode).toBe(target);
    });
    expect(app.root()).not.toHaveProperty("settings");
  });
}

export async function keyViewModes() {
  await withApplication(async (app) => {
    const button = app.element("#toggleKeyViewBtn");
    const projections = [
      { mode: "categorized", icon: "fas fa-sitemap" },
      { mode: "key-types", icon: "fas fa-th" },
      { mode: "grid", icon: "fas fa-list" },
    ];
    app.element('[data-mode="alias"]').click();
    await vi.waitFor(() =>
      expect(app.element(".mode-btn.active").dataset.mode).toBe("alias"),
    );
    const before = localStorage.getItem("keyViewMode");
    button.click();
    await new Promise((resolve) => app.window.setTimeout(resolve, 0));
    expect(localStorage.getItem("keyViewMode")).toBe(before);
    app.element('[data-mode="space"]').click();
    await vi.waitFor(() =>
      expect(app.element(".mode-btn.active").dataset.mode).toBe("space"),
    );
    for (const projection of projections) {
      button.click();
      await vi.waitFor(() => {
        expect(localStorage.getItem("keyViewMode")).toBe(projection.mode);
        expect(button.querySelector("i").className).toBe(projection.icon);
        expect(button.title.trim()).not.toBe("");
      });
    }
  });
}

export async function categoryCollapse() {
  await withApplication(async (app) => {
    app.element("#toggleKeyViewBtn").click();
    await vi.waitFor(() =>
      expect(
        app.document.querySelector("#keyGrid .category h4[data-category]"),
      ).toBeTruthy(),
    );
    const header = app.element("#keyGrid .category h4[data-category]");
    const category = header.dataset.category;
    const initial = header.classList.contains("collapsed");
    const body = header
      .closest(".category")
      .querySelector(".category-commands");
    const key = `keyCategory_${category}_collapsed`;
    for (const expected of [!initial, initial]) {
      header.click();
      await vi.waitFor(() => {
        expect(header.classList.contains("collapsed")).toBe(expected);
        expect(body.classList.contains("collapsed")).toBe(expected);
        expect(localStorage.getItem(key)).toBe(String(expected));
      });
    }
  });
}

export async function keySelectionAndFilter() {
  await withApplication(async (app) => {
    await selectKey(app);
    const filter = setInput(app, "#keyFilter", "__no_matching_key__");
    await vi.waitFor(() => {
      const keys = [...app.document.querySelectorAll("#keyGrid .key-item")];
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.every((key) => key.style.display === "none")).toBe(true);
    });
    filter.dispatchEvent(
      new app.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await vi.waitFor(() => expect(filter.value).toBe(""));
    expect(app.root().profiles.captain.builds.space.keys.F1).toEqual([
      "FireAll",
    ]);
  });
}

export async function clearChain() {
  await withApplication(async (app) => {
    await selectKey(app);
    const before = localStorage.getItem(ROOT);
    const writes = faultWrites(app);
    app.element("#clearChainBtn").click();
    await confirm(app);
    await vi.waitFor(() =>
      expect(writes.mock.calls.some(([key]) => key === ROOT)).toBe(true),
    );
    await vi.waitFor(() =>
      expect(
        app.diagnostics().domains.find((row) => row.domain === "project")
          .lastOperation.status,
      ).toBe("write_failed"),
    );
    expect(localStorage.getItem(ROOT)).toBe(before);
    expect(app.document.querySelectorAll(".command-item-row")).toHaveLength(1);
    writes.mockRestore();
    app.element("#clearChainBtn").click();
    await confirm(app);
    await vi.waitFor(() => {
      expect(app.root().profiles.captain.builds.space.keys.F1).toEqual([]);
      expect(app.document.querySelectorAll(".command-item-row")).toHaveLength(
        0,
      );
    });
  });
}

export async function customizeCommand() {
  await withApplication(async (app) => {
    await selectKey(app, "F2");
    await vi.waitFor(() =>
      expect(
        app.document.querySelector(
          '.command-item-row[data-index="0"] .btn-palindromic-toggle',
        ),
      ).toBeTruthy(),
    );
    const toggle = app.element(
      '.command-item-row[data-index="0"] .btn-palindromic-toggle',
    );
    const before = localStorage.getItem(ROOT);
    const writes = faultWrites(app);
    toggle.click();
    await vi.waitFor(() =>
      expect(writes.mock.calls.some(([key]) => key === ROOT)).toBe(true),
    );
    await vi.waitFor(() =>
      expect(
        app.diagnostics().domains.find((row) => row.domain === "project")
          .lastOperation.status,
      ).toBe("write_failed"),
    );
    expect(localStorage.getItem(ROOT)).toBe(before);
    expect(toggle.classList.contains("active")).toBe(true);
    writes.mockRestore();
    toggle.click();
    await vi.waitFor(() =>
      expect(app.root().profiles.captain.builds.space.keys.F2[0]).toEqual({
        command: "+TrayExecByTray 0 0",
        palindromicGeneration: false,
      }),
    );
    app
      .element('.command-item-row[data-index="0"] .btn-placement-toggle')
      .click();
    await vi.waitFor(() =>
      expect(app.root().profiles.captain.builds.space.keys.F2[0]).toMatchObject(
        { placement: "in-pivot-group" },
      ),
    );
    expect(app.root().profiles.captain.builds.space.keys.F2[1]).toBe("FireAll");
  });
}

export async function editCommand() {
  await withApplication(async (app) => {
    await selectKey(app, "F3");
    app.element('.command-item-row[data-index="0"] .btn-edit').click();
    await vi.waitFor(() =>
      expect(app.document.querySelector("#param_entityName")).toBeTruthy(),
    );
    const input = setInput(app, "#param_entityName", "Unsaved Boundary Draft");
    input.focus();
    input.setSelectionRange(8, 16);
    app.element('[data-lang="de"]').click();
    await vi.waitFor(() => expect(app.settings().language).toBe("de"));
    const replacement = app.element("#param_entityName");
    expect(replacement).not.toBe(input);
    expect(replacement.value).toBe("Unsaved Boundary Draft");
    expect(replacement.selectionStart).toBe(8);
    expect(replacement.selectionEnd).toBe(16);
    expect(app.element("#saveParameterCommandBtn").textContent).toBe(
      "Speichern",
    );
    app
      .element('#parameterModal .btn-secondary[data-modal="parameterModal"]')
      .click();
    await vi.waitFor(() =>
      expect(app.element("#parameterModal").classList.contains("active")).toBe(
        false,
      ),
    );
    expect(app.root().profiles.captain.builds.space.keys.F3).toEqual([
      'Target "Alpha"',
      "UncataloguedCommandForBoundary",
    ]);
    app.element('.command-item-row[data-index="0"] .btn-edit').click();
    await vi.waitFor(() =>
      expect(app.element("#parameterModal").classList.contains("active")).toBe(
        true,
      ),
    );
    setInput(app, "#param_entityName", "Bravo");
    app.element("#saveParameterCommandBtn").click();
    await vi.waitFor(() =>
      expect(app.root().profiles.captain.builds.space.keys.F3).toEqual([
        'Target "Bravo"',
        "UncataloguedCommandForBoundary",
      ]),
    );
  });
}

export async function captureKey() {
  await withApplication(async (app) => {
    app.element("#addKeyBtn").click();
    await vi.waitFor(() =>
      expect(
        app.element("#keySelectionModal").classList.contains("active"),
      ).toBe(true),
    );
    const keydown = new app.window.KeyboardEvent("keydown", {
      key: "F24",
      code: "F24",
      bubbles: true,
      cancelable: true,
    });
    app.document.dispatchEvent(keydown);
    await vi.waitFor(() =>
      expect(app.element("#keyPreviewDisplay").textContent).toContain("F24"),
    );
    expect(keydown.defaultPrevented).toBe(true);
    app.element("#confirm-key-selection").click();
    await vi.waitFor(() => {
      expect(app.root().profiles.captain.builds.space.keys.F24).toEqual([]);
      expect(
        app.element("#keySelectionModal").classList.contains("active"),
      ).toBe(false);
    });
    app.element("#addKeyBtn").click();
    await vi.waitFor(() =>
      expect(
        app.element("#keySelectionModal").classList.contains("active"),
      ).toBe(true),
    );
    app.element("#cancel-key-selection").click();
    await vi.waitFor(() =>
      expect(
        app.element("#keySelectionModal").classList.contains("active"),
      ).toBe(false),
    );
    const before = localStorage.getItem(ROOT);
    app.document.dispatchEvent(
      new app.window.KeyboardEvent("keydown", {
        key: "F23",
        code: "F23",
        bubbles: true,
      }),
    );
    expect(localStorage.getItem(ROOT)).toBe(before);
    app.element("#addKeyBtn").click();
    await vi.waitFor(() =>
      expect(
        app.element("#keySelectionModal").classList.contains("active"),
      ).toBe(true),
    );
    app.element("#cancel-key-selection").click();
  });
}

export async function commandPresentation() {
  const root = seededProject();
  const markup = 'CustomCommand <img id="command-chain-markup-probe" src="x">';
  const commands = [
    "FireAll",
    markup,
    "+TrayExecByTray 0 0",
    {
      command: "+TrayExecByTray 1 0",
      palindromicGeneration: false,
      placement: "in-pivot-group",
    },
  ];
  root.profiles.captain.builds.space.keys.F2 = commands;
  root.profiles.captain.keybindMetadata.space.F2 = {
    stabilizeExecutionOrder: true,
  };
  await withApplication(
    async (app) => {
      await selectKey(app, "F2");
      expect(
        app.document.getElementById("command-chain-markup-probe"),
      ).toBeNull();
      expect(app.element("#commandList").textContent).toContain(markup);
      app.element("#preferencesBtn").click();
      app.element("#bindToAliasModeCheckbox").click();
      app.element("#savePreferencesBtn").click();
      await vi.waitFor(() => expect(app.settings().bindToAliasMode).toBe(true));
      await vi.waitFor(() =>
        expect(app.element("#aliasPreview").textContent).toContain(markup),
      );
      const preview = app.element("#aliasPreview").textContent;
      expect(app.element("#generatedAlias").style.display).toBe("");
      const copy = vi
        .spyOn(app.window.navigator.clipboard, "writeText")
        .mockResolvedValue();
      app.element("#copyAliasBtn").click();
      await vi.waitFor(() => expect(copy).toHaveBeenCalledWith(preview));
      expect(
        app.document.getElementById("command-chain-markup-probe"),
      ).toBeNull();
      const header = app.element('.category[data-category="system"] h4');
      const before = header.classList.contains("collapsed");
      header.click();
      await vi.waitFor(() => {
        expect(header.classList.contains("collapsed")).toBe(!before);
        expect(localStorage.getItem("commandCategory_system_collapsed")).toBe(
          String(!before),
        );
      });
      // Accepted presentation broadcasts regenerate the chain after the library.
      await new Promise((resolve) => app.window.setTimeout(resolve, 0));
      const group = app.element(".command-group-separator .group-header");
      const name = group.dataset.group;
      const expanded = group.getAttribute("aria-expanded");
      group.click();
      await vi.waitFor(() => {
        expect(localStorage.getItem(`commandGroup_${name}_collapsed`)).toBe(
          String(expanded === "true"),
        );
        expect(
          app
            .element(`.group-header[data-group="${name}"]`)
            .getAttribute("aria-expanded"),
        ).not.toBe(expanded);
      });
      expect(app.root().profiles.captain.builds.space.keys.F2).toEqual(
        commands,
      );
    },
    { root },
  );
}

export async function commandMutation() {
  await withApplication(async (app) => {
    await selectKey(app, "F3");
    const before = localStorage.getItem(ROOT);
    const move = app.element('.command-item-row[data-index="0"] .btn-down');
    expect(move.disabled).toBe(false);
    app.document.querySelectorAll(".toast").forEach((toast) => toast.remove());
    const writes = faultWrites(app);
    move.click();
    await vi.waitFor(() =>
      expect(writes.mock.calls.some(([key]) => key === ROOT)).toBe(true),
    );
    await vi.waitFor(() =>
      expect(
        app.diagnostics().domains.find((row) => row.domain === "project")
          .lastOperation.status,
      ).toBe("write_failed"),
    );
    expect(localStorage.getItem(ROOT)).toBe(before);
    expect(app.document.querySelectorAll(".toast-success")).toHaveLength(0);
    writes.mockRestore();
    app.element('.command-item-row[data-index="0"] .btn-down').click();
    await vi.waitFor(() =>
      expect(app.root().profiles.captain.builds.space.keys.F3).toEqual([
        "UncataloguedCommandForBoundary",
        'Target "Alpha"',
      ]),
    );
    app.element('.command-item-row[data-index="0"] .btn-delete').click();
    await vi.waitFor(() =>
      expect(app.root().profiles.captain.builds.space.keys.F3).toEqual([
        'Target "Alpha"',
      ]),
    );
    app.element('[data-command="fire_all"]').click();
    await vi.waitFor(() =>
      expect(app.root().profiles.captain.builds.space.keys.F3).toEqual([
        'Target "Alpha"',
        "FireAll",
      ]),
    );
    expect(app.document.querySelectorAll(".command-item-row")).toHaveLength(2);
    expect(app.root().profiles.captain.extension).toEqual({ retained: true });
  });
}

export async function stabilizeChain() {
  await withApplication(async (app) => {
    await selectKey(app, "F2");
    const button = app.element("#stabilizeExecutionOrderBtn");
    const before = localStorage.getItem(ROOT);
    const wasActive = button.classList.contains("active");
    const writes = faultWrites(app);
    button.click();
    await vi.waitFor(() =>
      expect(writes.mock.calls.some(([key]) => key === ROOT)).toBe(true),
    );
    await vi.waitFor(() =>
      expect(
        app.diagnostics().domains.find((row) => row.domain === "project")
          .lastOperation.status,
      ).toBe("write_failed"),
    );
    expect(localStorage.getItem(ROOT)).toBe(before);
    expect(button.classList.contains("active")).toBe(wasActive);
    writes.mockRestore();
    button.click();
    await vi.waitFor(() => {
      expect(
        app.root().profiles.captain.keybindMetadata.space.F2
          .stabilizeExecutionOrder,
      ).toBe(!wasActive);
      expect(button.classList.contains("active")).toBe(!wasActive);
    });
    expect(app.root().profiles.captain.builds.space.keys.F2).toEqual([
      "+TrayExecByTray 0 0",
      "FireAll",
    ]);
  });
}
