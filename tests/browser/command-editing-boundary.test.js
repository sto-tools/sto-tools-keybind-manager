import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

const probeKey = "__command_editing_boundary_probe__";

describe("Command editing checked-bundle boundary", () => {
  it("preserves parameter edit sessions and durably replaces the captured command", async () => {
    const bus = window.eventBus;
    const coordinator = window.dataCoordinator;
    const storage = window.storageService;
    const chainUi = window.commandChainUI;

    expect(bus).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(storage).toBeTruthy();
    expect(chainUi?.isInitialized?.()).toBe(true);
    if (!bus || !coordinator || !storage || !chainUi) return;

    // A focused first-run execution may begin with the welcome modal open.
    // Close that fixture state so the parameter modal is the active language-
    // regeneration owner, matching a user who has entered the command editor.
    if (document.getElementById("aboutModal")?.classList.contains("active")) {
      await bus.emit(
        "modal:hide",
        { modalId: "aboutModal" },
        { synchronous: true },
      );
    }
    expect(document.querySelectorAll(".modal.active")).toHaveLength(0);

    const startingState = coordinator.getCurrentState();
    const profileId = startingState.currentProfile;
    const environment = ["space", "ground"].includes(
      startingState.currentEnvironment,
    )
      ? startingState.currentEnvironment
      : "space";
    expect(profileId).toBeTruthy();
    if (!profileId) return;

    const startingProfile = startingState.profiles[profileId];
    const hadOriginalKey = Object.hasOwn(
      startingProfile.builds?.[environment]?.keys || {},
      probeKey,
    );
    const originalCommands = hadOriginalKey
      ? structuredClone(startingProfile.builds[environment].keys[probeKey])
      : null;
    const originalEnvironment = startingState.currentEnvironment;
    const originalSelectedKey = chainUi.cache.selectedKey;
    const originalSelectedAlias = chainUi.cache.selectedAlias;
    const originalBindset = chainUi.cache.activeBindset || "Primary Bindset";
    const originalLanguage = window.i18next.language;
    const alternateLanguage = originalLanguage.startsWith("de") ? "en" : "de";
    const probeCommands = ['Target "Alpha"', "UncataloguedCommandForBoundary"];
    const editPayloads = [];
    const commandEditPayloads = [];
    const modalRegenerationPayloads = [];
    const detachEditPayloadListener = bus.on(
      "parameter-command:edit",
      (payload) => {
        editPayloads.push(payload);
      },
    );
    const detachCommandEditListener = bus.on("command:edit", (payload) => {
      commandEditPayloads.push(payload);
    });
    const detachModalRegenerationListener = bus.on(
      "modal:regenerated",
      (payload) => {
        modalRegenerationPayloads.push(payload);
      },
    );

    try {
      if (originalEnvironment !== environment) {
        await request(bus, "environment:switch", { mode: environment });
      }
      await request(bus, "data:update-profile", {
        profileId,
        add: {
          builds: {
            [environment]: { keys: { [probeKey]: probeCommands } },
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

      let editButton;
      await vi.waitFor(() => {
        expect(chainUi.cache.selectedKey).toBe(probeKey);
        expect(chainUi.cache.dataState).toBe(coordinator.getCurrentState());
        const row = document.querySelector('.command-item-row[data-index="0"]');
        expect(row).toBeInstanceOf(HTMLElement);
        editButton = row?.querySelector(".btn-edit:not(.btn-placeholder)");
        expect(editButton).toBeInstanceOf(HTMLButtonElement);
      });

      const ownerBeforeEdit = coordinator.getCurrentState();
      const revisionBeforeEdit = ownerBeforeEdit.revision;
      const cacheBeforeEdit = chainUi.cache.dataState;
      const durableBeforeEdit = structuredClone(storage.getProfile(profileId));
      const rootBeforeEdit = localStorage.getItem(storage.storageKey);
      const settingsBeforeEdit = localStorage.getItem(storage.settingsKey);
      // Edit targets use the canonical primary storage path even while the
      // enabled bindset selector presents it as "Primary Bindset".
      const expectedBindset = null;
      const expectedInitialTarget = {
        authorityEpoch: ownerBeforeEdit.authorityEpoch,
        revision: revisionBeforeEdit,
        profileId,
        environment,
        name: probeKey,
        bindset: expectedBindset,
        index: 0,
        originalEntry: probeCommands[0],
      };
      editButton.click();

      await vi.waitFor(() => {
        expect(editPayloads).toHaveLength(1);
        const modal = document.getElementById("parameterModal");
        const input = document.getElementById("param_entityName");
        expect(modal).toBeInstanceOf(HTMLElement);
        expect(modal?.classList).toContain("active");
        expect(input).toBeInstanceOf(HTMLInputElement);
        expect(input?.value).toBe("Alpha");
      });

      expect(editPayloads[0]?.target).toEqual(expectedInitialTarget);
      expect(Object.isFrozen(editPayloads[0]?.target)).toBe(true);
      expect(
        JSON.parse(
          document
            .getElementById("parameterModal")
            ?.getAttribute("data-command-def") || "{}",
        ),
      ).toMatchObject({
        categoryId: "targeting",
        commandId: "target",
        customizable: true,
      });
      expect(document.getElementById("modalOverlay")?.classList).toContain(
        "active",
      );
      expect(document.body.classList).toContain("modal-open");

      const originalInput = document.getElementById("param_entityName");
      const originalSave = document.getElementById("saveParameterCommandBtn");
      expect(originalInput).toBeInstanceOf(HTMLInputElement);
      expect(originalSave).toBeInstanceOf(HTMLButtonElement);
      const originalSaveText = originalSave?.textContent;
      originalInput.value = "Unsaved Boundary Draft";
      originalInput.focus();
      originalInput.setSelectionRange(8, 16, "forward");
      originalInput.dispatchEvent(new Event("input", { bubbles: true }));

      await window.i18next.changeLanguage(alternateLanguage);

      const regeneratedInput = document.getElementById("param_entityName");
      const regeneratedSave = document.getElementById(
        "saveParameterCommandBtn",
      );
      expect(regeneratedInput).toBeInstanceOf(HTMLInputElement);
      expect(regeneratedInput).not.toBe(originalInput);
      expect(originalInput.isConnected).toBe(false);
      expect(regeneratedInput?.value).toBe("Unsaved Boundary Draft");
      expect(document.activeElement).toBe(regeneratedInput);
      expect(regeneratedInput?.selectionStart).toBe(8);
      expect(regeneratedInput?.selectionEnd).toBe(16);
      expect(regeneratedSave?.textContent).toBe(window.i18next.t("save"));
      expect(regeneratedSave?.textContent).not.toBe(originalSaveText);
      expect(modalRegenerationPayloads).toEqual([
        { modalId: "parameterModal" },
      ]);

      const firstCancel = document.querySelector(
        '#parameterModal .btn-secondary[data-modal="parameterModal"]',
      );
      expect(firstCancel).toBeInstanceOf(HTMLButtonElement);
      firstCancel?.click();
      await vi.waitFor(() => {
        expect(
          document.getElementById("parameterModal")?.classList,
        ).not.toContain("active");
      });

      const settledModalContent = document.querySelector(
        "#parameterModal > .modal-content",
      );
      await bus.emit(
        "modal:show",
        { modalId: "parameterModal" },
        { synchronous: true },
      );
      expect(document.getElementById("parameterModal")?.classList).toContain(
        "active",
      );
      await window.i18next.changeLanguage(originalLanguage);
      expect(document.querySelector("#parameterModal > .modal-content")).toBe(
        settledModalContent,
      );
      expect(modalRegenerationPayloads).toEqual([
        { modalId: "parameterModal" },
      ]);
      await bus.emit(
        "modal:hide",
        { modalId: "parameterModal" },
        { synchronous: true },
      );
      expect(commandEditPayloads).toHaveLength(0);
      expect(coordinator.getCurrentState()).toBe(ownerBeforeEdit);
      expect(chainUi.cache.dataState).toBe(cacheBeforeEdit);
      expect(storage.getProfile(profileId)).toEqual(durableBeforeEdit);
      expect(localStorage.getItem(storage.storageKey)).toBe(rootBeforeEdit);
      expect(localStorage.getItem(storage.settingsKey)).toBe(
        settingsBeforeEdit,
      );

      const reopenedEditButton = document.querySelector(
        '.command-item-row[data-index="0"] .btn-edit:not(.btn-placeholder)',
      );
      expect(reopenedEditButton).toBeInstanceOf(HTMLButtonElement);
      reopenedEditButton?.click();

      await vi.waitFor(() => {
        expect(editPayloads).toHaveLength(2);
        const input = document.getElementById("param_entityName");
        expect(input).toBeInstanceOf(HTMLInputElement);
        expect(input?.value).toBe("Alpha");
      });
      expect(editPayloads[1]?.target).toEqual(expectedInitialTarget);
      expect(Object.isFrozen(editPayloads[1]?.target)).toBe(true);

      const replacementInput = document.getElementById("param_entityName");
      expect(replacementInput).toBeInstanceOf(HTMLInputElement);
      replacementInput.value = "Beta";
      replacementInput.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.waitFor(() => {
        expect(
          document.getElementById("parameterCommandPreview")?.textContent,
        ).toBe('Target "Beta"');
      });

      const save = document.getElementById("saveParameterCommandBtn");
      expect(save).toBeInstanceOf(HTMLButtonElement);
      save?.click();

      const expectedEditedCommands = [
        'Target "Beta"',
        "UncataloguedCommandForBoundary",
      ];
      await vi.waitFor(() => {
        const committedState = coordinator.getCurrentState();
        expect(committedState.revision).toBe(revisionBeforeEdit + 1);
        expect(
          committedState.profiles[profileId].builds[environment].keys[probeKey],
        ).toEqual(expectedEditedCommands);
        expect(chainUi.cache.dataState).toBe(committedState);
        expect(
          chainUi.cache.dataState.profiles[profileId].builds[environment].keys[
            probeKey
          ],
        ).toEqual(expectedEditedCommands);
        expect(
          storage.getProfile(profileId).builds[environment].keys[probeKey],
        ).toEqual(expectedEditedCommands);
        expect(
          JSON.parse(localStorage.getItem(storage.storageKey)).profiles[
            profileId
          ].builds[environment].keys[probeKey],
        ).toEqual(expectedEditedCommands);
      });
      await vi.waitFor(() => {
        expect(
          document.getElementById("parameterModal")?.classList,
        ).not.toContain("active");
        expect(commandEditPayloads).toHaveLength(1);
      });
      expect(commandEditPayloads[0]).toMatchObject({
        key: probeKey,
        index: 0,
        bindset: expectedBindset,
        updatedCommand: {
          command: 'Target "Beta"',
          type: "targeting",
          parameters: { entityName: "Beta" },
        },
        target: expectedInitialTarget,
      });
      expect(commandEditPayloads[0]?.target).toBe(editPayloads[1]?.target);
      expect(Object.isFrozen(commandEditPayloads[0]?.target)).toBe(true);

      let rawEditButton;
      await vi.waitFor(() => {
        rawEditButton = document.querySelector(
          '.command-item-row[data-index="1"] .btn-edit:not(.btn-placeholder)',
        );
        expect(rawEditButton).toBeInstanceOf(HTMLButtonElement);
      });
      rawEditButton?.click();

      await vi.waitFor(() => {
        expect(editPayloads).toHaveLength(3);
        expect(
          editPayloads[2]?.commandDef?.parameters?.rawCommand,
        ).toMatchObject({
          default: "UncataloguedCommandForBoundary",
          placeholder: "Enter any STO command",
          label: "Command:",
        });
        const modal = document.getElementById("parameterModal");
        const input = document.getElementById("param_rawCommand");
        expect(modal?.classList).toContain("active");
        expect(input).toBeInstanceOf(HTMLInputElement);
        expect(input?.value).toBe("UncataloguedCommandForBoundary");
        expect(input?.getAttribute("placeholder")).toBe(
          "Enter any STO command",
        );
        expect(
          document.querySelector('label[for="param_rawCommand"]')?.textContent,
        ).toBe("Command:");
      });
      expect(editPayloads[2]?.target).toEqual({
        ...expectedInitialTarget,
        revision: revisionBeforeEdit + 1,
        index: 1,
        originalEntry: probeCommands[1],
      });
      expect(Object.isFrozen(editPayloads[2]?.target)).toBe(true);
      expect(
        JSON.parse(
          document
            .getElementById("parameterModal")
            ?.getAttribute("data-command-def") || "{}",
        ),
      ).toMatchObject({
        name: "Edit Custom Command",
        categoryId: "custom",
        commandId: "add_custom_command",
      });

      const revisionBeforeRawCancel = coordinator.getCurrentState().revision;
      const durableBeforeRawCancel = structuredClone(
        storage.getProfile(profileId),
      );
      const rootBeforeRawCancel = localStorage.getItem(storage.storageKey);
      const rawCancel = document.querySelector(
        '#parameterModal .btn-secondary[data-modal="parameterModal"]',
      );
      expect(rawCancel).toBeInstanceOf(HTMLButtonElement);
      rawCancel?.click();
      await vi.waitFor(() => {
        expect(
          document.getElementById("parameterModal")?.classList,
        ).not.toContain("active");
      });
      expect(coordinator.getCurrentState().revision).toBe(
        revisionBeforeRawCancel,
      );
      expect(storage.getProfile(profileId)).toEqual(durableBeforeRawCancel);
      expect(localStorage.getItem(storage.storageKey)).toBe(
        rootBeforeRawCancel,
      );
      expect(commandEditPayloads).toHaveLength(1);
    } finally {
      const cancel = document.querySelector(
        '#parameterModal .btn-secondary[data-modal="parameterModal"]',
      );
      cancel?.click();
      if (document.getElementById("parameterModal")) {
        await vi.waitFor(() => {
          expect(
            document.getElementById("parameterModal")?.classList,
          ).not.toContain("active");
        });
      }
      await window.i18next.changeLanguage(originalLanguage);
      detachEditPayloadListener();
      detachCommandEditListener();
      detachModalRegenerationListener();
      await request(bus, "bindset-selector:set-active-bindset", {
        bindset: originalBindset,
      });
      if (originalEnvironment !== environment) {
        await request(bus, "environment:switch", {
          mode: originalEnvironment,
        });
      }
      if (originalEnvironment === "alias") {
        await request(bus, "selection:select-alias", {
          aliasName: originalSelectedAlias,
          skipPersistence: true,
          forceEmit: true,
        });
      } else {
        await request(bus, "selection:select-key", {
          keyName: originalSelectedKey,
          environment: originalEnvironment,
          bindset: originalBindset,
          skipPersistence: true,
          forceEmit: true,
        });
      }
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
    }

    await vi.waitFor(() => {
      const finalProfile = coordinator.getCurrentState().profiles[profileId];
      const finalCachedProfile = chainUi.cache.dataState.profiles[profileId];
      const finalStoredProfile = storage.getProfile(profileId);
      const finalRawProfile = JSON.parse(
        localStorage.getItem(storage.storageKey),
      ).profiles[profileId];
      if (hadOriginalKey) {
        expect(finalProfile.builds[environment].keys[probeKey]).toEqual(
          originalCommands,
        );
        expect(finalCachedProfile.builds[environment].keys[probeKey]).toEqual(
          originalCommands,
        );
        expect(finalStoredProfile.builds[environment].keys[probeKey]).toEqual(
          originalCommands,
        );
        expect(finalRawProfile.builds[environment].keys[probeKey]).toEqual(
          originalCommands,
        );
      } else {
        expect(finalProfile.builds[environment].keys).not.toHaveProperty(
          probeKey,
        );
        expect(finalCachedProfile.builds[environment].keys).not.toHaveProperty(
          probeKey,
        );
        expect(finalStoredProfile.builds[environment].keys).not.toHaveProperty(
          probeKey,
        );
        expect(finalRawProfile.builds[environment].keys).not.toHaveProperty(
          probeKey,
        );
      }
    });
  });
});
