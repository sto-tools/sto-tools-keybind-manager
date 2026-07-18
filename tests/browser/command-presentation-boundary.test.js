import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

let replySequence = 0;

function restoreRawStorage(key, value) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

function requestOwnerSnapshot(bus) {
  replySequence += 1;
  const replyTopic = `component:registered:reply:CommandPresentationBoundary:${Date.now()}-${replySequence}`;

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      detach();
      reject(new Error("CommandPresentationService did not reply"));
    }, 1000);
    const detach = bus.on(replyTopic, (reply) => {
      if (reply?.sender !== "CommandPresentationService") return;
      window.clearTimeout(timeout);
      detach();
      resolve(reply.state);
    });

    bus.emit("component:register", {
      name: "CommandPresentationBoundary",
      replyTopic,
    });
  });
}

function categoryNodes(categoryId) {
  const category = document.querySelector(
    `.category[data-category="${categoryId}"]`,
  );
  return {
    category,
    header: category?.querySelector("h4"),
    commands: category?.querySelector(".category-commands"),
  };
}

function appendProjectedGroupHeader(ui, groupType, isCollapsed) {
  const commandList = document.getElementById("commandList");
  const holder = document.createElement("div");
  holder.innerHTML = ui.renderGroupSeparator(groupType, {
    title: groupType,
    commands: [{ command: "+TrayExecByTray 0 0", index: 0 }],
    isCollapsed,
  });
  const projection = holder.firstElementChild;
  if (projection) commandList?.prepend(projection);
  return projection?.querySelector(".group-header") ?? null;
}

describe("Command presentation checked-bundle boundary", () => {
  it("converges static-category and chain-group clicks through the hidden owner", async () => {
    const bus = window.eventBus;
    const chainUi = window.commandChainUI;
    const categoryId = "system";
    const categoryStorageKey = `commandCategory_${categoryId}_collapsed`;
    const groupStorageKeyPrefix = "commandGroup_";

    expect(bus).toBeTruthy();
    expect(chainUi?.isInitialized?.()).toBe(true);
    expect(window.commandPresentationService).toBeUndefined();
    if (!bus || !chainUi) return;

    expect(bus.hasListeners("rpc:command-presentation:toggle-category")).toBe(
      true,
    );
    expect(bus.hasListeners("rpc:command-presentation:toggle-group")).toBe(
      true,
    );
    expect(bus.hasListeners("command-presentation:state-changed")).toBe(true);
    expect(Object.hasOwn(chainUi, "localStorage")).toBe(false);
    expect(chainUi.getGroupCollapsedState).toBeUndefined();
    expect(chainUi.setGroupCollapsedState).toBeUndefined();

    const startingState = await requestOwnerSnapshot(bus);
    const groupTypes = ["non-trayexec", "palindromic", "pivot"];
    const groupType =
      groupTypes.find(
        (candidate) => !startingState.collapsedGroups.includes(candidate),
      ) ?? groupTypes[0];
    const groupStorageKey = `${groupStorageKeyPrefix}${groupType}_collapsed`;
    const beforeCategoryRaw = localStorage.getItem(categoryStorageKey);
    const beforeGroupRaw = localStorage.getItem(groupStorageKey);
    const startingCategoryCollapsed =
      startingState.collapsedCategories.includes(categoryId);
    const startingGroupCollapsed =
      startingState.collapsedGroups.includes(groupType);
    let expectedRevision = startingState.revision;

    try {
      for (const expectedCollapsed of [
        !startingCategoryCollapsed,
        startingCategoryCollapsed,
      ]) {
        const { header } = categoryNodes(categoryId);
        expect(header).toBeInstanceOf(HTMLElement);
        header?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expectedRevision += 1;

        await vi.waitFor(() => {
          expect(chainUi.cache.commandPresentationState?.revision).toBe(
            expectedRevision,
          );
          expect(
            chainUi.cache.commandPresentationState?.collapsedCategories.includes(
              categoryId,
            ),
          ).toBe(expectedCollapsed);
          const current = categoryNodes(categoryId);
          expect(current.header?.classList.contains("collapsed")).toBe(
            expectedCollapsed,
          );
          expect(current.commands?.classList.contains("collapsed")).toBe(
            expectedCollapsed,
          );
        });

        expect(localStorage.getItem(categoryStorageKey)).toBe(
          String(expectedCollapsed),
        );
        expect(await requestOwnerSnapshot(bus)).toEqual(
          chainUi.cache.commandPresentationState,
        );
      }

      for (const expectedCollapsed of [
        !startingGroupCollapsed,
        startingGroupCollapsed,
      ]) {
        const groupHeader = appendProjectedGroupHeader(
          chainUi,
          groupType,
          !expectedCollapsed,
        );
        expect(groupHeader).toBeInstanceOf(HTMLElement);
        groupHeader?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expectedRevision += 1;

        await vi.waitFor(() => {
          expect(chainUi.cache.commandPresentationState?.revision).toBe(
            expectedRevision,
          );
          expect(
            chainUi.cache.commandPresentationState?.collapsedGroups.includes(
              groupType,
            ),
          ).toBe(expectedCollapsed);
        });
        expect(localStorage.getItem(groupStorageKey)).toBe(
          expectedCollapsed ? "true" : null,
        );
        expect(await requestOwnerSnapshot(bus)).toEqual(
          chainUi.cache.commandPresentationState,
        );
      }

      expect(chainUi.cache.commandPresentationState).toEqual({
        ...startingState,
        revision: startingState.revision + 4,
      });
    } finally {
      document
        .querySelectorAll(`.command-group-separator[data-group="${groupType}"]`)
        .forEach((element) => element.remove());

      let currentState = await requestOwnerSnapshot(bus);
      if (
        currentState.collapsedCategories.includes(categoryId) !==
        startingCategoryCollapsed
      ) {
        await request(bus, "command-presentation:toggle-category", {
          categoryId,
        });
      }
      currentState = await requestOwnerSnapshot(bus);
      if (
        currentState.collapsedGroups.includes(groupType) !==
        startingGroupCollapsed
      ) {
        await request(bus, "command-presentation:toggle-group", { groupType });
      }

      restoreRawStorage(categoryStorageKey, beforeCategoryRaw);
      restoreRawStorage(groupStorageKey, beforeGroupRaw);
    }

    const restoredState = await requestOwnerSnapshot(bus);
    expect(restoredState.collapsedCategories.includes(categoryId)).toBe(
      startingCategoryCollapsed,
    );
    expect(restoredState.collapsedGroups.includes(groupType)).toBe(
      startingGroupCollapsed,
    );
    expect(chainUi.cache.commandPresentationState).toEqual(restoredState);
    expect(localStorage.getItem(categoryStorageKey)).toBe(beforeCategoryRaw);
    expect(localStorage.getItem(groupStorageKey)).toBe(beforeGroupRaw);
  });
});
