import { describe, expect, it } from "vitest";

import {
  createCommandChainPreviewPlan,
  formatCommandChainAliasPreview,
  planPreviewClipboardCopy,
  projectPreviewClipboardResult,
  projectMirroringCommands,
  settleCommandChainPreview,
} from "../../../src/js/components/services/commandChainPreviewProjection.js";

describe("command-chain alias preview projection", () => {
  it("formats string and rich commands in their existing order", () => {
    expect(
      formatCommandChainAliasPreview("MyAlias", [
        "FireAll",
        { command: "FirePhasers" },
        "Distribute_Shields",
      ]),
    ).toBe("alias MyAlias <& FireAll $$ FirePhasers $$ Distribute_Shields &>");
  });

  it("preserves command text exactly without trimming", () => {
    expect(
      formatCommandChainAliasPreview("MyAlias", [
        " FireAll ",
        { command: "  FirePhasers" },
      ]),
    ).toBe("alias MyAlias <&  FireAll  $$   FirePhasers &>");
  });

  it("filters empty and nullish entries while retaining truthy legacy values", () => {
    expect(
      formatCommandChainAliasPreview("MyAlias", [
        "FireAll",
        "",
        null,
        undefined,
        {},
        { command: 7 },
        "FirePhasers",
      ]),
    ).toBe("alias MyAlias <& FireAll $$ 7 $$ FirePhasers &>");
  });

  it.each([[], null, undefined, {}, "FireAll"])(
    "uses the exact empty-chain form for %j",
    (commands) => {
      expect(formatCommandChainAliasPreview("MyAlias", commands)).toBe(
        "alias MyAlias <&  &>",
      );
    },
  );

  it("returns an empty string when the alias name is absent", () => {
    expect(formatCommandChainAliasPreview("", ["FireAll"])).toBe("");
    expect(formatCommandChainAliasPreview(null, ["FireAll"])).toBe("");
  });

  it("falls back to an empty chain when a malformed command throws", () => {
    const malformed = {};
    Object.defineProperty(malformed, "command", {
      get() {
        throw new Error("unreadable command");
      },
    });

    expect(
      formatCommandChainAliasPreview("MyAlias", ["FireAll", malformed]),
    ).toBe("alias MyAlias <&  &>");
  });

  it("retains the empty-chain fallback for a revoked command-list proxy", () => {
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();

    expect(formatCommandChainAliasPreview("MyAlias", proxy)).toBe(
      "alias MyAlias <&  &>",
    );
  });
});

describe("command-chain mirroring request projection", () => {
  it("preserves the exact mirroring fields while dropping unrelated metadata", () => {
    const commands = [
      "FireAll",
      {
        command: "TrayExecByTray 0 0",
        placement: "in-pivot-group",
        palindromicGeneration: false,
        displayText: "ignored",
      },
    ];

    expect(projectMirroringCommands(commands)).toEqual([
      { command: "FireAll" },
      {
        command: "TrayExecByTray 0 0",
        placement: "in-pivot-group",
        palindromicGeneration: false,
      },
    ]);
    expect(commands[1]).toHaveProperty("displayText", "ignored");
  });

  it("removes sparse entries without mutating the caller's array", () => {
    const commands = Array(2);
    commands[1] = "FireAll";

    expect(projectMirroringCommands(commands)).toEqual([
      { command: "FireAll" },
    ]);
    expect(commands).toHaveLength(2);
    expect(0 in commands).toBe(false);
  });
});

describe("command-chain preview planning", () => {
  it("projects ordinary key and alias previews with exact legacy command text", () => {
    const keyPlan = createCommandChainPreviewPlan({
      environment: "space",
      selectedName: "F1",
      commands: [" FireAll ", { command: 7 }, ""],
    });
    const aliasPlan = createCommandChainPreviewPlan({
      environment: "alias",
      selectedName: "MyAlias",
      commands: ["FireAll", { command: " FirePhasers " }],
    });

    expect(keyPlan).toEqual({
      labelKey: "generated_command",
      commandPreview: 'F1 " FireAll  $$ 7"',
      generatedAlias: {
        visible: false,
        content: { type: "literal", text: "" },
      },
      mirroring: null,
      diagnostic: null,
    });
    expect(aliasPlan).toEqual({
      labelKey: "generated_alias",
      commandPreview: "alias MyAlias <& FireAll $$  FirePhasers  &>",
      generatedAlias: {
        visible: false,
        content: { type: "literal", text: "" },
      },
      mirroring: null,
      diagnostic: null,
    });
  });

  it("projects bind-to-alias copy from the canonical generated name", () => {
    const plan = createCommandChainPreviewPlan({
      environment: "ground",
      selectedName: "Shift+Space",
      bindset: "Away Team",
      bindToAliasMode: true,
      commands: ["target_enemy_near", "+forward 1"],
    });

    expect(plan).toEqual({
      labelKey: "generated_command",
      commandPreview: 'Shift+Space "sto_kb_ground_away_team_shift_space"',
      generatedAlias: {
        visible: true,
        content: {
          type: "literal",
          text: "alias sto_kb_ground_away_team_shift_space <& target_enemy_near $$ +forward 1 &>",
        },
      },
      mirroring: null,
      diagnostic: null,
    });
  });

  it("returns translated invalid-name intent with the exact command fallback", () => {
    const plan = createCommandChainPreviewPlan({
      environment: "space",
      selectedName: "   ",
      bindToAliasMode: true,
      commands: [],
    });

    expect(plan).toEqual({
      labelKey: "generated_command",
      commandPreview: '    "..."',
      generatedAlias: {
        visible: true,
        content: {
          type: "translation",
          key: "invalid_key_name_for_alias_generation",
          options: { defaultValue: "Invalid key name for alias generation" },
        },
      },
      mirroring: null,
      diagnostic: null,
    });
  });

  it("plans and settles ordinary mirroring without changing the local fallback", () => {
    const plan = createCommandChainPreviewPlan({
      environment: "space",
      selectedName: "F1",
      stabilized: true,
      commands: [
        "FireAll",
        {
          command: "TrayExecByTray 0 0",
          placement: "in-pivot-group",
          palindromicGeneration: false,
          displayText: "not transported",
        },
      ],
    });

    expect(plan.commandPreview).toBe('F1 "FireAll $$ TrayExecByTray 0 0"');
    expect(plan.mirroring).toEqual({
      destination: "commandPreview",
      request: {
        commands: [
          { command: "FireAll" },
          {
            command: "TrayExecByTray 0 0",
            placement: "in-pivot-group",
            palindromicGeneration: false,
          },
        ],
      },
      template: { prefix: 'F1 "', suffix: '"' },
    });

    const settled = settleCommandChainPreview(
      plan,
      "FireAll $$ TrayExecByTray 0 0 $$ FireAll",
    );
    expect(settled.commandPreview).toBe(
      'F1 "FireAll $$ TrayExecByTray 0 0 $$ FireAll"',
    );
    expect(settled.mirroring).toBeNull();
    expect(plan.commandPreview).toBe('F1 "FireAll $$ TrayExecByTray 0 0"');
    expect(plan.mirroring).not.toBeNull();
  });

  it("plans and settles bind-to-alias mirroring at the alias destination", () => {
    const plan = createCommandChainPreviewPlan({
      environment: "space",
      selectedName: "Q",
      bindToAliasMode: true,
      stabilized: true,
      commands: ["FireAll", "FirePhasers"],
    });

    expect(plan.mirroring).toMatchObject({
      destination: "generatedAlias",
      template: { prefix: "alias sto_kb_space_q <& ", suffix: " &>" },
    });
    expect(plan.generatedAlias.content).toEqual({
      type: "literal",
      text: "alias sto_kb_space_q <& FireAll $$ FirePhasers &>",
    });

    const settled = settleCommandChainPreview(
      plan,
      "FireAll $$ FirePhasers $$ FireAll",
    );
    expect(settled.generatedAlias.content).toEqual({
      type: "literal",
      text: "alias sto_kb_space_q <& FireAll $$ FirePhasers $$ FireAll &>",
    });
    expect(settled.commandPreview).toBe('Q "sto_kb_space_q"');
    expect(settled.mirroring).toBeNull();
  });

  it.each(["", null, undefined, false])(
    "retains the local fallback when mirrored output is %j",
    (mirroredText) => {
      const plan = createCommandChainPreviewPlan({
        selectedName: "F1",
        stabilized: true,
        commands: ["FireAll", "FirePhasers"],
      });
      const settled = settleCommandChainPreview(plan, mirroredText);

      expect(settled.commandPreview).toBe('F1 "FireAll $$ FirePhasers"');
      expect(settled.mirroring).toBeNull();
    },
  );

  it("retains the malformed alias fallback when mirroring cannot be projected", () => {
    const malformed = {};
    Object.defineProperty(malformed, "command", {
      get() {
        throw new Error("unreadable command");
      },
    });

    const plan = createCommandChainPreviewPlan({
      selectedName: "F1",
      bindToAliasMode: true,
      stabilized: true,
      commands: ["FireAll", malformed],
    });

    expect(plan.generatedAlias.content).toEqual({
      type: "literal",
      text: "alias sto_kb_space_f1 <&  &>",
    });
    expect(plan.mirroring).toBeNull();
    expect(plan.diagnostic).toBe("mirroring-projection-failed");
  });

  it("returns translated error intent when alias preview input is unreadable", () => {
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();

    const plan = createCommandChainPreviewPlan({
      selectedName: "F1",
      bindToAliasMode: true,
      stabilized: true,
      commands: proxy,
    });

    expect(plan.commandPreview).toBe('F1 "..."');
    expect(plan.generatedAlias.content).toEqual({
      type: "translation",
      key: "error_generating_alias_preview",
      options: { defaultValue: "Error generating alias preview" },
    });
    expect(plan.mirroring).toBeNull();
    expect(plan.diagnostic).toBe("alias-preview-generation-failed");
  });

  it("detaches and deeply freezes the complete plan and settled projection", () => {
    const richCommand = {
      command: "TrayExecByTray 0 0",
      placement: "in-pivot-group",
      palindromicGeneration: false,
    };
    const commands = ["FireAll", richCommand];
    const plan = createCommandChainPreviewPlan({
      selectedName: "F1",
      stabilized: true,
      commands,
    });

    richCommand.command = "Changed";
    commands.push("Injected");
    expect(plan.mirroring?.request.commands).toHaveLength(2);
    expect(plan.mirroring?.request.commands[1].command).toBe(
      "TrayExecByTray 0 0",
    );
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.generatedAlias)).toBe(true);
    expect(Object.isFrozen(plan.generatedAlias.content)).toBe(true);
    expect(Object.isFrozen(plan.mirroring)).toBe(true);
    expect(Object.isFrozen(plan.mirroring?.request)).toBe(true);
    expect(Object.isFrozen(plan.mirroring?.request.commands)).toBe(true);
    expect(Object.isFrozen(plan.mirroring?.request.commands[0])).toBe(true);

    const settled = settleCommandChainPreview(plan, "Mirrored");
    expect(settled).not.toBe(plan);
    expect(Object.isFrozen(settled)).toBe(true);
    expect(Object.isFrozen(settled.generatedAlias)).toBe(true);
    expect(Object.isFrozen(settled.generatedAlias.content)).toBe(true);
  });
});

describe("preview clipboard planning", () => {
  it.each([null, undefined, "", "   ", 7])(
    "returns frozen empty intent for %j",
    (textContent) => {
      const plan = planPreviewClipboardCopy(textContent);
      expect(plan).toEqual({
        type: "empty",
        messageKey: "nothing_to_copy",
        toastType: "warning",
      });
      expect(Object.isFrozen(plan)).toBe(true);
    },
  );

  it("trims only outer preview whitespace", () => {
    const plan = planPreviewClipboardCopy(
      ' \n\t F1 " FireAll  $$ FirePhasers " \t ',
    );
    expect(plan).toEqual({
      type: "copy",
      text: 'F1 " FireAll  $$ FirePhasers "',
    });
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it.each([
    [
      { success: true, message: "content_copied_to_clipboard" },
      { toastType: "success", messageKey: "content_copied_to_clipboard" },
    ],
    [
      { success: true },
      { toastType: "success", messageKey: "content_copied_to_clipboard" },
    ],
    [
      { success: false, message: "failed_to_copy_to_clipboard" },
      { toastType: "error", messageKey: "failed_to_copy_to_clipboard" },
    ],
    [
      { success: false, message: "" },
      { toastType: "error", messageKey: "failed_to_copy_to_clipboard" },
    ],
    [null, { toastType: "error", messageKey: "failed_to_copy_to_clipboard" }],
  ])(
    "projects clipboard result %# with canonical fallback keys",
    (result, expected) => {
      const projection = projectPreviewClipboardResult(result);
      expect(projection).toEqual(expected);
      expect(Object.isFrozen(projection)).toBe(true);
    },
  );
});
