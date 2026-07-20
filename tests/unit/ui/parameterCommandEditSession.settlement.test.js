import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ParameterCommandEditSession from "../../../src/js/components/ui/parameterCommandEditSession.js";

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function commandDef() {
  return {
    name: "Target",
    parameters: { value: { type: "text", default: "alpha" } },
  };
}

function editPayload() {
  return {
    target: {
      authorityEpoch: 1,
      revision: 1,
      profileId: "captain",
      environment: "space",
      name: "F1",
      bindset: null,
      index: 0,
      originalEntry: "Target delayed",
    },
    index: 0,
    categoryId: "targeting",
    commandId: "target",
    commandDef: commandDef(),
    command: { command: "Target delayed" },
  };
}

const liveSessions = [];

function createHarness(buildCommand, options = {}) {
  const state = { editCurrent: true };
  const publishAdd = vi.fn();
  const showToast = vi.fn();
  const manager = {
    show: vi.fn(() => true),
    hide: vi.fn(),
    registerRegenerateCallback: vi.fn(),
    unregisterRegenerateCallback: vi.fn(),
  };
  const session = new ParameterCommandEditSession({
    document,
    modalManager: manager,
    translate: (key) => {
      if (key === "invalid_command_format") {
        return "Error: Invalid command format";
      }
      if (key === "command_edit_target_changed") {
        return "The command changed while you were editing it.";
      }
      return key;
    },
    enrichCommand: options.enrichCommand ?? vi.fn(),
    buildCommand,
    captureAddTarget: () => ({
      authorityEpoch: 1,
      revision: 1,
      profileId: "captain",
      environment: "space",
      name: "F1",
      selectedKey: "F1",
      selectedAlias: null,
      bindset: null,
    }),
    isAddTargetCurrent: () => true,
    isEditTargetCurrent: () => state.editCurrent,
    getContextGeneration: () => 1,
    getMissingSelectionKey: () => null,
    publishAdd,
    publishEdit: vi.fn(),
    showToast,
  });
  liveSessions.push(session);
  return { session, publishAdd, showToast, manager, state };
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  for (const session of liveSessions.splice(0)) session.destroy();
  document.body.replaceChildren();
});

describe("ParameterCommandEditSession settlement authority", () => {
  it("settles an edit whose immutable target changes during enrichment", async () => {
    const enrichment = deferred();
    const { session, manager, showToast, state } = createHarness(vi.fn(), {
      enrichCommand: vi.fn(() => enrichment.promise),
    });
    const result = session.showEdit(editPayload());

    state.editCurrent = false;
    enrichment.resolve({ parameters: { value: "too late" } });
    await expect(result).resolves.toBe(false);

    expect(session.currentParameterCommand).toBeNull();
    expect(manager.show).not.toHaveBeenCalled();
    expect(manager.hide).toHaveBeenCalledWith("parameterModal");
    expect(showToast).toHaveBeenCalledWith(
      "The command changed while you were editing it.",
      "warning",
    );
  });

  it.each([
    ["cancel", (session) => session.cancel()],
    [
      "replacement",
      (session) => session.showAdd("targeting", "replacement", commandDef()),
    ],
    ["destroy", (session) => session.destroy()],
  ])("keeps a delayed save inert after %s", async (_label, settle) => {
    const saving = deferred();
    const buildCommand = vi
      .fn()
      .mockResolvedValueOnce("Preview")
      .mockImplementationOnce(() => saving.promise)
      .mockResolvedValue("Replacement preview");
    const { session, publishAdd } = createHarness(buildCommand);
    session.showAdd("targeting", "target", commandDef());
    await flushPromises();

    const result = session.save();
    settle(session);
    saving.resolve("Target stale");

    await expect(result).resolves.toBe(false);
    expect(publishAdd).not.toHaveBeenCalled();
  });

  it("translates malformed build previews", async () => {
    const { session } = createHarness(
      vi.fn().mockResolvedValue({ command: 42 }),
    );
    session.showAdd("targeting", "target", commandDef());
    await flushPromises();

    expect(
      document.getElementById("parameterCommandPreview")?.textContent,
    ).toBe("Error: Invalid command format");
  });

  it("keeps an in-flight save valid across presentation-only regeneration", async () => {
    const saving = deferred();
    const buildCommand = vi
      .fn()
      .mockResolvedValueOnce("Preview")
      .mockImplementationOnce(() => saving.promise)
      .mockResolvedValueOnce("Regenerated preview");
    const { session, publishAdd } = createHarness(buildCommand);
    session.showAdd("targeting", "target", commandDef());
    await flushPromises();

    const result = session.save();
    expect(session.regenerate()).toBe(true);
    await flushPromises();
    saving.resolve("Target saved");

    await expect(result).resolves.toBe(true);
    expect(publishAdd).toHaveBeenCalledOnce();
    expect(publishAdd.mock.calls[0][1]).toBe("Target saved");
  });
});
