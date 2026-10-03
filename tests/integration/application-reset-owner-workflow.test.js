import {
  createResetOwnerWorkflowFixture,
  destroyResetOwnerWorkflowFixture,
  rawPersistence,
} from "../fixtures/services/applicationResetOwnerWorkflow.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

const ROOT_KEY = "sto_keybind_manager";
const BACKUP_KEY = "sto_keybind_manager_backup";
const SETTINGS_KEY = "sto_keybind_settings";
const RESET_KEY = "sto_app_reset";
const RECEIPT_STAGES = [
  "validation",
  "rootClear",
  "backupClear",
  "resetSentinel",
  "settingsClear",
  "settingsDefaults",
  "dataOwnerAdoption",
  "preferencesOwnerAdoption",
];

const complete = ["complete", true];
const pending = ["pending", false];
const skipped = ["skipped", false];
const failedIndeterminate = ["failed", "indeterminate"];
const failed = ["failed", false];

function compactReceipt(receipt) {
  return Object.fromEntries(
    RECEIPT_STAGES.map((stage) => [
      stage,
      [receipt[stage].status, receipt[stage].committed],
    ]),
  );
}

const cases = [
  {
    stage: "rootClear",
    fault: {
      method: "removeItem",
      key: ROOT_KEY,
      phase: "before",
      throw: true,
    },
    raw: "unchanged",
    receipt: {
      validation: complete,
      rootClear: failedIndeterminate,
      backupClear: pending,
      resetSentinel: pending,
      settingsClear: pending,
      settingsDefaults: pending,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: pending,
    },
    dataPublished: false,
    restartedProject: "captain",
    restartedTheme: "dark",
  },
  {
    stage: "backupClear",
    fault: {
      method: "removeItem",
      key: BACKUP_KEY,
      phase: "before",
      throw: true,
    },
    raw: "root-cleared",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: failedIndeterminate,
      resetSentinel: pending,
      settingsClear: pending,
      settingsDefaults: pending,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: pending,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "dark",
  },
  {
    stage: "resetSentinel",
    fault: { method: "setItem", key: RESET_KEY, phase: "before", throw: true },
    raw: "project-cleared",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: complete,
      resetSentinel: failedIndeterminate,
      settingsClear: pending,
      settingsDefaults: pending,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: pending,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "dark",
  },
  {
    stage: "dataOwnerAdoption",
    ownerFailure: "data",
    raw: "project-reset",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: complete,
      resetSentinel: complete,
      settingsClear: pending,
      settingsDefaults: pending,
      dataOwnerAdoption: failed,
      preferencesOwnerAdoption: pending,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "dark",
  },
  {
    stage: "settingsClear",
    fault: {
      method: "removeItem",
      key: SETTINGS_KEY,
      phase: "before",
      throw: true,
    },
    raw: "project-reset",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: complete,
      resetSentinel: complete,
      settingsClear: failedIndeterminate,
      settingsDefaults: skipped,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: skipped,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "dark",
  },
  {
    stage: "settingsDefaults",
    fault: {
      method: "setItem",
      key: SETTINGS_KEY,
      phase: "before",
      throw: true,
    },
    raw: "settings-cleared",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: complete,
      resetSentinel: complete,
      settingsClear: complete,
      settingsDefaults: failedIndeterminate,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: skipped,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "default",
  },
  {
    stage: "preferencesOwnerAdoption",
    ownerFailure: "preferences",
    raw: "defaults-written",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: complete,
      resetSentinel: complete,
      settingsClear: complete,
      settingsDefaults: complete,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: failed,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "default",
  },
];

describe("application reset durable failure and restart matrix", () => {
  let fixture;
  let repositoryStorage;
  let projectRepository;
  let coordinator;
  let preferences;
  let resetService;
  let initialRaw;
  let defaultSettingsRaw;

  let createCoordinator;
  let createPreferences;
  beforeEach(async () => {
    ({
      fixture,
      repositoryStorage,
      projectRepository,
      coordinator,
      preferences,
      resetService,
      initialRaw,
      defaultSettingsRaw,
      createCoordinator,
      createPreferences,
    } = await createResetOwnerWorkflowFixture());
  });

  afterEach(() =>
    destroyResetOwnerWorkflowFixture({
      fixture,
      resetService,
      preferences,
      coordinator,
      repositoryStorage,
    }),
  );
  it.each(cases)(
    "records exact persistence and restarts safely after $stage failure",
    async (testCase) => {
      const resetProjectOperation =
        projectRepository.reset.bind(projectRepository);
      const resetProject = vi.spyOn(projectRepository, "reset");
      if (testCase.fault) repositoryStorage.arm(testCase.fault);
      if (testCase.ownerFailure === "data") {
        resetProject.mockImplementationOnce(() => {
          const result = resetProjectOperation();
          coordinator.destroy();
          return result;
        });
      }
      if (testCase.ownerFailure === "preferences") {
        repositoryStorage.arm({
          method: "setItem",
          key: SETTINGS_KEY,
          phase: "after",
          throw: false,
          onTrigger: () => preferences.destroy(),
        });
      }

      const result = await request(
        fixture.eventBus,
        "application:reset",
        {},
        0,
      );

      expect(result).toMatchObject({ success: false, stage: testCase.stage });
      expect(compactReceipt(result.receipt)).toEqual(testCase.receipt);
      expect(resetProject).toHaveBeenCalledOnce();

      const expectedRaw = {
        unchanged: initialRaw,
        "root-cleared": { ...initialRaw, root: null },
        "project-cleared": {
          ...initialRaw,
          root: null,
          backup: null,
        },
        "project-reset": {
          ...initialRaw,
          root: null,
          backup: null,
          resetSentinel: "true",
        },
        "settings-cleared": {
          root: null,
          backup: null,
          settings: null,
          resetSentinel: "true",
        },
        "defaults-written": {
          root: null,
          backup: null,
          settings: defaultSettingsRaw,
          resetSentinel: "true",
        },
      }[testCase.raw];
      expect(rawPersistence()).toEqual(expectedRaw);

      const expectedDataPublications = testCase.dataPublished ? 1 : 0;
      expect(
        fixture.eventBusFixture.getEventsOfType("data:state-changed"),
      ).toHaveLength(expectedDataPublications);
      expect(
        fixture.eventBusFixture.getEventsOfType("profile:updated"),
      ).toHaveLength(expectedDataPublications);
      expect(
        fixture.eventBusFixture.getEventsOfType("profile:switched"),
      ).toHaveLength(expectedDataPublications);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
      ).toHaveLength(0);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:changed"),
      ).toHaveLength(0);
      expect(
        fixture.eventBusFixture.getEventsOfType("toast:show"),
      ).toHaveLength(0);
      expect(coordinator.getCurrentState()).toMatchObject({
        ready: testCase.ownerFailure === "data" ? false : true,
        currentProfile: "captain",
        profiles: { captain: expect.any(Object) },
      });

      resetService.destroy();
      if (!preferences.destroyed) preferences.destroy();
      if (!coordinator.destroyed) coordinator.destroy();
      repositoryStorage.clearFault();
      fixture.eventBusFixture.clearEventHistory();

      coordinator = await createCoordinator();
      preferences = await createPreferences();

      expect(coordinator.getCurrentState()).toMatchObject({
        ready: true,
        currentProfile: testCase.restartedProject,
      });
      if (testCase.restartedProject === null) {
        expect(coordinator.getCurrentState().profiles).toEqual({});
      } else {
        expect(coordinator.getCurrentState().profiles).toHaveProperty(
          testCase.restartedProject,
        );
      }
      expect(preferences.getCurrentState()).toMatchObject({
        ready: true,
        settings: { theme: testCase.restartedTheme },
      });
    },
  );
});
