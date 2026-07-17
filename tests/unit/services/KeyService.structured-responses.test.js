import { describe, it, expect, beforeEach, afterEach } from "vitest";
import KeyService from "../../../src/js/components/services/KeyService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("KeyService Structured Response Tests", () => {
  let fixture, service, profileUpdatePayloads;

  beforeEach(async () => {
    fixture = createServiceFixture();
    profileUpdatePayloads = [];

    // Set up request handlers on the fixture's eventBus
    const eventBus = fixture.eventBus;

    // Mock DataCoordinator profile switching
    eventBus.on("rpc:data:switch-profile", ({ replyTopic, payload }) => {
      // Mock profile switching - emit the profile:switched event
      const testProfile = {
        name: "Test Profile",
        builds: {
          space: { keys: {} },
          ground: { keys: {} },
        },
        bindsets: {
          Custom: {
            space: { keys: {} },
            ground: { keys: {} },
          },
        },
      };

      // Emit the event that ComponentBase expects
      eventBus.emit("profile:switched", {
        profileId: payload.profileId,
        profile: testProfile,
        environment: "space",
      });

      // Respond to the request
      eventBus.emit(replyTopic, {
        data: { success: true, profileId: payload.profileId },
      });
    });

    eventBus.on("rpc:data:update-profile", ({ replyTopic, payload }) => {
      profileUpdatePayloads.push(payload);
      // Mock the data update - return success
      const { add, delete: deleteOp, updates } = payload;
      if (updates?.modify?.bindsets) {
        const modifications = updates.modify.bindsets;
        service.cache.profile.bindsets = service.cache.profile.bindsets || {};
        Object.entries(modifications).forEach(([bindsetName, envData]) => {
          if (!service.cache.profile.bindsets[bindsetName]) {
            service.cache.profile.bindsets[bindsetName] = {
              space: { keys: {} },
              ground: { keys: {} },
            };
          }
          Object.entries(envData).forEach(([env, data]) => {
            if (!service.cache.profile.bindsets[bindsetName][env]) {
              service.cache.profile.bindsets[bindsetName][env] = { keys: {} };
            }
            const targetKeys =
              service.cache.profile.bindsets[bindsetName][env].keys;
            Object.entries(data.keys || {}).forEach(([key, value]) => {
              if (value === null) delete targetKeys[key];
              else targetKeys[key] = value;
            });
          });
        });
        eventBus.emit(replyTopic, { data: { success: true } });
        return;
      }
      if (add || deleteOp) {
        // Update the service cache to simulate what DataCoordinator would do
        if (add && add.builds && add.builds.space && add.builds.space.keys) {
          Object.assign(service.cache.keys, add.builds.space.keys);
        }
        if (
          deleteOp &&
          deleteOp.builds &&
          deleteOp.builds.space &&
          deleteOp.builds.space.keys
        ) {
          deleteOp.builds.space.keys.forEach(
            (key) => delete service.cache.keys[key],
          );
        }
        eventBus.emit(replyTopic, { data: { success: true } });
        return;
      }
      eventBus.emit(replyTopic, {
        data: { success: false, error: "invalid_operation" },
      });
    });

    eventBus.on("rpc:selection:select-key", ({ replyTopic }) => {
      eventBus.emit(replyTopic, { data: { success: true } });
    });

    eventBus.on(
      "rpc:parser:parse-command-string",
      ({ replyTopic, payload }) => {
        eventBus.emit(replyTopic, {
          data: { commands: [{ command: payload.commandString }] },
        });
      },
    );

    eventBus.on(
      "rpc:data:generate-unique-key-name",
      ({ replyTopic, payload }) => {
        eventBus.emit(replyTopic, {
          data: `${payload.baseKey}_duplicate_${Date.now()}`,
        });
      },
    );

    service = new KeyService({
      eventBus: eventBus,
      storage: fixture.storage,
      i18n: { t: (key, params) => `${key}:${JSON.stringify(params)}` },
    });
    service.init();

    // Set up a test profile in storage
    const testProfile = {
      name: "Test Profile",
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
      bindsets: {
        Custom: {
          space: { keys: {} },
          ground: { keys: {} },
        },
      },
    };
    fixture.storage.saveProfile("test-profile", testProfile);

    // Use proper profile switching via DataCoordinator
    await service.request("data:switch-profile", { profileId: "test-profile" });

    // Give ComponentBase time to process the profile:switched event
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  afterEach(() => {
    if (service && service.destroy) {
      service.destroy();
    }
  });

  describe("addKey", () => {
    it("should return structured success response for valid key", async () => {
      const result = await service.addKey("F3");

      expect(result).toEqual({
        success: true,
        key: "F3",
        environment: "space",
        bindset: "Primary Bindset",
      });
    });

    it("should return structured error response for invalid key name", async () => {
      const result = await service.addKey("");

      expect(result).toEqual({
        success: false,
        error: "invalid_key_name",
        params: { keyName: "" },
      });
    });

    it("should return structured error response when no profile selected", async () => {
      // Create a new service with no profile to test the no profile case
      const noProfileService = new KeyService({
        eventBus: fixture.eventBus,
        storage: fixture.storage,
        i18n: { t: (key, params) => `${key}:${JSON.stringify(params)}` },
      });
      noProfileService.init();

      const result = await noProfileService.addKey("F3");

      expect(result).toEqual({
        success: false,
        error: "no_profile_selected",
      });

      if (noProfileService && noProfileService.destroy) {
        noProfileService.destroy();
      }
    });

    it("should return structured error response for duplicate key", async () => {
      // Add first key
      await service.addKey("F3");

      // Try to add duplicate
      const result = await service.addKey("F3");

      expect(result).toEqual({
        success: false,
        error: "key_already_exists",
        params: { keyName: "F3" },
      });
    });

    it("should add key directly into a target bindset when provided", async () => {
      const result = await service.addKey("F4", "Custom");

      expect(result).toEqual({
        success: true,
        key: "F4",
        environment: "space",
        bindset: "Custom",
      });
      expect(service.cache.profile.bindsets.Custom.space.keys.F4).toEqual([]);
    });
  });

  describe("deleteKey", () => {
    it("should return structured success response for existing key", async () => {
      // First add a key
      await service.addKey("F3");

      // Then delete it
      const result = await service.deleteKey("F3");

      expect(result).toEqual({
        success: true,
        key: "F3",
        environment: "space",
      });
    });

    it("should return structured error response when no profile selected", async () => {
      // Create a new service with no profile to test the no profile case
      const noProfileService = new KeyService({
        eventBus: fixture.eventBus,
        storage: fixture.storage,
        i18n: { t: (key, params) => `${key}:${JSON.stringify(params)}` },
      });
      noProfileService.init();

      const result = await noProfileService.deleteKey("F3");

      expect(result).toEqual({
        success: false,
        error: "no_profile_selected",
      });

      if (noProfileService && noProfileService.destroy) {
        noProfileService.destroy();
      }
    });

    it("should return structured error response for non-existent key", async () => {
      const result = await service.deleteKey("Z9");

      expect(result).toEqual({
        success: false,
        error: "key_not_found",
        params: { keyName: "Z9" },
      });
    });
  });

  describe("duplicateKey", () => {
    it("should preserve strings and assign fresh ids to rich commands", async () => {
      const richCommand = { id: "cmd_1", command: "rich_command" };
      service.cache.keys.F3 = ["test_command", richCommand];

      const result = await service.duplicateKey("F3");
      const duplicatedCommands =
        profileUpdatePayloads.at(-1).add.builds.space.keys[result.newKey];

      expect(result.success).toBe(true);
      expect(result.sourceKey).toBe("F3");
      expect(result.newKey).toMatch(/^F3_copy(_\d+)?$/);
      expect(duplicatedCommands[0]).toBe("test_command");
      expect(duplicatedCommands[1]).not.toBe(richCommand);
      expect(duplicatedCommands[1]).toEqual({
        command: "rich_command",
        id: expect.stringMatching(/^key_/),
      });
      expect(duplicatedCommands[1].id).not.toBe(richCommand.id);
    });

    it("should return structured error response when no profile selected", async () => {
      // Create a new service with no profile to test the no profile case
      const noProfileService = new KeyService({
        eventBus: fixture.eventBus,
        storage: fixture.storage,
        i18n: { t: (key, params) => `${key}:${JSON.stringify(params)}` },
      });
      noProfileService.init();

      const result = await noProfileService.duplicateKey("F3");

      expect(result).toEqual({
        success: false,
        error: "no_profile_selected",
      });

      if (noProfileService && noProfileService.destroy) {
        noProfileService.destroy();
      }
    });

    it("should return structured error response for non-existent source key", async () => {
      const result = await service.duplicateKey("Z9");

      expect(result).toEqual({
        success: false,
        error: "key_not_found",
        params: { keyName: "Z9" },
      });
    });
  });

  describe("duplicateKeyWithName", () => {
    it("should return structured success response for valid duplication", async () => {
      await service.addKey("F3");
      service.cache.keys.F3 = [{ id: "cmd_1", command: "TestCommand" }];

      const result = await service.duplicateKeyWithName("F3", "F4");

      expect(result).toEqual({
        success: true,
        sourceKey: "F3",
        newKey: "F4",
        environment: "space",
      });
      expect(service.cache.keys).toHaveProperty("F4");
      expect(service.cache.keys.F4).toEqual([
        { id: "cmd_1", command: "TestCommand" },
      ]);
    });

    it("should return structured error when no profile selected", async () => {
      const noProfileService = new KeyService({
        eventBus: fixture.eventBus,
        storage: fixture.storage,
        i18n: { t: (key, params) => `${key}:${JSON.stringify(params)}` },
      });
      noProfileService.init();

      const result = await noProfileService.duplicateKeyWithName("F3", "F4");

      expect(result).toEqual({ success: false, error: "no_profile_selected" });

      if (noProfileService && noProfileService.destroy) {
        noProfileService.destroy();
      }
    });

    it("should return structured error for missing source key", async () => {
      const result = await service.duplicateKeyWithName("F5", "F6");

      expect(result).toEqual({
        success: false,
        error: "key_not_found",
        params: { keyName: "F5" },
      });
    });

    it("should return structured error for invalid new key name", async () => {
      await service.addKey("F3");
      service.cache.keys.F3 = [{ id: "cmd_1", command: "TestCommand" }];

      const result = await service.duplicateKeyWithName("F3", "invalid");

      expect(result).toEqual({
        success: false,
        error: "invalid_key_name",
        params: { keyName: "invalid" },
      });
    });

    it("should return structured error when target key already exists", async () => {
      await service.addKey("F3");
      service.cache.keys.F3 = [{ id: "cmd_1", command: "TestCommand" }];
      service.cache.keys.F4 = [{ id: "cmd_existing", command: "Existing" }];

      const result = await service.duplicateKeyWithName("F3", "F4");

      expect(result).toEqual({
        success: false,
        error: "key_already_exists",
        params: { keyName: "F4" },
      });
    });

    it("should return structured error when source key has no commands", async () => {
      await service.addKey("F5");
      service.cache.keys.F5 = [];

      const result = await service.duplicateKeyWithName("F5", "F6");

      expect(result).toEqual({
        success: false,
        error: "no_commands_to_duplicate",
      });
    });
  });

  describe("Request/Response Endpoints", () => {
    it("should handle key:add request via event bus", async () => {
      const result = await service.request("key:add", { key: "F7" });

      expect(result.success).toBe(true);
      expect(result.key).toBe("F7");
    });

    it("should handle key:delete request via event bus", async () => {
      // First add a key
      await service.addKey("F7");

      // Then delete via request
      const result = await service.request("key:delete", { key: "F7" });

      expect(result.success).toBe(true);
      expect(result.key).toBe("F7");
    });

    it("does not expose event-driven key duplication as an RPC", () => {
      expect(fixture.eventBus.hasListeners("rpc:key:duplicate")).toBe(false);
    });

    it("should handle invalid requests gracefully", async () => {
      const result = await service.request("key:add", { key: "" });

      expect(result.success).toBe(false);
      expect(result.error).toBe("invalid_key_name");
    });
  });

  describe("ComponentBase Integration", () => {
    it("should update cache when profile:switched event is emitted", () => {
      expect(service.cache.currentProfile).toBe("test-profile");
    });

    it("should maintain cache consistency after operations", async () => {
      // Add a key
      await service.addKey("F3");
      expect(service.cache.keys.F3).toBeDefined();

      // Delete the key
      await service.deleteKey("F3");
      expect(service.cache.keys.F3).toBeUndefined();
    });
  });
});
