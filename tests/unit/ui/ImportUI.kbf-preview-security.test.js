import { describe, expect, it } from "vitest";

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
