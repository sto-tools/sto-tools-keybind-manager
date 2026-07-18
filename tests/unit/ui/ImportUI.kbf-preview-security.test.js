import { afterEach, describe, expect, it, vi } from "vitest";

import ImportUI from "../../../src/js/components/ui/ImportUI.js";
import { buildKBFPreviewHtml } from "../../../src/js/components/ui/kbfPreviewDom.js";

describe("KBF preview markup", () => {
  it("escapes imported source and destination names", () => {
    const sourceName = '<img id="source-payload" onerror="alert(1)">';
    const destinationName =
      '<svg id="destination-payload" onload="alert(2)"></svg>';

    const markup = buildKBFPreviewHtml(
      {
        selectedBindsets: [sourceName],
        bindsetMappings: { [sourceName]: "custom" },
        bindsetRenames: { [sourceName]: destinationName },
      },
      (key) => key,
    );

    expect(markup).not.toContain(sourceName);
    expect(markup).not.toContain(destinationName);
    expect(markup).toContain(
      "&lt;img id=&quot;source-payload&quot; onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(markup).toContain(
      "&lt;svg id=&quot;destination-payload&quot; onload=&quot;alert(2)&quot;&gt;&lt;/svg&gt;",
    );
  });

  it("preserves primary and empty preview translation markup", () => {
    expect(buildKBFPreviewHtml(null, (key) => `t:${key}`)).toBe(
      '<p class="preview-placeholder">t:select_bindsets_for_preview</p>',
    );

    const markup = buildKBFPreviewHtml(
      {
        selectedBindsets: ["Primary Source"],
        bindsetMappings: { "Primary Source": "primary" },
        bindsetRenames: { "Primary Source": "Primary Source" },
      },
      (key) => `t:${key}`,
    );
    expect(markup).toContain(
      '<span class="mapping-indicator primary">t:maps_to_primary_bindset</span>',
    );
  });
});

describe("ImportUI KBF preview security", () => {
  let ui;

  afterEach(() => {
    ui?.destroy();
    vi.restoreAllMocks();
  });

  it("renders hostile original and destination bindset names as text", () => {
    const originalName =
      '<img id="kbf-original-payload" src="missing" onerror="alert(1)">';
    const finalName =
      '<svg id="kbf-destination-payload" onload="alert(2)"></svg>';
    const modal = document.createElement("div");
    modal.innerHTML = '<div id="preview_content"></div>';

    ui = new ImportUI({
      document,
      i18n: { t: (key) => key },
    });
    vi.spyOn(ui, "initializeTableStructure").mockImplementation(() => {});
    vi.spyOn(ui, "validateBindsetConfiguration").mockReturnValue({
      selectedBindsets: [originalName],
      bindsetMappings: { [originalName]: "custom" },
      bindsetRenames: { [originalName]: finalName },
    });

    ui.setupPreviewUpdates(modal, {
      valid: true,
      bindsetNames: [originalName],
      bindsetKeyCounts: { [originalName]: 1 },
    });

    const preview = modal.querySelector("#preview_content");
    expect(preview.querySelector("#kbf-original-payload")).toBeNull();
    expect(preview.querySelector("#kbf-destination-payload")).toBeNull();
    expect(preview.querySelector("img")).toBeNull();
    expect(preview.querySelector("svg")).toBeNull();
    expect(preview.querySelector(".preview-original").textContent).toBe(
      originalName,
    );
    expect(preview.querySelector(".mapping-indicator.custom").textContent).toBe(
      `maps_to: ${finalName}`,
    );
  });
});
