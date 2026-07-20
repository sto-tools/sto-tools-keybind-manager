import { afterEach, describe, expect, it, vi } from "vitest";

import CommandChainValidatorService from "../../src/js/components/services/CommandChainValidatorService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../fixtures/index.js";

function createProfile() {
  return {
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: { keys: { F1: ["First", "Second"] } },
      ground: { keys: {} },
    },
    aliases: {},
    keybindMetadata: {},
    aliasMetadata: {},
    bindsetMetadata: {},
    bindsets: {},
    migrationVersion: "2.1.1",
  };
}

describe("command-chain validation projection lifecycle", () => {
  let fixture;
  const components = [];

  afterEach(() => {
    for (const component of components.reverse()) {
      if (!component.destroyed) component.destroy();
    }
    fixture?.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  it("validates a late-joined owner snapshot without a preview responder", async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    const profile = createProfile();
    fixture.storage.getAllData.mockReturnValue({
      currentProfile: "captain",
      profiles: { captain: profile },
      settings: {},
      version: "1.0.0",
      lastModified: "2026-07-20T00:00:00.000Z",
    });

    const coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    components.push(coordinator);
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });

    const validator = new CommandChainValidatorService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    components.push(validator);
    validator.init();

    expect(validator.cache.dataState).toBe(coordinator.getCurrentState());
    expect(
      fixture.eventBus.hasListeners("rpc:command:generate-command-preview"),
    ).toBe(false);
    const result = vi.fn();
    fixture.eventBus.on("command-chain:validation-result", result);

    fixture.eventBus.emit("command-chain:validate", {
      key: "F1",
      stabilized: true,
      isAlias: false,
    });

    await vi.waitFor(() => expect(result).toHaveBeenCalledOnce());
    expect(result).toHaveBeenCalledWith({
      key: "F1",
      length: 'F1 "First $$ Second $$ First"'.length,
      severity: "warning",
      warnings: [
        {
          id: "stabilizedTrayOnly",
          severity: "warning",
          key: "stabilized_non_tray_warning",
          params: {},
          defaultMessage:
            "Stabilized execution should only be used with tray execution abilities.",
        },
      ],
      errors: [],
    });
  });
});
