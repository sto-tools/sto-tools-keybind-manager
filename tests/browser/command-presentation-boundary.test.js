import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

let replySequence = 0;
const probeKey = "__command_presentation_probe__";

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

describe("Command presentation checked-bundle boundary", () => {
  it("converges static-category and chain-group clicks through the hidden owner", async () => {
    const bus = window.eventBus;
    const chainUi = window.commandChainUI;
    const coordinator = window.dataCoordinator;
    const categoryId = "system";
    const categoryStorageKey = `commandCategory_${categoryId}_collapsed`;
    const groupStorageKeyPrefix = "commandGroup_";

    expect(bus).toBeTruthy();
    expect(chainUi?.isInitialized?.()).toBe(true);
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(window.commandPresentationService).toBeUndefined();
    if (!bus || !chainUi || !coordinator) return;

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

    const startingPresentationState = await requestOwnerSnapshot(bus);
    const startingDataState = coordinator.getCurrentState();
    const profileId = startingDataState.currentProfile;
    const environment = startingDataState.currentEnvironment;
    expect(profileId).toBeTruthy();
    expect(["space", "ground"]).toContain(environment);
    if (!profileId || !["space", "ground"].includes(environment)) return;

    const startingProfile = startingDataState.profiles[profileId];
    const originalCommands = structuredClone(
      startingProfile.builds?.[environment]?.keys?.[probeKey],
    );
    const hadOriginalKey = Object.hasOwn(
      startingProfile.builds?.[environment]?.keys || {},
      probeKey,
    );
    const originalMetadata = structuredClone(
      startingProfile.keybindMetadata?.[environment]?.[probeKey],
    );
    const hadOriginalMetadata = Object.hasOwn(
      startingProfile.keybindMetadata?.[environment] || {},
      probeKey,
    );
    const originalSelection = chainUi.cache.selectedKey;
    const originalBindset = chainUi.cache.activeBindset || "Primary Bindset";
    const markupCommand =
      'CustomCommand <img id="command-chain-markup-probe" src="x">';
    const probeCommands = [
      "FireAll",
      markupCommand,
      "+TrayExecByTray 0 0",
      {
        command: "+TrayExecByTray 1 0",
        palindromicGeneration: false,
        placement: "in-pivot-group",
      },
    ];
    const groupTypes = ["non-trayexec", "palindromic", "pivot"];
    const groupType =
      groupTypes.find(
        (candidate) =>
          !startingPresentationState.collapsedGroups.includes(candidate),
      ) ?? groupTypes[0];
    const groupStorageKey = `${groupStorageKeyPrefix}${groupType}_collapsed`;
    const beforeCategoryRaw = localStorage.getItem(categoryStorageKey);
    const beforeGroupRaw = localStorage.getItem(groupStorageKey);
    const startingCategoryCollapsed =
      startingPresentationState.collapsedCategories.includes(categoryId);
    const startingGroupCollapsed =
      startingPresentationState.collapsedGroups.includes(groupType);
    let expectedRevision = startingPresentationState.revision;

    try {
      const commandOperation = hadOriginalKey
        ? {
            modify: {
              builds: {
                [environment]: { keys: { [probeKey]: probeCommands } },
              },
            },
          }
        : {
            add: {
              builds: {
                [environment]: { keys: { [probeKey]: probeCommands } },
              },
            },
          };
      await request(bus, "data:update-profile", {
        profileId,
        ...commandOperation,
        modify: {
          ...(commandOperation.modify || {}),
          keybindMetadata: {
            [environment]: {
              [probeKey]: { stabilizeExecutionOrder: true },
            },
          },
        },
      });
      await request(bus, "bindset-selector:set-active-bindset", {
        bindset: "Primary Bindset",
      });
      await request(bus, "selection:select-key", {
        keyName: probeKey,
        environment,
        bindset: "Primary Bindset",
        skipPersistence: true,
        forceEmit: true,
      });
      await vi.waitFor(() => {
        expect(chainUi.cache.selectedKey).toBe(probeKey);
        expect(document.getElementById("chainTitle")?.textContent).toContain(
          probeKey,
        );
        expect(document.querySelectorAll(".command-item-row")).toHaveLength(
          probeCommands.length,
        );
        expect(
          [...document.querySelectorAll(".command-text")].some(
            ({ textContent }) => textContent?.includes(markupCommand),
          ),
        ).toBe(true);
        expect(
          document.getElementById("command-chain-markup-probe"),
        ).toBeNull();
        for (const candidate of groupTypes) {
          const header = document.querySelector(
            `.group-header[data-group="${candidate}"]`,
          );
          expect(header).toBeInstanceOf(HTMLButtonElement);
          expect(header?.getAttribute("aria-expanded")).toBe(
            String(
              !startingPresentationState.collapsedGroups.includes(candidate),
            ),
          );
        }
      });
      let currentGroupHeader = document.querySelector(
        `.group-header[data-group="${groupType}"]`,
      );

      for (const expectedCollapsed of [
        !startingCategoryCollapsed,
        startingCategoryCollapsed,
      ]) {
        const predecessorGroupHeader = currentGroupHeader;
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
          expect(
            document.querySelector(`.group-header[data-group="${groupType}"]`),
          ).not.toBe(predecessorGroupHeader);
        });
        currentGroupHeader = document.querySelector(
          `.group-header[data-group="${groupType}"]`,
        );

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
        const groupHeader = currentGroupHeader;
        expect(groupHeader).toBeInstanceOf(HTMLElement);
        groupHeader.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
          expect(
            document
              .querySelector(`.group-header[data-group="${groupType}"]`)
              ?.querySelector(".twisty")
              ?.classList.contains("collapsed"),
          ).toBe(expectedCollapsed);
          expect(
            document
              .querySelector(`.group-header[data-group="${groupType}"]`)
              ?.getAttribute("aria-expanded"),
          ).toBe(String(!expectedCollapsed));
        });
        currentGroupHeader = document.querySelector(
          `.group-header[data-group="${groupType}"]`,
        );
        expect(localStorage.getItem(groupStorageKey)).toBe(
          expectedCollapsed ? "true" : null,
        );
        expect(await requestOwnerSnapshot(bus)).toEqual(
          chainUi.cache.commandPresentationState,
        );
      }

      expect(chainUi.cache.commandPresentationState).toEqual({
        ...startingPresentationState,
        revision: startingPresentationState.revision + 4,
      });
    } finally {
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

      await request(bus, "bindset-selector:set-active-bindset", {
        bindset: originalBindset,
      });
      await request(bus, "selection:select-key", {
        keyName: originalSelection,
        environment,
        bindset: originalBindset,
        skipPersistence: true,
        forceEmit: true,
      });
      await request(bus, "data:update-profile", {
        profileId,
        ...(hadOriginalKey
          ? {
              modify: {
                builds: {
                  [environment]: {
                    keys: { [probeKey]: originalCommands },
                  },
                },
              },
            }
          : {
              delete: {
                builds: {
                  [environment]: { keys: [probeKey] },
                },
              },
            }),
      });
      await request(bus, "data:update-profile", {
        profileId,
        modify: {
          keybindMetadata: {
            [environment]: {
              [probeKey]: hadOriginalMetadata ? originalMetadata : {},
            },
          },
        },
      });
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
