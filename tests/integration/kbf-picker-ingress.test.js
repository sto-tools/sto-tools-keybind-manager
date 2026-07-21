import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportUI from "../../src/js/components/ui/ImportUI.js";
import { MAX_KBF_FILE_BYTES } from "../../src/js/lib/kbf/kbfLimits.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";

describe("KBF picker ingress", () => {
  let eventBusFixture;
  let importUI;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="modalOverlay"></div>';
    eventBusFixture = await createRealEventBusFixture();
    importUI = new ImportUI({
      eventBus: eventBusFixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    importUI.init();
  });

  afterEach(() => {
    importUI?.destroy();
    eventBusFixture?.destroy();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects an oversized selected KBF before constructing FileReader", async () => {
    const importRequests = [];
    const toasts = [];
    const FileReaderConstructor = vi.fn();
    vi.stubGlobal("FileReader", FileReaderConstructor);
    const detachRequest = eventBusFixture.eventBus.on(
      "rpc:import:kbf-file",
      ({ payload }) => importRequests.push(payload),
    );
    const detachToast = eventBusFixture.eventBus.on("toast:show", (toast) =>
      toasts.push(toast),
    );
    const beforeStorage = { ...localStorage };

    await importUI.openFileDialog("kbf");
    const input = document.querySelector(
      'input[type="file"][accept=".kbf,.txt"]',
    );
    expect(input).toBeInstanceOf(HTMLInputElement);
    const file = new File(
      [new Uint8Array(MAX_KBF_FILE_BYTES + 1)],
      "oversized.KBF",
      { type: "text/plain" },
    );
    expect(file.size).toBe(MAX_KBF_FILE_BYTES + 1);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(FileReaderConstructor).not.toHaveBeenCalled();
    expect(importRequests).toEqual([]);
    expect(toasts).toEqual([{ message: "kbf_file_too_large", type: "error" }]);
    expect(importUI.importFileSession.isActive).toBe(false);
    expect(input.isConnected).toBe(false);
    expect(document.getElementById("importModal")).toBeNull();
    expect(document.getElementById("enhancedBindsetSelectionModal")).toBeNull();
    expect({ ...localStorage }).toEqual(beforeStorage);

    detachRequest();
    detachToast();
  });
});
