import { afterEach, beforeEach, describe, expect, it } from "vitest";

import KeyService from "../../../src/js/components/services/KeyService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = ["key:add", "key:delete", "key:duplicate-with-name"];
const retiredTopics = ["key:duplicate"];

const expectResponderCount = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.getListenerCount(`rpc:${topic}`), topic).toBe(expected);
  }
};

describe("KeyService responder lifecycle", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new KeyService({ eventBus: fixture.eventBus });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
  });

  it("transfers only supported responders across initialization and replacement", async () => {
    expectResponderCount(fixture.eventBus, responderTopics, 0);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);

    await service.init();

    expectResponderCount(fixture.eventBus, responderTopics, 1);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);

    service.destroy();

    expectResponderCount(fixture.eventBus, responderTopics, 0);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);

    await service.init();

    expectResponderCount(fixture.eventBus, responderTopics, 1);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);

    service.destroy();
    service = new KeyService({ eventBus: fixture.eventBus });
    await service.init();

    expectResponderCount(fixture.eventBus, responderTopics, 1);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);
  });
});
