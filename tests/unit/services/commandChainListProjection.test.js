import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMMAND_CHAIN_GROUP_ORDER,
  projectCommandChainGroups,
  projectCommandChainRow,
} from "../../../src/js/components/services/commandChainListProjection.js";
import { createCommandChainInteractionState } from "../../../src/js/components/ui/commandChainInteractionPolicy.js";

const copy = {
  edit_command: "Edit command translated",
  delete_command: "Delete command translated",
  move_command_up: "Move up translated",
  move_command_down: "Move down translated",
  editable_parameters: "Parameters translated",
  palindromic_included_tooltip: "Included translated",
  palindromic_excluded_tooltip: "Excluded translated",
  placement_in_pivot_group_tooltip: "Pivot translated",
  placement_before_palindromes_tooltip: "Before translated",
  warning_key: "Warning translated",
  display_key: "Display translated",
};

const i18n = {
  t(key) {
    return copy[key] || key;
  },
};

function presentationState(collapsedGroups = []) {
  return {
    authorityEpoch: 1,
    revision: 0,
    collapsedCategories: [],
    collapsedGroups,
  };
}

describe("command-chain list projection", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("classifies every stabilized branch in fixed order with original indices", () => {
    const commands = [
      "FireAll",
      "TrayExecByTray 1 0",
      {
        command: "TrayExecByTray 2 0",
        palindromicGeneration: false,
        placement: "before-pre-pivot",
      },
      {
        command: "TrayExecByTray 3 0",
        palindromicGeneration: false,
        placement: "in-pivot-group",
      },
      "+TrayExecByTray 4 0",
      "+STOTrayExecByTray 5 0",
    ];

    localStorage.setItem("commandGroup_non-trayexec_collapsed", "true");
    localStorage.setItem("commandGroup_palindromic_collapsed", "true");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const groups = projectCommandChainGroups({
      commands,
      presentationState: presentationState(["pivot"]),
    });

    expect(COMMAND_CHAIN_GROUP_ORDER).toEqual([
      "non-trayexec",
      "palindromic",
      "pivot",
    ]);
    expect(groups["non-trayexec"].commands.map(({ index }) => index)).toEqual([
      0, 2, 5,
    ]);
    expect(groups.palindromic.commands.map(({ index }) => index)).toEqual([
      1, 4,
    ]);
    expect(groups.pivot.commands.map(({ index }) => index)).toEqual([3]);
    expect(groups["non-trayexec"].titleKey).toBe("command_group_non_trayexec");
    expect(groups.pivot.hintKey).toBe("command_group_hint_pivot");
    expect(groups["non-trayexec"].isCollapsed).toBe(false);
    expect(groups.pivot.isCollapsed).toBe(true);
    expect(getItem).not.toHaveBeenCalled();
    expect(Object.isFrozen(groups)).toBe(true);
    expect(Object.isFrozen(groups.pivot.commands)).toBe(true);
  });

  it("keeps an excluded pivot placement with fixed commands without a pivot command", () => {
    const command = {
      command: "TrayExecByTray 2 0",
      palindromicGeneration: false,
      placement: "before-pre-pivot",
    };
    const groups = projectCommandChainGroups({
      commands: [command],
      presentationState: presentationState(),
    });

    command.placement = "in-pivot-group";

    expect(groups["non-trayexec"].commands).toEqual([
      expect.objectContaining({ index: 0 }),
    ]);
    expect(groups.pivot.commands).toEqual([]);
  });

  it("projects translated display copy, warning, type, and unstabilized actions", () => {
    const interactionState = createCommandChainInteractionState({
      renderToken: 9,
      commandCount: 2,
    });
    const row = projectCommandChainRow({
      command: 'Target "Enemy"',
      commandString: 'Target "Enemy"',
      index: 0,
      stabilized: false,
      interactionState,
      enrichedCommand: {
        displayText: { key: "display_key", fallback: "Display fallback" },
        icon: "🎯",
        type: "custom",
      },
      commandDefinition: { customizable: true, categoryId: "targeting" },
      warningKey: "warning_key",
      i18n,
    });

    expect(row).toMatchObject({
      index: 0,
      renderToken: "9",
      groupType: null,
      number: "1",
      displayName: "Display translated",
      displayIcon: "🎯",
      commandType: "targeting",
      commandTypeClass: "targeting",
      customizable: true,
      parameterTitle: "Parameters translated",
      warning: { key: "warning_key", text: "Warning translated" },
    });
    expect(row.actions).toEqual([
      expect.objectContaining({
        kind: "edit",
        title: "Edit command translated",
        disabled: false,
        placeholder: false,
      }),
      expect.objectContaining({
        kind: "delete",
        title: "Delete command translated",
        danger: true,
      }),
      expect.objectContaining({
        kind: "move-up",
        title: "Move up translated",
        disabled: true,
      }),
      expect.objectContaining({
        kind: "move-down",
        title: "Move down translated",
        disabled: false,
      }),
    ]);
    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.isFrozen(row.actions)).toBe(true);
  });

  it("projects stabilized group movement and both excluded toggle states", () => {
    const command = {
      command: "TrayExecByTray 1 0",
      palindromicGeneration: false,
      placement: "in-pivot-group",
    };
    const groups = projectCommandChainGroups({
      commands: [command, "TrayExecByTray 2 0"],
      presentationState: presentationState(),
    });
    const interactionState = createCommandChainInteractionState({
      renderToken: 4,
      commandCount: 2,
      groups,
    });
    const row = projectCommandChainRow({
      command,
      commandString: command.command,
      index: 0,
      displayIndex: 3,
      stabilized: true,
      groupType: "pivot",
      interactionState,
      enrichedCommand: { displayText: "Tray", icon: "⚡", type: "tray" },
      i18n,
    });

    expect(row.number).toBe("3");
    expect(row.actions.map(({ kind }) => kind)).toEqual([
      "edit",
      "delete",
      "toggle-palindromic",
      "toggle-placement",
      "move-up",
      "move-down",
    ]);
    expect(row.actions[0]).toMatchObject({
      disabled: true,
      placeholder: true,
    });
    expect(row.actions[2]).toMatchObject({
      title: "Excluded translated",
      active: false,
      commandIndex: 0,
    });
    expect(row.actions[3]).toMatchObject({
      title: "Pivot translated",
      active: true,
      commandIndex: 0,
    });
    expect(row.actions.slice(-2)).toEqual([
      expect.objectContaining({ kind: "move-up", disabled: true }),
      expect.objectContaining({ kind: "move-down", disabled: true }),
    ]);
  });

  it("does not turn an unsafe command type into CSS classes", () => {
    const interactionState = createCommandChainInteractionState({
      renderToken: 1,
      commandCount: 1,
    });
    const row = projectCommandChainRow({
      command: "Custom",
      commandString: "Custom",
      index: 0,
      stabilized: false,
      interactionState,
      enrichedCommand: {
        displayText: "Custom",
        icon: "⚙️",
        type: 'custom" onclick="alert(1)',
      },
      i18n,
    });

    expect(row.commandType).toBe('custom" onclick="alert(1)');
    expect(row.commandTypeClass).toBeNull();
  });

  it("preserves legacy display fallback ordering for malformed and empty display text", () => {
    const interactionState = createCommandChainInteractionState({
      renderToken: 1,
      commandCount: 1,
    });
    const input = {
      command: "Canonical",
      commandString: "Canonical",
      index: 0,
      stabilized: false,
      interactionState,
      enrichedCommand: {
        displayText: {},
        text: "Parser text",
        icon: "⚙️",
        type: "custom",
      },
      i18n,
    };

    expect(projectCommandChainRow(input).displayName).toBe("Canonical");
    expect(
      projectCommandChainRow({
        ...input,
        enrichedCommand: { ...input.enrichedCommand, displayText: "" },
      }).displayName,
    ).toBe("Parser text");
  });
});
