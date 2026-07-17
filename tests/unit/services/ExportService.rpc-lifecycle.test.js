import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExportService from "../../../src/js/components/services/ExportService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = [
  "export:generate-filename",
  "export:generate-alias-filename",
  "export:import-from-file",
  "export:generate-keybind-file",
  "export:generate-alias-file",
  "export:sync-to-folder",
];

const retiredTopics = ["export:extract-keys"];

const expectResponderCount = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.getListenerCount(`rpc:${topic}`), topic).toBe(expected);
  }
};

describe("ExportService responder lifecycle", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new ExportService({
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
    const generateFileName = vi
      .spyOn(service, "generateFileName")
      .mockResolvedValue("profile_space.txt");
    const requestPayload = {
      profile: { name: "Profile" },
      extension: "txt",
      environment: "space",
    };

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
      service.request("export:generate-filename", requestPayload),
    ).resolves.toBe("profile_space.txt");
    expect(generateFileName).toHaveBeenCalledOnce();

    service.destroy();

    expect(service._responseDetachFunctions).toEqual([]);
    expectResponderCount(fixture.eventBus, responderTopics, 0);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);
    await expect(
      service.request("export:generate-filename", requestPayload),
    ).rejects.toThrow(
      'No handler registered for topic "export:generate-filename"',
    );
    expect(generateFileName).toHaveBeenCalledOnce();

    service.init();
    service.setupRequestHandlers();

    expect(service._responseDetachFunctions).toHaveLength(
      responderTopics.length,
    );
    expectResponderCount(fixture.eventBus, responderTopics, 1);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);
    await expect(
      service.request("export:generate-filename", {
        profile: { name: "Profile" },
        extension: "txt",
        environment: "space",
      }),
    ).resolves.toBe("profile_space.txt");
    expect(generateFileName).toHaveBeenCalledTimes(2);
  });
});
