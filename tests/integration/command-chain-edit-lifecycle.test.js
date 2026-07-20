import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainService from "../../src/js/components/services/CommandChainService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import { request, respond } from "../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../fixtures/index.js";

const initialCommands = [
  'Target "Alpha"',
  {
    command: "RawExplicit",
    type: "custom",
    parameters: { rawCommand: "RawExplicit" },
  },
];

const profile = {
  name: "Captain",
  description: "Command edit lifecycle fixture",
  currentEnvironment: "space",
  builds: {
    space: { keys: { F1: initialCommands, F2: ["CamReset"] } },
    ground: { keys: {} },
  },
  aliases: {},
  bindsets: {
    Weapons: {
      space: { keys: { F1: ["NamedTarget"] } },
      ground: { keys: {} },
    },
  },
  keybindMetadata: { space: {} },
};

const root = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: "captain",
  profiles: { captain: profile },
  globalAliases: {},
  settings: { bindsetsEnabled: false },
};

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function selection(selectedKey = "F1") {
  return {
    selectedKey,
    selectedAlias: null,
    editingContext: null,
    cachedSelections: { space: selectedKey, ground: null, alias: null },
    currentEnvironment: "space",
  };
}

describe("CommandChainService edit planning lifecycle", () => {
  let fixture;
  let coordinator;
  let service;
  let detachParser;

  beforeEach(async () => {
    fixture = createServiceFixture({
      initialStorageData: { sto_keybind_manager: root },
    });
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: {
        t: (key, options) => options?.defaultValue || key,
      },
    });

    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    service.init();
    await vi.waitFor(() => {
      expect(service.cache.dataState?.ready).toBe(true);
    });
    fixture.eventBus.emit("selection:state-changed", selection());
    fixture.eventBus.emit("preferences:loaded", {
      settings: { bindsetsEnabled: false },
    });
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    detachParser?.();
    if (!service.destroyed) service.destroy();
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  function editEvents() {
    return fixture
      .getEventHistory()
      .filter(({ event }) => event === "parameter-command:edit");
  }

  function installDeferredParser() {
    const first = deferred();
    let calls = 0;
    detachParser = respond(
      fixture.eventBus,
      "parser:parse-command-string",
      async ({ commandString }) => {
        calls += 1;
        if (calls === 1) return first.promise;
        return {
          commands: [
            {
              category:
                commandString === "RawExplicit" ? "custom" : "targeting",
            },
          ],
        };
      },
    );
    return { first, calls: () => calls };
  }

  async function startListenerEdit(index = 0) {
    const edit = vi.spyOn(service, "editCommandAtIndex");
    fixture.eventBus.emit("commandchain:edit", { index });
    await vi.waitFor(() => expect(edit).toHaveBeenCalledOnce());
    return { edit, pending: edit.mock.results[0].value };
  }

  it("suppresses delayed work when the owner replaces the exact target command", async () => {
    const parser = installDeferredParser();
    const { pending } = await startListenerEdit();
    await vi.waitFor(() => expect(parser.calls()).toBe(1));

    await request(fixture.eventBus, "data:update-profile", {
      profileId: "captain",
      modify: {
        builds: {
          space: {
            keys: {
              F1: ['Target "Replacement"', initialCommands[1]],
            },
          },
        },
      },
    });
    await vi.waitFor(() => {
      expect(service.cache.dataState.revision).toBeGreaterThan(1);
    });

    parser.first.resolve({
      commands: [
        { category: "targeting", parameters: { entityName: "Alpha" } },
      ],
    });

    await expect(pending).resolves.toBe(false);
    expect(parser.calls()).toBe(1);
    expect(editEvents()).toEqual([]);
  });

  it("suppresses an unrelated same-owner revision from the captured edit", async () => {
    const parser = installDeferredParser();
    const { pending } = await startListenerEdit();
    await vi.waitFor(() => expect(parser.calls()).toBe(1));

    await request(fixture.eventBus, "data:update-profile", {
      profileId: "captain",
      modify: {
        keybindMetadata: {
          space: { F2: { stabilizeExecutionOrder: true } },
        },
      },
    });
    parser.first.resolve({
      commands: [
        { category: "targeting", parameters: { entityName: "Alpha" } },
      ],
    });

    await expect(pending).resolves.toBe(false);
    expect(parser.calls()).toBe(1);
    expect(editEvents()).toEqual([]);
  });

  it("keeps a rejected stale snapshot inert while parsing", async () => {
    const parser = installDeferredParser();
    const { pending } = await startListenerEdit();
    await vi.waitFor(() => expect(parser.calls()).toBe(1));
    const acceptedSnapshot = service.cache.dataState;
    const staleSnapshot = structuredClone(acceptedSnapshot);
    staleSnapshot.revision = Math.max(0, acceptedSnapshot.revision - 1);

    fixture.eventBus.emit("data:state-changed", {
      reason: "test-stale-owner",
      state: staleSnapshot,
    });
    expect(service.cache.dataState).toBe(acceptedSnapshot);
    parser.first.resolve({
      commands: [
        { category: "targeting", parameters: { entityName: "Alpha" } },
      ],
    });

    await expect(pending).resolves.toBe(true);
    expect(parser.calls()).toBe(2);
    expect(editEvents()).toHaveLength(1);
  });

  it("suppresses delayed work after selection or effective-bindset changes", async () => {
    const parser = installDeferredParser();
    const firstEdit = await startListenerEdit();
    await vi.waitFor(() => expect(parser.calls()).toBe(1));

    fixture.eventBus.emit("selection:state-changed", selection("F2"));
    fixture.eventBus.emit("selection:state-changed", selection("F1"));
    parser.first.resolve({ commands: [{ category: "targeting" }] });
    await expect(firstEdit.pending).resolves.toBe(false);
    expect(editEvents()).toEqual([]);

    detachParser();
    firstEdit.edit.mockRestore();
    fixture.eventBus.emit("selection:state-changed", selection("F1"));
    const bindsetParser = installDeferredParser();
    const secondEdit = await startListenerEdit();
    await vi.waitFor(() => expect(bindsetParser.calls()).toBe(1));

    fixture.eventBus.emit("preferences:loaded", {
      settings: { bindsetsEnabled: true },
    });
    fixture.eventBus.emit("bindset-selector:active-changed", {
      name: "Weapons",
    });
    fixture.eventBus.emit("bindset-selector:active-changed", {
      name: "Primary Bindset",
    });
    fixture.eventBus.emit("preferences:loaded", {
      settings: { bindsetsEnabled: false },
    });
    bindsetParser.first.resolve({ commands: [{ category: "targeting" }] });

    await expect(secondEdit.pending).resolves.toBe(false);
    expect(editEvents()).toEqual([]);
  });

  it("suppresses delayed work after an owner environment transition", async () => {
    const parser = installDeferredParser();
    const { pending } = await startListenerEdit();
    await vi.waitFor(() => expect(parser.calls()).toBe(1));

    await coordinator.setEnvironment("ground");
    await vi.waitFor(() => {
      expect(service.cache.dataState.currentEnvironment).toBe("ground");
    });
    parser.first.resolve({ commands: [{ category: "targeting" }] });

    await expect(pending).resolves.toBe(false);
    expect(parser.calls()).toBe(1);
    expect(editEvents()).toEqual([]);
  });

  it("suppresses delayed work after DataCoordinator authority replacement", async () => {
    const parser = installDeferredParser();
    const { pending } = await startListenerEdit();
    await vi.waitFor(() => expect(parser.calls()).toBe(1));
    const predecessorAuthority = service.cache.dataState.authorityEpoch;

    coordinator.destroy();
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    coordinator.init();
    await vi.waitFor(() => {
      expect(service.cache.dataState.authorityEpoch).toBeGreaterThan(
        predecessorAuthority,
      );
    });
    parser.first.resolve({ commands: [{ category: "targeting" }] });

    await expect(pending).resolves.toBe(false);
    expect(parser.calls()).toBe(1);
    expect(editEvents()).toEqual([]);
  });

  it("gives the latest edit intent exclusive publication ownership", async () => {
    const parser = installDeferredParser();
    const edit = vi.spyOn(service, "editCommandAtIndex");

    fixture.eventBus.emit("commandchain:edit", { index: 0 });
    await vi.waitFor(() => expect(parser.calls()).toBe(1));
    fixture.eventBus.emit("commandchain:edit", { index: 1 });
    await vi.waitFor(() => expect(edit).toHaveBeenCalledTimes(2));

    await expect(edit.mock.results[1].value).resolves.toBe(true);
    expect(editEvents()).toHaveLength(1);
    expect(editEvents()[0].data.index).toBe(1);

    parser.first.resolve({ commands: [{ category: "targeting" }] });
    await expect(edit.mock.results[0].value).resolves.toBe(false);
    expect(editEvents()).toHaveLength(1);
  });

  it.each([false, true])(
    "keeps predecessor parsing inert after destroy%s",
    async (reinitialize) => {
      const parser = installDeferredParser();
      const { pending } = await startListenerEdit();
      await vi.waitFor(() => expect(parser.calls()).toBe(1));

      service.destroy();
      if (reinitialize) service.init();
      parser.first.resolve({ commands: [{ category: "targeting" }] });

      await expect(pending).resolves.toBe(false);
      expect(editEvents()).toEqual([]);
    },
  );
});
