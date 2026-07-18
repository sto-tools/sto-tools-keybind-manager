import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../../src/js/components/services/ImportService.js";
import { MAX_STO_TEXT_IMPORT_BYTES } from "../../../src/js/components/services/textImportBoundary.js";
import { request, respond } from "../../../src/js/core/requestResponse.js";
import { createImportServiceFixture } from "../../fixtures/index.js";

describe("ImportService STO text boundary", () => {
  let fixture;
  let service;
  let parseCommand;

  beforeEach(() => {
    fixture = createImportServiceFixture();
    service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: {
        t: (key, params) =>
          params?.line === undefined ? key : `${key}:${params.line}`,
      },
    });
    service.init();
    parseCommand = vi.fn(({ commandString }) => ({
      commands: commandString ? [{ command: commandString }] : [],
      isMirrored: false,
    }));
    respond(fixture.eventBus, "parser:parse-command-string", parseCommand);
    fixture.storage.getProfile.mockClear();
    fixture.storage.saveProfile.mockClear();
  });

  afterEach(() => {
    service?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it.each([
    ["import:keybind-file", "keybind_file_too_large", true],
    ["import:alias-file", "alias_file_too_large", false],
  ])(
    "rejects oversized content at the real %s responder before effects",
    async (topic, error, needsEnvironment) => {
      const content = "x".repeat(MAX_STO_TEXT_IMPORT_BYTES + 1);
      const payload = {
        content,
        profileId: "default_space",
        ...(needsEnvironment ? { environment: "space" } : {}),
      };

      await expect(request(fixture.eventBus, topic, payload)).resolves.toEqual({
        success: false,
        error,
        params: {
          size: MAX_STO_TEXT_IMPORT_BYTES + 1,
          limit: MAX_STO_TEXT_IMPORT_BYTES,
        },
      });
      expect(parseCommand).not.toHaveBeenCalled();
      expect(fixture.storage.getProfile).not.toHaveBeenCalled();
      expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
    },
  );

  it("rejects a non-string alias document before storage access", async () => {
    const result = await service.importAliasFile(
      /** @type {any} */ (null),
      "default_space",
    );

    expect(result).toEqual({
      success: false,
      error: "invalid_alias_file_content",
    });
    expect(fixture.storage.getProfile).not.toHaveBeenCalled();
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
  });

  it("imports valid keybind lines while returning structured-line diagnostics", async () => {
    const result = await service.importKeybindFile(
      'F1 "FireAll"\nF2 "Target_Enemy_Near" trailing',
      "default_space",
      "space",
    );

    expect(result).toMatchObject({
      success: true,
      imported: { keys: 1 },
      errors: ["import_keybind_line_unrecognized:2"],
    });
    expect(parseCommand).toHaveBeenCalledWith({ commandString: "FireAll" });
    expect(
      fixture.storage.getProfile("default_space").builds.space.keys,
    ).toEqual({ F1: ["FireAll"] });
  });
});
