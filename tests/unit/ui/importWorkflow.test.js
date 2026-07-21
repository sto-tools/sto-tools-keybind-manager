import { describe, expect, it, vi } from "vitest";

import {
  normalizeImportStrategy,
  runImportWorkflow,
} from "../../../src/js/components/ui/importWorkflow.js";

const createProfile = () => ({
  builds: {
    space: { keys: { F1: ["FireAll"] } },
    ground: { keys: { G1: ["Target_Next_Enemy"], G2: ["FireAll"] } },
  },
  aliases: {
    Fire: { commands: ["FireAll"] },
    Target: { commands: ["Target_Next_Enemy"] },
  },
});

const createCallbacks = (overrides = {}) => ({
  promptEnvironment: vi.fn(async (environment) => ({
    environment,
    strategy: "merge_keep",
  })),
  promptAliasStrategy: vi.fn(async () => "merge_keep"),
  showOverwriteConfirmation: vi.fn(async () => true),
  promptEnhancedBindsetSelection: vi.fn(async () => ({
    selectedBindsets: ["Master"],
  })),
  request: vi.fn(async () => ({ success: true })),
  ...overrides,
});

const run = (type, callbacks, overrides = {}) =>
  runImportWorkflow({
    type,
    content: `${type}-content`,
    profileId: "captain",
    currentEnvironment: "ground",
    profile: createProfile(),
    ...callbacks,
    ...overrides,
  });

describe("importWorkflow", () => {
  it.each([
    ["merge_keep", "merge_keep"],
    ["merge_overwrite", "merge_overwrite"],
    ["overwrite_all", "overwrite_all"],
    ["unexpected", "merge_keep"],
    ["", "merge_keep"],
    [null, "merge_keep"],
    [undefined, "merge_keep"],
  ])("normalizes strategy %j to %s", (input, expected) => {
    expect(normalizeImportStrategy(input)).toBe(expected);
  });

  it.each([
    ["merge_keep", "merge_keep"],
    ["merge_overwrite", "merge_overwrite"],
    ["invalid-form-value", "merge_keep"],
  ])(
    "dispatches a keybind text import with normalized %s strategy",
    async (selected, expected) => {
      const callbacks = createCallbacks({
        promptEnvironment: vi.fn(async () => ({
          environment: "space",
          strategy: selected,
        })),
      });
      const serviceResult = { success: true, imported: { keys: 1 } };
      callbacks.request.mockResolvedValue(serviceResult);

      await expect(run("keybinds", callbacks)).resolves.toEqual({
        status: "completed",
        importType: "keybinds",
        result: serviceResult,
      });

      expect(callbacks.promptEnvironment).toHaveBeenCalledWith(
        "ground",
        "keybinds",
      );
      expect(callbacks.request).toHaveBeenCalledExactlyOnceWith(
        "import:keybind-file",
        {
          content: "keybinds-content",
          profileId: "captain",
          environment: "space",
          strategy: expected,
        },
        0,
      );
      expect(callbacks.showOverwriteConfirmation).not.toHaveBeenCalled();
    },
  );

  it("confirms a destructive keybind import against the accepted snapshot", async () => {
    const callbacks = createCallbacks({
      promptEnvironment: vi.fn(async () => ({
        environment: "ground",
        strategy: "overwrite_all",
      })),
    });

    await run("keybinds", callbacks);

    expect(callbacks.showOverwriteConfirmation).toHaveBeenCalledExactlyOnceWith(
      "keys",
      2,
      0,
      "ground",
    );
    expect(callbacks.request).toHaveBeenCalledWith(
      "import:keybind-file",
      {
        content: "keybinds-content",
        profileId: "captain",
        environment: "ground",
        strategy: "overwrite_all",
      },
      0,
    );
  });

  it("preserves alias mode as the environment prompt default", async () => {
    const callbacks = createCallbacks({
      promptEnvironment: vi.fn(async () => ({
        environment: "ground",
        strategy: "merge_keep",
      })),
    });

    await run("keybinds", callbacks, { currentEnvironment: "alias" });

    expect(callbacks.promptEnvironment).toHaveBeenCalledWith(
      "alias",
      "keybinds",
    );
    expect(callbacks.request).toHaveBeenCalledWith(
      "import:keybind-file",
      {
        content: "keybinds-content",
        profileId: "captain",
        environment: "ground",
        strategy: "merge_keep",
      },
      0,
    );
  });

  it.each([
    [
      "environment",
      createCallbacks({ promptEnvironment: vi.fn(async () => null) }),
    ],
    [
      "overwrite",
      createCallbacks({
        promptEnvironment: vi.fn(async () => ({
          environment: "ground",
          strategy: "overwrite_all",
        })),
        showOverwriteConfirmation: vi.fn(async () => false),
      }),
    ],
  ])("cancels a keybind import at the %s stage", async (stage, callbacks) => {
    await expect(run("keybinds", callbacks)).resolves.toEqual({
      status: "cancelled",
      stage,
    });
    expect(callbacks.request).not.toHaveBeenCalled();
  });

  it("skips key confirmation when the accepted environment has no keys", async () => {
    const callbacks = createCallbacks({
      promptEnvironment: vi.fn(async () => ({
        environment: "space",
        strategy: "overwrite_all",
      })),
    });

    await run("keybinds", callbacks, {
      profile: { builds: { space: { keys: {} } }, aliases: {} },
    });

    expect(callbacks.showOverwriteConfirmation).not.toHaveBeenCalled();
    expect(callbacks.request).toHaveBeenCalledOnce();
  });

  it.each([
    ["merge_keep", "merge_keep"],
    ["merge_overwrite", "merge_overwrite"],
    ["invalid-form-value", "merge_keep"],
  ])(
    "dispatches an alias text import with normalized %s strategy",
    async (selected, expected) => {
      const callbacks = createCallbacks({
        promptAliasStrategy: vi.fn(async () => selected),
      });

      await run("aliases", callbacks);

      expect(callbacks.promptEnvironment).not.toHaveBeenCalled();
      expect(callbacks.request).toHaveBeenCalledExactlyOnceWith(
        "import:alias-file",
        {
          content: "aliases-content",
          profileId: "captain",
          strategy: expected,
        },
        0,
      );
      expect(callbacks.showOverwriteConfirmation).not.toHaveBeenCalled();
    },
  );

  it("confirms a destructive alias import against the accepted snapshot", async () => {
    const callbacks = createCallbacks({
      promptAliasStrategy: vi.fn(async () => "overwrite_all"),
    });

    await run("aliases", callbacks);

    expect(callbacks.showOverwriteConfirmation).toHaveBeenCalledExactlyOnceWith(
      "aliases",
      2,
      0,
    );
    expect(callbacks.request).toHaveBeenCalledWith(
      "import:alias-file",
      {
        content: "aliases-content",
        profileId: "captain",
        strategy: "overwrite_all",
      },
      0,
    );
  });

  it.each([
    [
      "strategy",
      createCallbacks({ promptAliasStrategy: vi.fn(async () => null) }),
    ],
    [
      "overwrite",
      createCallbacks({
        promptAliasStrategy: vi.fn(async () => "overwrite_all"),
        showOverwriteConfirmation: vi.fn(async () => false),
      }),
    ],
  ])("cancels an alias import at the %s stage", async (stage, callbacks) => {
    await expect(run("aliases", callbacks)).resolves.toEqual({
      status: "cancelled",
      stage,
    });
    expect(callbacks.request).not.toHaveBeenCalled();
  });

  it("runs the KBF parse, configuration, and import RPCs in order", async () => {
    const parseResult = {
      valid: true,
      bindsetNames: ["Master"],
      bindsetKeyCounts: { Master: 3 },
    };
    const configuration = {
      selectedBindsets: ["Master"],
      bindsetMappings: { Master: "primary" },
      bindsetRenames: {},
    };
    const importResult = { success: true, imported: { bindsets: 1 } };
    const callbacks = createCallbacks({
      promptEnvironment: vi.fn(async () => ({
        environment: "space",
        strategy: "merge_overwrite",
      })),
      promptEnhancedBindsetSelection: vi.fn(async () => configuration),
      request: vi
        .fn()
        .mockResolvedValueOnce(parseResult)
        .mockResolvedValueOnce(importResult),
    });

    await expect(
      run("kbf", callbacks, { bindsetsEnabled: false }),
    ).resolves.toEqual({
      status: "completed",
      importType: "kbf",
      result: importResult,
    });

    expect(callbacks.promptEnvironment).toHaveBeenCalledWith("ground", "kbf", {
      bindsetsEnabled: false,
    });
    expect(callbacks.request.mock.calls).toEqual([
      ["parse-kbf-file", { content: "kbf-content", environment: "space" }],
      [
        "import:kbf-file",
        {
          content: "kbf-content",
          profileId: "captain",
          environment: "space",
          strategy: "merge_overwrite",
          configuration,
        },
        0,
      ],
    ]);
    expect(callbacks.promptEnhancedBindsetSelection).toHaveBeenCalledWith(
      parseResult,
    );
  });

  it("returns an invalid KBF parse result without asking for configuration", async () => {
    const parseResult = {
      valid: false,
      error: "invalid_kbf_file_format",
      params: { path: "$.bindsets" },
    };
    const callbacks = createCallbacks({
      request: vi.fn(async () => parseResult),
    });

    await expect(run("kbf", callbacks)).resolves.toEqual({
      status: "invalid-kbf",
      parseResult,
    });
    expect(callbacks.request).toHaveBeenCalledExactlyOnceWith(
      "parse-kbf-file",
      { content: "kbf-content", environment: "ground" },
    );
    expect(callbacks.promptEnhancedBindsetSelection).not.toHaveBeenCalled();
  });

  it("cancels a KBF import when configuration selection is cancelled", async () => {
    const callbacks = createCallbacks({
      request: vi.fn(async () => ({ valid: true, bindsetNames: ["Master"] })),
      promptEnhancedBindsetSelection: vi.fn(async () => null),
    });

    await expect(run("kbf", callbacks)).resolves.toEqual({
      status: "cancelled",
      stage: "configuration",
    });
    expect(callbacks.request).toHaveBeenCalledOnce();
  });

  it("forwards invalid non-null KBF configuration to the canonical service validator", async () => {
    const invalidConfiguration = { selectedBindsets: "all" };
    const failure = { success: false, error: "invalid_kbf_configuration" };
    const callbacks = createCallbacks({
      promptEnhancedBindsetSelection: vi.fn(async () => invalidConfiguration),
      request: vi
        .fn()
        .mockResolvedValueOnce({ valid: true, bindsetNames: ["Master"] })
        .mockResolvedValueOnce(failure),
    });

    await expect(run("kbf", callbacks)).resolves.toEqual({
      status: "completed",
      importType: "kbf",
      result: failure,
    });
    expect(callbacks.request).toHaveBeenLastCalledWith(
      "import:kbf-file",
      {
        content: "kbf-content",
        profileId: "captain",
        environment: "ground",
        strategy: "merge_keep",
        configuration: invalidConfiguration,
      },
      0,
    );
  });

  it("rejects unsupported import types before invoking a callback", async () => {
    const callbacks = createCallbacks();

    await expect(run("project", callbacks)).rejects.toThrow(
      "Unsupported import type: project",
    );
    expect(callbacks.request).not.toHaveBeenCalled();
    expect(callbacks.promptEnvironment).not.toHaveBeenCalled();
    expect(callbacks.promptAliasStrategy).not.toHaveBeenCalled();
  });
});
