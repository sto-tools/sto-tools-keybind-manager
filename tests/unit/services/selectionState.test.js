import { describe, expect, it } from "vitest";

import {
  applyActiveSelection,
  selectionCacheFromProfile,
  selectionRecordFromProfile,
  selectionRecordsEqual,
} from "../../../src/js/components/services/selectionState.js";

describe("selection state projection", () => {
  it("projects all durable selection slots from a profile", () => {
    expect(
      selectionCacheFromProfile({
        selections: {
          space: "F1",
          ground: "G",
          alias: "Alpha",
          custom: "C1",
        },
      }),
    ).toEqual({
      space: "F1",
      ground: "G",
      alias: "Alpha",
      custom: "C1",
    });
  });

  it("normalizes missing and non-string boundary values to null", () => {
    expect(
      selectionCacheFromProfile({
        selections: { space: 42, ground: undefined, alias: null },
      }),
    ).toEqual({ space: null, ground: null, alias: null });
    expect(selectionCacheFromProfile(null)).toEqual({
      space: null,
      ground: null,
      alias: null,
    });
  });

  it("projects mutually exclusive active key and alias state", () => {
    const cache = { selectedKey: "F1", selectedAlias: null };

    expect(applyActiveSelection(cache, "ground", "G1")).toBe(true);
    expect(cache).toEqual({ selectedKey: "G1", selectedAlias: null });
    expect(applyActiveSelection(cache, "ground", "G1")).toBe(false);

    expect(applyActiveSelection(cache, "alias", "Alpha")).toBe(true);
    expect(cache).toEqual({ selectedKey: null, selectedAlias: "Alpha" });
  });

  it("compares exact valid durable selection records", () => {
    expect(
      selectionRecordFromProfile({
        selections: { space: "S1", alias: null, invalid: 42 },
      }),
    ).toEqual({ space: "S1", alias: null });
    expect(
      selectionRecordsEqual(
        { space: "S1", alias: null },
        { alias: null, space: "S1" },
      ),
    ).toBe(true);
    expect(selectionRecordsEqual({ space: "S1" }, { space: "S2" })).toBe(false);
    expect(
      selectionRecordsEqual({ space: "S1" }, { space: "S1", alias: null }),
    ).toBe(false);
  });
});
