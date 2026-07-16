import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSelectionTransitionController } from "../../../src/js/components/services/selectionTransition.js";

describe("selection transition controller", () => {
  let profileId;
  let destroyed;
  let errors;
  let controller;

  beforeEach(() => {
    vi.useFakeTimers();
    profileId = "profile-a";
    destroyed = false;
    errors = [];
    controller = createSelectionTransitionController({
      getProfileId: () => profileId,
      isDestroyed: () => destroyed,
      onError: (error, kind) => errors.push({ error, kind }),
    });
  });

  afterEach(() => {
    controller.invalidate();
    vi.useRealTimers();
  });

  it("invalidates guards on a newer transition, profile drift, or destroy", () => {
    const first = controller.begin();
    expect(first()).toBe(true);

    const second = controller.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);

    profileId = "profile-b";
    expect(second()).toBe(false);

    const third = controller.begin();
    destroyed = true;
    expect(third()).toBe(false);
  });

  it("runs only the latest deferred restore", async () => {
    const restores = [];
    controller.defer(async () => restores.push("profile-a"));
    controller.defer(async () => restores.push("profile-b"));

    await vi.runAllTimersAsync();

    expect(restores).toEqual(["profile-b"]);
  });

  it("cancels scheduled tasks and reports current task failures", async () => {
    const cancelledTask = vi.fn();
    const cancelledGuard = controller.begin();
    controller.schedule(cancelledTask, 10, cancelledGuard);
    controller.invalidate();

    await vi.advanceTimersByTimeAsync(10);
    expect(cancelledTask).not.toHaveBeenCalled();

    const failure = new Error("task failed");
    const currentGuard = controller.begin();
    controller.schedule(
      async () => {
        throw failure;
      },
      10,
      currentGuard,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(errors).toEqual([{ error: failure, kind: "task" }]);
  });
});
