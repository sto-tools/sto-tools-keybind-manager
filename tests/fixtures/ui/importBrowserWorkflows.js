import { expect, vi } from "vitest";
import {
  BACKUP,
  ROOT,
  SETTINGS,
  seededProject,
  withApplication,
} from "./applicationRuntime.js";
import { MAX_STO_TEXT_IMPORT_BYTES } from "../../../src/js/components/services/textImportBoundary.js";

function createKBF({
  keyName = "F24",
  activityFields = "Activity:1;",
  combo = "",
} = {}) {
  const activity = btoa(activityFields);
  const key = btoa(
    `Key:${keyName};Control:0;Alt:0;Shift:0;Combo:${combo};ACT:${activity};`,
  );
  return btoa(`GROUPSET:1;KEYSET:${btoa(`Name:Master;KEY:${key};`)};`);
}

function multiBindsetKBF() {
  const keyset = (name, keyName) =>
    btoa(
      `Name:${name};KEY:${btoa(`Key:${keyName};Control:0;Alt:0;Shift:0;Combo:;ACT:${btoa("Activity:1;")};`)};`,
    );
  return btoa(
    `GROUPSET:1;KEYSET:${keyset("Master", "F23")};KEYSET:${keyset("Alternate", "F24")};`,
  );
}

async function chooseFile(app, button, content, name) {
  const trigger = app.element(
    button === "#openProjectBtn" ? "#backupMenuBtn" : "#importMenuBtn",
  );
  if (!trigger.closest(".dropdown").classList.contains("active"))
    trigger.click();
  expect(app.element(button).getClientRects().length).toBeGreaterThan(0);
  let input;
  const click = app.window.HTMLInputElement.prototype.click;
  const picker = vi
    .spyOn(app.window.HTMLInputElement.prototype, "click")
    .mockImplementation(function () {
      if (this.type === "file") input = this;
      else click.call(this);
    });
  app.element(button).click();
  await vi.waitFor(() => expect(input).toBeTruthy());
  picker.mockRestore();
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new app.window.File([content], name, { type: "text/plain" })],
  });
  // The restore picker uses the native onchange property and returns its async
  // completion. Await that public DOM callback; dispatchEvent alone discards it.
  const onChange = input.onchange;
  let completion;
  if (typeof onChange === "function") {
    input.onchange = function (event) {
      completion = onChange.call(this, event);
      return completion;
    };
  }
  input.dispatchEvent(new app.window.Event("change", { bubbles: true }));
  if (completion) await completion;
  if (typeof onChange === "function") input.onchange = onChange;
  return input;
}

async function importDecision(
  app,
  { strategy = "merge_overwrite", aliases = false } = {},
) {
  const modal = aliases ? "#aliasStrategyModal" : "#importModal";
  await vi.waitFor(() =>
    expect(app.document.querySelector(`${modal}.active`)).toBeTruthy(),
  );
  const strategyInput = app.document.querySelector(
    `${modal} input[name="${aliases ? "alias-import-strategy" : "import-strategy"}"][value="${strategy}"]`,
  );
  if (strategyInput) {
    strategyInput.checked = true;
    strategyInput.dispatchEvent(
      new app.window.Event("change", { bubbles: true }),
    );
  }
  const action = aliases
    ? app.document.querySelector(`${modal} .alias-strategy-confirm`)
    : app.document.querySelector(`${modal} .import-space`);
  expect(action, "Visible import decision control").toBeTruthy();
  action.click();
}

export async function textImport({
  aliases = false,
  malformed = false,
  oversized = false,
} = {}) {
  await withApplication(async (app) => {
    const before = localStorage.getItem(ROOT);
    const content = oversized
      ? "x".repeat(MAX_STO_TEXT_IMPORT_BYTES + 1)
      : malformed
        ? `alias Slow <& ${" ".repeat(10000)}X`
        : aliases
          ? 'alias BrowserAlias "FireAll"'
          : 'F24 "FireAll"\n0x2 "encoded first"\n1 "display last"';
    app.document.querySelectorAll(".toast").forEach((toast) => toast.remove());
    const writes = vi.spyOn(app.window.Storage.prototype, "setItem");
    await chooseFile(
      app,
      aliases ? "#importAliasesBtn" : "#importKeybindsBtn",
      content,
      "browser-input.txt",
    );
    if (!oversized) await importDecision(app, { aliases });
    if (oversized || malformed) {
      await vi.waitFor(
        () =>
          expect(
            app.document.querySelector(".toast-error, .toast-warning"),
          ).toBeTruthy(),
        { timeout: 5000 },
      );
      expect(localStorage.getItem(ROOT)).toBe(before);
      expect(writes.mock.calls.filter(([key]) => key === ROOT)).toHaveLength(0);
    } else {
      await vi.waitFor(() => {
        if (aliases)
          expect(
            app.root().profiles.captain.aliases.BrowserAlias.commands,
          ).toEqual(["FireAll"]);
        else {
          expect(app.root().profiles.captain.builds.space.keys.F24).toEqual([
            "FireAll",
          ]);
          expect(app.root().profiles.captain.builds.space.keys["1"]).toEqual([
            "display last",
          ]);
        }
      });
      expect(app.root().profiles.captain.extension).toEqual({ retained: true });
      expect(app.root()).not.toHaveProperty("settings");
      app.element("#fileExplorerBtn").click();
      expect(
        app.element('#fileTree .profile[data-profileid="captain"]').textContent,
      ).toContain("Captain");
    }
  });
}

export async function kbfImport({
  single = false,
  cancel = false,
  invalid = null,
} = {}) {
  const variants = {
    "a prototype-sensitive nested key": { keyName: "__proto__" },
    "an unbounded activity range": {
      activityFields: "Activity:95;N1:0;N2:0;N3:10;",
    },
    "malformed Base64 activity text": {
      activityFields: "Activity:96;Text:not.base64;",
    },
    "a control character in a combo token": { combo: btoa("Alt\nF2") },
    "an excessive combo chord": {
      combo: Array.from({ length: 11 }, (_, index) =>
        btoa(`F${index + 1}`),
      ).join("*"),
    },
    "a negative execution order": { activityFields: "Activity:1;O:-1;" },
    // The destination configuration is an internal action contract; its exact
    // source-equivalent case remains. Browser ingress exercises hostile keys.
    "a prototype-sensitive destination": { keyName: "__proto__" },
  };
  await withApplication(async (app) => {
    const before = localStorage.getItem(ROOT);
    app.document.querySelectorAll(".toast").forEach((toast) => toast.remove());
    const writes = vi.spyOn(app.window.Storage.prototype, "setItem");
    const content = invalid
      ? createKBF(variants[invalid])
      : single
        ? multiBindsetKBF()
        : createKBF();
    await chooseFile(app, "#importKbfBtn", content, "browser-input.kbf");
    if (cancel) {
      await vi.waitFor(() =>
        expect(app.document.querySelector("#importModal.active")).toBeTruthy(),
      );
      app.document.dispatchEvent(
        new app.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      );
      await vi.waitFor(() =>
        expect(app.document.querySelector("#importModal")).toBeNull(),
      );
      await chooseFile(app, "#importKbfBtn", content, "browser-cancel.kbf");
      await vi.waitFor(() =>
        expect(app.document.querySelector("#importModal.active")).toBeTruthy(),
      );
      app.element("#modalOverlay").click();
      await vi.waitFor(() =>
        expect(app.document.querySelector("#importModal")).toBeNull(),
      );
      expect(localStorage.getItem(ROOT)).toBe(before);
      expect(writes.mock.calls.filter(([key]) => key === ROOT)).toHaveLength(0);
      return;
    }
    // KBF validation follows the visible environment/strategy decision, even
    // for malformed files. Do not wait for a parse error before that decision.
    await importDecision(app);
    if (invalid) {
      await vi.waitFor(
        () => expect(app.document.querySelector(".toast-error")).toBeTruthy(),
        { timeout: 5000 },
      );
      expect(localStorage.getItem(ROOT)).toBe(before);
      expect(writes.mock.calls.filter(([key]) => key === ROOT)).toHaveLength(0);
      return;
    }
    await vi.waitFor(() =>
      expect(
        app.document.querySelector("#enhancedBindsetSelectionModal.active"),
      ).toBeTruthy(),
    );
    const options = [
      ...app.document.querySelectorAll(".single-bindset-option"),
    ];
    expect(options).toHaveLength(single ? 2 : 1);
    const option = single
      ? options.find(
          (candidate) =>
            candidate.dataset.bindset?.toLowerCase() === "alternate",
        )
      : options[0];
    expect(option).toBeTruthy();
    option.click();
    expect(option.classList.contains("selected")).toBe(true);
    app.element(".single-bindset-confirm").click();
    await vi.waitFor(() =>
      expect(app.root().profiles.captain.builds.space.keys.F24).toEqual([
        "target_clear",
      ]),
    );
    expect(app.root().profiles.captain.builds.space.keys.F23).toBeUndefined();
    expect(app.root().profiles.captain.extension).toEqual({ retained: true });
  });
}

export async function restoreProject({ invalid = false } = {}) {
  await withApplication(async (app) => {
    const protectedKeys = [ROOT, SETTINGS, BACKUP];
    const before = protectedKeys.map((key) => [key, localStorage.getItem(key)]);
    const beforeProfile = app.element("#profileSelect").value;
    const beforeLabel = app.element(
      '#profileSelect option[value="captain"]',
    ).textContent;
    const beforeDiagnostics = app
      .diagnostics()
      .domains.filter(
        ({ domain }) => domain === "project" || domain === "settings",
      );
    const project = seededProject();
    project.profiles.captain.name = "Restored Captain";
    // Object-valued commands are supported legacy import records. A numeric
    // command list is the original ingress regression's rejected shape.
    if (invalid) project.profiles.captain.builds.space.keys.F1 = 42;
    const artifact = {
      type: "project",
      version: "1.0.0",
      data: {
        profiles: project.profiles,
        currentProfile: "captain",
        settings: { ...app.settings(), theme: "dark" },
      },
    };
    app.document.querySelectorAll(".toast").forEach((toast) => toast.remove());
    const writes = vi.spyOn(app.window.Storage.prototype, "setItem");
    await chooseFile(
      app,
      "#openProjectBtn",
      JSON.stringify(artifact),
      "project.json",
    );
    if (invalid) {
      await vi.waitFor(
        () => expect(app.document.querySelector(".toast-error")).toBeTruthy(),
        { timeout: 5000 },
      );
      expect(
        protectedKeys.map((key) => [key, localStorage.getItem(key)]),
      ).toEqual(before);
      expect(
        writes.mock.calls.filter(([key]) => protectedKeys.includes(key)),
      ).toHaveLength(0);
      expect(app.element("#profileSelect").value).toBe(beforeProfile);
      expect(
        app.element('#profileSelect option[value="captain"]').textContent,
      ).toBe(beforeLabel);
      expect(
        app
          .diagnostics()
          .domains.filter(
            ({ domain }) => domain === "project" || domain === "settings",
          ),
      ).toEqual(beforeDiagnostics);
    } else {
      await vi.waitFor(() => {
        expect(app.root().profiles.captain.name).toBe("Restored Captain");
        expect(
          app.element('#profileSelect option[value="captain"]').textContent,
        ).toContain("Restored Captain");
        expect(app.settings().theme).toBe("dark");
      });
      expect(app.root()).not.toHaveProperty("settings");
      expect(app.root().profiles.captain.extension).toEqual({ retained: true });
    }
  });
}
