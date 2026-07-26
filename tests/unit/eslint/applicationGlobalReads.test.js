import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { applicationGlobalAllowlist } from "../../../scripts/eslint/applicationGlobalAllowlist.mjs";
import {
  READ_RULE_NAME,
  REPOSITORY_ROOT,
  readMessageIds,
  verifyReads,
} from "./applicationGlobals.harness.js";

describe("application-global read guard", () => {
  it("accepts native reads while rejecting retired aliased confirmation", () => {
    expect(
      readMessageIds(
        `
          const runtime = globalThis;
          runtime.confirmDialog?.confirm("continue");
          window.document.querySelector("main");
        `,
        "src/js/components/ui/CommandUI.js",
      ),
    ).toEqual(["unallowlisted"]);
  });

  it("rejects reads of the retired static-data globals", () => {
    expect(
      readMessageIds(
        `
          const data = window.STO_DATA;
          void window.COMMANDS;
          window.localizeCommandData?.();
        `,
        "src/js/main.js",
      ),
    ).toEqual(Array(3).fill("unallowlisted"));
  });

  it("rejects unknown and retired reads through every global spelling", () => {
    expect(
      readMessageIds(
        `
          window.app?.setModified(true);
          globalThis["dataService"];
          self.STO_DATA;
          const runtime = globalThis;
          runtime.commandChainUI;
        `,
        "src/js/example.js",
      ),
    ).toEqual([
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
    ]);
  });

  it("tracks immutable aliases and rejects dynamic reads", () => {
    expect(
      readMessageIds(
        `
          const direct = window;
          const nullable = typeof window === "undefined" ? null : window;
          direct[name];
          nullable?.["app"];
        `,
        "src/js/example.js",
      ),
    ).toEqual(["dynamic", "unallowlisted"]);
  });

  it("rejects laundering the global object or an alias through opaque values", () => {
    expect(
      readMessageIds(
        `
          const runtime = window;
          consume(runtime);
          construct(new Consumer(globalThis));
          const wrapped = { runtime };
          const list = [window];
          function expose() {
            return runtime;
          }
          void wrapped;
          void list;
          void expose;
        `,
        "src/js/example.js",
      ),
    ).toEqual(Array(5).fill("opaque"));
  });

  it("does not mistake a shadowed Object.assign call for a global write", () => {
    expect(
      readMessageIds(
        `
          const Object = { assign: consume };
          Object.assign(window, { eventBus });
        `,
        "src/js/example.js",
      ),
    ).toEqual(["opaque"]);
  });

  it("checks destructured reads and rejects opaque extraction", () => {
    expect(
      readMessageIds(
        `
          const { stoUI } = window;
          const { app } = window;
          const { [name]: dynamic } = window;
          const { ...snapshot } = window;
          void stoUI;
          void app;
          void dynamic;
          void snapshot;
        `,
        "src/js/components/ui/CommandUI.js",
      ),
    ).toEqual(["unallowlisted", "unallowlisted", "dynamic", "opaque"]);
  });

  it("does not count producer writes or native browser access as reads", () => {
    expect(
      verifyReads(
        `
          window.storageService = {};
          delete window.storageService;
          window.location.hash = "probe";
          globalThis.requestAnimationFrame(callback);
          Object.assign(window, { eventBus });
        `,
        "src/js/main.js",
      ),
    ).toEqual([]);
  });

  it("records no application reader metadata for app composition", () => {
    expect(
      readMessageIds("export {};", "src/js/app.js", {
        enforceDeclaredReaders: true,
      }),
    ).toEqual([]);
  });

  it.each([
    "src/js/components/services/dataCoordinatorDefaultUi.js",
    "src/js/components/ui/CommandUI.js",
    "src/js/components/ui/FileExplorerUI.js",
    "src/js/components/ui/InterfaceModeUI.js",
  ])("rejects the retired stoUI exposure in %s", (file) => {
    expect(readMessageIds("void globalThis.stoUI;", file)).toEqual([
      "unallowlisted",
    ]);
  });

  it("records only the deliberate development diagnostic consumers", () => {
    expect(applicationGlobalAllowlist).not.toHaveProperty("stoFileExplorer");
    expect(applicationGlobalAllowlist).not.toHaveProperty("inputDialog");
    expect(applicationGlobalAllowlist).not.toHaveProperty("stoKeybinds");
    expect(applicationGlobalAllowlist).not.toHaveProperty("VFX_EFFECTS");
    expect(applicationGlobalAllowlist).not.toHaveProperty("STO_DATA");
    expect(applicationGlobalAllowlist).not.toHaveProperty("COMMANDS");
    expect(applicationGlobalAllowlist).not.toHaveProperty(
      "localizeCommandData",
    );
    expect(applicationGlobalAllowlist).not.toHaveProperty("stoUI");
    expect(applicationGlobalAllowlist).not.toHaveProperty("stoSync");
    expect(applicationGlobalAllowlist).not.toHaveProperty("confirmDialog");
    expect(applicationGlobalAllowlist).not.toHaveProperty("i18next");
    expect(applicationGlobalAllowlist).not.toHaveProperty("applyTranslations");
    expect(applicationGlobalAllowlist).not.toHaveProperty("storageService");
    expect(applicationGlobalAllowlist).not.toHaveProperty("dataCoordinator");
    expect(applicationGlobalAllowlist).not.toHaveProperty("eventBus");
    expect(applicationGlobalAllowlist).not.toHaveProperty("commandChainUI");
    expect(applicationGlobalAllowlist).not.toHaveProperty("keyBrowserUI");
    expect(applicationGlobalAllowlist).not.toHaveProperty("keyBrowserService");
    expect(applicationGlobalAllowlist.devMonitor.consumers).toEqual([
      "development console",
      "tests/browser-setup.js",
      "tests/fixtures/ui/applicationRuntime.js",
    ]);
    expect(
      readMessageIds(
        "void globalThis.stoSync;",
        "src/js/components/ui/PreferencesUI.js",
      ),
    ).toEqual(["unallowlisted"]);
    expect(
      readMessageIds(
        "void globalThis.inputDialog;",
        "src/js/components/ui/BindsetManagerUI.js",
      ),
    ).toEqual(["unallowlisted"]);
    expect(
      readMessageIds("void globalThis.stoKeybinds;", "src/js/main.js"),
    ).toEqual(["unallowlisted"]);
    expect(
      readMessageIds(
        "void globalThis.VFX_EFFECTS;",
        "src/js/components/services/VFXManagerService.js",
      ),
    ).toEqual(["unallowlisted"]);
    expect(
      readMessageIds(
        "void globalThis.VFX_EFFECTS;",
        "src/js/components/ui/VFXManagerUI.js",
      ),
    ).toEqual(["unallowlisted"]);
  });

  it.each([
    ["storageService", "src/js/main.js"],
    ["dataCoordinator", "src/js/main.js"],
    ["eventBus", "src/js/lib/commandDisplayAdapter.js"],
    ["commandChainUI", "src/js/app.js"],
    ["keyBrowserUI", "src/js/app.js"],
    ["keyBrowserService", "src/js/app.js"],
  ])("rejects the retired %s read in %s", (name, file) => {
    expect(readMessageIds(`void globalThis.${name};`, file)).toEqual([
      "unallowlisted",
    ]);
  });

  it.each([
    "tests/browser-setup.js",
    "tests/fixtures/ui/applicationRuntime.js",
  ])("accepts the explicit DevMonitor diagnostic read in %s", (file) => {
    expect(
      verifyReads("void window.devMonitor;", file, {
        enforceDeclaredReaders: true,
      }),
    ).toEqual([]);
  });
});

describe("application-global read ESLint wiring", () => {
  it("enforces production source while leaving test fixtures out of scope", async () => {
    const eslint = new ESLint({ cwd: REPOSITORY_ROOT });
    const [sourceResult] = await eslint.lintText("void window.app;", {
      filePath: path.join(REPOSITORY_ROOT, "src/js/global-read-probe.mjs"),
    });
    const [testResult] = await eslint.lintText("void window.app;", {
      filePath: path.join(REPOSITORY_ROOT, "tests/unit/global-probe.test.js"),
    });

    expect(sourceResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageId: "unallowlisted",
          ruleId: READ_RULE_NAME,
        }),
      ]),
    );
    expect(
      testResult.messages.filter(
        (message) => message.ruleId === READ_RULE_NAME,
      ),
    ).toEqual([]);
  });
});
