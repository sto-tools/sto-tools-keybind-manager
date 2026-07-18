import { afterEach, describe, expect, it, vi } from "vitest";

import CommandPresentationService from "../../src/js/components/services/CommandPresentationService.js";
import CommandChainUI from "../../src/js/components/ui/CommandChainUI.js";
import CommandLibraryUI from "../../src/js/components/ui/CommandLibraryUI.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";

const categoryId = "system";
const groupType = "palindromic";
const categoryStorageKey = `commandCategory_${categoryId}_collapsed`;
const groupStorageKey = `commandGroup_${groupType}_collapsed`;

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    values,
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function mountCommandUi() {
  document.body.innerHTML = `
    <div id="commandCategories">
      <div id="commandCategoriesList"></div>
      <div id="aliasCategoriesList"></div>
    </div>
    <div id="chainTitle"></div>
    <div id="commandPreview"></div>
    <span id="commandCount"></span>
    <div id="commandList"></div>
  `;
}

function createLibraryUi(eventBus) {
  return new CommandLibraryUI({
    eventBus,
    document,
    i18n: { t: (key) => key },
  });
}

function createChainUi(eventBus) {
  return new CommandChainUI({
    eventBus,
    document,
    i18n: { t: (key) => key },
  });
}

function appendGroupHeader(ui, collapsed = false) {
  const holder = document.createElement("div");
  holder.innerHTML = ui.renderGroupSeparator(groupType, {
    title: "Palindromic",
    commands: [{ command: "+TrayExecByTray 0 0", index: 0 }],
    isCollapsed: collapsed,
  });
  const commandList = document.getElementById("commandList");
  commandList?.replaceChildren(...holder.children);
  return commandList?.querySelector(`.group-header[data-group="${groupType}"]`);
}

describe("Integration: command presentation ownership", () => {
  let eventBusFixture;
  let service;
  let replacementService;
  let libraryUi;
  let chainUi;
  let lateJoinUi;

  afterEach(() => {
    lateJoinUi?.destroy();
    chainUi?.destroy();
    libraryUi?.destroy();
    replacementService?.destroy();
    service?.destroy();
    eventBusFixture?.destroy();
    localStorage.clear();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it.each(["owner-first", "ui-first"])(
    "hydrates exact raw formats and converges both UIs in %s order",
    async (startupOrder) => {
      mountCommandUi();
      eventBusFixture = await createRealEventBusFixture();
      const storage = createMemoryStorage({
        commandCategory_aliases_collapsed: "true",
        [categoryStorageKey]: "false",
        commandCategory_future_collapsed: "TRUE",
        commandGroup_pivot_collapsed: "true",
        [groupStorageKey]: "false",
        commandGroup_future_collapsed: "true",
      });
      service = new CommandPresentationService({
        eventBus: eventBusFixture.eventBus,
        localStorage: storage,
      });
      libraryUi = createLibraryUi(eventBusFixture.eventBus);
      chainUi = createChainUi(eventBusFixture.eventBus);
      const libraryRequest = vi.spyOn(libraryUi, "request");
      const chainRequest = vi.spyOn(chainUi, "request");

      if (startupOrder === "owner-first") {
        service.init();
        libraryUi.init();
        chainUi.init();
      } else {
        libraryUi.init();
        chainUi.init();
        service.init();
      }

      await vi.waitFor(() => {
        expect(libraryUi.cache.commandPresentationState).toEqual(
          service.getCurrentState(),
        );
        expect(chainUi.cache.commandPresentationState).toEqual(
          service.getCurrentState(),
        );
      });
      expect(service.getCurrentState()).toMatchObject({
        revision: 0,
        collapsedCategories: ["aliases"],
        collapsedGroups: ["pivot"],
      });
      expect(storage.getItem(categoryStorageKey)).toBe("false");
      expect(storage.getItem(groupStorageKey)).toBe("false");
      expect(storage.getItem("commandCategory_future_collapsed")).toBe("TRUE");
      expect(storage.getItem("commandGroup_future_collapsed")).toBe("true");

      const categoryHeader = await vi.waitFor(() => {
        const header = document.querySelector(
          `.category[data-category="${categoryId}"] > h4`,
        );
        expect(header).toBeInstanceOf(HTMLElement);
        return header;
      });
      categoryHeader.click();

      await vi.waitFor(() => {
        expect(service.getCurrentState()).toMatchObject({
          revision: 1,
          collapsedCategories: ["aliases", categoryId],
        });
        expect(libraryUi.cache.commandPresentationState).toEqual(
          service.getCurrentState(),
        );
        expect(chainUi.cache.commandPresentationState).toEqual(
          service.getCurrentState(),
        );
        expect(categoryHeader.classList).toContain("collapsed");
      });
      expect(storage.getItem(categoryStorageKey)).toBe("true");
      expect(localStorage.getItem(categoryStorageKey)).toBeNull();

      categoryHeader.click();
      await vi.waitFor(() => {
        expect(service.getCurrentState()).toMatchObject({
          revision: 2,
          collapsedCategories: ["aliases"],
        });
        expect(categoryHeader.classList).not.toContain("collapsed");
      });
      expect(storage.getItem(categoryStorageKey)).toBe("false");
      expect(localStorage.getItem(categoryStorageKey)).toBeNull();

      const groupHeader = appendGroupHeader(chainUi);
      expect(groupHeader).toBeInstanceOf(HTMLElement);
      groupHeader?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      await vi.waitFor(() => {
        expect(service.getCurrentState()).toMatchObject({
          revision: 3,
          collapsedGroups: [groupType, "pivot"],
        });
        expect(libraryUi.cache.commandPresentationState).toEqual(
          service.getCurrentState(),
        );
        expect(chainUi.cache.commandPresentationState).toEqual(
          service.getCurrentState(),
        );
      });
      expect(storage.getItem(groupStorageKey)).toBe("true");
      expect(localStorage.getItem(groupStorageKey)).toBeNull();

      const expandedGroupHeader = appendGroupHeader(chainUi, true);
      expandedGroupHeader?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await vi.waitFor(() => {
        expect(service.getCurrentState()).toMatchObject({
          revision: 4,
          collapsedGroups: ["pivot"],
        });
      });
      expect(storage.getItem(groupStorageKey)).toBeNull();
      expect(localStorage.getItem(groupStorageKey)).toBeNull();

      expect(libraryRequest).toHaveBeenCalledWith(
        "command-presentation:toggle-category",
        { categoryId },
      );
      expect(chainRequest).toHaveBeenCalledWith(
        "command-presentation:toggle-group",
        { groupType },
      );

      const beforeReplyOnlyResults = service.getCurrentState();
      libraryRequest.mockResolvedValueOnce(true);
      libraryUi.toggleCommandCategory(categoryId);
      const replyOnlyGroupHeader = appendGroupHeader(chainUi);
      chainRequest.mockResolvedValueOnce(true);
      replyOnlyGroupHeader?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(service.getCurrentState()).toEqual(beforeReplyOnlyResults);
      expect(libraryUi.cache.commandPresentationState).toEqual(
        beforeReplyOnlyResults,
      );
      expect(chainUi.cache.commandPresentationState).toEqual(
        beforeReplyOnlyResults,
      );
      expect(storage.getItem(categoryStorageKey)).toBe("false");
      expect(storage.getItem(groupStorageKey)).toBeNull();

      expect(Object.hasOwn(libraryUi, "localStorage")).toBe(false);
      expect(Object.hasOwn(chainUi, "localStorage")).toBe(false);
      expect(chainUi.getGroupCollapsedState).toBeUndefined();
      expect(chainUi.setGroupCollapsedState).toBeUndefined();
    },
  );

  it("adopts a replacement owner, rejects stale state, and late-joins at revision zero", async () => {
    mountCommandUi();
    eventBusFixture = await createRealEventBusFixture();
    const storage = createMemoryStorage();
    service = new CommandPresentationService({
      eventBus: eventBusFixture.eventBus,
      localStorage: storage,
    });
    libraryUi = createLibraryUi(eventBusFixture.eventBus);
    chainUi = createChainUi(eventBusFixture.eventBus);

    libraryUi.init();
    chainUi.init();
    service.init();
    await request(
      eventBusFixture.eventBus,
      "command-presentation:toggle-category",
      {
        categoryId,
      },
    );
    const retiredOwnerState = service.getCurrentState();
    expect(retiredOwnerState).toMatchObject({
      revision: 1,
      collapsedCategories: [categoryId],
    });

    service.destroy();
    replacementService = new CommandPresentationService({
      eventBus: eventBusFixture.eventBus,
      localStorage: storage,
    });
    replacementService.init();

    await vi.waitFor(() => {
      expect(libraryUi.cache.commandPresentationState).toEqual(
        replacementService.getCurrentState(),
      );
      expect(chainUi.cache.commandPresentationState).toEqual(
        replacementService.getCurrentState(),
      );
    });
    const replacementState = replacementService.getCurrentState();
    expect(replacementState).toMatchObject({
      revision: 0,
      collapsedCategories: [categoryId],
    });
    expect(replacementState.authorityEpoch).toBeGreaterThan(
      retiredOwnerState.authorityEpoch,
    );

    lateJoinUi = createLibraryUi(eventBusFixture.eventBus);
    lateJoinUi.init();
    await vi.waitFor(() => {
      expect(lateJoinUi.cache.commandPresentationState).toEqual(
        replacementState,
      );
    });

    await eventBusFixture.eventBus.emit(
      "command-presentation:state-changed",
      retiredOwnerState,
    );
    await eventBusFixture.eventBus.emit("command-presentation:state-changed", {
      ...replacementState,
      collapsedCategories: [],
    });
    expect(libraryUi.cache.commandPresentationState).toEqual(replacementState);
    expect(chainUi.cache.commandPresentationState).toEqual(replacementState);
    expect(lateJoinUi.cache.commandPresentationState).toEqual(replacementState);
  });

  it.each([
    {
      label: "category write",
      initial: {},
      storageMethod: "setItem",
      topic: "command-presentation:toggle-category",
      payload: { categoryId },
    },
    {
      label: "group removal",
      initial: { [groupStorageKey]: "true" },
      storageMethod: "removeItem",
      topic: "command-presentation:toggle-group",
      payload: { groupType },
    },
  ])(
    "keeps owner state and publications atomic when a $label fails",
    async ({ initial, storageMethod, topic, payload }) => {
      eventBusFixture = await createRealEventBusFixture();
      const storage = createMemoryStorage(initial);
      service = new CommandPresentationService({
        eventBus: eventBusFixture.eventBus,
        localStorage: storage,
      });
      service.init();
      const before = service.getCurrentState();
      const publication = vi.fn();
      eventBusFixture.eventBus.on(
        "command-presentation:state-changed",
        publication,
      );
      vi.spyOn(storage, storageMethod).mockImplementation(() => {
        throw new Error("persistence unavailable");
      });

      await expect(
        request(eventBusFixture.eventBus, topic, payload),
      ).rejects.toThrow("persistence unavailable");

      expect(service.getCurrentState()).toEqual(before);
      expect(publication).not.toHaveBeenCalled();
      expect(storage.getItem(categoryStorageKey)).toBeNull();
      expect(storage.getItem(groupStorageKey)).toBe(
        initial[groupStorageKey] ?? null,
      );
    },
  );
});
