import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

const probeKey = "__command_editing_boundary_probe__";

describe("Command editing checked-bundle boundary", () => {
  it("opens the parameter editor through the real rendered edit control without writing state", async () => {
    const bus = window.eventBus;
    const coordinator = window.dataCoordinator;
    const storage = window.storageService;
    const chainUi = window.commandChainUI;

    expect(bus).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(storage).toBeTruthy();
    expect(chainUi?.isInitialized?.()).toBe(true);
    if (!bus || !coordinator || !storage || !chainUi) return;

    const editPayloads = [];
    const detachEditPayloadListener = bus.on(
      "parameter-command:edit",
      (payload) => {
        editPayloads.push(structuredClone(payload));
      },
    );

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
    const probeCommands = ['Target "Alpha"', "UncataloguedCommandForBoundary"];

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
        const row = document.querySelector('.command-item-row[data-index="0"]');
        expect(row).toBeInstanceOf(HTMLElement);
        editButton = row?.querySelector(".btn-edit:not(.btn-placeholder)");
        expect(editButton).toBeInstanceOf(HTMLButtonElement);
      });

      const revisionBeforeEdit = coordinator.getCurrentState().revision;
      const durableBeforeEdit = structuredClone(storage.getProfile(profileId));
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
      expect(coordinator.getCurrentState().revision).toBe(revisionBeforeEdit);
      expect(storage.getProfile(profileId)).toEqual(durableBeforeEdit);
      expect(
        coordinator.getCurrentState().profiles[profileId].builds[environment]
          .keys[probeKey],
      ).toEqual(probeCommands);

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

      const rawEditButton = document.querySelector(
        '.command-item-row[data-index="1"] .btn-edit:not(.btn-placeholder)',
      );
      expect(rawEditButton).toBeInstanceOf(HTMLButtonElement);
      rawEditButton?.click();

      await vi.waitFor(() => {
        expect(editPayloads).toHaveLength(2);
        expect(
          editPayloads[1]?.commandDef?.parameters?.rawCommand,
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
      expect(coordinator.getCurrentState().revision).toBe(revisionBeforeEdit);
      expect(storage.getProfile(profileId)).toEqual(durableBeforeEdit);
    } finally {
      detachEditPayloadListener();
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

    const finalProfile = coordinator.getCurrentState().profiles[profileId];
    if (hadOriginalKey) {
      expect(finalProfile.builds[environment].keys[probeKey]).toEqual(
        originalCommands,
      );
    } else {
      expect(finalProfile.builds[environment].keys).not.toHaveProperty(
        probeKey,
      );
    }
  });
});
