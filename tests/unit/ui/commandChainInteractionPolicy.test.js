import { beforeEach, describe, expect, it } from "vitest";

import {
  createCommandChainInteractionState,
  decodeCommandChainClick,
  decodeCommandChainDoubleClick,
  decodeCommandChainDrop,
  getCommandMoveTarget,
  isCommandChainInteractionCurrent,
  normalizeCommandGroupType,
} from "../../../src/js/components/ui/commandChainInteractionPolicy.js";

function createState({
  renderToken = "7",
  commandCount = 3,
  groups = null,
} = {}) {
  return createCommandChainInteractionState({
    renderToken,
    commandCount,
    groups,
  });
}

function createGroups() {
  return {
    "non-trayexec": {
      commands: [
        { command: "First", index: 0 },
        { command: "Third", index: 2 },
      ],
    },
    palindromic: {
      commands: [{ command: "Second", index: 1 }],
    },
    pivot: { commands: [] },
  };
}

function createRow({
  index = "0",
  renderToken = "7",
  group,
  customizable = false,
} = {}) {
  const row = document.createElement("div");
  row.className = `command-item-row${customizable ? " customizable" : ""}`;
  row.dataset.index = index;
  row.dataset.renderToken = renderToken;
  if (group !== undefined) row.dataset.group = group;

  for (const className of [
    "btn-edit",
    "btn-delete",
    "btn-up",
    "btn-down",
    "btn-palindromic-toggle",
    "btn-placement-toggle",
  ]) {
    const button = document.createElement("button");
    button.className = className;
    const icon = document.createElement("i");
    button.append(icon);
    row.append(button);
  }
  document.body.append(row);
  return row;
}

describe("command-chain interaction policy", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("captures immutable command and group authority for one render", () => {
    const groups = createGroups();
    groups.pivot.commands.push(
      { command: "invalid", index: 9 },
      { command: "duplicate", index: 0 },
    );
    const state = createState({ groups });

    groups["non-trayexec"].commands.splice(0);

    expect(state).toEqual({
      renderToken: "7",
      commandIndices: [0, 1, 2],
      groupIndices: {
        "non-trayexec": [0, 2],
        palindromic: [1],
        pivot: [],
      },
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.groupIndices["non-trayexec"])).toBe(true);
  });

  it("normalizes only the three supported group identifiers", () => {
    expect(normalizeCommandGroupType("non-trayexec")).toBe("non-trayexec");
    expect(normalizeCommandGroupType("palindromic")).toBe("palindromic");
    expect(normalizeCommandGroupType("pivot")).toBe("pivot");
    expect(normalizeCommandGroupType("unknown")).toBeNull();
    expect(normalizeCommandGroupType(null)).toBeNull();
  });

  it("projects adjacent unstabilized targets and rejects boundaries", () => {
    const state = createState();

    expect(getCommandMoveTarget(state, 1, null, "up")).toBe(0);
    expect(getCommandMoveTarget(state, 1, null, "down")).toBe(2);
    expect(getCommandMoveTarget(state, 0, null, "up")).toBeNull();
    expect(getCommandMoveTarget(state, 2, null, "down")).toBeNull();
    expect(getCommandMoveTarget(state, 7, null, "up")).toBeNull();
  });

  it("projects moves within a stabilized group without crossing groups", () => {
    const state = createState({ groups: createGroups() });

    expect(getCommandMoveTarget(state, 2, "non-trayexec", "up")).toBe(0);
    expect(getCommandMoveTarget(state, 0, "non-trayexec", "down")).toBe(2);
    expect(getCommandMoveTarget(state, 0, "non-trayexec", "up")).toBeNull();
    expect(getCommandMoveTarget(state, 2, "non-trayexec", "down")).toBeNull();
    expect(getCommandMoveTarget(state, 1, "palindromic", "up")).toBeNull();
    expect(getCommandMoveTarget(state, 1, "non-trayexec", "up")).toBeNull();
    expect(getCommandMoveTarget(state, 1, null, "up")).toBeNull();
  });

  it.each([
    [".btn-edit i", "edit", true],
    [".btn-delete i", "delete", true],
    [".btn-palindromic-toggle i", "toggle-palindromic", true],
    [".btn-placement-toggle i", "toggle-placement", true],
  ])("decodes %s as a typed %s interaction", (selector, type, consumeEvent) => {
    const state = createState();
    const row = createRow({ index: "1" });

    expect(
      decodeCommandChainClick(row.querySelector(selector), state, 7),
    ).toEqual({
      type,
      index: 1,
      renderToken: "7",
      consumeEvent,
    });
  });

  it("decodes group-aware move buttons and suppresses disabled boundaries", () => {
    const state = createState({ groups: createGroups() });
    const row = createRow({ index: "2", group: "non-trayexec" });

    expect(
      decodeCommandChainClick(row.querySelector(".btn-up i"), state, 7),
    ).toEqual({
      type: "move",
      fromIndex: 2,
      toIndex: 0,
      renderToken: "7",
      consumeEvent: false,
    });

    row.querySelector(".btn-down").disabled = true;
    expect(
      decodeCommandChainClick(row.querySelector(".btn-down i"), state, 7),
    ).toEqual({ type: "none" });
  });

  it("decodes only customizable double-click rows", () => {
    const state = createState();
    const row = createRow({ index: "1", customizable: true });

    expect(
      decodeCommandChainDoubleClick(row.firstElementChild, state, 7),
    ).toEqual({
      type: "edit",
      index: 1,
      renderToken: "7",
      consumeEvent: false,
    });
    row.classList.remove("customizable");
    expect(
      decodeCommandChainDoubleClick(row.firstElementChild, state, 7),
    ).toEqual({ type: "none" });
  });

  it("decodes a current rendered group header", () => {
    const state = createState({ groups: createGroups() });
    const header = document.createElement("div");
    header.className = "group-header";
    header.dataset.group = "palindromic";
    header.dataset.renderToken = "7";
    const child = document.createElement("span");
    header.append(child);

    expect(decodeCommandChainClick(child, state, 7)).toEqual({
      type: "toggle-group",
      groupType: "palindromic",
      renderToken: "7",
      consumeEvent: false,
    });
  });

  it.each(["1junk", "-1", "01", "9007199254740992", "3"])(
    "rejects malformed or out-of-range row index %s",
    (index) => {
      const state = createState();
      const row = createRow({ index });

      expect(
        decodeCommandChainClick(row.querySelector(".btn-delete"), state, 7),
      ).toEqual({ type: "none" });
    },
  );

  it("rejects stale rows as soon as a successor render starts", () => {
    const state = createState({ groups: createGroups() });
    const row = createRow({ index: "0", group: "non-trayexec" });

    expect(
      isCommandChainInteractionCurrent(state, 8, row.dataset.renderToken),
    ).toBe(false);
    expect(
      decodeCommandChainClick(row.querySelector(".btn-delete"), state, 8),
    ).toEqual({ type: "none" });
    expect(decodeCommandChainDoubleClick(row, state, 8)).toEqual({
      type: "none",
    });
  });

  it("rejects forged group membership and stale group headers", () => {
    const state = createState({ groups: createGroups() });
    const row = createRow({ index: "1", group: "non-trayexec" });
    const header = document.createElement("div");
    header.className = "group-header";
    header.dataset.group = "pivot";
    header.dataset.renderToken = "6";

    expect(
      decodeCommandChainClick(row.querySelector(".btn-delete"), state, 7),
    ).toEqual({ type: "none" });
    expect(decodeCommandChainClick(header, state, 7)).toEqual({ type: "none" });
  });

  it("decodes current drag/drop rows and rejects stale or no-op drops", () => {
    const state = createState();
    const from = createRow({ index: "0" });
    const to = createRow({ index: "2" });

    expect(decodeCommandChainDrop(from, to, state, 7)).toEqual({
      type: "move",
      fromIndex: 0,
      toIndex: 2,
      renderToken: "7",
      consumeEvent: false,
    });
    expect(decodeCommandChainDrop(from, from, state, 7)).toEqual({
      type: "none",
    });
    from.dataset.renderToken = "6";
    expect(decodeCommandChainDrop(from, to, state, 7)).toEqual({
      type: "none",
    });
    from.dataset.renderToken = "7";
    expect(decodeCommandChainDrop(from, to, state, 8)).toEqual({
      type: "none",
    });
  });

  it("rejects drag/drop across stabilized groups", () => {
    const state = createState({ groups: createGroups() });
    const first = createRow({ index: "0", group: "non-trayexec" });
    const sameGroup = createRow({ index: "2", group: "non-trayexec" });
    const otherGroup = createRow({ index: "1", group: "palindromic" });

    expect(decodeCommandChainDrop(first, sameGroup, state, 7)).toEqual({
      type: "move",
      fromIndex: 0,
      toIndex: 2,
      renderToken: "7",
      consumeEvent: false,
    });
    expect(decodeCommandChainDrop(first, otherGroup, state, 7)).toEqual({
      type: "none",
    });
  });
});
