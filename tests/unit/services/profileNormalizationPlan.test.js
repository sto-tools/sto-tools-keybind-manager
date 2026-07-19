import { describe, expect, it, vi } from "vitest";

import { normalizeProfile } from "../../../src/js/lib/profileNormalizer.js";
import { planProfileNormalizations } from "../../../src/js/components/services/profileNormalizationPlan.js";

describe("profile normalization planning", () => {
  it("plans ordered detached replacements through explicit capabilities", () => {
    const profiles = {
      missing: {
        name: "Missing",
        builds: { space: { keys: { F1: ["FireAll"] } } },
        aliases: {},
      },
      current: {
        name: "Current",
        migrationVersion: "2.1.1",
        builds: {
          space: { keys: { F2: [{ command: "MustRemainRich" }] } },
        },
        aliases: {},
      },
      stale: {
        name: "Stale",
        migrationVersion: "2.1.0",
        builds: { space: { keys: {} } },
        aliases: {},
      },
    };
    const sourceBefore = structuredClone(profiles);
    const order = [];
    const discardedReturn = { migrationVersion: "not-the-draft" };

    const result = planProfileNormalizations(profiles, {
      normalizeProfile: (draft) => {
        order.push(`normalize:${draft.name}`);
        draft.migrationVersion = "2.1.1";
        draft.normalized = true;
        return discardedReturn;
      },
      onProfileStart: (profileId) => order.push(`start:${profileId}`),
      onProfileComplete: (report) =>
        order.push(
          `complete:${report.profileId}:${report.originalVersion}:${report.normalizedVersion}`,
        ),
    });

    expect(order).toEqual([
      "start:missing",
      "normalize:Missing",
      "complete:missing:2.0.0:2.1.1",
      "start:stale",
      "normalize:Stale",
      "complete:stale:2.1.0:2.1.1",
    ]);
    expect(result.profilesNormalized).toBe(2);
    expect(Object.keys(result.normalizedProfiles)).toEqual([
      "missing",
      "stale",
    ]);
    expect(result.normalizedProfiles.missing).toMatchObject({
      name: "Missing",
      migrationVersion: "2.1.1",
      normalized: true,
    });
    expect(result.normalizedProfiles.missing).not.toBe(profiles.missing);
    expect(result.normalizedProfiles.missing).not.toBe(discardedReturn);
    expect(profiles).toEqual(sourceBefore);
  });

  it("does not invoke any capability for a claimed current version", () => {
    const capabilities = {
      normalizeProfile: vi.fn(),
      onProfileStart: vi.fn(),
      onProfileComplete: vi.fn(),
    };
    const profiles = {
      current: {
        migrationVersion: "2.1.1",
        builds: {
          space: { keys: { F1: [{ command: "StillRich" }] } },
        },
      },
    };

    expect(planProfileNormalizations(profiles, capabilities)).toEqual({
      profilesNormalized: 0,
      normalizedProfiles: {},
    });
    expect(capabilities.normalizeProfile).not.toHaveBeenCalled();
    expect(capabilities.onProfileStart).not.toHaveBeenCalled();
    expect(capabilities.onProfileComplete).not.toHaveBeenCalled();
  });

  it("composes with the production normalizer without broadening its scope", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const profiles = {
      legacy: {
        name: "Legacy",
        extension: { retained: true },
        builds: {
          space: {
            keys: { F1: [{ command: "FireAll" }] },
            aliases: {
              scoped: { commands: [{ command: "ScopedMustRemainRich" }] },
            },
          },
        },
        bindsets: {
          Alternate: {
            space: {
              keys: { F2: [{ command: "BindsetMustRemainRich" }] },
            },
          },
        },
        aliases: { top: { commands: "FireAll $$ FireTorps" } },
      },
    };

    profiles.future = {
      name: "Future",
      migrationVersion: "9.0.0",
      builds: { space: { keys: { F9: ["FutureCommand"] } } },
      aliases: {},
    };
    const result = planProfileNormalizations(profiles, {
      normalizeProfile,
    });
    const normalized = result.normalizedProfiles.legacy;

    expect(normalized).toMatchObject({
      migrationVersion: "2.1.1",
      extension: { retained: true },
      builds: {
        space: {
          keys: { F1: ["FireAll"] },
          aliases: {
            scoped: { commands: [{ command: "ScopedMustRemainRich" }] },
          },
        },
      },
      bindsets: {
        Alternate: {
          space: {
            keys: { F2: [{ command: "BindsetMustRemainRich" }] },
          },
        },
      },
      aliases: { top: { commands: ["FireAll", "FireTorps"] } },
    });
    expect(profiles.legacy).not.toHaveProperty("migrationVersion");
    expect(profiles.legacy.builds.space.keys.F1).toEqual([
      { command: "FireAll" },
    ]);
    expect(result.profilesNormalized).toBe(2);
    expect(result.normalizedProfiles.future).toMatchObject({
      migrationVersion: "2.1.1",
      builds: { space: { keys: { F9: ["FutureCommand"] } } },
    });
    expect(profiles.future.migrationVersion).toBe("9.0.0");
  });

  it("leaves every source profile untouched when normalization throws", () => {
    const profiles = {
      first: { name: "First", builds: {}, aliases: {} },
      second: { name: "Second", builds: {}, aliases: {} },
    };
    const sourceBefore = structuredClone(profiles);
    const order = [];

    expect(() =>
      planProfileNormalizations(profiles, {
        normalizeProfile: (draft) => {
          order.push(`normalize:${draft.name}`);
          if (draft.name === "Second") throw new Error("normalizer failed");
          draft.migrationVersion = "2.1.1";
        },
        onProfileStart: (profileId) => order.push(`start:${profileId}`),
        onProfileComplete: ({ profileId }) =>
          order.push(`complete:${profileId}`),
      }),
    ).toThrow("normalizer failed");
    expect(order).toEqual([
      "start:first",
      "normalize:First",
      "complete:first",
      "start:second",
      "normalize:Second",
    ]);
    expect(profiles).toEqual(sourceBefore);
  });
});
