import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesUI from "../../../src/js/components/ui/PreferencesUI.js";
import { createEventBusFixture } from "../../fixtures/index.js";

const ownedTopicCounts = {
  "preferences:show": 1,
  "sync:folder-set": 1,
  "preferences:changed": 1,
  "preferences:state-changed": 1,
};

function installMarkup() {
  document.body.innerHTML = `
    <button id="savePreferencesBtn" type="button">Save</button>
    <button id="setSyncFolderBtn" type="button">Set folder</button>
    <span id="currentSyncFolder"></span>
  `;
}

function installFunctionalDomRouter(eventBus) {
  eventBus.onDom.mockImplementation((target, event, handler) => {
    const resolvedTarget =
      typeof target === "string"
        ? document.querySelector(
            [".", "#", "["].includes(target[0]) ? target : `#${target}`,
          )
        : target;
    if (!resolvedTarget?.addEventListener) return () => {};

    resolvedTarget.addEventListener(event, handler);
    return () => resolvedTarget.removeEventListener(event, handler);
  });
}

function expectOwnedTopicCounts(eventBus, multiplier) {
  for (const [topic, count] of Object.entries(ownedTopicCounts)) {
    expect(eventBus.getListenerCount(topic), topic).toBe(count * multiplier);
  }
}

function createOwner(eventBus) {
  const ui = new PreferencesUI({ eventBus, document });
  const spies = {
    request: vi
      .spyOn(ui, "request")
      .mockResolvedValue({ success: true, folderName: "Fleet Builds" }),
    populate: vi
      .spyOn(ui, "populatePreferencesModal")
      .mockResolvedValue(undefined),
    show: vi.spyOn(ui, "showPreferences").mockResolvedValue(undefined),
    updateFolder: vi
      .spyOn(ui, "updateFolderDisplay")
      .mockResolvedValue(undefined),
    notifyAutoSync: vi
      .spyOn(ui, "notifyAutoSyncSettingsChanged")
      .mockResolvedValue(undefined),
    save: vi.spyOn(ui, "saveAllSettings").mockResolvedValue(true),
  };
  return { ui, spies };
}

function clearOwnerSpies(owner) {
  for (const spy of Object.values(owner.spies)) spy.mockClear();
}

function dispatchOwnedInteractions(eventBus) {
  eventBus.emit("preferences:show");
  eventBus.emit("sync:folder-set");
  eventBus.emit("preferences:changed", {
    changes: { autoSync: true },
  });
  document.getElementById("savePreferencesBtn")?.click();
  document.getElementById("setSyncFolderBtn")?.click();
}

async function flushAsyncHandlers() {
  await Promise.resolve();
  await Promise.resolve();
}

function expectOneOwnedDispatch(owner) {
  expect(owner.spies.show).toHaveBeenCalledOnce();
  expect(owner.spies.updateFolder).toHaveBeenCalledOnce();
  expect(owner.spies.notifyAutoSync).toHaveBeenCalledOnce();
  expect(owner.spies.save).toHaveBeenCalledOnce();
  expect(owner.spies.request).toHaveBeenCalledOnce();
  expect(owner.spies.request).toHaveBeenCalledWith(
    "sync:select-folder",
    { autoSync: true },
    0,
  );
}

describe("PreferencesUI lifecycle ownership", () => {
  let fixture;
  let owners;

  beforeEach(() => {
    installMarkup();
    fixture = createEventBusFixture();
    installFunctionalDomRouter(fixture.eventBus);
    owners = [];
  });

  afterEach(() => {
    for (const { ui } of owners.reverse()) {
      if (!ui.destroyed) ui.destroy();
    }
    fixture?.destroy();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detaches and restores one set of bus and DOM listeners on reinitialization", async () => {
    const owner = createOwner(fixture.eventBus);
    owners.push(owner);

    owner.ui.init();
    await flushAsyncHandlers();
    expectOwnedTopicCounts(fixture.eventBus, 1);

    clearOwnerSpies(owner);
    dispatchOwnedInteractions(fixture.eventBus);
    await flushAsyncHandlers();
    expectOneOwnedDispatch(owner);

    owner.ui.destroy();
    expectOwnedTopicCounts(fixture.eventBus, 0);

    clearOwnerSpies(owner);
    dispatchOwnedInteractions(fixture.eventBus);
    await flushAsyncHandlers();
    expect(owner.spies.show).not.toHaveBeenCalled();
    expect(owner.spies.updateFolder).not.toHaveBeenCalled();
    expect(owner.spies.notifyAutoSync).not.toHaveBeenCalled();
    expect(owner.spies.save).not.toHaveBeenCalled();
    expect(owner.spies.request).not.toHaveBeenCalled();

    owner.ui.init();
    await flushAsyncHandlers();
    expectOwnedTopicCounts(fixture.eventBus, 1);

    clearOwnerSpies(owner);
    dispatchOwnedInteractions(fixture.eventBus);
    await flushAsyncHandlers();
    expectOneOwnedDispatch(owner);
  });

  it("leaves only the replacement UI live after predecessor teardown", async () => {
    const predecessor = createOwner(fixture.eventBus);
    owners.push(predecessor);
    predecessor.ui.init();
    await flushAsyncHandlers();
    predecessor.ui.destroy();

    const replacement = createOwner(fixture.eventBus);
    owners.push(replacement);
    replacement.ui.init();
    await flushAsyncHandlers();
    expectOwnedTopicCounts(fixture.eventBus, 1);

    clearOwnerSpies(predecessor);
    clearOwnerSpies(replacement);
    dispatchOwnedInteractions(fixture.eventBus);
    await flushAsyncHandlers();

    expect(predecessor.spies.show).not.toHaveBeenCalled();
    expect(predecessor.spies.updateFolder).not.toHaveBeenCalled();
    expect(predecessor.spies.notifyAutoSync).not.toHaveBeenCalled();
    expect(predecessor.spies.save).not.toHaveBeenCalled();
    expect(predecessor.spies.request).not.toHaveBeenCalled();
    expectOneOwnedDispatch(replacement);
  });

  it("uses only the typed action when the retired ambient bridge is poisoned", async () => {
    const ambientSetSyncFolder = vi.fn(() => {
      throw new Error("ambient stoSync must not be read");
    });
    vi.stubGlobal("stoSync", { setSyncFolder: ambientSetSyncFolder });
    const owner = createOwner(fixture.eventBus);
    owners.push(owner);
    owner.ui.init();

    document.getElementById("setSyncFolderBtn")?.click();
    await flushAsyncHandlers();

    expect(owner.spies.request).toHaveBeenCalledWith(
      "sync:select-folder",
      { autoSync: true },
      0,
    );
    expect(document.getElementById("currentSyncFolder")?.textContent).toBe(
      "Fleet Builds",
    );
    expect(ambientSetSyncFolder).not.toHaveBeenCalled();
  });

  it("leaves the displayed folder unchanged when selection is not successful", async () => {
    const owner = createOwner(fixture.eventBus);
    owners.push(owner);
    owner.spies.request.mockResolvedValue({ success: false });
    owner.ui.init();
    const display = document.getElementById("currentSyncFolder");
    if (display) display.textContent = "Existing Folder";

    document.getElementById("setSyncFolderBtn")?.click();
    await flushAsyncHandlers();

    expect(display?.textContent).toBe("Existing Folder");
  });
});
