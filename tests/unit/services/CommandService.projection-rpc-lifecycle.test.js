import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandService from "../../../src/js/components/services/CommandService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = [
  "command:delete",
  "command:move",
  "command:import-from-source",
  "command:generate-mirrored-commands",
];
const retiredTopics = [
  "command:get-for-selected-key",
  "command:get-import-sources",
  "command:get-empty-state-info",
  "command:validate",
  "command:check-environment-compatibility",
  "command:generate-command-preview",
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
    const moveCommand = vi
      .spyOn(service, "moveCommand")
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
    const target = Object.freeze({
      authorityEpoch: 12,
      revision: 4,
      profileId: "captain",
      environment: "space",
      name: "F1",
      bindset: null,
      index: 0,
      originalEntry: "FireAll",
    });
    fixture.eventBus.emit("command:add", { command: "FireAll", key: "F1" });
    fixture.eventBus.emit("command:edit", {
      key: "F1",
      index: 0,
      updatedCommand: "FirePhasers",
      target,
    });
    expect(addCommand).toHaveBeenCalledOnce();
    expect(editCommand).toHaveBeenCalledWith(
      "F1",
      0,
      "FirePhasers",
      null,
      target,
    );
    await service.request("command:delete", { key: "F1", index: 0 });
    expect(deleteCommand).toHaveBeenCalledOnce();
    await service.request("command:move", {
      key: "F1",
      fromIndex: 0,
      toIndex: 1,
      bindset: "Weapons",
    });
    expect(moveCommand).toHaveBeenCalledWith("F1", 0, 1, "Weapons");

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
    fixture.eventBus.emit("command:edit", {
      key: "F1",
      index: 0,
      updatedCommand: "LegacyEdit",
    });
    expect(editCommand).toHaveBeenLastCalledWith(
      "F1",
      0,
      "LegacyEdit",
      null,
      undefined,
    );
    expect(editCommand).toHaveBeenCalledTimes(2);
    await service.request("command:delete", { key: "F1", index: 0 });
    expect(deleteCommand).toHaveBeenCalledTimes(2);
    await service.request("command:move", {
      key: "F1",
      fromIndex: 1,
      toIndex: 0,
    });
    expect(moveCommand).toHaveBeenLastCalledWith("F1", 1, 0, undefined);
    expect(moveCommand).toHaveBeenCalledTimes(2);

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
