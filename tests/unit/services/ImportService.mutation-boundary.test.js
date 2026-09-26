import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImportService from "../../../src/js/components/services/ImportService.js";
import { request, respond } from "../../../src/js/core/requestResponse.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import {
  createServiceFixture,
  respondWithImportedProfileCommits,
} from "../../fixtures/index.js";
import { completeKBFParseResult } from "../../fixtures/kbfParseResult.js";

const profile = () => ({
  name: "Captain",
  description: "before",
  currentEnvironment: "space",
  builds: { space: { keys: {} }, ground: { keys: {} } },
  aliases: {},
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("ImportService guarded mutation ingress", () => {
  let fixture, service, stopParser, stopCommit, parser;
  beforeEach(() => {
    fixture = createServiceFixture();
    fixture.storage.saveProfile("captain", profile());
    fixture.storage.saveProfile.mockClear();
    service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    service.init();
    service._cacheDataState(
      createDataCoordinatorState({
        currentProfile: "captain",
        currentProfileData: profile(),
      }),
    );
    stopCommit = respondWithImportedProfileCommits(
      fixture.eventBus,
      fixture.storage,
    );
    parser = vi.fn(({ commandString }) => ({
      commands: [{ command: commandString }],
      isMirrored: false,
    }));
    stopParser = respond(
      fixture.eventBus,
      "parser:parse-command-string",
      (payload) => parser(payload),
    );
  });
  afterEach(() => {
    service.destroy();
    stopParser();
    stopCommit();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it.each(
    ["keybind", "alias", "kbf"].flatMap((format) =>
      [
        "content getter",
        "options getter",
        "nested getter",
        "hidden",
        "symbol",
        "cycle",
      ].map((kind) => [format, kind]),
    ),
  )(
    "rejects %s %s before parser, storage, or accepted-state reads",
    async (format, kind) => {
      const getter = vi.fn(() => "FireAll");
      const payload = { content: 'F1 "FireAll"', profileId: "captain" };
      if (kind === "content getter")
        Object.defineProperty(payload, "content", {
          enumerable: true,
          get: getter,
        });
      if (kind === "options getter")
        Object.defineProperty(payload, "options", {
          enumerable: true,
          get: getter,
        });
      if (kind === "nested getter")
        payload.options = Object.defineProperty({}, "strategy", {
          enumerable: true,
          get: getter,
        });
      if (kind === "hidden")
        Object.defineProperty(payload, "options", { value: {} });
      if (kind === "symbol") payload[Symbol("private")] = true;
      if (kind === "cycle") {
        payload.options = {};
        payload.options.loop = payload.options;
      }
      const state = service.cache.dataState;
      const readState = vi.fn(() => state);
      Object.defineProperty(service.cache, "dataState", {
        configurable: true,
        get: readState,
      });
      fixture.storage.getProfile.mockClear();
      const result = await request(
        fixture.eventBus,
        `import:${format}-file`,
        payload,
      );
      expect(result.success).toBe(false);
      expect(getter).not.toHaveBeenCalled();
      expect(readState).not.toHaveBeenCalled();
      expect(parser).not.toHaveBeenCalled();
      expect(fixture.storage.getProfile).not.toHaveBeenCalled();
      expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
    },
  );

  it.each([
    "new revision",
    "replacement authority",
    "destroy and reinitialize",
  ])("does not hand off a captured replacement after %s", async (change) => {
    const entered = deferred();
    const resume = deferred();
    parser.mockImplementation(async ({ commandString }) => {
      if (parser.mock.calls.length === 2) {
        entered.resolve();
        await resume.promise;
      }
      return { commands: [{ command: commandString }], isMirrored: false };
    });
    const pending = service.importKeybindFile(
      'F1 "FireAll"',
      "captain",
      "space",
    );
    await entered.promise;
    if (change === "destroy and reinitialize") {
      service.destroy();
      service.init();
    } else
      service._cacheDataState(
        createDataCoordinatorState({
          currentProfile: "captain",
          currentProfileData: profile(),
          authorityEpoch: change === "replacement authority" ? 2 : 1,
          revision: 2,
        }),
      );
    resume.resolve();
    expect(await pending).toMatchObject({
      success: false,
      error: "import_failed",
    });
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("profile:updated"),
    ).toHaveLength(0);
  });

  it("detaches KBF configuration before deferred parser execution", async () => {
    const resume = deferred();
    vi.spyOn(service.kbfParser.decoder, "validateFormat").mockReturnValue({
      isValid: true,
      isKBF: true,
    });
    vi.spyOn(service.kbfParser, "parseFile").mockReturnValue(resume.promise);
    const configuration = {
      selectedBindsets: ["Master"],
      bindsetMappings: { Master: "primary" },
      bindsetRenames: {},
    };
    const pending = service.importKBFFile(
      "kbf",
      "captain",
      "space",
      {},
      configuration,
    );
    configuration.selectedBindsets.length = 0;
    configuration.bindsetMappings.Master = "custom";
    resume.resolve(
      completeKBFParseResult({
        bindsets: {
          Master: { keys: { F1: ["FireAll"] }, aliases: {}, metadata: {} },
        },
        aliases: {},
        errors: [],
        warnings: [],
        stats: { totalBindsets: 1 },
      }),
    );
    expect(await pending).toMatchObject({
      success: true,
      imported: { keys: 1 },
    });
    expect(
      fixture.storage.saveProfile.mock.calls[0][1].builds.space.keys.F1,
    ).toEqual(["FireAll"]);
  });

  it.each(["teardown", "newer accepted revision"])(
    "retains acknowledged import success but suppresses predecessor publication after %s",
    async (change) => {
      stopCommit();
      const entered = deferred();
      const resume = deferred();
      stopCommit = respond(
        fixture.eventBus,
        "data:update-profile",
        async (payload) => {
          fixture.storage.saveProfile(
            payload.profileId,
            payload.updates.replacement,
          );
          entered.resolve();
          await resume.promise;
          return { success: true, profile: payload.updates.replacement };
        },
      );
      const pending = service.importKeybindFile(
        'F1 "FireAll"',
        "captain",
        "space",
      );
      await entered.promise;
      if (change === "teardown") {
        service.destroy();
        service.init();
      } else {
        const successor = fixture.storage.getProfile("captain");
        successor.description = "newer accepted description";
        fixture.storage.saveProfile("captain", successor);
        service._cacheDataState(
          createDataCoordinatorState({
            currentProfile: "captain",
            currentProfileData: successor,
            revision: 3,
          }),
        );
      }
      resume.resolve();
      expect(await pending).toMatchObject({ success: true });
      expect(
        fixture.storage.getProfile("captain").builds.space.keys.F1,
      ).toEqual(["FireAll"]);
      expect(
        fixture.eventBusFixture.getEventsOfType("profile:updated"),
      ).toHaveLength(0);
    },
  );

  it.each([
    false,
    { success: false },
    { success: true },
    { success: true, profile: {} },
  ])(
    "rejects malformed owner acknowledgement %# without legacy publication",
    async (result) => {
      stopCommit();
      stopCommit = respond(
        fixture.eventBus,
        "data:update-profile",
        () => result,
      );
      expect(
        await service.importKeybindFile('F1 "FireAll"', "captain", "space"),
      ).toMatchObject({ success: false, error: "import_failed" });
      expect(
        fixture.eventBusFixture.getEventsOfType("profile:updated"),
      ).toHaveLength(0);
    },
  );
});
