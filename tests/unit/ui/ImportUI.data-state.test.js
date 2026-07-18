import { afterEach, describe, expect, it, vi } from "vitest";

import ImportUI from "../../../src/js/components/ui/ImportUI.js";
import { buildKBFErrorMessage } from "../../../src/js/components/ui/importResultMessages.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";
import { MAX_STO_TEXT_IMPORT_BYTES } from "../../../src/js/components/services/textImportBoundary.js";
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

  it.each(["change", "cancel"])(
    "removes the hidden input when an empty picker ends with %s",
    async (eventName) => {
      fixture = createEventBusFixture();
      /** @type {Partial<Record<'change' | 'cancel', EventListener>>} */
      const handlers = {};
      const input = {
        type: "",
        accept: "",
        style: {},
        files: [],
        addEventListener: vi.fn((event, handler) => {
          if (event === "change" || event === "cancel") {
            handlers[event] = handler;
          }
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
        i18n: { t: (key) => key },
      });

      await ui.openFileDialog("keybinds");
      handlers[eventName]?.(new Event(eventName));

      expect(removeChild).toHaveBeenCalledTimes(1);
      expect(removeChild).toHaveBeenCalledWith(input);
    },
  );

  it("removes the hidden input after the user cancels an import prompt", async () => {
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
    const removeChild = vi.fn();
    ui = new ImportUI({
      eventBus: fixture.eventBus,
      document: {
        createElement: vi.fn(() => input),
        body: { appendChild: vi.fn(), removeChild },
        getElementById: vi.fn(),
      },
      i18n: { t: (key) => key },
    });
    ui.promptEnvironment = vi.fn(async () => null);
    ui.request = vi.fn();

    await ui.openFileDialog("keybinds");
    await changeHandler();

    await vi.waitFor(() => expect(removeChild).toHaveBeenCalledTimes(1));
    expect(ui.request).not.toHaveBeenCalled();
  });

  it.each(["error", "abort"])(
    "removes the hidden input when file reading ends with %s",
    async (eventName) => {
      fixture = createEventBusFixture();
      let changeHandler;
      /** @type {Array<{ onerror: ((event: Event) => unknown) | null, onabort: ((event: Event) => unknown) | null }>} */
      const readers = [];
      class ControlledFileReader {
        constructor() {
          this.result = null;
          /** @type {((event: Event) => unknown) | null} */
          this.onload = null;
          /** @type {((event: Event) => unknown) | null} */
          this.onerror = null;
          /** @type {((event: Event) => unknown) | null} */
          this.onabort = null;
          readers.push(this);
        }

        readAsText() {}
      }
      vi.stubGlobal("FileReader", ControlledFileReader);
      const input = {
        type: "",
        accept: "",
        style: {},
        files: [new File(["content"], "binds.txt")],
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
        i18n: { t: (key) => key },
      });

      await ui.openFileDialog("keybinds");
      await changeHandler();
      const reader = readers[0];
      if (eventName === "error") {
        reader.onerror?.(new Event("error"));
      } else {
        reader.onabort?.(new Event("abort"));
      }

      expect(removeChild).toHaveBeenCalledTimes(1);
      expect(removeChild).toHaveBeenCalledWith(input);
    },
  );

  it.each(["construction", "read"])(
    "removes the hidden input after a synchronous FileReader %s failure",
    async (phase) => {
      fixture = createEventBusFixture();
      let changeHandler;
      const failure = new Error(`${phase} failed`);
      class ThrowingFileReader {
        constructor() {
          if (phase === "construction") throw failure;
          this.result = null;
          this.onload = null;
          this.onerror = null;
          this.onabort = null;
        }

        readAsText() {
          throw failure;
        }
      }
      vi.stubGlobal("FileReader", ThrowingFileReader);
      const input = {
        type: "",
        accept: "",
        style: {},
        files: [new File(["content"], "binds.txt")],
        addEventListener: vi.fn((event, handler) => {
          if (event === "change") changeHandler = handler;
        }),
        click: vi.fn(),
      };
      const removeChild = vi.fn();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      ui = new ImportUI({
        eventBus: fixture.eventBus,
        document: {
          createElement: vi.fn(() => input),
          body: { appendChild: vi.fn(), removeChild },
          getElementById: vi.fn(),
        },
        i18n: { t: (key) => key },
      });

      await ui.openFileDialog("keybinds");
      await changeHandler();

      expect(removeChild).toHaveBeenCalledTimes(1);
      expect(removeChild).toHaveBeenCalledWith(input);
      expect(consoleError).toHaveBeenCalledWith(
        "[ImportUI] Failed to import file:",
        failure.message,
      );
    },
  );

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
      expect(ui.request).toHaveBeenCalledWith("import:keybind-file", {
        content: 'F1 "FireAll"',
        profileId: "alpha",
        environment: "ground",
        strategy: "overwrite_all",
      });
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
      expect(ui.request).toHaveBeenCalledWith("import:alias-file", {
        content: 'alias Fire "FireAll"',
        profileId: null,
        strategy: "overwrite_all",
      });
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
    ["keybinds", "keybind_file_too_large"],
    ["aliases", "alias_file_too_large"],
  ])(
    "rejects an oversized %s file before reading or prompting",
    async (type, errorKey) => {
      fixture = createEventBusFixture();
      let changeHandler;
      const file = new File(
        ["x".repeat(MAX_STO_TEXT_IMPORT_BYTES + 1)],
        "oversized.txt",
      );
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
        `${errorKey}:${file.size}:${MAX_STO_TEXT_IMPORT_BYTES}`,
        "error",
      );
      expect(ui.promptEnvironment).not.toHaveBeenCalled();
      expect(ui.promptAliasStrategy).not.toHaveBeenCalled();
      expect(ui.request).not.toHaveBeenCalled();
      expect(removeChild).toHaveBeenCalledWith(input);
    },
  );
});
