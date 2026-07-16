import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainService from "../../../src/js/components/services/CommandChainService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = [
  "command:set-stabilize",
  "command-chain:clear",
  "command-chain:generate-alias-name",
  "command-chain:generate-alias-preview",
];
const retiredTopics = ["command:is-stabilized", "command-chain:is-stabilized"];

const expectResponderState = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.hasListeners(`rpc:${topic}`)).toBe(expected);
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

  it("never restores retired queries while transferring its remaining responders", async () => {
    const generateAliasName = vi
      .spyOn(service, "generateBindToAliasName")
      .mockResolvedValue("sto_kb_space_F1");

    expectResponderState(fixture.eventBus, retiredTopics, false);

    service.init();

    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);
    await service.request("command-chain:generate-alias-name", {
      environment: "space",
      keyName: "F1",
    });
    expect(generateAliasName).toHaveBeenCalledOnce();

    service.destroy();
    expectResponderState(fixture.eventBus, responderTopics, false);
    expectResponderState(fixture.eventBus, retiredTopics, false);

    service.init();

    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);
    await service.request("command-chain:generate-alias-name", {
      environment: "space",
      keyName: "F1",
    });
    expect(generateAliasName).toHaveBeenCalledTimes(2);
  });
});
