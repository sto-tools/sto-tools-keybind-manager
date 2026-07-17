import { describe, expect, it } from "vitest";
import {
  activeBindsetFromPayload,
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
