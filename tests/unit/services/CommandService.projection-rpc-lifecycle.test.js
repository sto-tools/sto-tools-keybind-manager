import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandService from "../../../src/js/components/services/CommandService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = [
  "command:add",
  "command:edit",
  "command:delete",
  "command:move",
  "command:import-from-source",
  "command:generate-command-preview",
  "command:generate-mirrored-commands",
];
const retiredTopics = [
  "command:get-for-selected-key",
  "command:get-import-sources",
  "command:get-empty-state-info",
  "command:validate",
  "command:check-environment-compatibility",
];

const expectResponderState = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.hasListeners(`rpc:${topic}`)).toBe(expected);
  }
};

describe("CommandService projection responder lifecycle", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new CommandService({
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
    const deleteCommand = vi
      .spyOn(service, "deleteCommand")
      .mockResolvedValue(true);

    expectResponderState(fixture.eventBus, retiredTopics, false);

    service.init();

    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);
    await service.request("command:delete", { key: "F1", index: 0 });
    expect(deleteCommand).toHaveBeenCalledOnce();

    service.destroy();
    expectResponderState(fixture.eventBus, responderTopics, false);
    expectResponderState(fixture.eventBus, retiredTopics, false);

    service.init();

    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);
    await service.request("command:delete", { key: "F1", index: 0 });
    expect(deleteCommand).toHaveBeenCalledTimes(2);
  });
});
