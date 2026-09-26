import { describe, expect, it, vi } from "vitest";

import {
  acquireDataCoordinatorReadLease,
  activateDataCoordinatorOwner,
  enqueueDataCoordinatorMutation,
} from "../../../src/js/components/services/dataCoordinatorMutationQueue.js";
import {
  createArtifactCapturePort,
  createCurrentProjectArtifactSerializer,
} from "../../../src/js/components/services/projectArtifactCapture.js";
import { acquirePreferencesReadLease } from "../../../src/js/components/services/preferencesReadLease.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";
import {
  createPreferencesStateSnapshot,
  isCurrentPreferencesStateAuthority,
  nextPreferencesStateAuthorityEpoch,
} from "../../../src/js/components/services/preferencesState.js";
import { createDataStateSnapshot } from "../../../src/js/components/services/dataState.js";

function deferred() {
  let resolve = () => {};
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createPreferencesOwner({
  revision = 1,
  ready = true,
  settings = createDefaultPreferencesSettings(),
  onGet = () => {},
} = {}) {
  const authorityEpoch = nextPreferencesStateAuthorityEpoch();
  const snapshot = createPreferencesStateSnapshot(settings, {
    authorityEpoch,
    ready,
    revision: ready ? revision : 0,
  });
  const owner = {
    _lifecycleGeneration: 1,
    _stateAuthorityEpoch: authorityEpoch,
    _stateRevision: ready ? revision : 0,
    _mutationTail: Promise.resolve(),
    destroyed: false,
    getCurrentState: vi.fn(() => {
      onGet(owner);
      return snapshot;
    }),
    _assertCurrentLifecycle(generation) {
      if (
        generation !== owner._lifecycleGeneration ||
        owner.destroyed ||
        !isCurrentPreferencesStateAuthority(owner._stateAuthorityEpoch)
      ) {
        throw new Error("operation_cancelled");
      }
    },
    _enqueueMutation(operation) {
      const result = owner._mutationTail.then(operation);
      owner._mutationTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  return owner;
}

let nextDataAuthorityEpoch = 1000;

function createDataOwner({
  revision = 1,
  ready = true,
  profiles = {},
  currentProfile = null,
  eventBus = {},
  onGet = () => {},
} = {}) {
  const owner = {
    eventBus,
    _lifecycleGeneration: 1,
    _stateAuthorityEpoch: nextDataAuthorityEpoch++,
    _stateRevision: ready ? revision : 0,
    destroyed: false,
  };
  const snapshot = createDataStateSnapshot(
    {
      profiles,
      currentProfile,
      currentEnvironment: "space",
      metadata: { lastModified: null, version: "1.0.0" },
    },
    {
      authorityEpoch: owner._stateAuthorityEpoch,
      ready,
      revision: ready ? revision : 0,
    },
  );
  Object.assign(owner, {
    getCurrentState: vi.fn(() => {
      onGet(owner);
      return snapshot;
    }),
    _captureOperationGeneration: () => owner._lifecycleGeneration,
    _isCurrentOperation: (generation) =>
      !owner.destroyed && generation === owner._lifecycleGeneration,
    _assertCurrentOperation(generation) {
      if (!owner._isCurrentOperation(generation)) {
        throw new Error("operation_cancelled");
      }
    },
  });
  activateDataCoordinatorOwner(owner);
  return owner;
}

describe("project artifact owner read leases", () => {
  it("waits earlier mutations and acquires Preferences before DataCoordinator", async () => {
    const earlier = deferred();
    const order = [];
    const preferencesOwner = createPreferencesOwner({
      onGet: () => order.push("preferences"),
    });
    preferencesOwner._mutationTail = earlier.promise;
    const dataOwner = createDataOwner({
      onGet: () => order.push("data"),
    });
    const capturePromise = createArtifactCapturePort({
      preferencesOwner,
      dataOwner,
    }).capture();

    await Promise.resolve();
    expect(order).toEqual([]);
    earlier.resolve();
    await capturePromise;
    expect(order[0]).toBe("preferences");
    expect(order.indexOf("data")).toBeGreaterThan(order.indexOf("preferences"));
  });

  it("holds future writes, releases in reverse order, and tolerates repeat release", async () => {
    const releases = [];
    let preferencesWrite;
    const preferencesOwner = createPreferencesOwner({
      onGet: (owner) => {
        if (!preferencesWrite) {
          preferencesWrite = owner._enqueueMutation(() =>
            releases.push("preferences"),
          );
        }
      },
    });
    let dataWrite;
    const dataOwner = createDataOwner({
      onGet: (owner) => {
        if (!dataWrite) {
          dataWrite = enqueueDataCoordinatorMutation(owner, () =>
            releases.push("data"),
          );
        }
      },
    });

    await createArtifactCapturePort({ preferencesOwner, dataOwner }).capture();
    await Promise.all([preferencesWrite, dataWrite]);
    expect(releases).toEqual(["data", "preferences"]);

    const preferencesLease =
      await acquirePreferencesReadLease(preferencesOwner);
    const preferencesAfter = preferencesOwner._enqueueMutation(() => "open");
    preferencesLease.release();
    preferencesLease.release();
    await expect(preferencesAfter).resolves.toBe("open");

    const dataLease = await acquireDataCoordinatorReadLease(dataOwner);
    const dataAfter = enqueueDataCoordinatorMutation(dataOwner, () => "open");
    dataLease.release();
    dataLease.release();
    await expect(dataAfter).resolves.toBe("open");
  });

  it("rejects pre-ready owners and releases an already-held Preferences lease", async () => {
    let followingWrite;
    const preferencesOwner = createPreferencesOwner({
      onGet: (owner) => {
        followingWrite ??= owner._enqueueMutation(() => "released");
      },
    });
    const dataOwner = createDataOwner({ ready: false });

    await expect(
      createArtifactCapturePort({ preferencesOwner, dataOwner }).capture(),
    ).rejects.toThrowError("data_owner_not_ready");
    await expect(followingWrite).resolves.toBe("released");

    const unreadyPreferences = createPreferencesOwner({ ready: false });
    await expect(
      createArtifactCapturePort({
        preferencesOwner: unreadyPreferences,
        dataOwner: createDataOwner(),
      }).capture(),
    ).rejects.toThrowError("preferences_not_ready");
  });

  it("accepts independent unequal owner revisions and records the exact tuple", async () => {
    const preferencesOwner = createPreferencesOwner({ revision: 7 });
    const dataOwner = createDataOwner({ revision: 41 });

    const capture = await createArtifactCapturePort({
      preferencesOwner,
      dataOwner,
    }).capture();

    expect(capture.source).toEqual({
      preferencesAuthorityEpoch: preferencesOwner._stateAuthorityEpoch,
      preferencesRevision: 7,
      dataAuthorityEpoch: dataOwner._stateAuthorityEpoch,
      dataRevision: 41,
    });
    expect(capture.project).toEqual({ profiles: {}, currentProfile: null });
  });

  it.each([
    ["Preferences authority", "preferences-authority"],
    ["Preferences revision", "preferences-revision"],
    ["DataCoordinator authority", "data-authority"],
    ["DataCoordinator revision", "data-revision"],
    ["DataCoordinator identity", "data-identity"],
  ])("rejects a stale %s tuple", async (_label, staleField) => {
    let dataGets = 0;
    const eventBus = {};
    const preferencesOwner = createPreferencesOwner({
      onGet: () => {
        if (staleField === "data-identity" && dataGets === 1) {
          createDataOwner({ eventBus });
        }
      },
    });
    const dataOwner = createDataOwner({
      eventBus,
      onGet: (owner) => {
        dataGets += 1;
        if (dataGets !== 1) return;
        if (staleField === "preferences-authority") {
          nextPreferencesStateAuthorityEpoch();
        } else if (staleField === "preferences-revision") {
          preferencesOwner._stateRevision += 1;
        } else if (staleField === "data-authority") {
          owner._stateAuthorityEpoch += 1;
        } else if (staleField === "data-revision") {
          owner._stateRevision += 1;
        }
      },
    });

    await expect(
      createArtifactCapturePort({ preferencesOwner, dataOwner }).capture(),
    ).rejects.toThrowError("operation_cancelled");
  });

  it("releases both leases when validation fails after acquisition", async () => {
    let preferencesGets = 0;
    let preferencesWrite;
    const preferencesOwner = createPreferencesOwner({
      onGet: (owner) => {
        preferencesGets += 1;
        if (preferencesGets === 1) {
          preferencesWrite = owner._enqueueMutation(() => "preferences-open");
        } else {
          owner._stateRevision += 1;
        }
      },
    });
    let dataWrite;
    const dataOwner = createDataOwner({
      onGet: (owner) => {
        dataWrite ??= enqueueDataCoordinatorMutation(owner, () => "data-open");
      },
    });

    await expect(
      createArtifactCapturePort({ preferencesOwner, dataOwner }).capture(),
    ).rejects.toThrowError("operation_cancelled");
    await expect(dataWrite).resolves.toBe("data-open");
    await expect(preferencesWrite).resolves.toBe("preferences-open");
  });

  it("returns detached project, settings, source, and fixed serialized text", async () => {
    const settings = {
      ...createDefaultPreferencesSettings(),
      extension: { retained: true },
    };
    const preferencesOwner = createPreferencesOwner({ settings });
    const dataOwner = createDataOwner({
      profiles: { alpha: { name: "Alpha", extension: { retained: true } } },
      currentProfile: "alpha",
    });
    const serializer = createCurrentProjectArtifactSerializer({
      capturePort: createArtifactCapturePort({ preferencesOwner, dataOwner }),
      version: "9.8.7",
      now: () => "2026-09-26T01:02:03.000Z",
    });

    const result = await serializer.serialize();
    expect(result.exported).toBe("2026-09-26T01:02:03.000Z");
    expect(result.capture.project.currentProfile).toBe("alpha");
    expect(result.capture.settings.extension).toEqual({ retained: true });
    expect(JSON.parse(result.artifact)).toEqual({
      version: "9.8.7",
      exported: result.exported,
      type: "project",
      data: {
        profiles: result.capture.project.profiles,
        settings: result.capture.settings,
        currentProfile: "alpha",
      },
    });

    result.capture.project.profiles.alpha.name = "changed";
    result.capture.settings.extension.retained = false;
    expect(JSON.parse(result.artifact).data.profiles.alpha.name).toBe("Alpha");
    expect(JSON.parse(result.artifact).data.settings.extension.retained).toBe(
      true,
    );
    expect(dataOwner.getCurrentState().profiles.alpha.name).toBe("Alpha");
    expect(preferencesOwner.getCurrentState().settings.extension.retained).toBe(
      true,
    );
  });

  it("does not invoke serialization metadata until capture has released", async () => {
    const order = [];
    const serializer = createCurrentProjectArtifactSerializer({
      capturePort: {
        async capture() {
          order.push("release-data", "release-preferences");
          return {
            project: { profiles: {}, currentProfile: null },
            settings: createDefaultPreferencesSettings(),
            source: {
              preferencesAuthorityEpoch: 1,
              preferencesRevision: 2,
              dataAuthorityEpoch: 3,
              dataRevision: 4,
            },
          };
        },
      },
      now: () => {
        order.push("serialize");
        return "2026-09-26T01:02:03.000Z";
      },
    });

    await serializer.serialize();
    expect(order).toEqual(["release-data", "release-preferences", "serialize"]);
  });
});
