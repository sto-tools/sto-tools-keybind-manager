import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../../src/js/components/services/ImportService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

const profileId = "captain";
const profile = {
  name: "Captain",
  currentEnvironment: "space",
  builds: {
    space: { keys: {} },
    ground: { keys: {} },
  },
  bindsets: {},
  aliases: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
};

describe("ImportService persistence failures", () => {
  let fixture;
  let service;
  let markAppModified;
  let profileUpdated;
  let beforeProfile;

  beforeEach(() => {
    fixture = createServiceFixture();
    fixture.storage.saveProfile(profileId, profile);
    fixture.storage.saveProfile.mockClear();
    beforeProfile = fixture.storage.getProfile(profileId);

    service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    service.init();

    respond(
      fixture.eventBus,
      "parser:parse-command-string",
      ({ commandString }) => ({
        commands: [{ command: commandString }],
        isMirrored: false,
      }),
    );
    respond(fixture.eventBus, "preferences:get-settings", () => ({
      bindsetsEnabled: true,
    }));

    markAppModified = vi.spyOn(service, "markAppModified");
    profileUpdated = vi.fn();
    fixture.eventBus.on("profile:updated", profileUpdated);
    fixture.storage.saveProfile.mockReturnValue(false);
  });

  afterEach(() => {
    service?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("fails a keybind import without publishing transient state", async () => {
    const result = await service.importKeybindFile(
      'F1 "FireAll"',
      profileId,
      "space",
    );

    expect(result).toEqual({
      success: false,
      error: "import_failed",
      params: { reason: "storage_write_failed" },
    });
    expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
    expect(fixture.storage.getProfile(profileId)).toEqual(beforeProfile);
    expect(profileUpdated).not.toHaveBeenCalled();
    expect(markAppModified).not.toHaveBeenCalled();
  });

  it("fails an alias import without publishing transient state", async () => {
    const result = await service.importAliasFile(
      'alias Fire "FireAll"',
      profileId,
    );

    expect(result).toEqual({
      success: false,
      error: "import_failed",
      params: { reason: "storage_write_failed" },
    });
    expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
    expect(fixture.storage.getProfile(profileId)).toEqual(beforeProfile);
    expect(profileUpdated).not.toHaveBeenCalled();
    expect(markAppModified).not.toHaveBeenCalled();
  });

  it("fails a KBF import without publishing transient state", async () => {
    vi.spyOn(service.kbfParser.decoder, "validateFormat").mockReturnValue({
      isValid: true,
      isKBF: true,
      warnings: [],
    });
    vi.spyOn(service.kbfParser, "parseFile").mockResolvedValue({
      bindsets: {
        Master: {
          keys: { F1: ["FireAll"] },
          metadata: {},
        },
      },
      aliases: {},
      stats: { totalBindsets: 1, processedLayers: [] },
      errors: [],
      warnings: [],
    });

    const result = await service.importKBFFile(
      "valid KBF data",
      profileId,
      "space",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("kbf_import_critical_error");
    expect(result.errors).toContain("storage_write_failed");
    expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
    expect(fixture.storage.getProfile(profileId)).toEqual(beforeProfile);
    expect(profileUpdated).not.toHaveBeenCalled();
    expect(markAppModified).not.toHaveBeenCalled();
  });
});
