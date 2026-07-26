import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decodeStoredApplicationJson } from "../../../src/js/components/services/storedApplicationDataBoundary.js";

const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/storage",
);

function readFixture(fileName) {
  return JSON.parse(readFileSync(join(fixtureDirectory, fileName), "utf8"));
}

const rootFields = [
  "version",
  "created",
  "lastModified",
  "lastBackup",
  "currentProfile",
  "profiles",
  "globalAliases",
  "settings",
];

const profileFields = [
  "id",
  "name",
  "description",
  "currentEnvironment",
  "environment",
  "builds",
  "aliases",
  "bindsets",
  "keybindMetadata",
  "aliasMetadata",
  "bindsetMetadata",
  "keys",
  "keybinds",
  "selections",
  "created",
  "lastModified",
  "migrationVersion",
  "vertigoSettings",
];

const richCommandFields = [
  "command",
  "text",
  "id",
  "type",
  "category",
  "categoryId",
  "commandId",
  "name",
  "description",
  "icon",
  "environment",
  "warning",
  "customizable",
  "custom",
  "palindromicGeneration",
  "placement",
  "parameters",
];

const aliasFields = [
  "description",
  "commands",
  "type",
  "name",
  "isGenerated",
  "isLoader",
  "category",
  "metadata",
];

const settingsFields = [
  "theme",
  "autoSave",
  "showTooltips",
  "confirmDeletes",
  "maxUndoSteps",
  "defaultMode",
  "compactView",
  "language",
  "syncFolderName",
  "syncFolderPath",
  "autoSync",
  "autoSyncInterval",
  "bindToAliasMode",
  "bindsetsEnabled",
  "translateGeneratedMessages",
  "syncFolderFallback",
  "currentProfile",
  "version",
  "firstRun",
];

function expectOwnFields(value, fields) {
  for (const field of fields) expect(value).toHaveProperty(field);
}

describe("complete persisted-data contract fixture", () => {
  it("materializes every known root, profile, command, alias, and settings field", () => {
    const root = readFixture("complete-current-root.json");
    const profile = root.profiles["complete-profile"];
    const command = profile.builds.space.keys.F1[1];
    const alias = profile.aliases.CompleteAlias;

    expectOwnFields(root, rootFields);
    expectOwnFields(profile, profileFields);
    expectOwnFields(command, richCommandFields);
    expectOwnFields(alias, aliasFields);
    expectOwnFields(root.settings, settingsFields);
  });

  it("round-trips and detaches explicit extensions at every open schema level", () => {
    const root = readFixture("complete-current-root.json");
    const decoded = decodeStoredApplicationJson(JSON.stringify(root), {
      defaults: root,
      version: root.version,
    });

    expect(decoded).toMatchObject({
      success: true,
      changed: false,
      migrated: false,
      value: root,
    });
    if (!decoded.success) throw new Error("expected a decoded root");

    const profile = decoded.value.profiles["complete-profile"];
    expect(decoded.value.rootExtension).toEqual({ retained: true });
    expect(profile.profileExtension).toEqual({
      panels: ["commands", "aliases"],
    });
    expect(profile.builds.space.environmentExtension).toEqual({
      layout: "space",
    });
    expect(profile.builds.space.keys.F1[1].commandExtension).toEqual({
      source: "complete-fixture",
    });
    expect(profile.aliases.CompleteAlias.aliasExtension).toEqual(["retained"]);
    expect(decoded.value.settings["plugin:layout"]).toEqual({
      density: "compact",
    });

    root.rootExtension.retained = false;
    root.profiles["complete-profile"].profileExtension.panels.length = 0;
    expect(decoded.value.rootExtension).toEqual({ retained: true });
    expect(profile.profileExtension).toEqual({
      panels: ["commands", "aliases"],
    });
  });

  it("covers the complete imported project envelope and rich-command shape", () => {
    const project = readFixture("../sync/sync-project-golden.json");
    const profile = project.data.profiles["canonical-profile"];
    const command = profile.builds.space.keys.F1[1];

    expectOwnFields(project, ["version", "exported", "type", "data"]);
    expectOwnFields(project.data, ["profiles", "settings", "currentProfile"]);
    expectOwnFields(
      profile,
      profileFields.filter((field) => field !== "keys" && field !== "keybinds"),
    );
    expect(profile).not.toHaveProperty("keys");
    expect(profile).not.toHaveProperty("keybinds");
    expect(profile.builds.space.keys).toHaveProperty("F1");
    expect(profile.builds.ground.keys).toHaveProperty("F2");
    expectOwnFields(command, richCommandFields);
    expectOwnFields(project.data.settings, settingsFields.slice(0, 16));
    expect(command.commandExtension).toEqual({
      source: "artifact-fixture",
    });
    expect(profile.profileExtension).toEqual({
      source: "artifact-fixture",
    });
    expect(project.data.settings["plugin:layout"]).toEqual({
      density: "compact",
    });
  });
});
