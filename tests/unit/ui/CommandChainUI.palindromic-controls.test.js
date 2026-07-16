import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import CommandChainUI from "../../../src/js/components/ui/CommandChainUI.js";
import i18next from "i18next";

describe("CommandChainUI Palindromic Controls", () => {
  let ui, mockDocument, mockEventBus, mockUI, dom;

  beforeEach(async () => {
    // Set up DOM environment
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <div id="commandList"></div>
          <div id="chainTitle"></div>
          <div id="commandPreview"></div>
          <div id="commandCount"></div>
          <div id="emptyState"></div>
          <div id="generatedAlias"></div>
          <div id="aliasPreview"></div>
          <div id="stabilizeExecutionOrderBtn"></div>
          <div id="copyAliasBtn"></div>
          <div id="copyPreviewBtn"></div>
          <div id="bindsetSelector"></div>
          <div id="bindsetDropdown"></div>
        </body>
      </html>
    `,
      { url: "http://localhost" },
    );

    // Mock document and UI
    mockDocument = dom.window.document;
    const createElement = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = vi.fn((tagName) => {
      return createElement(tagName);
    });

    mockUI = {
      showToast: vi.fn(),
    };

    // Create a mock event bus that properly handles the RPC pattern
    const eventListeners = new Map();
    const rpcListeners = new Map();

    mockEventBus = {
      hasListeners: vi.fn((topic) => {
        const handlers = rpcListeners.get(topic);
        return (handlers?.length ?? handlers?.size ?? 0) > 0;
      }),
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
        // Remove from the mock RPC readiness registry
        if (rpcListeners.has(topic)) {
          const handlers = rpcListeners.get(topic);
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      }),
      // Stub DOM delegation used by CommandChainUI so init doesn't error in unit tests
      onDom: vi.fn(() => () => {}),
      onDomDebounced: vi.fn(() => () => {}),
      emit: vi.fn((topic, data) => {
        // Handle RPC pattern: when code emits rpc:topic, respond appropriately
        if (topic.startsWith("rpc:")) {
          const actualTopic = topic.substring(4); // Remove 'rpc:' prefix
          const { requestId, replyTopic } = data;

          // Simulate async response
          setTimeout(() => {
            let result;

            if (actualTopic === "command-chain:update-commands") {
              result = { success: true };
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
          eventListeners.get(topic).forEach((listener) => {
            try {
              listener(data);
            } catch (error) {
              console.error("Event listener error:", error);
            }
          });
        }
      }),
      request: vi.fn((endpoint) => {
        if (endpoint === "command:find-definition") {
          return Promise.resolve({ categoryId: "tray", customizable: false });
        }
        if (endpoint === "command:get-warning") {
          return Promise.resolve(null);
        }
        if (endpoint === "data:update-profile") {
          return Promise.resolve({ success: true });
        }
        if (endpoint === "command:get-empty-state-info") {
          return Promise.resolve({
            title: "Test Title",
            preview: "Test Preview",
            emptyTitle: "Test Empty",
            icon: "fas fa-test",
          });
        }
        return Promise.resolve(null);
      }),
      requestResponse: vi.fn((endpoint, handler) => {
        // Store handler for request-response pattern
        if (!rpcListeners.has(endpoint)) {
          rpcListeners.set(endpoint, []);
        }
        rpcListeners.get(endpoint).push(handler);
      }),
      respond: vi.fn((endpoint, handler) => {
        // Store endpoint response handler
        if (!rpcListeners.has(endpoint)) {
          rpcListeners.set(endpoint, []);
        }
        rpcListeners.get(endpoint).push(handler);
      }),
    };

    // enrichForDisplay uses the low-level request/response helper directly.
    // Register a marker so its parser request can complete through the mock bus.
    rpcListeners.set("rpc:parser:parse-command-string", new Set([vi.fn()]));

    // Initialize i18next
    await i18next.init({
      lng: "en",
      fallbackLng: ["en"],
      returnEmptyString: false,
      resources: {
        en: { translation: {} },
      },
    });

    ui = new CommandChainUI({
      eventBus: mockEventBus,
      ui: mockUI,
      document: mockDocument,
      i18n: i18next,
    });

    // ComponentBase.request routes through the low-level RPC helper. These unit
    // tests exercise CommandChainUI in isolation, so keep endpoint behavior local.
    ui.request = mockEventBus.request;
    ui.render = vi.fn().mockResolvedValue(undefined);

    // Set up cache data
    ui.cache = {
      currentEnvironment: "ground",
      currentProfile: "profile-1",
      selectedKey: "F1",
      selectedAlias: null,
      activeBindset: "Primary Bindset",
      preferences: {
        bindsetsEnabled: false,
        bindToAliasMode: false,
      },
    };
  });

  afterEach(() => {
    if (ui) {
      ui.onDestroy?.();
    }
    dom?.window?.close?.();
  });

  describe("Palindromic Controls Display", () => {
    it("should show an active palindromic toggle for TrayExec commands when stabilization is enabled", async () => {
      const element = await ui.createCommandElement(
        "+TrayExecByTray 1 0",
        0,
        3,
        null,
        null,
        true,
      );
      const palindromicButton = element.querySelector(
        ".btn-palindromic-toggle",
      );

      expect(palindromicButton).toBeTruthy();
      expect(palindromicButton.classList.contains("active")).toBe(true);
      expect(palindromicButton.dataset.commandIndex).toBe("0");
      expect(element.querySelector(".btn-placement-toggle")).toBeFalsy();
    });

    it("should not show palindromic controls for non-TrayExec commands", async () => {
      const element = await ui.createCommandElement("Target_Enemy_Near", 0, 3);

      expect(element.querySelector(".btn-palindromic-toggle")).toBeFalsy();
      expect(element.querySelector(".btn-placement-toggle")).toBeFalsy();
    });

    it("should not show palindromic controls when stabilization is disabled", async () => {
      const element = await ui.createCommandElement(
        "+TrayExecByTray 1 0",
        0,
        3,
      );

      expect(element.querySelector(".btn-palindromic-toggle")).toBeFalsy();
      expect(element.querySelector(".btn-placement-toggle")).toBeFalsy();
    });

    it("should show active placement control for an excluded command in the pivot group", async () => {
      const richCommand = {
        command: "+TrayExecByTray 1 0",
        palindromicGeneration: false,
        placement: "in-pivot-group",
      };

      const element = await ui.createCommandElement(
        richCommand,
        0,
        3,
        null,
        null,
        true,
      );
      const palindromicButton = element.querySelector(
        ".btn-palindromic-toggle",
      );
      const placementButton = element.querySelector(".btn-placement-toggle");

      expect(palindromicButton).toBeTruthy();
      expect(palindromicButton.classList.contains("active")).toBe(false);
      expect(placementButton).toBeTruthy();
      expect(placementButton.classList.contains("active")).toBe(true);
      expect(placementButton.dataset.commandIndex).toBe("0");
    });

    it("should hide placement control while a command is included in the palindrome", async () => {
      const element = await ui.createCommandElement(
        "+TrayExecByTray 1 0",
        0,
        3,
        null,
        null,
        true,
      );

      expect(element.querySelector(".btn-palindromic-toggle")).toBeTruthy();
      expect(element.querySelector(".btn-placement-toggle")).toBeFalsy();
    });
  });

  describe("Palindromic Control Event Handlers", () => {
    it("should exclude an included command when its palindromic toggle is clicked", async () => {
      const commands = ["+TrayExecByTray 1 0", "Target_Enemy_Near"];
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands);
      ui.updateCommandPalindromicSetting = vi.fn().mockResolvedValue(undefined);

      await ui.setupEventListeners();

      const handlerCall = mockEventBus.onDom.mock.calls.find(
        (call) => call[2] === "commandchain-palindromic-toggle",
      );
      const handler = handlerCall?.[3];
      const button = { dataset: { commandIndex: "0" } };
      const target = {
        closest: vi.fn((selector) =>
          selector === ".btn-palindromic-toggle" ? button : null,
        ),
      };
      const event = {
        target,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      expect(handler).toEqual(expect.any(Function));
      await handler(event);

      expect(target.closest).toHaveBeenCalledWith(".btn-palindromic-toggle");
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(ui.updateCommandPalindromicSetting).toHaveBeenCalledWith(
        0,
        "palindromicGeneration",
        false,
      );
    });

    it("should move an excluded command into the pivot group when its placement toggle is clicked", async () => {
      const commands = [
        {
          command: "+TrayExecByTray 1 0",
          palindromicGeneration: false,
          placement: "before-pre-pivot",
        },
      ];
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands);
      ui.updateCommandPalindromicSetting = vi.fn().mockResolvedValue(undefined);

      await ui.setupEventListeners();

      const handlerCall = mockEventBus.onDom.mock.calls.find(
        (call) => call[2] === "commandchain-placement-toggle",
      );
      const handler = handlerCall?.[3];
      const button = { dataset: { commandIndex: "0" } };
      const target = {
        closest: vi.fn((selector) =>
          selector === ".btn-placement-toggle" ? button : null,
        ),
      };
      const event = {
        target,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      expect(handler).toEqual(expect.any(Function));
      await handler(event);

      expect(target.closest).toHaveBeenCalledWith(".btn-placement-toggle");
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(ui.updateCommandPalindromicSetting).toHaveBeenCalledWith(
        0,
        "placement",
        "in-pivot-group",
      );
    });
  });

  describe("updateCommandPalindromicSetting", () => {
    it("should convert string commands to rich objects when updating palindromic settings", async () => {
      // Mock commands
      const commands = ["+TrayExecByTray 1 0", "Target_Enemy_Near"];

      // Mock getCommandsForCurrentSelection method
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands);

      mockEventBus.request.mockResolvedValue({ success: true });

      await ui.updateCommandPalindromicSetting(
        0,
        "palindromicGeneration",
        false,
      );

      expect(mockEventBus.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "profile-1",
        modify: {
          builds: {
            ground: {
              keys: {
                F1: [
                  {
                    command: "+TrayExecByTray 1 0",
                    palindromicGeneration: false,
                  },
                  "Target_Enemy_Near",
                ],
              },
            },
          },
        },
      });
    });

    it("should store placement when converting a string command to a rich object", async () => {
      const commands = ["+TrayExecByTray 1 0", "Target_Enemy_Near"];
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands);
      mockEventBus.request.mockResolvedValue({ success: true });

      await ui.updateCommandPalindromicSetting(
        0,
        "placement",
        "in-pivot-group",
      );

      expect(mockEventBus.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "profile-1",
        modify: {
          builds: {
            ground: {
              keys: {
                F1: [
                  {
                    command: "+TrayExecByTray 1 0",
                    placement: "in-pivot-group",
                  },
                  "Target_Enemy_Near",
                ],
              },
            },
          },
        },
      });
    });

    it("should update existing rich command objects", async () => {
      const commands = [
        {
          command: "+TrayExecByTray 1 0",
          palindromicGeneration: false,
          placement: "before-pre-pivot",
        },
        "Target_Enemy_Near",
      ];

      // Mock getCommandsForCurrentSelection method
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands);

      mockEventBus.request.mockResolvedValue({ success: true });

      await ui.updateCommandPalindromicSetting(
        0,
        "placement",
        "in-pivot-group",
      );

      expect(mockEventBus.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "profile-1",
        modify: {
          builds: {
            ground: {
              keys: {
                F1: [
                  {
                    command: "+TrayExecByTray 1 0",
                    palindromicGeneration: false,
                    placement: "in-pivot-group",
                  },
                  "Target_Enemy_Near",
                ],
              },
            },
          },
        },
      });
    });

    it("should handle invalid command indices gracefully", async () => {
      const commands = ["+TrayExecByTray 1 0"];

      // Mock getCommandsForCurrentSelection method
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands);

      await ui.updateCommandPalindromicSetting(
        5,
        "palindromicGeneration",
        false,
      );

      expect(mockEventBus.request).not.toHaveBeenCalledWith(
        "data:update-profile",
        expect.any(Object),
      );
    });

    it("should explicitly include a command when palindromicGeneration is set to true", async () => {
      const commands = [
        {
          command: "+TrayExecByTray 1 0",
          palindromicGeneration: false,
          placement: "before-pre-pivot",
        },
      ];

      // Mock getCommandsForCurrentSelection method
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands);

      mockEventBus.request.mockResolvedValue({ success: true });

      await ui.updateCommandPalindromicSetting(
        0,
        "palindromicGeneration",
        true,
      );

      expect(mockEventBus.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "profile-1",
        modify: {
          builds: {
            ground: {
              keys: {
                F1: [
                  {
                    command: "+TrayExecByTray 1 0",
                    palindromicGeneration: true,
                    placement: "before-pre-pivot",
                  },
                ],
              },
            },
          },
        },
      });
    });
  });

  describe("Lazy Rich Object Conversion", () => {
    it("should only convert commands to rich objects when user customizes them", async () => {
      // Start with simple string commands
      const commands = ["+TrayExecByTray 1 0", "+TrayExecByTray 1 1"];

      // Mock getCommandsForCurrentSelection method
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands);

      mockEventBus.request.mockResolvedValue({ success: true });

      // Before customization, commands should remain strings
      expect(commands[0]).toBe("+TrayExecByTray 1 0");
      expect(typeof commands[0]).toBe("string");

      // After user customizes (excludes from palindrome), convert to rich object
      await ui.updateCommandPalindromicSetting(
        0,
        "palindromicGeneration",
        false,
      );

      expect(mockEventBus.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "profile-1",
        modify: {
          builds: {
            ground: {
              keys: {
                F1: [
                  {
                    command: "+TrayExecByTray 1 0",
                    palindromicGeneration: false,
                  },
                  "+TrayExecByTray 1 1",
                ],
              },
            },
          },
        },
      });

      // Second command should remain as string until user customizes it
      expect(typeof commands[1]).toBe("string");
    });
  });
});
