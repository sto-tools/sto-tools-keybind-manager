import { expect, it, vi } from "vitest";
import { request } from "../../../src/js/core/requestResponse.js";
import { importedProject } from "../../fixtures/services/projectImportOwnerChain.js";

export function registerImportOwnerSettlementCases(owners) {
  it.each(
    ["data:state-changed", "profile:switched", "environment:changed"].flatMap(
      (topic) =>
        [true, false].flatMap((settings) => [
          ["restore", topic, settings],
          ["import", topic, settings],
        ]),
    ),
  )(
    "%s retains started required %s settlement when a synchronous listener destroys the Data owner (settings: %s)",
    async (workflow, topic, settings) => {
      const {
        eventBusFixture,
        coordinator,
        projectManager,
        importer,
        projectRepository,
        settingsRepository,
      } = owners();
      const rootWrites = vi.spyOn(projectRepository, "commit");
      const settingsWrites = vi.spyOn(settingsRepository, "replace");
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const started = vi.fn();
      const isImportPublication = (event) =>
        topic !== "data:state-changed" || event.reason === "state-reloaded";
      eventBusFixture.eventBus.on(topic, async (event) => {
        if (!isImportPublication(event)) return;
        started();
        await gate;
      });
      eventBusFixture.eventBus.on(topic, (event) => {
        if (isImportPublication(event)) coordinator.destroy();
      });
      let settled = false;
      const artifact = structuredClone(importedProject);
      if (!settings) delete artifact.data.settings;
      const content = JSON.stringify(artifact);
      const action = (
        workflow === "restore"
          ? projectManager.restoreFromProjectContent(content, "project.json")
          : importer.importProjectFile(content)
      ).then((result) => {
        settled = true;
        return result;
      });
      await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
      expect(settled).toBe(false);
      expect(rootWrites).toHaveBeenCalledOnce();
      expect(settingsWrites).toHaveBeenCalledTimes(settings ? 1 : 0);
      release();
      await expect(action).resolves.toMatchObject(
        workflow === "restore"
          ? {
              success: false,
              durable: true,
            }
          : {
              success: false,
              error: "storage_write_failed",
              partial: true,
              committed: { profiles: [], settings, project: true },
            },
      );
      expect(rootWrites).toHaveBeenCalledOnce();
      expect(settingsWrites).toHaveBeenCalledTimes(settings ? 1 : 0);
    },
  );

  it.each(["data:state-changed", "preferences:state-changed"])(
    "public import releases both leases before settling required %s cross-owner mutation",
    async (topic) => {
      const { eventBusFixture, coordinator, preferences, importer } = owners();
      let invoked = false;
      const finished = vi.fn();
      eventBusFixture.eventBus.on(topic, async ({ reason }) => {
        if (
          invoked ||
          !["state-reloaded", "project-settings-activated"].includes(reason)
        )
          return;
        invoked = true;
        await preferences.setSetting("theme", "dark");
        await coordinator.renameProfile("imported", "Public Listener");
        finished();
      });
      await expect(
        importer.importProjectFile(JSON.stringify(importedProject)),
      ).resolves.toMatchObject({ success: true });
      expect(finished).toHaveBeenCalledOnce();
      expect(coordinator.getCurrentState().profiles.imported.name).toBe(
        "Public Listener",
      );
    },
  );

  it.each([
    "data:state-changed",
    "preferences:state-changed",
    "preferences:changed",
    "language:changed",
  ])(
    "settles required %s listeners after releasing both owner leases",
    async (topic) => {
      const { eventBusFixture, coordinator, preferences, projectManager } =
        owners();
      let invoked = false;
      const finished = vi.fn();
      eventBusFixture.eventBus.on(topic, async (event) => {
        if (invoked) return;
        if (topic === "data:state-changed" && event.reason !== "state-reloaded")
          return;
        if (
          topic === "preferences:state-changed" &&
          event.reason !== "project-settings-activated"
        )
          return;
        invoked = true;
        await request(
          eventBusFixture.eventBus,
          "preferences:set-setting",
          { key: "theme", value: "dark" },
          0,
        );
        await coordinator.renameProfile("imported", "Listener Renamed");
        finished();
      });
      const result = await projectManager.restoreFromProjectContent(
        JSON.stringify(importedProject),
        "project.json",
      );
      expect(result).toMatchObject({ success: true });
      expect(finished).toHaveBeenCalledOnce();
      expect(preferences.getCurrentState().settings.theme).toBe("dark");
      expect(coordinator.getCurrentState().profiles.imported.name).toBe(
        "Listener Renamed",
      );
    },
  );

  it.each(["data:state-changed", "preferences:state-changed"])(
    "waits for its own %s required listener without retaining either writer lease",
    async (topic) => {
      const { eventBusFixture, coordinator, projectManager } = owners();
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const started = vi.fn();
      eventBusFixture.eventBus.on(topic, async (event) => {
        if (topic === "data:state-changed" && event.reason !== "state-reloaded")
          return;
        if (
          topic === "preferences:state-changed" &&
          event.reason !== "project-settings-activated"
        )
          return;
        started();
        await gate;
      });
      let settled = false;
      const restore = projectManager
        .restoreFromProjectContent(
          JSON.stringify(importedProject),
          "project.json",
        )
        .then((result) => {
          settled = true;
          return result;
        });
      await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
      await request(
        eventBusFixture.eventBus,
        "preferences:set-setting",
        { key: "theme", value: "dark" },
        0,
      );
      await coordinator.renameProfile("imported", "Subsequent");
      expect(settled).toBe(false);
      release();
      await expect(restore).resolves.toMatchObject({ success: true });
    },
  );

  it("retains already-started required Preferences settlement when a synchronous listener destroys its owner", async () => {
    const { eventBusFixture, coordinator, preferences, projectManager } =
      owners();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = vi.fn();
    eventBusFixture.eventBus.on(
      "preferences:state-changed",
      async ({ reason }) => {
        if (reason !== "project-settings-activated") return;
        started();
        await gate;
      },
    );
    eventBusFixture.eventBus.on("preferences:state-changed", ({ reason }) => {
      if (reason === "project-settings-activated") preferences.destroy();
    });
    let settled = false;
    const restore = projectManager
      .restoreFromProjectContent(
        JSON.stringify(importedProject),
        "project.json",
      )
      .then((result) => {
        settled = true;
        return result;
      });
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    await coordinator.renameProfile("imported", "After Cancellation");
    expect(settled).toBe(false);
    release();
    await expect(restore).resolves.toMatchObject({
      success: false,
      durable: true,
    });
  });
}
