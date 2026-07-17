import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainService from "../../../src/js/components/services/CommandChainService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = [
  "command:set-stabilize",
  "command-chain:generate-alias-name",
  "command-chain:generate-alias-preview",
];
const retiredTopics = [
  "command:is-stabilized",
  "command-chain:is-stabilized",
  "command-chain:clear",
];

const expectResponderState = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.getListenerCount(`rpc:${topic}`), topic).toBe(expected);
  }
};

describe("CommandChainService projection responder lifecycle", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("owns retained responders and the clear event only while initialized", async () => {
    const generateAliasName = vi
      .spyOn(service, "generateBindToAliasName")
      .mockResolvedValue("sto_kb_space_F1");

    expectResponderState(fixture.eventBus, responderTopics, 0);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command-chain:clear")).toBe(0);

    await service.init();

    expectResponderState(fixture.eventBus, responderTopics, 1);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command-chain:clear")).toBe(1);
    await service.request("command-chain:generate-alias-name", {
      environment: "space",
      keyName: "F1",
    });
    expect(generateAliasName).toHaveBeenCalledOnce();

    service.destroy();
    expectResponderState(fixture.eventBus, responderTopics, 0);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command-chain:clear")).toBe(0);

    await service.init();

    expectResponderState(fixture.eventBus, responderTopics, 1);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command-chain:clear")).toBe(1);
    await service.request("command-chain:generate-alias-name", {
      environment: "space",
      keyName: "F1",
    });
    expect(generateAliasName).toHaveBeenCalledTimes(2);

    service.destroy();
    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    await service.init();

    expectResponderState(fixture.eventBus, responderTopics, 1);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command-chain:clear")).toBe(1);
  });
});
