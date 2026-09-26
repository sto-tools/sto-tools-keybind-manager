import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { serializeProjectArtifact } from "../../../src/js/components/services/projectArtifact.js";

const goldenProject = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests/fixtures/sync/sync-project-golden.json"),
    "utf8",
  ),
);

describe("project artifact builder", () => {
  it("builds the exact current golden from explicit canonical settings", () => {
    const project = {
      profiles: structuredClone(goldenProject.data.profiles),
      currentProfile: goldenProject.data.currentProfile,
    };
    Object.defineProperty(project, "settings", {
      enumerable: true,
      get() {
        throw new Error("root settings must not be read");
      },
    });
    const settings = structuredClone(goldenProject.data.settings);

    const artifact = serializeProjectArtifact(project, settings, {
      version: goldenProject.version,
      exported: goldenProject.exported,
    });

    expect(JSON.parse(artifact)).toEqual(goldenProject);
    expect(artifact).toBe(JSON.stringify(goldenProject, null, 2));

    project.profiles = {};
    settings.theme = "changed-after-build";
    expect(JSON.parse(artifact)).toEqual(goldenProject);
  });

  it("rejects absent settings instead of consulting embedded root settings", () => {
    const project = {
      profiles: {},
      currentProfile: null,
      settings: structuredClone(goldenProject.data.settings),
    };

    expect(() =>
      serializeProjectArtifact(project, undefined, {
        exported: "2026-07-18T01:02:03.000Z",
      }),
    ).toThrowError("canonical_settings_required");
  });

  it("preserves decisive empty profiles and null current profile", () => {
    const artifact = serializeProjectArtifact(
      { profiles: {}, currentProfile: null },
      structuredClone(goldenProject.data.settings),
      {
        version: null,
        exported: "2026-07-18T01:02:03.000Z",
      },
    );

    expect(JSON.parse(artifact)).toEqual({
      version: "1.0.0",
      exported: "2026-07-18T01:02:03.000Z",
      type: "project",
      data: {
        profiles: {},
        settings: goldenProject.data.settings,
        currentProfile: null,
      },
    });
  });
});
