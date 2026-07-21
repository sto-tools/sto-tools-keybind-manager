import { existsSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { applicationGlobalAllowlist } from "../../../scripts/eslint/applicationGlobalAllowlist.mjs";
import {
  REPOSITORY_ROOT,
  RULE_NAME,
  messageIds,
  verify,
} from "./applicationGlobals.harness.js";

describe("application-global compatibility metadata", () => {
  it("freezes the exact 12-name post-static-data allowlist", () => {
    const expectedNames = [
      "applyTranslations",
      "commandChainUI",
      "confirmDialog",
      "dataCoordinator",
      "devMonitor",
      "eventBus",
      "i18next",
      "keyBrowserService",
      "keyBrowserUI",
      "stoSync",
      "stoUI",
      "storageService",
    ];

    expect(Object.keys(applicationGlobalAllowlist).sort()).toEqual(
      expectedNames,
    );
    expect(Object.isFrozen(applicationGlobalAllowlist)).toBe(true);
  });

  it("records complete immutable ownership and removal metadata", () => {
    const writerTuples = new Set();

    for (const [name, entry] of Object.entries(applicationGlobalAllowlist)) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(entry.classification).not.toBe("");
      expect(entry.purpose).not.toBe("");
      expect(entry.compatibilityOwner).not.toBe("");
      expect(entry.removalGate).not.toBe("");
      expect(entry.consumers.length).toBeGreaterThan(0);
      expect(entry.writers.length).toBeGreaterThan(0);
      expect(Object.isFrozen(entry.consumers)).toBe(true);
      expect(Object.isFrozen(entry.writers)).toBe(true);

      for (const writer of entry.writers) {
        const tuple = `${writer.file}:${writer.path}`;
        expect(writer.path === name || writer.path.startsWith(`${name}.`)).toBe(
          true,
        );
        expect(writerTuples.has(tuple)).toBe(false);
        expect(existsSync(path.join(REPOSITORY_ROOT, writer.file))).toBe(true);
        writerTuples.add(tuple);
      }
    }
  });

  it("tracks the known production and checked-bundle consumers", () => {
    expect(applicationGlobalAllowlist.eventBus.consumers).toContain(
      "src/js/lib/commandDisplayAdapter.js",
    );
    expect(applicationGlobalAllowlist.stoSync.consumers).toContain(
      "tests/browser/storage-boundary.test.js",
    );
    expect(applicationGlobalAllowlist.stoUI.consumers).toEqual([
      "src/js/components/services/StorageService.js",
      "src/js/components/services/dataCoordinatorDefaultUi.js",
      "src/js/components/ui/CommandUI.js",
      "src/js/components/ui/FileExplorerUI.js",
      "src/js/components/ui/InterfaceModeUI.js",
    ]);
    expect(applicationGlobalAllowlist.commandChainUI.consumers).toEqual([
      "src/js/app.js",
      "browser diagnostics",
    ]);
    expect(applicationGlobalAllowlist.confirmDialog.consumers).toContain(
      "src/js/app.js",
    );
    expect(applicationGlobalAllowlist.keyBrowserUI.consumers).toContain(
      "src/js/app.js",
    );
    expect(applicationGlobalAllowlist.keyBrowserService.consumers).toContain(
      "src/js/app.js",
    );
  });

  it.each([
    "dataService",
    "COMMAND_CATEGORIES",
    "KEY_LAYOUTS",
    "DEFAULT_SETTINGS",
    "SAMPLE_PROFILES",
    "SAMPLE_ALIASES",
    "TRAY_CONFIG",
    "stoCommandParser",
    "stoAliases",
    "STOError",
    "VertigoError",
    "InvalidEnvironmentError",
    "InvalidEffectError",
    "inputDialog",
    "stoKeybinds",
    "VFX_EFFECTS",
    "COMMANDS",
    "STO_DATA",
    "localizeCommandData",
  ])("does not retain the retired %s exposure", (name) => {
    expect(applicationGlobalAllowlist).not.toHaveProperty(name);
  });
});

describe("application-global write guard", () => {
  it("rejects the retired static-data writers from their former owner", () => {
    expect(
      messageIds(
        `
        window.STO_DATA = {};
        window["COMMANDS"] = {};
        window[\`localizeCommandData\`] = () => {};
      `,
        "src/js/data.js",
      ),
    ).toEqual(Array(3).fill("unallowlisted"));
  });

  it("accepts every main.js root and Object.assign writer", () => {
    const messages = verify(
      `
        window.i18next = {};
        window.applyTranslations = () => {};
        Object.assign(window, {
          storageService: {}, dataCoordinator: {}, stoUI: {},
          stoSync: {}, eventBus: {}
        });
      `,
      "src/js/main.js",
      { enforceDeclaredWriters: true },
    );

    expect(messages).toEqual([]);
  });

  it("accepts every app.js and DevMonitor.js writer", () => {
    const appMessages = verify(
      `
        window.confirmDialog = {};
        window.commandChainUI = {};
        window.keyBrowserUI = {};
        window.keyBrowserService = {};
      `,
      "src/js/app.js",
      { enforceDeclaredWriters: true },
    );
    const developmentMessages = verify(
      `
        window.i18next.t = () => {};
        window.applyTranslations = () => {};
        window.devMonitor = {};
      `,
      "src/js/dev/DevMonitor.js",
      { enforceDeclaredWriters: true },
    );

    expect(appMessages).toEqual([]);
    expect(developmentMessages).toEqual([]);
  });

  it("ignores native browser writes and locally shadowed built-ins", () => {
    expect(
      verify(
        `
          window.location.hash = "probe";
          globalThis.document.title = "probe";
          function local(window, Object) {
            window.dataService = {};
            Object.assign(window, { dataService: {} });
          }
        `,
        "src/js/example.js",
      ),
    ).toEqual([]);
  });

  it("rejects unknown, retired, wrong-file, and nested writes", () => {
    expect(
      messageIds(
        `
          window.newService = {};
          window.dataService = {};
          window.inputDialog = {};
          window.stoKeybinds = {};
          window.VFX_EFFECTS = {};
          window.STO_DATA = {};
          window.STO_DATA.commands = {};
          globalThis.window.stoAliases = {};
        `,
        "src/js/main.js",
      ),
    ).toEqual([
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
    ]);
  });

  it("treats inherited object names as unknown globals without crashing", () => {
    expect(
      messageIds(
        `
          window.constructor = value;
          window.toString = value;
          window.hasOwnProperty = value;
          window.valueOf = value;
          window.__proto__ = value;
        `,
        "src/js/example.js",
      ),
    ).toEqual(Array(5).fill("unallowlisted"));
  });

  it("rejects dynamic and opaque bulk writes", () => {
    expect(
      messageIds(
        `
          window[name] = value;
          Object.assign(window, source);
          Object.assign(window, { ...source });
          Object.assign(window, { storageService, newService });
        `,
        "src/js/main.js",
      ),
    ).toEqual(["dynamic", "opaqueBulk", "opaqueBulk", "unallowlisted"]);
  });

  it("covers computed, aliased bulk, native, array, and loop targets", () => {
    expect(
      messageIds(
        `
          window[\`stoAliases\`] = value;
          window[1] = value;
          Object.assign(window, {
            ["dataService"]: value,
            [\`newService\`]: value,
            [dynamicName]: value
          });
          const { assign } = Object;
          assign(window, { aliasedAssignGlobal: value });
          Object.assign(window.document, source);
          Object.assign(window.document, { ...source, [dynamicName]: value });
          [window.SAMPLE_PROFILES, ...window.TRAY_CONFIG] = values;
          for (window.DEFAULT_SETTINGS in values) {}
        `,
        "src/js/example.js",
      ),
    ).toEqual([
      "unallowlisted",
      "dynamic",
      "unallowlisted",
      "unallowlisted",
      "dynamic",
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
    ]);
  });

  it("checks reflected, defined, updated, deleted, and patterned writes", () => {
    expect(
      messageIds(
        `
          Object.defineProperty(window, "dataService", { value: {} });
          Object.defineProperties(window, { stoAliases: { value: {} } });
          Reflect.defineProperty(window, "newService", { value: {} });
          Reflect.set(window, dynamicName, {});
          window.dataService++;
          delete window.storageService;
          ({ value: window.stoCommandParser } = source);
          for (window.SAMPLE_PROFILES of values) {}
        `,
        "src/js/example.js",
      ),
    ).toEqual([
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
      "dynamic",
      "unallowlisted",
      "wrongWriter",
      "unallowlisted",
      "unallowlisted",
    ]);
  });

  it("checks global-qualified, aliased, legacy, and prototype writers", () => {
    expect(
      messageIds(
        `
          const define = globalThis.Object.defineProperty;
          const { defineProperties } = Object;
          const { set: reflectSet } = Reflect;
          globalThis.Object.defineProperty(window, "qualifiedGlobal", { value: {} });
          define(window, "aliasedGlobal", { value: {} });
          defineProperties(window, { destructuredBuiltinGlobal: { value: {} } });
          reflectSet(window, "reflectedAliasGlobal", {});
          window.__defineGetter__("getterGlobal", () => value);
          Object.setPrototypeOf(window, { prototypeGlobal: value });
        `,
        "src/js/example.js",
      ),
    ).toEqual(Array(6).fill("unallowlisted"));
  });

  it("rejects reflected definitions of retired static-data globals", () => {
    expect(
      messageIds(
        `
          Object.defineProperty(window, "STO_DATA", { value: {} });
          const { defineProperties } = Object;
          defineProperties(window, { ["COMMANDS"]: { value: {} } });
          window.localizeCommandData = () => {};
        `,
        "src/js/data.js",
      ),
    ).toEqual(Array(3).fill("unallowlisted"));
  });

  it("allows only the documented nested development mutation", () => {
    expect(
      messageIds(
        `
          window.i18next.t = replacement;
          window.i18next.language = "de";
          window.applyTranslations.wrapper = replacement;
        `,
        "src/js/dev/DevMonitor.js",
      ),
    ).toEqual(["wrongWriter", "wrongWriter"]);
  });

  it("records no producer metadata for the module-owned static data", () => {
    expect(
      verify("export {};", "src/js/data.js", {
        enforceDeclaredWriters: true,
      }),
    ).toEqual([]);
  });

  it("rejects mutation and removal spellings for retired static data", () => {
    expect(
      messageIds(
        `
          delete window.STO_DATA;
          ({ value: window.COMMANDS } = source);
          for (window.localizeCommandData of values) {}
        `,
        "src/js/data.js",
      ),
    ).toEqual(Array(3).fill("unallowlisted"));
  });
});

describe("application-global ESLint wiring", () => {
  it("enforces production source while leaving test fixtures out of scope", async () => {
    const eslint = new ESLint({ cwd: REPOSITORY_ROOT });
    const [sourceResult] = await eslint.lintText("window.dataService = {};", {
      filePath: path.join(REPOSITORY_ROOT, "src/js/global-probe.mjs"),
    });
    const [testResult] = await eslint.lintText("window.dataService = {};", {
      filePath: path.join(REPOSITORY_ROOT, "tests/unit/global-probe.test.js"),
    });

    expect(sourceResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageId: "unallowlisted",
          ruleId: RULE_NAME,
        }),
      ]),
    );
    expect(
      testResult.messages.filter((message) => message.ruleId === RULE_NAME),
    ).toEqual([]);
  });
});
