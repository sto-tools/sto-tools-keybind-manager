import { afterEach, describe, expect, it, vi } from "vitest";

import ImportUI from "../../../src/js/components/ui/ImportUI.js";
import { buildKBFErrorMessage } from "../../../src/js/components/ui/importResultMessages.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";
import { MAX_STO_TEXT_IMPORT_BYTES } from "../../../src/js/components/services/textImportBoundary.js";
import { MAX_KBF_FILE_BYTES } from "../../../src/js/lib/kbf/kbfLimits.js";
import en from "../../../src/i18n/en.json";

const kbfParseErrorKeys = [
  "invalid_kbf_file_content",
  "invalid_environment",
  "invalid_kbf_file_format",
  "invalid_kbf_parse_result",
  "no_valid_bindsets_found",
  "kbf_parse_critical_error",
];

/** @type {import('../../../src/js/types/rpc/import-export.js').KBFImportError[]} */
const kbfImportErrorKeys = [
  "invalid_kbf_file_content",
  "storage_not_available",
  "no_active_profile",
  "invalid_environment",
  "invalid_kbf_file_format",
  "invalid_kbf_parse_result",
  "invalid_kbf_configuration",
  "no_valid_bindsets_found",
  "profile_not_found",
  "multiple_bindsets_not_allowed",
  "non_primary_mapping_not_allowed",
  "kbf_import_critical_error",
];

const profile = (name, keyCount, aliasCount) => ({
  id: name.toLowerCase(),
  name,
  currentEnvironment: "ground",
  environment: "ground",
  builds: {
    space: { keys: {} },
    ground: {
      keys: Object.fromEntries(
        Array.from({ length: keyCount }, (_, index) => [
          `F${index + 1}`,
          ["FireAll"],
        ]),
      ),
    },
  },
  aliases: Object.fromEntries(
    Array.from({ length: aliasCount }, (_, index) => [
      `alias_${index}`,
      { commands: ["FireAll"] },
    ]),
  ),
});

describe("ImportUI accepted data state", () => {
  let fixture;
  let ui;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses one accepted snapshot for profile, environment, and overwrite counts", async () => {
    fixture = createEventBusFixture();
    let changeHandler;
    const input = {
      type: "",
      accept: "",
      style: {},
      files: [new File(['F1 "FireAll"'], "binds.txt")],
      addEventListener: vi.fn((event, handler) => {
        if (event === "change") changeHandler = handler;
      }),
      click: vi.fn(),
    };
    const document = {
      createElement: vi.fn(() => input),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      getElementById: vi.fn(),
    };
    ui = new ImportUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.init();

    const originalProfile = profile("Alpha", 2, 1);
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 10,
        currentProfile: "alpha",
        currentEnvironment: "alias",
        currentProfileData: originalProfile,
        profiles: { alpha: originalProfile },
      }),
    });

    ui.promptEnvironment = vi.fn(async () => {
      const replacementProfile = profile("Beta", 5, 4);
      fixture.eventBus.emit("data:state-changed", {
        reason: "initial-load",
        state: createDataCoordinatorState({
          authorityEpoch: 11,
          currentProfile: "beta",
          currentEnvironment: "space",
          currentProfileData: replacementProfile,
          profiles: { beta: replacementProfile },
        }),
      });
      return { environment: "ground", strategy: "overwrite_all" };
    });
    ui.showOverwriteConfirmation = vi.fn(async () => true);
    ui.request = vi.fn(async (topic) => {
      if (topic === "import:keybind-file") {
        return { success: true, imported: { keys: 1 } };
      }
      throw new Error(`Unexpected request: ${topic}`);
    });

    await ui.openFileDialog("keybinds");
    await changeHandler();

    await vi.waitFor(() => {
      expect(ui.request).toHaveBeenCalledWith(
        "import:keybind-file",
        {
          content: 'F1 "FireAll"',
          profileId: "alpha",
          environment: "ground",
          strategy: "overwrite_all",
        },
        0,
      );
    });
    expect(ui.promptEnvironment).toHaveBeenCalledWith("alias", "keybinds");
    expect(ui.showOverwriteConfirmation).toHaveBeenCalledWith(
      "keys",
      2,
      0,
      "ground",
    );
    expect(ui.request).not.toHaveBeenCalledWith(
      "data:get-current-state",
      expect.anything(),
    );
    expect(ui).not.toHaveProperty("storage");
  });

  it("preserves the pre-ready empty fallback without querying state", async () => {
    fixture = createEventBusFixture();
    let changeHandler;
    const input = {
      type: "",
      accept: "",
      style: {},
      files: [new File(['alias Fire "FireAll"'], "aliases.txt")],
      addEventListener: vi.fn((event, handler) => {
        if (event === "change") changeHandler = handler;
      }),
      click: vi.fn(),
    };
    ui = new ImportUI({
      eventBus: fixture.eventBus,
      document: {
        createElement: vi.fn(() => input),
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
        getElementById: vi.fn(),
      },
      i18n: { t: (key) => key },
    });
    ui.init();
    ui.promptAliasStrategy = vi.fn(async () => "overwrite_all");
    ui.showOverwriteConfirmation = vi.fn(async () => true);
    ui.request = vi.fn(async (topic, payload) => {
      if (topic === "import:alias-file") {
        return { success: true, imported: { aliases: 1 }, payload };
      }
      throw new Error(`Unexpected request: ${topic}`);
    });

    await ui.openFileDialog("aliases");
    await changeHandler();

    await vi.waitFor(() => {
      expect(ui.request).toHaveBeenCalledWith(
        "import:alias-file",
        {
          content: 'alias Fire "FireAll"',
          profileId: null,
          strategy: "overwrite_all",
        },
        0,
      );
    });
    expect(ui.showOverwriteConfirmation).not.toHaveBeenCalled();
  });

  it.each(kbfParseErrorKeys)(
    "renders the English translation for KBF parse failure %s",
    async (errorKey) => {
      fixture = createEventBusFixture();
      let changeHandler;
      const input = {
        type: "",
        accept: "",
        style: {},
        files: [new File(["invalid-kbf"], "invalid.kbf")],
        addEventListener: vi.fn((event, handler) => {
          if (event === "change") changeHandler = handler;
        }),
        click: vi.fn(),
      };
      const translate = vi.fn((key) => en[key] ?? key);
      ui = new ImportUI({
        eventBus: fixture.eventBus,
        document: {
          createElement: vi.fn(() => input),
          body: { appendChild: vi.fn(), removeChild: vi.fn() },
          getElementById: vi.fn(),
        },
        i18n: { t: translate },
      });
      ui.init();
      ui.promptEnvironment = vi.fn(async (environment) => ({
        environment,
        strategy: "merge_keep",
      }));
      ui.request = vi.fn(async (topic) => {
        if (topic === "parse-kbf-file") {
          return {
            valid: false,
            error: errorKey,
            message: errorKey,
            params: { path: "$.bindsets" },
          };
        }
        throw new Error(`Unexpected request: ${topic}`);
      });
      const showToast = vi.spyOn(ui, "showToast");

      await ui.openFileDialog("kbf");
      await changeHandler();

      await vi.waitFor(() => {
        expect(showToast).toHaveBeenCalledWith(en[errorKey], "error");
      });
      expect(en[errorKey]).toEqual(expect.any(String));
      expect(en[errorKey]).not.toBe(errorKey);
      expect(translate).toHaveBeenCalledWith(errorKey, {
        path: "$.bindsets",
      });
    },
  );

  it.each(kbfImportErrorKeys)(
    "renders the English translation for KBF import failure %s",
    (errorKey) => {
      const translate = vi.fn((key) => en[key] ?? key);
      const message = buildKBFErrorMessage(
        {
          success: false,
          error: errorKey,
          params: {},
          errors: [],
          warnings: [],
        },
        translate,
      );

      expect(message).toBe(en[errorKey]);
      expect(en[errorKey]).toEqual(expect.any(String));
      expect(en[errorKey]).not.toBe(errorKey);
      expect(translate).toHaveBeenCalledWith(errorKey, {});
    },
  );

  it.each([
    ["keybinds", "keybind_file_too_large", MAX_STO_TEXT_IMPORT_BYTES],
    ["aliases", "alias_file_too_large", MAX_STO_TEXT_IMPORT_BYTES],
    ["kbf", "kbf_file_too_large", MAX_KBF_FILE_BYTES],
  ])(
    "rejects an oversized %s file before reading or prompting",
    async (type, errorKey, maxBytes) => {
      fixture = createEventBusFixture();
      let changeHandler;
      const file = new File(["x".repeat(maxBytes + 1)], "oversized.txt");
      const input = {
        type: "",
        accept: "",
        style: {},
        files: [file],
        addEventListener: vi.fn((event, handler) => {
          if (event === "change") changeHandler = handler;
        }),
        click: vi.fn(),
      };
      const removeChild = vi.fn();
      ui = new ImportUI({
        eventBus: fixture.eventBus,
        document: {
          createElement: vi.fn(() => input),
          body: { appendChild: vi.fn(), removeChild },
          getElementById: vi.fn(),
        },
        i18n: {
          t: (key, params) => `${key}:${params?.size}:${params?.limit}`,
        },
      });
      ui.init();
      ui.request = vi.fn();
      ui.promptEnvironment = vi.fn();
      ui.promptAliasStrategy = vi.fn();
      const showToast = vi.spyOn(ui, "showToast");

      await ui.openFileDialog(type);
      await changeHandler();

      expect(showToast).toHaveBeenCalledWith(
        `${errorKey}:${file.size}:${maxBytes}`,
        "error",
      );
      expect(ui.promptEnvironment).not.toHaveBeenCalled();
      expect(ui.promptAliasStrategy).not.toHaveBeenCalled();
      expect(ui.request).not.toHaveBeenCalled();
      expect(removeChild).toHaveBeenCalledWith(input);
    },
  );
});
