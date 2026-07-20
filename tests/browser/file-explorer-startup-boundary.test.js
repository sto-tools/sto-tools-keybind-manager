import { describe, expect, it } from "vitest";

describe("File Explorer startup boundary", () => {
  it("opens through its initialized event consumer without a late callback", () => {
    const bus = window.eventBus;
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
});
