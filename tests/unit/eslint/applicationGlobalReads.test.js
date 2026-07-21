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
  it("accepts exact direct and aliased production readers", () => {
    expect(
      verifyReads(
        `
          const runtime = globalThis;
          runtime.stoUI?.showToast("saved");
          runtime.confirmDialog?.confirm("continue");
          window.document.querySelector("main");
        `,
        "src/js/components/ui/CommandUI.js",
        { enforceDeclaredReaders: true },
      ),
    ).toEqual([]);
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

  it("rejects unknown and wrong-file reads through every global spelling", () => {
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
      "wrongReader",
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
    ).toEqual(["unallowlisted", "dynamic", "opaque"]);
  });

  it("does not count producer writes or native browser access as reads", () => {
    expect(
      verifyReads(
        `
          window.i18next = {};
          window.i18next.t = replacement;
          delete window.applyTranslations;
          window.location.hash = "probe";
          globalThis.requestAnimationFrame(callback);
        `,
        "src/js/main.js",
      ),
    ).toEqual([]);
  });

  it("ratchets stale production reader metadata", () => {
    expect(
      readMessageIds("export {};", "src/js/components/ui/CommandUI.js", {
        enforceDeclaredReaders: true,
      }),
    ).toEqual(["stale", "stale"]);
  });

  it("records only live production consumers for retired bridges", () => {
    expect(applicationGlobalAllowlist).not.toHaveProperty("stoFileExplorer");
    expect(applicationGlobalAllowlist).not.toHaveProperty("inputDialog");
    expect(applicationGlobalAllowlist).not.toHaveProperty("stoKeybinds");
    expect(applicationGlobalAllowlist).not.toHaveProperty("VFX_EFFECTS");
    expect(applicationGlobalAllowlist).not.toHaveProperty("STO_DATA");
    expect(applicationGlobalAllowlist).not.toHaveProperty("COMMANDS");
    expect(applicationGlobalAllowlist).not.toHaveProperty(
      "localizeCommandData",
    );
    expect(applicationGlobalAllowlist.commandChainUI.consumers).not.toContain(
      "src/js/components/ui/CommandLibraryUI.js",
    );
    expect(applicationGlobalAllowlist.stoUI.consumers).not.toContain(
      "src/js/components/ui/CommandChainUI.js",
    );
    expect(
      applicationGlobalAllowlist.applyTranslations.consumers,
    ).not.toContain("src/js/components/ui/CommandChainUI.js");
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
