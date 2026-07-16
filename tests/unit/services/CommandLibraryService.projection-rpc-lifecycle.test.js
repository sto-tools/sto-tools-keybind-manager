import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandLibraryService from "../../../src/js/components/services/CommandLibraryService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = [
  "command:find-definition",
  "command:get-warning",
  "command:get-categories",
  "command:generate-id",
  "command:filter-library",
];
const retiredTopics = ["command:get-combined-aliases"];

const expectResponderState = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.hasListeners(`rpc:${topic}`), topic).toBe(expected);
  }
};

describe("CommandLibraryService projection responder lifecycle", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new CommandLibraryService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("never restores the retired query while transferring remaining responders", async () => {
    const getCategories = vi
      .spyOn(service, "getCommandCategories")
      .mockResolvedValue({});

    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);

    service.init();
    await service.request("command:get-categories");
    expect(getCategories).toHaveBeenCalledOnce();

    service.destroy();
    expectResponderState(fixture.eventBus, responderTopics, false);
    expectResponderState(fixture.eventBus, retiredTopics, false);

    service.init();
    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);
    await service.request("command:get-categories");
    expect(getCategories).toHaveBeenCalledTimes(2);
  });
});
