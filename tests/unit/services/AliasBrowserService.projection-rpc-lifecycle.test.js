import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AliasBrowserService from "../../../src/js/components/services/AliasBrowserService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = ["alias-browser:create"];
const retiredTopics = ["alias:get-all"];

const expectResponderState = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.hasListeners(`rpc:${topic}`)).toBe(expected);
  }
};

describe("AliasBrowserService projection responder lifecycle", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new AliasBrowserService({ eventBus: fixture.eventBus });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("never restores the retired query while transferring its action responder", async () => {
    const createAlias = vi.spyOn(service, "createAlias").mockResolvedValue({
      success: true,
      message: "alias_created",
      data: { name: "Engage" },
    });

    expectResponderState(fixture.eventBus, retiredTopics, false);

    service.init();

    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);
    await service.request("alias-browser:create", { name: "Engage" });
    expect(createAlias).toHaveBeenCalledOnce();

    service.destroy();
    expectResponderState(fixture.eventBus, responderTopics, false);
    expectResponderState(fixture.eventBus, retiredTopics, false);

    service.init();

    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);
    await service.request("alias-browser:create", { name: "Engage" });
    expect(createAlias).toHaveBeenCalledTimes(2);
  });
});
