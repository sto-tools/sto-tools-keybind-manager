import { describe, expect, it, vi } from "vitest";

import { createSelectionPersistenceController } from "../../../src/js/components/services/selectionPersistence.js";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("selection persistence controller", () => {
  it("serializes writes in invocation order", async () => {
    const firstWrite = createDeferred();
    const secondWrite = createDeferred();
    const write = vi
      .fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(() => secondWrite.promise);
    const controller = createSelectionPersistenceController({ write });

    const firstResult = controller.persist("profile-a", "space", "F1");
    const secondResult = controller.persist("profile-a", "space", "F2");
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));

    expect(write).toHaveBeenNthCalledWith(1, "profile-a", { space: "F1" });
    firstWrite.resolve();
    await expect(firstResult).resolves.toBe(true);
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write).toHaveBeenNthCalledWith(2, "profile-a", { space: "F2" });

    secondWrite.resolve();
    await expect(secondResult).resolves.toBe(true);
  });

  it("rebases a queued cross-environment write after its predecessor succeeds", async () => {
    const firstWrite = createDeferred();
    const write = vi
      .fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValueOnce(undefined);
    const controller = createSelectionPersistenceController({ write });
    controller.reset("profile-a", { space: "S0", ground: "G0" });

    const spaceResult = controller.persist("profile-a", "space", "S1");
    const groundResult = controller.persist("profile-a", "ground", "G1");
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));

    expect(write).toHaveBeenNthCalledWith(1, "profile-a", {
      space: "S1",
      ground: "G0",
    });
    firstWrite.resolve();
    await expect(spaceResult).resolves.toBe(true);
    await expect(groundResult).resolves.toBe(true);
    expect(write).toHaveBeenNthCalledWith(2, "profile-a", {
      space: "S1",
      ground: "G1",
    });
  });

  it("rebases a queued write without a predecessor that rejected", async () => {
    const failure = new Error("write failed");
    const onError = vi.fn();
    const write = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);
    const controller = createSelectionPersistenceController({
      write,
      onError,
    });
    controller.reset("profile-a", { space: "S0", ground: "G0" });

    const failedResult = controller.persist("profile-a", "space", "S1");
    const recoveredResult = controller.persist("profile-a", "ground", "G1");

    await expect(failedResult).resolves.toBe(false);
    await expect(recoveredResult).resolves.toBe(true);
    expect(write).toHaveBeenNthCalledWith(2, "profile-a", {
      space: "S0",
      ground: "G1",
    });
    expect(onError).toHaveBeenCalledWith(failure, "profile-a", {
      space: "S1",
      ground: "G0",
    });
  });

  it("does not let a blocked profile delay another profile", async () => {
    const profileAWrite = createDeferred();
    const write = vi.fn((profileId) =>
      profileId === "profile-a" ? profileAWrite.promise : Promise.resolve(),
    );
    const controller = createSelectionPersistenceController({ write });

    const profileAResult = controller.persist("profile-a", "space", "S1");
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const profileBResult = controller.persist("profile-b", "ground", "G1");

    await expect(profileBResult).resolves.toBe(true);
    expect(write).toHaveBeenNthCalledWith(2, "profile-b", { ground: "G1" });

    profileAWrite.resolve();
    await expect(profileAResult).resolves.toBe(true);
  });

  it("replaces staged state when a fresh profile seed is supplied", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const onCommit = vi.fn();
    const controller = createSelectionPersistenceController({
      write,
      onCommit,
    });
    const firstSeed = { space: "S0", ground: "G0", alias: null, invalid: 42 };

    controller.reset("profile-a", firstSeed);
    await controller.persist("profile-a", "alias", "Alpha");
    controller.reset("profile-a", { ground: "G2" });
    await controller.persist("profile-a", "space", "S2");

    expect(firstSeed).toEqual({
      space: "S0",
      ground: "G0",
      alias: null,
      invalid: 42,
    });
    expect(write).toHaveBeenNthCalledWith(1, "profile-a", {
      space: "S0",
      ground: "G0",
      alias: "Alpha",
    });
    expect(write).toHaveBeenNthCalledWith(2, "profile-a", {
      ground: "G2",
      space: "S2",
    });
    expect(onCommit).toHaveBeenLastCalledWith("profile-a", {
      ground: "G2",
      space: "S2",
    });
  });

  it("reasserts a fresh seed after an older in-flight write", async () => {
    const staleWrite = createDeferred();
    const write = vi
      .fn()
      .mockImplementationOnce(() => staleWrite.promise)
      .mockResolvedValue(undefined);
    const onCommit = vi.fn();
    const controller = createSelectionPersistenceController({
      write,
      onCommit,
    });
    controller.reset("profile-a", { space: "S0", ground: "G0" });

    const staleResult = controller.persist("profile-a", "space", "S1");
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    controller.reset("profile-a", { space: "Imported", ground: "G2" });

    staleWrite.resolve();
    await expect(staleResult).resolves.toBe(false);
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));

    expect(write).toHaveBeenNthCalledWith(2, "profile-a", {
      space: "Imported",
      ground: "G2",
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(controller.snapshot("profile-a")).toEqual({
      space: "Imported",
      ground: "G2",
    });
  });

  it("rebases post-reset writes without accepting an older completion", async () => {
    const staleWrite = createDeferred();
    const write = vi
      .fn()
      .mockImplementationOnce(() => staleWrite.promise)
      .mockResolvedValue(undefined);
    const onCommit = vi.fn();
    const controller = createSelectionPersistenceController({
      write,
      onCommit,
    });
    controller.reset("profile-a", { space: "S0", ground: "G0" });

    const staleResult = controller.persist("profile-a", "space", "S1");
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    controller.reset("profile-a", { space: "Imported", ground: "G2" });
    const aliasResult = controller.persist("profile-a", "alias", "Alpha");

    staleWrite.resolve();
    await expect(staleResult).resolves.toBe(false);
    await expect(aliasResult).resolves.toBe(true);

    expect(write).toHaveBeenNthCalledWith(2, "profile-a", {
      space: "Imported",
      ground: "G2",
    });
    expect(write).toHaveBeenNthCalledWith(3, "profile-a", {
      space: "Imported",
      ground: "G2",
      alias: "Alpha",
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("profile-a", {
      space: "Imported",
      ground: "G2",
      alias: "Alpha",
    });
  });

  it("skips queued pre-reset intent and rebases post-reset intent", async () => {
    const staleWrite = createDeferred();
    const write = vi
      .fn()
      .mockImplementationOnce(() => staleWrite.promise)
      .mockResolvedValue(undefined);
    const onCommit = vi.fn();
    const controller = createSelectionPersistenceController({
      write,
      onCommit,
    });
    controller.reset("profile-a", { space: "S0", ground: "G0" });

    const inFlightResult = controller.persist("profile-a", "space", "S1");
    const queuedResult = controller.persist("profile-a", "ground", "G1");
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));

    controller.reset("profile-a", { space: "Imported", ground: "G2" });
    const postResetResult = controller.persist("profile-a", "alias", "Alpha");

    staleWrite.resolve();
    await expect(inFlightResult).resolves.toBe(false);
    await expect(queuedResult).resolves.toBe(false);
    await expect(postResetResult).resolves.toBe(true);

    expect(write).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenNthCalledWith(1, "profile-a", {
      space: "S1",
      ground: "G0",
    });
    expect(write).toHaveBeenNthCalledWith(2, "profile-a", {
      space: "Imported",
      ground: "G2",
    });
    expect(write).toHaveBeenNthCalledWith(3, "profile-a", {
      space: "Imported",
      ground: "G2",
      alias: "Alpha",
    });
    expect(write).not.toHaveBeenCalledWith("profile-a", {
      space: "Imported",
      ground: "G1",
    });
    expect(controller.snapshot("profile-a")).toEqual({
      space: "Imported",
      ground: "G2",
      alias: "Alpha",
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("repairs a reset seed after disposal without running queued intent callbacks", async () => {
    const staleWrite = createDeferred();
    let durableSelections = { space: "S0" };
    const write = vi.fn(async (_profileId, selections) => {
      if (write.mock.calls.length === 1) await staleWrite.promise;
      durableSelections = { ...selections };
    });
    const onCommit = vi.fn();
    const controller = createSelectionPersistenceController({
      write,
      onCommit,
    });
    controller.reset("profile-a", durableSelections);

    const staleResult = controller.persist("profile-a", "space", "S1");
    const queuedResult = controller.persist("profile-a", "space", "S2");
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));

    controller.reset("profile-a", { space: "Imported" });
    controller.dispose();
    staleWrite.resolve();

    await expect(staleResult).resolves.toBe(false);
    await expect(queuedResult).resolves.toBe(false);
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));

    expect(write).toHaveBeenNthCalledWith(1, "profile-a", { space: "S1" });
    expect(write).toHaveBeenNthCalledWith(2, "profile-a", {
      space: "Imported",
    });
    expect(durableSelections).toEqual({ space: "Imported" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("treats null as a successful no-op without changing staged state", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const controller = createSelectionPersistenceController({ write });
    controller.reset("profile-a", { space: "S0", alias: null });

    await expect(controller.persist("profile-a", "space", null)).resolves.toBe(
      true,
    );
    expect(write).not.toHaveBeenCalled();

    await controller.persist("profile-a", "ground", "G1");
    expect(write).toHaveBeenCalledWith("profile-a", {
      space: "S0",
      ground: "G1",
      alias: null,
    });
  });
});
