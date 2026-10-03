// Exact internal assertions preserved from tests/browser/file-explorer-startup-boundary.test.js.
import { beforeEach, afterEach } from "vitest";
import {
  initializeSourceApplication,
  destroySourceApplication,
} from "../../fixtures/ui/sourceApplicationRuntime.js";
beforeEach(initializeSourceApplication);
afterEach(destroySourceApplication);

import { runtime } from "../../fixtures/ui/sourceApplicationRuntime.js";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT_KEY } from "../../fixtures/ui/projectStorage.js";

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

    expect(app).not.toHaveProperty("storageService");
    expect(app).not.toHaveProperty("projectRepository");
    const beforeRoot = localStorage.getItem(PROJECT_ROOT_KEY);
    localStorage.setItem(
      PROJECT_ROOT_KEY,
      JSON.stringify({
        currentProfile: "storage-poison",
        profiles: {
          "storage-poison": {
            id: "storage-poison",
            name: "Storage Poison",
            builds: { space: { keys: {} } },
          },
        },
      }),
    );

    try {
      openButton.click();

      const renderedIds = [
        ...tree.querySelectorAll(":scope > .tree-node.profile"),
      ].map((node) => node.getAttribute("data-profileid"));
      expect(renderedIds).toEqual(Object.keys(snapshot.profiles));
      expect(renderedIds).not.toContain("storage-poison");
    } finally {
      if (beforeRoot === null) localStorage.removeItem(PROJECT_ROOT_KEY);
      else localStorage.setItem(PROJECT_ROOT_KEY, beforeRoot);
      app.eventBus?.emit("modal:hide", { modalId: "fileExplorerModal" });
    }
  });
});
