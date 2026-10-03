import {
  createResetOwnerWorkflowFixture,
  destroyResetOwnerWorkflowFixture,
  rawPersistence,
  createProfile,
} from "../fixtures/services/applicationResetOwnerWorkflow.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createPreferencesState } from "../fixtures/core/componentState.js";

const ROOT_KEY = "sto_keybind_manager";
const BACKUP_KEY = "sto_keybind_manager_backup";
const SETTINGS_KEY = "sto_keybind_settings";
const RESET_KEY = "sto_app_reset";
const cases = [
  "rootClear",
  "backupClear",
  "resetSentinel",
  "settingsClear",
  "settingsDefaults",
].map((stage, index) => ({
  stage,
  fault: {
    method: index === 2 || index === 4 ? "setItem" : "removeItem",
    key: [ROOT_KEY, BACKUP_KEY, RESET_KEY, SETTINGS_KEY, SETTINGS_KEY][index],
    phase: "before",
    throw: true,
  },
}));

describe("application reset resumable saga and overlap", () => {
  let fixture;
  let repositoryStorage;
  let projectRepository;
  let settingsRepository;
  let coordinator;
  let preferences;
  let resetService;
  let initialRaw;
  let i18n;

  beforeEach(async () => {
    ({
      fixture,
      repositoryStorage,
      projectRepository,
      settingsRepository,
      coordinator,
      preferences,
      resetService,
      initialRaw,
      i18n,
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
  it("serializes overlapping restore, application reset and ordinary Preferences mutation", async () => {
    const importer = new ImportService({
      eventBus: fixture.eventBus,
      replaceProjectFromImport:
        coordinator.replaceProjectFromImport.bind(coordinator),
      replaceProjectFromImportWithSettlement:
        coordinator.replaceProjectFromImportWithSettlement.bind(coordinator),
    });
    const projectManager = new ProjectManagementService({
      eventBus: fixture.eventBus,
      i18n,
      runPreferencesTransition:
        preferences.runExternalActivationTransition.bind(preferences),
      importProjectWithinPreferencesTransition:
        importer.importProjectWithinPreferencesTransition.bind(importer),
      activateProjectFromImport:
        coordinator.activateProjectFromImport.bind(coordinator),
    });
    importer.init();
    projectManager.init();
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    i18n.changeLanguage.mockImplementationOnce(async (language) => {
      await gate;
      i18n.language = language;
    });
    const clear = vi.spyOn(settingsRepository, "clear");
    const projectReset = vi.spyOn(projectRepository, "reset");
    const artifact = JSON.stringify({
      version: "1.0.0",
      type: "project",
      exported: "2026-10-03T00:00:00.000Z",
      data: {
        profiles: {
          restored: { ...createProfile(), id: "restored", name: "Restored" },
        },
        currentProfile: "restored",
        settings: {
          ...createPreferencesState().settings,
          language: "fr",
          theme: "dark",
        },
      },
    });
    try {
      const restoring = projectManager.restoreFromProjectContent(
        artifact,
        "overlap.json",
      );
      await vi.waitFor(() =>
        expect(i18n.changeLanguage).toHaveBeenCalledWith("fr"),
      );
      const resetting = request(fixture.eventBus, "application:reset", {}, 0);
      const changing = preferences.setSetting("theme", "light");
      await Promise.resolve();
      expect(projectReset).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      release();
      await expect(restoring).resolves.toMatchObject({ success: true });
      await expect(resetting).resolves.toMatchObject({ success: true });
      await changing;
      expect(projectReset).toHaveBeenCalledOnce();
      expect(clear).toHaveBeenCalledOnce();
      expect(coordinator.getCurrentState()).toMatchObject({
        currentProfile: null,
        profiles: {},
      });
      expect(preferences.getSettings().theme).toBe("light");
      expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).theme).toBe(
        "light",
      );
      expect(
        fixture.eventBusFixture
          .getEventsOfType("preferences:state-changed")
          .filter(({ data }) => data.reason === "settings-reset"),
      ).toHaveLength(1);
      expect(
        fixture.eventBusFixture
          .getEventsOfType("data:state-changed")
          .filter(({ data }) => data.reason === "storage-reset"),
      ).toHaveLength(1);
    } finally {
      release();
      projectManager.destroy();
      importer.destroy();
    }
  });

  it("revokes reset while waiting for the Preferences lease before touching persistence", async () => {
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const blocking = preferences.runExternalActivationTransition(
      "project-restore",
      async () => {
        await gate;
      },
    );
    await Promise.resolve();
    const before = rawPersistence();
    const resetting = resetService.reset({});
    resetService.destroy();
    release();
    await blocking;
    await expect(resetting).resolves.toMatchObject({
      success: false,
      durable: false,
      params: { reason: "operation_cancelled" },
    });
    expect(rawPersistence()).toEqual(before);
  });

  it("revokes subsequent reset stages if the service is destroyed during settings clear", async () => {
    repositoryStorage.arm({
      method: "removeItem",
      key: SETTINGS_KEY,
      phase: "after",
      onTrigger: () => resetService.destroy(),
    });
    const defaults = vi.spyOn(settingsRepository, "replace");
    await expect(resetService.reset({})).resolves.toMatchObject({
      success: false,
      durable: true,
      params: { reason: "operation_cancelled" },
      receipt: {
        rootClear: { status: "complete", committed: true },
        settingsClear: { status: "complete", committed: true },
      },
    });
    expect(defaults).not.toHaveBeenCalled();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(coordinator.getCurrentState().currentProfile).toBe("captain");
  });

  it("drains a started Preferences publication after synchronous teardown without replaying adoption", async () => {
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let settled = false;
    const emit = fixture.eventBus.emit.getMockImplementation();
    fixture.eventBus.emit.mockImplementation((topic, publication, options) => {
      emit(topic, publication, options);
      if (
        topic === "preferences:state-changed" &&
        publication.reason === "settings-reset"
      )
        return gate;
    });
    const detach = fixture.eventBus.on(
      "preferences:state-changed",
      ({ reason }) => {
        if (reason !== "settings-reset") return;
        preferences.destroy();
        return gate;
      },
    );
    const resetting = resetService.reset({}).then((result) => {
      settled = true;
      return result;
    });
    try {
      await vi.waitFor(() => expect(preferences.destroyed).toBe(true));
      await Promise.resolve();
      expect(settled).toBe(false);
      const revision = preferences._stateRevision;
      release();
      await expect(resetting).resolves.toMatchObject({
        success: false,
        durable: true,
        receipt: {
          preferencesOwnerAdoption: { status: "failed", committed: true },
        },
      });
      await expect(resetService.reset({})).resolves.toMatchObject({
        success: false,
        durable: true,
      });
      expect(preferences._stateRevision).toBe(revision);
      expect(
        fixture.eventBusFixture
          .getEventsOfType("preferences:state-changed")
          .filter(({ data }) => data.reason === "settings-reset"),
      ).toHaveLength(1);
    } finally {
      release();
      detach();
    }
  });

  it("treats a real transient post-adoption collaborator error as degraded success without re-adopting", async () => {
    preferences.localizeCommands.mockClear();
    const applying = vi.spyOn(preferences, "_applyAndPublishTransition");
    preferences.localizeCommands.mockImplementationOnce(() => {
      throw new Error("transient catalog effect");
    });
    const revision = preferences._stateRevision;
    await expect(resetService.reset({})).resolves.toMatchObject({
      success: true,
    });
    await expect(applying.mock.results[0].value).resolves.toMatchObject({
      effectsDegraded: true,
    });
    expect(preferences._stateRevision).toBe(revision + 1);
    expect(
      fixture.eventBusFixture
        .getEventsOfType("preferences:state-changed")
        .filter(({ data }) => data.reason === "settings-reset"),
    ).toHaveLength(1);
    expect(preferences.localizeCommands).toHaveBeenCalledOnce();
    expect(preferences.getCurrentState().settings).toEqual(
      createPreferencesState().settings,
    );
  });

  it.each([
    ...cases
      .filter(({ fault }) => fault)
      .map(({ stage, fault }) => ({ stage, fault })),
    ...cases
      .filter(({ fault }) => fault)
      .map(({ stage, fault }) => ({
        stage,
        fault: { ...fault, phase: "after" },
      })),
  ])(
    "resumes $stage $fault.phase failure without replaying verified completed stages",
    async ({ stage, fault }) => {
      const remove = vi.spyOn(repositoryStorage, "removeItem");
      const write = vi.spyOn(repositoryStorage, "setItem");
      repositoryStorage.arm(fault);
      const first = await request(fixture.eventBus, "application:reset", {}, 0);
      expect(first).toMatchObject({ success: false, stage });
      const stages = {
        rootClear: [remove, ROOT_KEY],
        backupClear: [remove, BACKUP_KEY],
        resetSentinel: [write, RESET_KEY],
        settingsClear: [remove, SETTINGS_KEY],
        settingsDefaults: [write, SETTINGS_KEY],
      };
      const before = Object.fromEntries(
        Object.entries(stages).map(([name, [spy, key]]) => [
          name,
          spy.mock.calls.filter(([candidate]) => candidate === key).length,
        ]),
      );
      repositoryStorage.clearFault();
      const second = await request(
        fixture.eventBus,
        "application:reset",
        {},
        0,
      );
      expect(second.success).toBe(true);
      for (const [name, [spy, key]] of Object.entries(stages)) {
        if (
          first.receipt[name].status === "complete" ||
          (name === stage && fault.phase === "after")
        )
          expect(
            spy.mock.calls.filter(([candidate]) => candidate === key).length,
            name,
          ).toBe(before[name]);
      }
      expect(coordinator.getCurrentState().profiles).toEqual({});
      expect(preferences.getSettings()).toEqual(
        createPreferencesState().settings,
      );
      expect(
        fixture.eventBusFixture.getEventsOfType("data:state-changed"),
      ).toHaveLength(1);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
      ).toHaveLength(1);
      expect(second.receipt.preferencesOwnerAdoption.status).toBe("complete");
    },
  );

  it("resumes only pending Data adoption after Preferences already committed and published", async () => {
    const defaultsWrite = vi.spyOn(settingsRepository, "replace");
    const clear = vi.spyOn(settingsRepository, "clear");
    const remove = vi.spyOn(repositoryStorage, "removeItem");
    const write = vi.spyOn(repositoryStorage, "setItem");
    vi.spyOn(projectRepository, "load").mockImplementationOnce(() => {
      throw new Error("injected adoption read failure");
    });
    const first = await request(fixture.eventBus, "application:reset", {}, 0);
    expect(first).toMatchObject({ success: false, stage: "dataOwnerAdoption" });
    expect(first.receipt.preferencesOwnerAdoption).toMatchObject({
      status: "complete",
      committed: true,
    });
    const revision = preferences.getCurrentState().revision;
    const before = {
      remove: remove.mock.calls.length,
      write: write.mock.calls.length,
    };
    await expect(
      request(fixture.eventBus, "application:reset", {}, 0),
    ).resolves.toMatchObject({ success: true });
    expect(remove).toHaveBeenCalledTimes(before.remove);
    expect(write).toHaveBeenCalledTimes(before.write);
    expect(clear).toHaveBeenCalledOnce();
    expect(defaultsWrite).toHaveBeenCalledOnce();
    expect(preferences.getCurrentState().revision).toBe(revision);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(1);
    expect(
      fixture.eventBusFixture.getEventsOfType("data:state-changed"),
    ).toHaveLength(1);
    // A fully acknowledged reset ends the saga; a distinct later action is new.
    await expect(
      request(fixture.eventBus, "application:reset", {}, 0),
    ).resolves.toMatchObject({ success: true });
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("does not clear or rewrite settings again when defaults persisted but adoption preparation failed", async () => {
    const write = vi.spyOn(settingsRepository, "replace");
    const clear = vi.spyOn(settingsRepository, "clear");
    vi.spyOn(preferences, "_prepareSettingsTransition").mockImplementationOnce(
      () => {
        throw new Error("injected preparation failure");
      },
    );
    const first = await request(fixture.eventBus, "application:reset", {}, 0);
    expect(first).toMatchObject({
      success: false,
      stage: "preferencesOwnerAdoption",
    });
    expect(first.receipt.settingsDefaults).toMatchObject({
      status: "complete",
      committed: true,
    });
    await expect(
      request(fixture.eventBus, "application:reset", {}, 0),
    ).resolves.toMatchObject({ success: true });
    expect(write).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(1);
  });

  it.each(["preferences", "data"])(
    "fails closed rather than replaying after an intervening %s owner mutation",
    async (domain) => {
      repositoryStorage.arm({
        method: "setItem",
        key: SETTINGS_KEY,
        phase: "before",
        throw: true,
      });
      await expect(
        request(fixture.eventBus, "application:reset", {}, 0),
      ).resolves.toMatchObject({ success: false });
      if (domain === "preferences")
        await preferences.setSetting("theme", "light");
      else await coordinator.reloadState();
      const durable = rawPersistence();
      const acceptedPreferences = preferences.getCurrentState();
      const acceptedData = coordinator.getCurrentState();
      const write = vi.spyOn(repositoryStorage, "setItem");
      const remove = vi.spyOn(repositoryStorage, "removeItem");
      await expect(
        request(fixture.eventBus, "application:reset", {}, 0),
      ).resolves.toMatchObject({
        success: false,
        params: { reason: "operation_cancelled" },
      });
      expect(write).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(rawPersistence()).toEqual(durable);
      expect(preferences.getCurrentState()).toEqual(acceptedPreferences);
      expect(coordinator.getCurrentState()).toEqual(acceptedData);
    },
  );

  it("fails closed when a completed stage changes or its verification read throws", async () => {
    repositoryStorage.arm({
      method: "setItem",
      key: SETTINGS_KEY,
      phase: "before",
      throw: true,
    });
    await request(fixture.eventBus, "application:reset", {}, 0);
    repositoryStorage.arm({
      method: "getItem",
      key: ROOT_KEY,
      phase: "before",
      throw: true,
    });
    const write = vi.spyOn(repositoryStorage, "setItem");
    const remove = vi.spyOn(repositoryStorage, "removeItem");
    await expect(
      request(fixture.eventBus, "application:reset", {}, 0),
    ).resolves.toMatchObject({
      success: false,
      params: { reason: "storage_read_failed" },
    });
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    localStorage.setItem(ROOT_KEY, initialRaw.root);
    await expect(
      request(fixture.eventBus, "application:reset", {}, 0),
    ).resolves.toMatchObject({
      success: false,
      params: { reason: "verification_failed" },
    });
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
