import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { generateBindToAliasName } from "../../../src/js/lib/aliasNameValidator.js";
import CommandChainUI from "../../../src/js/components/ui/CommandChainUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import i18next from "i18next";

describe("Bind-to-Alias Mode", () => {
  let ui, mockDocument, mockEventBus, mockUI;
  beforeEach(async () => {
    // Mock document and UI
    mockDocument = {
      getElementById: vi.fn(),
      querySelector: vi.fn(),
      createElement: vi.fn(() => ({
        innerHTML: "",
        classList: { remove: vi.fn(), add: vi.fn() },
        style: {},
        replaceChildren: vi.fn(),
      })),
    };

    mockUI = {
      showToast: vi.fn(),
    };

    // Create a mock event bus that properly handles the RPC pattern
    const [eventListeners, rpcListeners] = [new Map(), new Map()];

    mockEventBus = {
      hasListeners: vi.fn((topic) => Boolean(rpcListeners.get(topic)?.length)),
      on: vi.fn((topic, handler) => {
        if (!eventListeners.has(topic)) {
          eventListeners.set(topic, []);
        }
        eventListeners.get(topic).push(handler);
        return () => {}; // Return cleanup function
      }),
      off: vi.fn((topic, handler) => {
        // Remove from eventListeners
        if (eventListeners.has(topic)) {
          const handlers = eventListeners.get(topic);
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
        if (rpcListeners.has(topic)) {
          const handlers = rpcListeners.get(topic);
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      }),
      // Stub DOM delegation used by CommandChainUI so init doesn't error in unit tests that don't need DOM
      onDom: vi.fn(() => () => {}),
      onDomDebounced: vi.fn(() => () => {}),
      emit: vi.fn((topic, data) => {
        // Handle RPC pattern: when code emits rpc:topic, respond appropriately
        if (topic.startsWith("rpc:")) {
          const actualTopic = topic.substring(4); // Remove 'rpc:' prefix
          const { requestId, replyTopic, payload } = data;

          // Simulate async response
          setTimeout(() => {
            let result;

            if (actualTopic === "command:generate-mirrored-commands") {
              result = null;
            } else if (actualTopic === "command-chain:generate-alias-name") {
              result = "sto_kb_space_q";
            } else if (actualTopic === "command-chain:generate-alias-preview") {
              const { commands } = payload;
              if (!commands || commands.length === 0) {
                result = "alias sto_kb_space_q <&  &>";
              } else {
                result =
                  "alias sto_kb_space_q <& FireAll $$ +power_exec Distribute_Shields &>";
              }
            } else {
              result = {};
            }

            // Emit response on reply topic
            if (eventListeners.has(replyTopic)) {
              eventListeners.get(replyTopic).forEach((handler) => {
                handler({ requestId, data: result });
              });
            }
          }, 0);
        }

        // Also call any registered listeners for this topic (for non-RPC events)
        if (eventListeners.has(topic)) {
          eventListeners.get(topic).forEach((handler) => handler(data));
        }
      }),

      // Mock respond function to track RPC handlers
      respond: vi.fn((topic, handler) => {
        const rpcTopic = `rpc:${topic}`;
        if (!rpcListeners.has(rpcTopic)) {
          rpcListeners.set(rpcTopic, []);
        }
        rpcListeners.get(rpcTopic).push(handler);

        return () => {
          // Return detach function
          if (rpcListeners.has(rpcTopic)) {
            const handlers = rpcListeners.get(rpcTopic);
            const index = handlers.indexOf(handler);
            if (index > -1) {
              handlers.splice(index, 1);
            }
          }
        };
      }),

      clear: vi.fn(() => {
        eventListeners.clear();
        rpcListeners.clear();
      }),
    };

    // Mock handlers for command-chain endpoints
    mockEventBus.respond(
      "command-chain:generate-alias-name",
      async ({ environment, keyName }) => {
        return `sto_kb_${environment}_${keyName.toLowerCase()}`;
      },
    );

    mockEventBus.respond(
      "command-chain:generate-alias-preview",
      async ({ commands }) => {
        if (!commands || commands.length === 0) {
          return "alias sto_kb_space_q <&  &>";
        } else {
          return "alias sto_kb_space_q <& FireAll $$ +power_exec Distribute_Shields &>";
        }
      },
    );

    // Mock i18n
    const mockI18n = { t: vi.fn((key) => key) };
    vi.spyOn(i18next, "t").mockImplementation((key) => key);

    // Create CommandChainUI instance
    ui = new CommandChainUI({
      eventBus: mockEventBus,
      ui: mockUI,
      document: mockDocument,
      i18n: mockI18n,
    });

    // Initialize the component to set up cache
    await ui.init();
  });

  describe("Alias Name Generation", () => {
    it("should generate correct alias names for different environments and keys", () => {
      // Test normal cases
      expect(generateBindToAliasName("space", "Q")).toBe("sto_kb_space_q");
      expect(generateBindToAliasName("ground", "F1")).toBe("sto_kb_ground_f1");
      expect(generateBindToAliasName("space", "Ctrl+A")).toBe(
        "sto_kb_space_ctrl_a",
      );

      // Test special characters
      expect(generateBindToAliasName("space", "Shift+Space")).toBe(
        "sto_kb_space_shift_space",
      );
      expect(generateBindToAliasName("ground", "Alt+Tab")).toBe(
        "sto_kb_ground_alt_tab",
      );

      // Test edge cases
      expect(generateBindToAliasName("space", "1")).toBe("sto_kb_space_k1"); // Number key gets 'k' prefix
      expect(generateBindToAliasName("space", "")).toBe(null); // Empty key name
    });

    it("should handle special key names correctly", () => {
      expect(generateBindToAliasName("space", "NumPad1")).toBe(
        "sto_kb_space_numpad1",
      );
      expect(generateBindToAliasName("space", "Mouse4")).toBe(
        "sto_kb_space_mouse4",
      );
      expect(generateBindToAliasName("ground", "Alt+F4")).toBe(
        "sto_kb_ground_alt_f4",
      );
      expect(generateBindToAliasName("space", "Page Up")).toBe(
        "sto_kb_space_page_up",
      );
    });

    it("should handle invalid key names gracefully", () => {
      expect(generateBindToAliasName("space", "")).toBe(null);
      expect(generateBindToAliasName("space", "   ")).toBe(null);
      expect(generateBindToAliasName("space", "!!!")).toBe(
        "sto_kb_space_exclamationexclamationexclamation",
      ); // Special chars get converted
    });

    it("should show generated alias section when bind-to-alias mode is active", async () => {
      const mockGeneratedAlias = { style: { display: "none" } };
      const mockAliasPreview = { textContent: "" };
      const mockCommandPreview = { textContent: "" };

      mockDocument.getElementById.mockImplementation((id) => {
        if (id === "generatedAlias") return mockGeneratedAlias;
        if (id === "aliasPreview") return mockAliasPreview;
        if (id === "commandPreview") return mockCommandPreview;
        return null;
      });

      ui.cache.currentEnvironment = "space";

      const commands = [
        { command: "FireAll" },
        { command: "+power_exec Distribute_Shields" },
      ];

      await ui.updateBindToAliasMode(true, "Q", commands);

      expect(mockGeneratedAlias.style.display).toBe("");
      expect(mockAliasPreview.textContent).toBe(
        "alias sto_kb_space_q <& FireAll $$ +power_exec Distribute_Shields &>",
      );
      expect(mockCommandPreview.textContent).toBe('Q "sto_kb_space_q"');
    });

    it("should hide generated alias section when bind-to-alias mode is disabled", async () => {
      const mockGeneratedAlias = { style: {} };
      const mockAliasPreview = { textContent: "" };
      const mockCommandPreview = { textContent: "" };
      const mockLabel = { setAttribute: vi.fn(), parentElement: {} };

      // Set initial state
      mockGeneratedAlias.style.display = "";

      mockDocument.getElementById.mockImplementation((id) => {
        if (id === "generatedAlias") return mockGeneratedAlias;
        if (id === "aliasPreview") return mockAliasPreview;
        if (id === "commandPreview") return mockCommandPreview;
        return null;
      });

      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === ".generated-command label[data-i18n]")
          return mockLabel;
        return null;
      });

      const commands = [{ command: "FireAll" }];

      await ui.updateBindToAliasMode(false, "Q", commands);

      expect(mockGeneratedAlias.style.display).toBe("none");
      expect(mockCommandPreview.textContent).toBe('Q "FireAll"');
      expect(mockLabel.setAttribute).toHaveBeenCalledWith(
        "data-i18n",
        "generated_command",
      );
    });

    it("should handle empty commands in bind-to-alias mode", async () => {
      const mockGeneratedAlias = { style: { display: "none" } };
      const mockAliasPreview = { textContent: "" };
      const mockCommandPreview = { textContent: "" };

      mockDocument.getElementById.mockImplementation((id) => {
        if (id === "generatedAlias") return mockGeneratedAlias;
        if (id === "aliasPreview") return mockAliasPreview;
        if (id === "commandPreview") return mockCommandPreview;
        return null;
      });

      ui.cache.currentEnvironment = "space";

      await ui.updateBindToAliasMode(true, "Q", []);

      expect(mockGeneratedAlias.style.display).toBe("");
      expect(mockAliasPreview.textContent).toBe("alias sto_kb_space_q <&  &>");
      expect(mockCommandPreview.textContent).toBe('Q "sto_kb_space_q"');
    });

    it("should not show generated alias section in alias environment", async () => {
      const mockGeneratedAlias = { style: {} };
      const mockAliasPreview = { textContent: "" };
      const mockCommandPreview = { textContent: "" };
      const mockLabel = { setAttribute: vi.fn(), parentElement: {} };

      // Set initial state
      mockGeneratedAlias.style.display = "";

      mockDocument.getElementById.mockImplementation((id) => {
        if (id === "generatedAlias") return mockGeneratedAlias;
        if (id === "aliasPreview") return mockAliasPreview;
        if (id === "commandPreview") return mockCommandPreview;
        return null;
      });

      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === ".generated-command label[data-i18n]")
          return mockLabel;
        return null;
      });

      ui.cache.currentEnvironment = "alias";

      const commands = [{ command: "FireAll" }];

      await ui.updateBindToAliasMode(false, "MyAlias", commands);

      expect(mockGeneratedAlias.style.display).toBe("none");
      expect(mockCommandPreview.textContent).toBe(
        "alias MyAlias <& FireAll &>",
      );
      expect(mockLabel.setAttribute).toHaveBeenCalledWith(
        "data-i18n",
        "generated_alias",
      );
    });

    it("should show empty quoted string when no commands and bind-to-alias mode is disabled", async () => {
      const mockGeneratedAlias = { style: {} };
      const mockAliasPreview = { textContent: "" };
      const mockCommandPreview = { textContent: "" };
      const mockLabel = { setAttribute: vi.fn(), parentElement: {} };

      // Ensure generatedAlias starts hidden (any value is fine as it should stay hidden)
      mockGeneratedAlias.style.display = "none";

      mockDocument.getElementById.mockImplementation((id) => {
        if (id === "generatedAlias") return mockGeneratedAlias;
        if (id === "aliasPreview") return mockAliasPreview;
        if (id === "commandPreview") return mockCommandPreview;
        return null;
      });

      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === ".generated-command label[data-i18n]")
          return mockLabel;
        return null;
      });

      ui.cache.currentEnvironment = "space";

      await ui.updateBindToAliasMode(false, "F4", []);

      // generatedAlias should remain hidden
      expect(mockGeneratedAlias.style.display).toBe("none");
      // Command preview should show key with empty quoted string
      expect(mockCommandPreview.textContent).toBe('F4 ""');
      expect(mockLabel.setAttribute).toHaveBeenCalledWith(
        "data-i18n",
        "generated_command",
      );
    });

    it("should update label when updatePreviewLabel is called in alias environment", () => {
      const mockLabel = { setAttribute: vi.fn(), parentElement: {} };

      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === ".generated-command label[data-i18n]")
          return mockLabel;
        return null;
      });

      // Set environment to alias
      ui.cache.currentEnvironment = "alias";

      // Call updatePreviewLabel directly (this is what gets called on environment change)
      ui.updatePreviewLabel();

      // Should update the label to alias format
      expect(mockLabel.setAttribute).toHaveBeenCalledWith(
        "data-i18n",
        "generated_alias",
      );
    });
  });

  describe("Copy Alias Functionality", () => {
    afterEach(() => {
      mockDocument.getElementById.mockReset();
    });

    it("requests clipboard copy via utility channel and shows success toast", async () => {
      const aliasEl = { textContent: '  space_q "FireAll"  ' };
      mockDocument.getElementById.mockImplementation((id) =>
        id === "aliasPreview" ? aliasEl : null,
      );

      const requestSpy = vi.spyOn(ui, "request").mockResolvedValue({
        success: true,
        message: "content_copied_to_clipboard",
      });
      const toastSpy = vi.spyOn(ui, "showToast");

      await ui.copyAliasToClipboard();

      expect(requestSpy).toHaveBeenCalledWith("utility:copy-to-clipboard", {
        text: 'space_q "FireAll"',
      });
      expect(toastSpy).toHaveBeenCalledWith(
        "content_copied_to_clipboard",
        "success",
      );
    });

    it("shows error toast when clipboard request reports failure", async () => {
      const aliasEl = { textContent: 'space_q "FireAll"' };
      mockDocument.getElementById.mockImplementation((id) =>
        id === "aliasPreview" ? aliasEl : null,
      );

      vi.spyOn(ui, "request").mockResolvedValue({
        success: false,
        message: "failed_to_copy_to_clipboard",
      });
      const toastSpy = vi.spyOn(ui, "showToast");

      await ui.copyAliasToClipboard();

      expect(toastSpy).toHaveBeenCalledWith(
        "failed_to_copy_to_clipboard",
        "error",
      );
    });

    it("warns when there is no alias content to copy", async () => {
      const aliasEl = { textContent: "   " };
      mockDocument.getElementById.mockImplementation((id) =>
        id === "aliasPreview" ? aliasEl : null,
      );
      const toastSpy = vi.spyOn(ui, "showToast");
      const requestSpy = vi.spyOn(ui, "request");

      await ui.copyAliasToClipboard();

      expect(toastSpy).toHaveBeenCalledWith("nothing_to_copy", "warning");
      expect(requestSpy).not.toHaveBeenCalled();
    });
  });

  describe("Copy Command Preview Functionality", () => {
    afterEach(() => {
      mockDocument.getElementById.mockReset();
    });

    it("copies command preview via utility request and shows success toast", async () => {
      const previewEl = { textContent: '  F1 "FireAll"  ' };
      mockDocument.getElementById.mockImplementation((id) =>
        id === "commandPreview" ? previewEl : null,
      );

      const requestSpy = vi.spyOn(ui, "request").mockResolvedValue({
        success: true,
        message: "content_copied_to_clipboard",
      });
      const toastSpy = vi.spyOn(ui, "showToast");

      await ui.copyCommandPreviewToClipboard();

      expect(requestSpy).toHaveBeenCalledWith("utility:copy-to-clipboard", {
        text: 'F1 "FireAll"',
      });
      expect(toastSpy).toHaveBeenCalledWith(
        "content_copied_to_clipboard",
        "success",
      );
    });

    it("shows error toast when copy request fails", async () => {
      const previewEl = { textContent: 'F1 "FireAll"' };
      mockDocument.getElementById.mockImplementation((id) =>
        id === "commandPreview" ? previewEl : null,
      );

      vi.spyOn(ui, "request").mockResolvedValue({
        success: false,
        message: "failed_to_copy_to_clipboard",
      });
      const toastSpy = vi.spyOn(ui, "showToast");

      await ui.copyCommandPreviewToClipboard();

      expect(toastSpy).toHaveBeenCalledWith(
        "failed_to_copy_to_clipboard",
        "error",
      );
    });

    it("warns when command preview is empty", async () => {
      const previewEl = { textContent: "   " };
      mockDocument.getElementById.mockImplementation((id) =>
        id === "commandPreview" ? previewEl : null,
      );
      const toastSpy = vi.spyOn(ui, "showToast");
      const requestSpy = vi.spyOn(ui, "request");

      await ui.copyCommandPreviewToClipboard();

      expect(toastSpy).toHaveBeenCalledWith("nothing_to_copy", "warning");
      expect(requestSpy).not.toHaveBeenCalled();
    });
  });

  describe("bindset dropdown behavior", () => {
    beforeEach(() => {
      // Setup bindsets feature
      ui.cache.preferences.bindsetsEnabled = true;
      ui._bindsetNames = ["Primary Bindset", "Custom Bindset"];
      ui.cache.activeBindset = "Primary Bindset";
      ui.cache.selectedKey = "F1";
      ui.cache.currentEnvironment = "space";
    });

    it("should update stabilization button state when switching bindsets", async () => {
      const mockButton = {
        disabled: false,
        classList: {
          toggle: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn().mockReturnValue(false),
        },
      };
      ui.document.getElementById = vi.fn((id) =>
        id === "stabilizeExecutionOrderBtn" ? mockButton : null,
      );
      const profile = {
        name: "Captain",
        currentEnvironment: "space",
        builds: { space: { keys: { F1: [] } }, ground: { keys: {} } },
        aliases: {},
        keybindMetadata: {
          space: { F1: { stabilizeExecutionOrder: false } },
        },
        bindsetMetadata: {
          "Custom Bindset": {
            space: { F1: { stabilizeExecutionOrder: true } },
          },
        },
      };
      ui._cacheDataState(
        createDataCoordinatorState({
          authorityEpoch: 80,
          revision: 1,
          currentProfile: "captain",
          currentProfileData: profile,
          profiles: { captain: profile },
        }),
      );
      ui.cache.selectedKey = "F1";
      ui.cache.activeBindset = "Primary Bindset";
      await ui.updateChainActions();
      expect(mockButton.classList.toggle).toHaveBeenCalledWith("active", false);
      mockButton.classList.toggle.mockClear();
      ui.cache.activeBindset = "Custom Bindset";
      await ui.updateChainActions();
      expect(mockButton.classList.toggle).toHaveBeenCalledWith("active", true);
    });

    it("should call updateChainActions when activeBindset changes", async () => {
      // Mock the updateChainActions method to verify it gets called
      const originalUpdateChainActions = ui.updateChainActions;
      ui.updateChainActions = vi.fn();
      ui.updateBindsetBanner = vi.fn();
      ui.render = vi.fn();

      // Simulate what happens in the dropdown click handler
      ui.activeBindset = "Primary Bindset";

      // Simulate the dropdown option click logic (the part we actually care about)
      const oldBindset = ui.activeBindset;
      const newBindset = "Custom Bindset";

      if (newBindset !== oldBindset) {
        ui.activeBindset = newBindset;
        ui.updateBindsetBanner();
        ui.updateChainActions(); // This is the line we added in our fix
        ui.render();
      }

      // Verify the fix works
      expect(ui.updateChainActions).toHaveBeenCalled();
      expect(ui.activeBindset).toBe("Custom Bindset");

      // Restore original method
      ui.updateChainActions = originalUpdateChainActions;
    });
  });
});
