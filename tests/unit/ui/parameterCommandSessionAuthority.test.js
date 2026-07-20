import { describe, expect, it, vi } from "vitest";

import {
  isParameterActionCurrent,
  isParameterEditSessionCurrent,
  isParameterPreviewCurrent,
  isParameterSessionCurrent,
} from "../../../src/js/components/ui/parameterCommandSessionAuthority.js";

function editTarget() {
  return {
    authorityEpoch: 1,
    revision: 2,
    profileId: "captain",
    environment: "space",
    name: "F1",
    bindset: null,
    index: 0,
    originalEntry: "Target old",
  };
}

function session(descriptor = { mode: "add" }) {
  return {
    generation: 3,
    contextGeneration: 4,
    formRevision: 5,
    previewRevision: 6,
    settled: false,
    descriptor,
  };
}

function owner(currentSession) {
  return { destroyed: false, generation: 3, currentSession };
}

describe("parameterCommandSessionAuthority predicates", () => {
  it("requires the exact live generation and unsettled session identity", () => {
    const current = session();
    expect(isParameterSessionCurrent(current, owner(current))).toBe(true);
    expect(
      isParameterSessionCurrent(current, {
        ...owner(current),
        destroyed: true,
      }),
    ).toBe(false);
    expect(
      isParameterSessionCurrent(current, { ...owner(current), generation: 4 }),
    ).toBe(false);
    expect(isParameterSessionCurrent(current, owner(session()))).toBe(false);
    expect(
      isParameterSessionCurrent({ ...current, settled: true }, owner(current)),
    ).toBe(false);
  });

  it("requires both edit mode and the captured target guard", () => {
    const target = editTarget();
    const current = session({ mode: "edit", target });
    const guard = vi.fn(() => true);

    expect(isParameterEditSessionCurrent(current, owner(current), guard)).toBe(
      true,
    );
    expect(guard).toHaveBeenCalledWith(target, 4);
    expect(
      isParameterEditSessionCurrent(
        session(),
        owner(current),
        vi.fn(() => true),
      ),
    ).toBe(false);
    expect(
      isParameterEditSessionCurrent(current, owner(current), () => false),
    ).toBe(false);
  });

  it("matches preview and form revisions only for the live session", () => {
    const current = session();
    const currentOwner = owner(current);
    expect(isParameterPreviewCurrent(current, currentOwner, 6, 5)).toBe(true);
    expect(isParameterPreviewCurrent(current, currentOwner, 7, 5)).toBe(false);
    expect(isParameterPreviewCurrent(current, currentOwner, 6, 4)).toBe(false);
  });

  it.each([
    ["add", { mode: "add" }, "isAddTargetCurrent"],
    ["edit", { mode: "edit", target: editTarget() }, "isEditTargetCurrent"],
  ])(
    "routes %s action authority through its exact guard",
    (_mode, descriptor, guardName) => {
      const current = session(descriptor);
      const guards = {
        isAddTargetCurrent: vi.fn(() => true),
        isEditTargetCurrent: vi.fn(() => true),
      };
      const target = descriptor.mode === "edit" ? descriptor.target : {};

      expect(
        isParameterActionCurrent(current, owner(current), target, 4, guards),
      ).toBe(true);
      expect(guards[guardName]).toHaveBeenCalledWith(target, 4);
    },
  );
});
