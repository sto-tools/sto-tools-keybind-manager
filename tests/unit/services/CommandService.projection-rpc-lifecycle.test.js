import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandService from "../../../src/js/components/services/CommandService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = [
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
  "command:add",
  "command:edit",
];

const expectResponderState = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.getListenerCount(`rpc:${topic}`), topic).toBe(expected);
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

  it("owns retained responders and command events only while initialized", async () => {
    const deleteCommand = vi
      .spyOn(service, "deleteCommand")
      .mockResolvedValue(true);
    const addCommand = vi.spyOn(service, "addCommand").mockResolvedValue(true);
    const editCommand = vi
      .spyOn(service, "editCommand")
      .mockResolvedValue(true);

    expectResponderState(fixture.eventBus, responderTopics, 0);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command:add")).toBe(0);
    expect(fixture.eventBus.getListenerCount("command:edit")).toBe(0);

    await service.init();

    expectResponderState(fixture.eventBus, responderTopics, 1);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command:add")).toBe(1);
    expect(fixture.eventBus.getListenerCount("command:edit")).toBe(1);
    fixture.eventBus.emit("command:add", { command: "FireAll", key: "F1" });
    fixture.eventBus.emit("command:edit", {
      key: "F1",
      index: 0,
      updatedCommand: "FirePhasers",
    });
    expect(addCommand).toHaveBeenCalledOnce();
    expect(editCommand).toHaveBeenCalledOnce();
    await service.request("command:delete", { key: "F1", index: 0 });
    expect(deleteCommand).toHaveBeenCalledOnce();

    service.destroy();
    expectResponderState(fixture.eventBus, responderTopics, 0);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command:add")).toBe(0);
    expect(fixture.eventBus.getListenerCount("command:edit")).toBe(0);

    await service.init();

    expectResponderState(fixture.eventBus, responderTopics, 1);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command:add")).toBe(1);
    expect(fixture.eventBus.getListenerCount("command:edit")).toBe(1);
    await service.request("command:delete", { key: "F1", index: 0 });
    expect(deleteCommand).toHaveBeenCalledTimes(2);

    service.destroy();
    service = new CommandService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    await service.init();

    expectResponderState(fixture.eventBus, responderTopics, 1);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command:add")).toBe(1);
    expect(fixture.eventBus.getListenerCount("command:edit")).toBe(1);
  });
});
