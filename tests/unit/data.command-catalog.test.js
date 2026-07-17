import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  commandCategories,
  findCommandByName,
  findCommandDefinition,
  getCommandCategories,
  getCommandWarning,
} from "../../src/js/data/commandCatalog.js";

describe("command catalog projections", () => {
  it("pins the complete ordered catalog contract", () => {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(commandCategories))
      .digest("hex");

    expect(fingerprint).toBe(
      "aba3fad86a19fd38ab67120e5305a7790663fc226e92f7e14d625b131e5f4fd7",
    );
  });

  it("preserves category order and duplicate-command first-match behavior", () => {
    expect(Object.keys(commandCategories)).toEqual([
      "custom",
      "targeting",
      "combat",
      "cosmetic",
      "bridge_officer",
      "tray",
      "power",
      "movement",
      "camera",
      "communication",
      "team",
      "system",
    ]);
    expect(
      Object.values(commandCategories).reduce(
        (count, category) => count + Object.keys(category.commands).length,
        0,
      ),
    ).toBe(116);
    expect(findCommandDefinition("+STOTrayExecByTray 0 0")).toMatchObject({
      categoryId: "tray",
      commandId: "custom_tray",
    });
    expect(
      findCommandDefinition("TrayExecByTrayWithBackup 1 0 0 0 0"),
    ).toMatchObject({ categoryId: "tray", commandId: "tray_with_backup" });
  });

  it("supports exact, rich-display, parameterized, and missing definitions", () => {
    expect(findCommandDefinition("FireAll")).toMatchObject({
      categoryId: "combat",
      commandId: "fire_all",
      command: "FireAll",
    });
    expect(
      findCommandDefinition({ command: "not exact", text: "Fire All Weapons" }),
    ).toMatchObject({ categoryId: "combat", commandId: "fire_all" });
    expect(findCommandDefinition("+TrayExecByTray 3 4")).toMatchObject({
      categoryId: "tray",
      commandId: "custom_tray",
    });
    expect(findCommandDefinition("TrayExecByTray 3 4")).toMatchObject({
      categoryId: "tray",
      commandId: "custom_tray",
    });
    expect(findCommandDefinition("UnknownCommand")).toBeNull();
  });

  it("translates returned definitions without mutating the shared catalog", () => {
    const i18n = {
      t: (key, { defaultValue } = {}) =>
        key.endsWith(".name") ? "Translated fire" : defaultValue,
    };

    const definition = findCommandDefinition("FireAll", i18n);

    expect(definition).toMatchObject({
      name: "Translated fire",
      description: "Fire all weapons",
    });
    expect(commandCategories.combat.commands.fire_all.name).toBe(
      "Fire All Weapons",
    );
  });

  it("does not misclassify communication text containing $Target", () => {
    expect(findCommandDefinition('team "attack $Target"')).toMatchObject({
      categoryId: "communication",
      commandId: "team_message",
    });
  });

  it("preserves warning and exact compatibility lookup semantics", () => {
    expect(getCommandWarning("FireAll")).toBe("spam_bar_warning");
    expect(getCommandWarning("FireAll extra")).toBeNull();
    expect(getCommandWarning("UnknownCommand")).toBeNull();
    expect(findCommandByName("FireAll")).toMatchObject({
      categoryId: "combat",
      commandId: "fire_all",
      environment: "space",
    });
    expect(findCommandByName("FireAll extra")).toBeNull();
    expect(findCommandByName("UnknownCommand")).toBeNull();
  });

  it("returns detached category snapshots and accepts an explicit test catalog", () => {
    const snapshot = getCommandCategories();
    snapshot.combat.commands.fire_all.name = "Mutated snapshot";
    expect(commandCategories.combat.commands.fire_all.name).toBe(
      "Fire All Weapons",
    );

    const fixture = {
      fixture: {
        name: "Fixture",
        commands: {
          test: { name: "Test", command: "FixtureCommand" },
        },
      },
    };
    expect(
      findCommandDefinition("FixtureCommand", null, fixture),
    ).toMatchObject({
      categoryId: "fixture",
      commandId: "test",
    });
    expect(findCommandByName("FixtureCommand", fixture)).toMatchObject({
      categoryId: "fixture",
      commandId: "test",
    });
  });
});
