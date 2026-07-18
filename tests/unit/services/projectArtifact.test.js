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
  it("builds the exact current golden with separate settings precedence", () => {
    const root = {
      profiles: structuredClone(goldenProject.data.profiles),
      settings: { theme: "stale-root" },
      currentProfile: goldenProject.data.currentProfile,
    };
    const before = structuredClone(root);

    const settings = structuredClone(goldenProject.data.settings);
    const artifact = serializeProjectArtifact(root, settings, {
      version: goldenProject.version,
      exported: goldenProject.exported,
    });

    expect(JSON.parse(artifact)).toEqual(goldenProject);
    expect(artifact).toBe(JSON.stringify(goldenProject, null, 2));
    expect(root).toEqual(before);

    root.profiles = {};
    settings.theme = "changed-after-build";
    expect(JSON.parse(artifact)).toEqual(goldenProject);
  });

  it("retains the historical root-settings and version fallbacks", () => {
    const root = {
      profiles: {},
      settings: { theme: "root-fallback" },
      currentProfile: null,
    };

    const artifact = serializeProjectArtifact(root, null, {
      version: "",
      exported: "2026-07-18T01:02:03.000Z",
    });

    expect(JSON.parse(artifact)).toEqual({
      version: "1.0.0",
      exported: "2026-07-18T01:02:03.000Z",
      type: "project",
      data: {
        profiles: {},
        settings: { theme: "root-fallback" },
        currentProfile: null,
      },
    });
  });

  it("retains empty compatibility fallbacks for incomplete injected storage data", () => {
    const artifact = serializeProjectArtifact(
      { profiles: null, settings: null, currentProfile: null },
      undefined,
      {
        version: null,
        exported: "2026-07-18T01:02:03.000Z",
      },
    );

    expect(JSON.parse(artifact)).toEqual({
      version: "1.0.0",
      exported: "2026-07-18T01:02:03.000Z",
      type: "project",
      data: { profiles: {}, settings: {}, currentProfile: null },
    });
  });
});
