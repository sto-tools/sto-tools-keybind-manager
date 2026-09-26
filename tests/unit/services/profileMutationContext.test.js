import { describe, expect, it } from "vitest";
import {
  assertProfileMutationContext,
  canPublishProfileMutation,
  captureProfileMutationContext,
} from "../../../src/js/components/services/profileMutationContext.js";

function fixture() {
  const state = {
    ready: true,
    authorityEpoch: 3,
    revision: 8,
    currentProfile: "captain",
    currentEnvironment: "space",
  };
  const service = { destroyed: false, cache: { dataState: state } };
  return { state, service, context: captureProfileMutationContext(service, 2) };
}

describe("profile mutation accepted planning context", () => {
  it("captures only accepted coordinates and permits explicit new import targets", () => {
    const { service, context } = fixture();
    expect(context).toEqual({
      generation: 2,
      profileId: "captain",
      currentProfile: "captain",
      environment: "space",
      precondition: { authorityEpoch: 3, revision: 8 },
    });
    expect(
      captureProfileMutationContext(service, 2, "new-import").profileId,
    ).toBe("new-import");
    expect(
      captureProfileMutationContext(service, 2, null).profileId,
    ).toBeNull();
    service.cache.dataState.revision += 1;
    expect(context.precondition.revision).toBe(8);
  });

  it.each(["destroyed", "unready", "absent"])(
    "rejects %s owner context before planning",
    (kind) => {
      const { service } = fixture();
      if (kind === "destroyed") service.destroyed = true;
      if (kind === "unready") service.cache.dataState.ready = false;
      if (kind === "absent") service.cache.dataState = null;
      expect(() => captureProfileMutationContext(service, 2)).toThrow(
        "operation_cancelled",
      );
    },
  );

  it.each([
    "destroyed",
    "unready",
    "absent",
    "epoch",
    "revision",
    "generation",
  ])("rejects %s drift immediately before handoff", (kind) => {
    const { service, state, context } = fixture();
    if (kind === "destroyed") service.destroyed = true;
    if (kind === "unready") state.ready = false;
    if (kind === "absent") service.cache.dataState = null;
    if (kind === "epoch") state.authorityEpoch += 1;
    if (kind === "revision") state.revision += 1;
    expect(() =>
      assertProfileMutationContext(
        service,
        context,
        kind === "generation" ? 3 : 2,
      ),
    ).toThrow("operation_cancelled");
  });

  it("allows unchanged handoff and the expected revision advance after acknowledgement", () => {
    const { service, state, context } = fixture();
    expect(() =>
      assertProfileMutationContext(service, context, 2),
    ).not.toThrow();
    state.revision += 1;
    expect(canPublishProfileMutation(service, context, 2)).toBe(true);
  });

  it.each([
    "destroyed",
    "unready",
    "absent",
    "epoch",
    "profile",
    "environment",
    "generation",
  ])(
    "suppresses %s presentation drift without changing the accepted receipt",
    (kind) => {
      const { service, state, context } = fixture();
      if (kind === "destroyed") service.destroyed = true;
      if (kind === "unready") state.ready = false;
      if (kind === "absent") service.cache.dataState = null;
      if (kind === "epoch") state.authorityEpoch += 1;
      if (kind === "profile") state.currentProfile = "other";
      if (kind === "environment") state.currentEnvironment = "ground";
      expect(
        canPublishProfileMutation(
          service,
          context,
          kind === "generation" ? 3 : 2,
        ),
      ).toBe(false);
    },
  );
});
