import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import AliasBrowserUI from "../../../src/js/components/ui/AliasBrowserUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createUIComponentFixture } from "../../fixtures/ui/component.js";

function createDocumentMock() {
  const aliasGrid = {
    querySelectorAll: vi.fn(() => []),
    querySelector: vi.fn(() => null),
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    innerHTML: "",
    style: {},
  };

  const duplicateAliasInput = {
    value: "copyAlias",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  const duplicateAliasConfirmBtn = {
    disabled: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  const duplicateAliasValidation = {
    textContent: "",
    style: { display: "none" },
  };

  const duplicateModal = {
    querySelector: vi.fn((selector) => {
      if (selector === "#duplicateAliasNameInput") return duplicateAliasInput;
      if (selector === "#confirmDuplicateAliasBtn")
        return duplicateAliasConfirmBtn;
      if (selector === "#duplicateAliasValidation")
        return duplicateAliasValidation;
      return null;
    }),
  };

  return {
    getElementById: vi.fn((id) => {
      if (id === "aliasGrid") {
        return aliasGrid;
      }
      if (id === "aliasDuplicateModal") {
        return duplicateModal;
      }
      return null;
    }),
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
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
      querySelector: vi.fn(),
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
  };
}

const noopModalManager = {
  show: vi.fn(),
  hide: vi.fn(),
};

describe("AliasBrowserUI Duplicate Flow", () => {
  let fixture, component;

  const adoptAliases = (aliases, { authorityEpoch = 1, revision = 1 } = {}) => {
    const profile = {
      name: "Captain",
      currentEnvironment: "alias",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases,
    };
    component._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch,
        revision,
        currentProfile: "captain",
        currentEnvironment: "alias",
        currentProfileData: profile,
        profiles: { captain: profile },
      }),
    );
  };

  beforeEach(() => {
    fixture = createUIComponentFixture(AliasBrowserUI, {
      i18n: {
        t: vi.fn((key, params) => {
          if (key === "alias_duplicated_successfully")
            return `Alias copied from "${params.from}" to "${params.to}"`;
          if (key === "duplicate_failed_error")
            return `Failed to duplicate alias "${params.sourceName}": ${params.reason}`;
          return key;
        }),
      },
      document: createDocumentMock(),
      autoInit: false,
    });

    component = fixture.component;
    component.modalManager = noopModalManager;
    component.confirmDialog = { confirm: vi.fn(() => Promise.resolve(true)) };
    adoptAliases({
      testAlias: { commands: ["FireAll"], description: "desc" },
    });

    fixture.mockResponse(
      "alias:duplicate-with-name",
      async ({ sourceName, newName }) => ({
        success: true,
        message: "alias_duplicated_successfully",
        params: { from: sourceName, to: newName },
      }),
    );

    component.init();
  });

  afterEach(() => {
    fixture.cleanup();
    vi.restoreAllMocks();
  });

  it("duplicates alias using modal name and refreshes cache", async () => {
    const renderSpy = vi.spyOn(component, "render").mockResolvedValue();
    await component.duplicateAlias("testAlias");

    const modal = fixture.document.getElementById("aliasDuplicateModal");
    const confirmBtn = modal.querySelector("#confirmDuplicateAliasBtn");
    await confirmBtn.onclick();

    expect(component.cache.aliases).toHaveProperty("testAlias_copy");
    expect(renderSpy).toHaveBeenCalled();
  });

  it("drops malformed alias records while retaining valid aliases", async () => {
    adoptAliases(
      {
        validAlias: {
          commands: ["FireAll", { text: "Text-only command" }],
          description: "valid",
        },
        malformedAlias: { commands: [42], description: "invalid" },
      },
      { revision: 2 },
    );

    await component.render();

    expect(component.cache.aliases).toEqual({
      validAlias: {
        commands: ["FireAll", { text: "Text-only command" }],
        description: "valid",
      },
    });
    expect(fixture.document.getElementById("aliasGrid").innerHTML).toContain(
      "validAlias",
    );
    expect(
      fixture.document.getElementById("aliasGrid").innerHTML,
    ).not.toContain("malformedAlias");
  });

  it("renders the pre-ready fallback without querying alias state", async () => {
    component.cache.dataState = null;
    component.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await component.render();

    expect(component.cache.aliases).toEqual({});
    expect(fixture.document.getElementById("aliasGrid").innerHTML).toContain(
      "no_aliases_defined",
    );
    expect(component.request).not.toHaveBeenCalled();
  });

  it("replaces aliases when a new snapshot authority is accepted", async () => {
    await component.render();
    expect(component.cache.aliases).toHaveProperty("testAlias");

    adoptAliases(
      { replacementAlias: { commands: ["Target_Enemy_Near"] } },
      { authorityEpoch: 2, revision: 0 },
    );
    await component.render();

    expect(component.cache.aliases).toEqual({
      replacementAlias: { commands: ["Target_Enemy_Near"] },
    });
    expect(fixture.document.getElementById("aliasGrid").innerHTML).toContain(
      "replacementAlias",
    );
    expect(
      fixture.document.getElementById("aliasGrid").innerHTML,
    ).not.toContain("testAlias");
  });
});
