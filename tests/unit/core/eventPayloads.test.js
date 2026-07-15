import { describe, expect, it } from "vitest";
import {
  activeBindsetFromPayload,
  legacyFilter,
  legacyViewMode,
  selectedKeyFromPayload,
} from "../../../src/js/core/eventPayloads.js";

describe("selectedKeyFromPayload", () => {
  it("uses the canonical key field", () => {
    expect(
      selectedKeyFromPayload({
        key: "Spacebar",
        environment: "space",
        source: "SelectionService",
      }),
    ).toBe("Spacebar");
  });

  it("retains the legacy name-field compatibility fallback", () => {
    expect(selectedKeyFromPayload({ name: "F1" })).toBe("F1");
  });

  it("preserves an explicit cleared selection", () => {
    expect(
      selectedKeyFromPayload({ key: null, source: "SelectionService" }),
    ).toBeNull();
  });

  it("rejects malformed compatibility payloads", () => {
    expect(selectedKeyFromPayload(undefined)).toBeNull();
    expect(selectedKeyFromPayload({ key: 42 })).toBeNull();
    expect(selectedKeyFromPayload({ name: false })).toBeNull();
  });
});

describe("activeBindsetFromPayload", () => {
  it("uses the canonical bindset field", () => {
    expect(activeBindsetFromPayload({ bindset: "Primary Bindset" })).toBe(
      "Primary Bindset",
    );
  });

  it("retains the legacy name-field compatibility fallback", () => {
    expect(activeBindsetFromPayload({ name: "Legacy Bindset" })).toBe(
      "Legacy Bindset",
    );
  });

  it("rejects malformed compatibility payloads", () => {
    expect(activeBindsetFromPayload(null)).toBeUndefined();
    expect(activeBindsetFromPayload({ bindset: 42 })).toBeUndefined();
    expect(activeBindsetFromPayload({ name: false })).toBeUndefined();
  });
});

describe("legacy UI payload readers", () => {
  it("validates view-mode compatibility payloads", () => {
    expect(legacyViewMode({ viewMode: "categorized" })).toBe("categorized");
    expect(legacyViewMode({ viewMode: 42 })).toBeUndefined();
    expect(legacyViewMode(null)).toBeUndefined();
  });

  it("validates filter compatibility payloads", () => {
    expect(legacyFilter("phaser")).toBe("phaser");
    expect(legacyFilter({ value: "torpedo" })).toBe("torpedo");
    expect(legacyFilter({ value: 42 })).toBe("");
    expect(legacyFilter(null)).toBe("");
  });
});
