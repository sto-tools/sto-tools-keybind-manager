import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import {
  captureCommandChainPreviewElements,
  commitCommandChainPreview,
} from "../../../src/js/components/ui/commandChainPreviewDom.js";

function createPreviewDocument({ includeLabel = true } = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <div class="generated-command">
      ${includeLabel ? '<label data-i18n="old_label">Old label</label>' : ""}
      <div id="commandPreview">Old command</div>
    </div>
    <div id="generatedAlias" style="display: none">
      <div id="aliasPreview">Old alias</div>
    </div>
  </body>`);

  return { dom, document: dom.window.document };
}

function createProjection(overrides = {}) {
  return {
    labelKey: "generated_alias",
    commandPreview: 'F1 "sto_<img id=command-injection src=x>"',
    generatedAlias: {
      visible: true,
      content: {
        type: "literal",
        text: "alias sto_<svg id=alias-injection></svg> <& FireAll &>",
      },
    },
    ...overrides,
  };
}

describe("command-chain inert preview DOM", () => {
  it("commits translated and generated HTML-shaped values as inert text", () => {
    const { dom, document } = createPreviewDocument();
    const addEventListener = vi.spyOn(
      dom.window.EventTarget.prototype,
      "addEventListener",
    );
    const ambientTranslations = vi.fn();
    vi.stubGlobal("applyTranslations", ambientTranslations);

    try {
      const elements = captureCommandChainPreviewElements(document);
      const projection = createProjection();
      const committed = commitCommandChainPreview(
        elements,
        {
          t: (key) => `<script id=translation-injection>${key}</script>`,
        },
        projection,
      );

      expect(committed).toBe(true);
      expect(elements.commandPreview.ownerDocument).toBe(document);
      expect(elements.commandPreview.textContent).toBe(
        projection.commandPreview,
      );
      expect(elements.aliasPreview.textContent).toBe(
        projection.generatedAlias.content.text,
      );
      expect(elements.generatedAlias.style.display).toBe("");
      expect(elements.label.dataset.i18n).toBe("generated_alias");
      expect(elements.label.textContent).toBe(
        "<script id=translation-injection>generated_alias</script>",
      );
      expect(document.querySelector("img, svg, script")).toBeNull();
      expect(addEventListener).not.toHaveBeenCalled();
      expect(ambientTranslations).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      dom.window.close();
    }
  });

  it.each(["generatedAlias", "aliasPreview", "commandPreview"])(
    "returns null without %s and leaves every surviving preview untouched",
    (missingId) => {
      const { dom, document } = createPreviewDocument();
      document.getElementById(missingId).remove();
      const before = document.body.innerHTML;
      const translate = vi.fn(() => "Translated label");

      const elements = captureCommandChainPreviewElements(document);

      expect(elements).toBeNull();
      expect(
        commitCommandChainPreview(
          elements,
          { t: translate },
          createProjection(),
        ),
      ).toBe(false);
      expect(document.body.innerHTML).toBe(before);
      expect(translate).not.toHaveBeenCalled();
      dom.window.close();
    },
  );

  it.each(["generatedAlias", "aliasPreview"])(
    "commits an empty-state command preview without the optional %s node",
    (missingId) => {
      const { dom, document } = createPreviewDocument();
      document.getElementById("aliasPreview").textContent = "Stale alias";
      document.getElementById("generatedAlias").style.display = "";
      if (missingId === "generatedAlias") {
        const generatedAlias = document.getElementById("generatedAlias");
        generatedAlias.before(document.getElementById("aliasPreview"));
      }
      document.getElementById(missingId).remove();
      const elements = captureCommandChainPreviewElements(document, {
        allowPartialAlias: true,
      });
      const projection = createProjection({
        commandPreview: "Select a key to see the generated command",
        generatedAlias: {
          visible: false,
          content: { type: "literal", text: "" },
        },
      });

      expect(
        commitCommandChainPreview(
          elements,
          { t: (key) => `Translated ${key}` },
          projection,
        ),
      ).toBe(true);
      expect(elements.commandPreview.textContent).toBe(
        projection.commandPreview,
      );
      expect(elements.label.textContent).toBe("Translated generated_alias");
      if (missingId !== "aliasPreview") {
        expect(document.getElementById("aliasPreview").textContent).toBe("");
      }
      if (missingId !== "generatedAlias") {
        expect(document.getElementById("generatedAlias").style.display).toBe(
          "none",
        );
      }
      dom.window.close();
    },
  );

  it("commits all mandatory preview values when the label is absent", () => {
    const { dom, document } = createPreviewDocument({ includeLabel: false });
    const elements = captureCommandChainPreviewElements(document);
    const translate = vi.fn(() => {
      throw new Error("the optional label must not be translated");
    });
    const projection = createProjection({
      commandPreview: 'F2 "FireAll"',
      generatedAlias: {
        visible: false,
        content: { type: "literal", text: "Retained alias text" },
      },
    });

    expect(elements).toMatchObject({ label: null });
    expect(
      commitCommandChainPreview(elements, { t: translate }, projection),
    ).toBe(true);
    expect(elements.commandPreview.textContent).toBe('F2 "FireAll"');
    expect(elements.aliasPreview.textContent).toBe("Retained alias text");
    expect(elements.generatedAlias.style.display).toBe("none");
    expect(translate).not.toHaveBeenCalled();
    dom.window.close();
  });

  it("materializes a translated diagnostic with fallback options as inert text", () => {
    const { dom, document } = createPreviewDocument();
    const elements = captureCommandChainPreviewElements(document);
    const translate = vi.fn((key, options) =>
      key === "error_generating_alias_preview"
        ? `<img id=diagnostic-injection>${options.defaultValue}</img>`
        : `Translated ${key}`,
    );
    const projection = createProjection({
      generatedAlias: {
        visible: true,
        content: {
          type: "translation",
          key: "error_generating_alias_preview",
          options: { defaultValue: "Error generating alias preview" },
        },
      },
    });

    expect(
      commitCommandChainPreview(elements, { t: translate }, projection),
    ).toBe(true);
    expect(translate).toHaveBeenNthCalledWith(
      1,
      "error_generating_alias_preview",
      { defaultValue: "Error generating alias preview" },
    );
    expect(translate).toHaveBeenNthCalledWith(2, "generated_alias");
    expect(elements.aliasPreview.textContent).toBe(
      "<img id=diagnostic-injection>Error generating alias preview</img>",
    );
    expect(document.getElementById("diagnostic-injection")).toBeNull();
    dom.window.close();
  });

  it("does not partially mutate previews when alias translation fails", () => {
    const { dom, document } = createPreviewDocument();
    const elements = captureCommandChainPreviewElements(document);
    const before = document.body.innerHTML;
    const projection = createProjection({
      generatedAlias: {
        visible: true,
        content: {
          type: "translation",
          key: "error_generating_alias_preview",
          options: { defaultValue: "Error generating alias preview" },
        },
      },
    });

    expect(() =>
      commitCommandChainPreview(
        elements,
        {
          t(key) {
            throw new Error(`translation unavailable: ${key}`);
          },
        },
        projection,
      ),
    ).toThrow("translation unavailable: error_generating_alias_preview");
    expect(document.body.innerHTML).toBe(before);
    dom.window.close();
  });

  it("does not partially mutate previews when label translation fails", () => {
    const { dom, document } = createPreviewDocument();
    const elements = captureCommandChainPreviewElements(document);
    const before = document.body.innerHTML;

    expect(() =>
      commitCommandChainPreview(
        elements,
        {
          t() {
            throw new Error("translation unavailable");
          },
        },
        createProjection(),
      ),
    ).toThrow("translation unavailable");
    expect(document.body.innerHTML).toBe(before);
    dom.window.close();
  });
});
