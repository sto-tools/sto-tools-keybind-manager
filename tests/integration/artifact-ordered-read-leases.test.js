import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import {
  acquireDataCoordinatorReadLease,
  activateDataCoordinatorOwner,
} from "../../src/js/components/services/dataCoordinatorMutationQueue.js";
import { acquirePreferencesReadLease } from "../../src/js/components/services/preferencesReadLease.js";
import { createArtifactCapturePort } from "../../src/js/components/services/projectArtifactCapture.js";
import { createDefaultPreferencesSettings } from "../../src/js/components/services/preferencesDefaults.js";
import { createServiceFixture } from "../fixtures/index.js";

describe("artifact ordered owner read leases", () => {
  let fixture;
  let preferencesOwner;
  let dataOwner;

  beforeEach(async () => {
    fixture = createServiceFixture();
    const i18n = {
      language: "en",
      t: (key) => key,
      changeLanguage: vi.fn(async (language) => {
        i18n.language = language;
      }),
    };
    preferencesOwner = new PreferencesService({
      settingsRepository: fixture.settingsRepository,
      defaults: createDefaultPreferencesSettings(),
      eventBus: fixture.eventBus,
      i18n,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    dataOwner = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: fixture.eventBus,
      projectRepository: fixture.projectRepository,
      i18n,
    });
    preferencesOwner.init();
    await preferencesOwner.initialStateReady;
    dataOwner.init();
    await dataOwner.initialStateReady;
  });

  afterEach(() => {
    dataOwner?.destroy();
    preferencesOwner?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("holds later owner writes until each lease is released idempotently", async () => {
    const preferencesLease =
      await acquirePreferencesReadLease(preferencesOwner);
    const dataLease = await acquireDataCoordinatorReadLease(dataOwner);
    let preferencesSettled = false;
    let dataSettled = false;

    const preferencesWrite = preferencesOwner
      .setSetting("theme", "light")
      .then((value) => {
        preferencesSettled = true;
        return value;
      });
    const dataWrite = dataOwner
      .updateProfile("default_space", {
        properties: { description: "captured after release" },
      })
      .then((value) => {
        dataSettled = true;
        return value;
      });

    await Promise.resolve();
    await Promise.resolve();
    expect({ preferencesSettled, dataSettled }).toEqual({
      preferencesSettled: false,
      dataSettled: false,
    });

    dataLease.release();
    dataLease.release();
    await expect(dataWrite).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
    expect(preferencesSettled).toBe(false);

    preferencesLease.release();
    preferencesLease.release();
    await expect(preferencesWrite).resolves.toBe(true);
  });

  it("captures one detached tuple while preserving independent revisions", async () => {
    await preferencesOwner.setSetting("theme", "light");
    await preferencesOwner.setSetting("theme", "dark");
    await dataOwner.updateProfile("default_space", {
      properties: { description: "owner snapshot" },
    });

    const capture = await createArtifactCapturePort({
      preferencesOwner,
      dataOwner,
    }).capture();
    const preferencesState = preferencesOwner.getCurrentState();
    const dataState = dataOwner.getCurrentState();

    expect(capture.source).toEqual({
      preferencesAuthorityEpoch: preferencesState.authorityEpoch,
      preferencesRevision: preferencesState.revision,
      dataAuthorityEpoch: dataState.authorityEpoch,
      dataRevision: dataState.revision,
    });
    expect(capture.source.preferencesRevision).not.toBe(
      capture.source.dataRevision,
    );
    expect(capture.project.profiles.default_space.description).toBe(
      "owner snapshot",
    );
    expect(capture.settings.theme).toBe("dark");

    capture.project.profiles.default_space.description = "mutated copy";
    capture.settings.theme = "mutated copy";
    expect(dataOwner.getCurrentState().profiles.default_space.description).toBe(
      "owner snapshot",
    );
    expect(preferencesOwner.getCurrentState().settings.theme).toBe("dark");
  });

  it.each([
    ["Preferences authority", "preferences-authority"],
    ["Preferences revision", "preferences-revision"],
    ["DataCoordinator authority", "data-authority"],
    ["DataCoordinator revision", "data-revision"],
    ["DataCoordinator identity", "data-identity"],
  ])("rejects a stale %s against real owners", async (_label, staleField) => {
    const getDataState = dataOwner.getCurrentState.bind(dataOwner);
    vi.spyOn(dataOwner, "getCurrentState").mockImplementationOnce(() => {
      const snapshot = getDataState();
      if (staleField === "preferences-authority") {
        preferencesOwner._stateAuthorityEpoch += 1;
      } else if (staleField === "preferences-revision") {
        preferencesOwner._stateRevision += 1;
      } else if (staleField === "data-authority") {
        dataOwner._stateAuthorityEpoch += 1;
      } else if (staleField === "data-revision") {
        dataOwner._stateRevision += 1;
      } else {
        activateDataCoordinatorOwner(
          new DataCoordinator({
            visitedState: new LocalStorageVisitedStatePersistence({
              storage: localStorage,
            }),
            eventBus: fixture.eventBus,
            projectRepository: fixture.projectRepository,
            i18n: { t: (key) => key },
          }),
        );
      }
      return snapshot;
    });

    await expect(
      createArtifactCapturePort({ preferencesOwner, dataOwner }).capture(),
    ).rejects.toThrowError("operation_cancelled");
  });
});
