import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import CommandLibraryUI from "../../../src/js/components/ui/CommandLibraryUI.js";
import { createUIComponentFixture } from "../../fixtures/ui/component.js";

describe("CommandLibraryUI Toast Tests", () => {
  let fixture, component;

  beforeEach(() => {
    fixture = createUIComponentFixture(CommandLibraryUI, {
      constructorArgs: {
        service: null,
        ui: null,
        modalManager: null,
      },
      i18n: {
        t: vi.fn((key) => {
          if (key === "template_system_coming_soon")
            return "Template system coming soon";
          return key;
        }),
      },
      document: {
        getElementById: vi.fn(() => null),
        createElement: vi.fn(() => ({
          value: "",
          textContent: "",
          innerHTML: "",
          className: "",
          id: "",
          style: {},
          classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          click: vi.fn(),
          focus: vi.fn(),
          blur: vi.fn(),
          appendChild: vi.fn(),
          removeChild: vi.fn(),
          querySelector: vi.fn(),
          setAttribute: vi.fn(),
          removeAttribute: vi.fn(),
        })),
        createDocumentFragment: vi.fn(() => ({
          appendChild: vi.fn(),
          querySelector: vi.fn(),
          querySelectorAll: vi.fn(() => []),
        })),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
          createElement: vi.fn(() => ({
            value: "",
            textContent: "",
            innerHTML: "",
            className: "",
            id: "",
            style: {},
            classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            click: vi.fn(),
            focus: vi.fn(),
            blur: vi.fn(),
            appendChild: vi.fn(),
            removeChild: vi.fn(),
            querySelector: vi.fn(),
            setAttribute: vi.fn(),
            removeAttribute: vi.fn(),
          })),
        },
      },
      autoInit: false,
    });

    component = fixture.component;

    // Now initialize the component
    component.init();
  });

  afterEach(() => {
    if (component && component.destroy) {
      component.destroy();
    }
    vi.restoreAllMocks();
  });

  describe("UIComponentBase integration", () => {
    it("should inherit showToast method from UIComponentBase", () => {
      expect(typeof component.showToast).toBe("function");
    });

    it("uses its injected localization capability", () => {
      expect(typeof component.i18n.t).toBe("function");
    });
  });
});
