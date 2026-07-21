import { describe, expect, it } from "vitest";

import {
  createDataStateChangedPayload,
  profileStateChange,
} from "../../../src/js/components/services/dataStateChange.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";

describe("data-state change protocol", () => {
  it("materializes ordinary and replacement payloads as the closed event union", () => {
    const state = createDataCoordinatorState();

    expect(createDataStateChangedPayload("profile-updated", state)).toEqual({
      reason: "profile-updated",
      state,
    });
    expect(
      createDataStateChangedPayload("profile-replaced", state, {
        profileId: "captain",
      }),
    ).toEqual({
      reason: "profile-replaced",
      profileId: "captain",
      state,
    });
  });

  it("rejects replacement provenance without the changed profile identity", () => {
    const state = createDataCoordinatorState();

    expect(() =>
      createDataStateChangedPayload("profile-replaced", state),
    ).toThrow("profile-replaced state requires a profileId");
  });

  it("selects replacement provenance only for complete profile replacement", () => {
    expect(
      profileStateChange({ properties: { name: "Captain" } }, "captain"),
    ).toEqual(["profile-updated", {}]);
    expect(
      profileStateChange({ replacement: { name: "Captain" } }, "captain"),
    ).toEqual(["profile-replaced", { profileId: "captain" }]);
  });
});
