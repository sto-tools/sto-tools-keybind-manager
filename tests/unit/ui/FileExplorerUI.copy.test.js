import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import FileExplorerUI from "../../../src/js/components/ui/FileExplorerUI.js";
import { createUIComponentFixture } from "../../fixtures/ui/component.js";

describe("FileExplorerUI – copy preview content", () => {
  let fixture;
  let component;
  let showToastSpy;
  const originalI18next = globalThis.i18next;

  beforeEach(() => {
    globalThis.i18next = {
      t: vi.fn((key) => key),
    };
    fixture = createUIComponentFixture(FileExplorerUI, {
      autoInit: false,
      document,
    });
    component = fixture.component;
    showToastSpy = vi.spyOn(component, "showToast");
    component.init();
    showToastSpy.mockClear();
  });

  afterEach(() => {
    if (component && !component.destroyed) {
      component.destroy();
    }
    globalThis.i18next = originalI18next;
    vi.restoreAllMocks();
  });

  function getCopyHandler() {
    const calls = fixture.eventBus.onDom.mock.calls;
    const match = calls.find((call) => call[0] === "copyFileContentBtn");
    return match ? match[2] : null;
  }

  function getDownloadHandler() {
    const calls = fixture.eventBus.onDom.mock.calls;
    const match = calls.find((call) => call[0] === "downloadFileBtn");
    return match ? match[2] : null;
  }

  it("requests clipboard copy and shows success toast on success", async () => {
    component.request = vi.fn().mockResolvedValue({
      success: true,
      message: "content_copied_to_clipboard",
    });

    const handler = getCopyHandler();
    expect(handler).toBeTypeOf("function");
    component.document = {
      getElementById: vi.fn((id) =>
        id === component.contentId ? { textContent: "example content" } : null,
      ),
    };

    await handler();

    expect(component.request).toHaveBeenCalledWith(
      "utility:copy-to-clipboard",
      { text: "example content" },
    );
    const successCall = showToastSpy.mock.calls.find(
      (call) => call[0] === "content_copied_to_clipboard",
    );
    expect(successCall).toEqual(["content_copied_to_clipboard", "success"]);
  });

  it("shows error toast when clipboard copy fails", async () => {
    component.request = vi.fn().mockResolvedValue({
      success: false,
      message: "failed_to_copy_to_clipboard",
    });

    const handler = getCopyHandler();
    expect(handler).toBeTypeOf("function");
    component.document = {
      getElementById: vi.fn((id) =>
        id === component.contentId ? { textContent: "other content" } : null,
      ),
    };

    await handler();

    expect(component.request).toHaveBeenCalledWith(
      "utility:copy-to-clipboard",
      { text: "other content" },
    );
    const errorCall = showToastSpy.mock.calls.find(
      (call) => call[0] === "failed_to_copy_to_clipboard",
    );
    expect(errorCall).toEqual(["failed_to_copy_to_clipboard", "error"]);
  });

  it("shows warning toast when preview content is empty", async () => {
    const handler = getCopyHandler();
    expect(handler).toBeTypeOf("function");

    component.document = {
      getElementById: vi.fn((id) =>
        id === component.contentId ? { textContent: "   " } : null,
      ),
    };

    await handler();

    expect(showToastSpy).toHaveBeenCalledWith("nothing_to_copy", "warning");
  });

  it("uses the default filename when the selected profile is unavailable", async () => {
    const handler = getDownloadHandler();
    expect(handler).toBeTypeOf("function");
    component.selectedNode = {
      type: "build",
      profileId: "missing-profile",
      environment: "space",
    };
    component.storage = { getProfile: vi.fn(() => null) };
    component.request = vi.fn();
    component.downloadFile = vi.fn();
    component.document = {
      getElementById: vi.fn((id) =>
        id === component.contentId ? { textContent: "preview content" } : null,
      ),
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await handler();

    expect(component.request).not.toHaveBeenCalled();
    expect(component.downloadFile).toHaveBeenCalledWith(
      "preview content",
      "default_export_filename",
      "text/plain",
    );
  });

  it("previews and downloads a build through the canonical export RPCs", async () => {
    document.body.innerHTML = `
      <div id="fileTree"></div>
      <pre id="fileContent"></pre>
    `;
    const profile = {
      id: "alpha",
      name: "Alpha",
      builds: { space: { keys: { F1: ["FireAll"] } } },
    };
    component.storage = {
      getProfile: vi.fn(() => profile),
    };
    component.request = vi.fn(async (topic) => {
      if (topic === "export:generate-keybind-file") return 'F1 "FireAll"\n';
      if (topic === "export:generate-filename") return "Alpha_space.txt";
      throw new Error(`Unexpected topic: ${topic}`);
    });
    component.downloadFile = vi.fn();
    const node = document.createElement("div");
    node.className = "tree-node build";
    node.dataset.type = "build";
    node.setAttribute("data-profileid", "alpha");
    node.setAttribute("data-environment", "space");
    document.getElementById("fileTree").appendChild(node);

    await component.selectNode(node);

    expect(component.request).toHaveBeenCalledWith(
      "export:generate-keybind-file",
      { profileId: "alpha", environment: "space" },
    );
    expect(document.getElementById("fileContent").textContent).toBe(
      'F1 "FireAll"\n',
    );

    const handler = getDownloadHandler();
    expect(handler).toBeTypeOf("function");
    await handler();

    expect(component.request).toHaveBeenCalledWith("export:generate-filename", {
      profile,
      extension: "txt",
      environment: "space",
    });
    expect(component.downloadFile).toHaveBeenCalledWith(
      'F1 "FireAll"\n',
      "Alpha_space.txt",
      "text/plain",
    );
  });

  it("owns one open-event consumer across init, destroy, reinit, and replacement", () => {
    expect(fixture.eventBus.getListenerCount("file-explorer:open")).toBe(1);
    expect(
      fixture.eventBus.onDom.mock.calls.filter(
        ([target]) => target === "fileExplorerBtn",
      ),
    ).toHaveLength(0);

    const open = vi.spyOn(component, "openExplorer");
    fixture.emit("file-explorer:open");
    expect(open).toHaveBeenCalledOnce();

    component.destroy();
    expect(fixture.eventBus.getListenerCount("file-explorer:open")).toBe(0);

    component.init();
    expect(fixture.eventBus.getListenerCount("file-explorer:open")).toBe(1);
    fixture.emit("file-explorer:open");
    expect(open).toHaveBeenCalledTimes(2);

    component.destroy();
    const replacement = new FileExplorerUI({
      eventBus: fixture.eventBus,
      document,
      i18n: fixture.i18n,
    });
    const replacementOpen = vi.spyOn(replacement, "openExplorer");
    replacement.init();

    expect(fixture.eventBus.getListenerCount("file-explorer:open")).toBe(1);
    fixture.emit("file-explorer:open");
    expect(open).toHaveBeenCalledTimes(2);
    expect(replacementOpen).toHaveBeenCalledOnce();

    replacement.destroy();
    expect(fixture.eventBus.getListenerCount("file-explorer:open")).toBe(0);
  });
});
