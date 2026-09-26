import { runtime } from "../fixtures/ui/applicationRuntime.js";
import { describe, expect, it } from "vitest";

describe("File Explorer startup boundary", () => {
  it("opens through its initialized event consumer without a late callback", () => {
    const bus = runtime().eventBus;
    const openButton = document.getElementById("fileExplorerBtn");
    const modal = document.getElementById("fileExplorerModal");

    expect(bus?.hasListeners("file-explorer:open")).toBe(true);
    expect(openButton).toBeInstanceOf(HTMLButtonElement);
    expect(modal).toBeInstanceOf(HTMLDivElement);
    if (!(openButton instanceof HTMLButtonElement) || !modal) return;

    openButton.click();
    expect(modal.classList.contains("active")).toBe(true);

    bus?.emit("modal:hide", { modalId: "fileExplorerModal" });
    expect(modal.classList.contains("active")).toBe(false);
  });

  it("renders the accepted coordinator snapshot without reading stale storage", () => {
    const app = runtime();
    const openButton = document.getElementById("fileExplorerBtn");
    const tree = document.getElementById("fileTree");
    const snapshot = app.dataCoordinator?.getCurrentState?.();

    expect(openButton).toBeInstanceOf(HTMLButtonElement);
    expect(tree).toBeInstanceOf(HTMLDivElement);
    expect(snapshot?.ready).toBe(true);
    if (
      !(openButton instanceof HTMLButtonElement) ||
      !(tree instanceof HTMLDivElement) ||
      !snapshot?.ready
    ) {
      return;
    }

    const originalGetAllData = app.storageService.getAllData;
    const originalGetProfile = app.storageService.getProfile;
    let getAllDataCalls = 0;
    let getProfileCalls = 0;
    app.storageService.getAllData = () => {
      getAllDataCalls += 1;
      return {
        currentProfile: "storage-poison",
        profiles: {
          "storage-poison": {
            id: "storage-poison",
            name: "Storage Poison",
            builds: { space: { keys: {} } },
          },
        },
      };
    };
    app.storageService.getProfile = () => {
      getProfileCalls += 1;
      return {
        id: "storage-poison",
        name: "Storage Poison",
        builds: { space: { keys: {} } },
      };
    };

    try {
      openButton.click();

      const renderedIds = [
        ...tree.querySelectorAll(":scope > .tree-node.profile"),
      ].map((node) => node.getAttribute("data-profileid"));
      expect(renderedIds).toEqual(Object.keys(snapshot.profiles));
      expect(renderedIds).not.toContain("storage-poison");
      expect(getAllDataCalls).toBe(0);
      expect(getProfileCalls).toBe(0);
    } finally {
      app.storageService.getAllData = originalGetAllData;
      app.storageService.getProfile = originalGetProfile;
      app.eventBus?.emit("modal:hide", { modalId: "fileExplorerModal" });
    }
  });
});
