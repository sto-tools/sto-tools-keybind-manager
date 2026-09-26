import { afterEach, describe, expect, it, vi } from "vitest";

import FileExplorerUI from "../../../src/js/components/ui/FileExplorerUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const i18n = { t: (key) => key };

function profile(id, name, builds = {}) {
  return {
    id,
    name,
    builds,
    aliases: {},
  };
}

function mountExplorer() {
  document.body.innerHTML = `
    <div id="fileTree"></div>
    <pre id="fileContent"></pre>
    <button id="copyFileContentBtn"></button>
    <button id="downloadFileBtn"></button>
  `;
}

function treeProfileIds() {
  return [...document.querySelectorAll("#fileTree > .tree-node.profile")].map(
    (node) => node.getAttribute("data-profileid"),
  );
}

describe("FileExplorerUI accepted data state", () => {
  let fixture;
  let ui;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("projects a live accepted snapshot without a persistence query", async () => {
    mountExplorer();
    fixture = createEventBusFixture();
    ui = new FileExplorerUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
    });
    ui.request = vi.fn(async (topic) => {
      if (topic === "export:generate-keybind-file") return "space export";
      if (topic === "export:generate-alias-file") return "alias export";
      throw new Error(`Unexpected request: ${topic}`);
    });
    ui.init();
    ui.openExplorer();

    expect(treeProfileIds()).toEqual([]);

    const alpha = profile("alpha", "Alpha", {
      space: { keys: { F1: ["FireAll"] } },
      ground: { keys: {} },
    });
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 10,
        currentProfileData: alpha,
        profiles: { alpha },
      }),
    });

    expect(treeProfileIds()).toEqual(["alpha"]);
    expect(
      document.querySelectorAll("#fileTree .tree-node.build"),
    ).toHaveLength(2);
    expect(
      document.querySelectorAll("#fileTree .tree-node.aliases"),
    ).toHaveLength(1);
    expect(Object.isFrozen(ui.cache.dataState)).toBe(true);

    await expect(ui.generateBuildExport("alpha", "space")).resolves.toBe(
      "space export",
    );
    await expect(ui.generateAliasExport("alpha")).resolves.toBe("alias export");
    expect(ui.request.mock.calls).toEqual([
      [
        "export:generate-keybind-file",
        {
          profileId: "alpha",
          environment: "space",
        },
      ],
      ["export:generate-alias-file", { profileId: "alpha" }],
    ]);
  });

  it("adopts a late-join snapshot before the explorer first opens", () => {
    mountExplorer();
    fixture = createEventBusFixture();
    const alpha = profile("alpha", "Late Alpha", {
      space: { keys: {} },
    });
    const lateJoin = createDataCoordinatorState({
      authorityEpoch: 20,
      revision: 0,
      currentProfileData: alpha,
      profiles: { alpha },
    });
    fixture.eventBus.on("component:register", ({ replyTopic }) => {
      fixture.eventBus.emit(replyTopic, {
        sender: "DataCoordinator",
        state: lateJoin,
      });
    });

    ui = new FileExplorerUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
    });
    ui.init();
    ui.openExplorer();

    expect(ui.cache.dataState).toMatchObject({
      authorityEpoch: 20,
      revision: 0,
      currentProfile: "alpha",
    });
    expect(treeProfileIds()).toEqual(["alpha"]);
    expect(
      document.querySelector("#fileTree > .profile")?.textContent,
    ).toContain("Late Alpha");
  });

  it("clears prior tree and selection for a pre-ready replacement authority", () => {
    mountExplorer();
    fixture = createEventBusFixture();
    ui = new FileExplorerUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
    });
    ui.init();

    const alpha = profile("alpha", "Alpha", { space: { keys: {} } });
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 30,
        revision: 5,
        currentProfileData: alpha,
        profiles: { alpha },
      }),
    });
    ui.selectedNode = {
      type: "build",
      profileId: "alpha",
      environment: "space",
    };
    expect(treeProfileIds()).toEqual(["alpha"]);

    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 31,
        ready: false,
        revision: 0,
        currentProfile: null,
        currentProfileData: null,
        profiles: {},
      }),
    });

    expect(treeProfileIds()).toEqual([]);
    expect(ui.selectedNode).toBeNull();
    expect(ui.cache.dataState).toMatchObject({
      authorityEpoch: 31,
      ready: false,
      currentProfile: null,
      profiles: {},
    });

    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: createDataCoordinatorState({
        authorityEpoch: 30,
        revision: 999,
        currentProfileData: alpha,
        profiles: { alpha },
      }),
    });

    expect(treeProfileIds()).toEqual([]);
    expect(ui.cache.dataState?.authorityEpoch).toBe(31);
  });

  it("treats ready empty profiles and a null current profile as decisive", async () => {
    mountExplorer();
    fixture = createEventBusFixture();
    ui = new FileExplorerUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
    });
    ui.request = vi.fn();
    ui.init();

    const old = profile("old", "Old", { space: { keys: {} } });
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 40,
        currentProfileData: old,
        profiles: { old },
      }),
    });
    expect(treeProfileIds()).toEqual(["old"]);

    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-deleted",
      state: createDataCoordinatorState({
        authorityEpoch: 40,
        revision: 2,
        currentProfile: null,
        currentProfileData: null,
        profiles: {},
      }),
    });

    expect(treeProfileIds()).toEqual([]);
    await expect(ui.generateBuildExport("old", "space")).resolves.toBe("");
    await expect(ui.generateAliasExport("old")).resolves.toBe("");
    expect(ui.request).not.toHaveBeenCalled();
  });
});
