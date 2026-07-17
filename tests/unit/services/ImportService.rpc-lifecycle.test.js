import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../../src/js/components/services/ImportService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = [
  "import:keybind-file",
  "import:alias-file",
  "import:kbf-file",
  "import:project-file",
  "import:from-file",
  "parse-kbf-file",
];

const retiredTopics = [
  "import:validate-kbf-file",
  "import:validate-keybind-file",
];

const expectResponderCount = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.getListenerCount(`rpc:${topic}`), topic).toBe(expected);
  }
};

describe("ImportService responder lifecycle", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("owns one responder set across setup, teardown, and same-instance reinitialization", async () => {
    const parseKBFFile = vi
      .spyOn(service, "parseKBFFile")
      .mockResolvedValue({ valid: false, error: "test" });
    const requestPayload = { content: "test", environment: "space" };

    expect(service._responseDetachFunctions).toEqual([]);
    expectResponderCount(fixture.eventBus, responderTopics, 0);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);

    service.init();
    service.setupRequestHandlers();

    expect(service._responseDetachFunctions).toHaveLength(
      responderTopics.length,
    );
    expectResponderCount(fixture.eventBus, responderTopics, 1);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);
    await expect(
      service.request("parse-kbf-file", requestPayload),
    ).resolves.toEqual({ valid: false, error: "test" });
    expect(parseKBFFile).toHaveBeenCalledOnce();

    service.destroy();

    expect(service._responseDetachFunctions).toEqual([]);
    expectResponderCount(fixture.eventBus, responderTopics, 0);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);
    await expect(
      service.request("parse-kbf-file", requestPayload),
    ).rejects.toThrow('No handler registered for topic "parse-kbf-file"');
    expect(parseKBFFile).toHaveBeenCalledOnce();

    service.init();
    service.setupRequestHandlers();

    expect(service._responseDetachFunctions).toHaveLength(
      responderTopics.length,
    );
    expectResponderCount(fixture.eventBus, responderTopics, 1);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);
    await expect(
      service.request("parse-kbf-file", {
        content: "test",
        environment: "ground",
      }),
    ).resolves.toEqual({ valid: false, error: "test" });
    expect(parseKBFFile).toHaveBeenCalledTimes(2);
  });

  it("does not inspect null KBF options when the top-level strategy is valid", async () => {
    const result = {
      success: false,
      error: "invalid_kbf_file_content",
    };
    const importKBFFile = vi
      .spyOn(service, "importKBFFile")
      .mockResolvedValue(result);
    service.init();

    await expect(
      service.request("import:kbf-file", {
        content: "test",
        profileId: "profile-1",
        environment: "space",
        options: null,
        strategy: "merge_keep",
      }),
    ).resolves.toEqual(result);
    expect(importKBFFile).toHaveBeenCalledWith(
      "test",
      "profile-1",
      "space",
      { strategy: "merge_keep" },
      undefined,
    );
  });
});
