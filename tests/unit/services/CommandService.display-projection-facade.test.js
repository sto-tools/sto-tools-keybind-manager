import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandService from "../../../src/js/components/services/CommandService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function parsed(commandString, parameters = {}) {
  return {
    commands: [
      {
        command: commandString,
        signature: "TrayExecByTray(active, tray, slot)",
        parameters,
      },
    ],
  };
}

describe("CommandService display-normalization facade", () => {
  let fixture;
  let service;
  let detachParser;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new CommandService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    service.init();
  });

  afterEach(() => {
    detachParser?.();
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("parses non-empty commands strictly in sequence with display text disabled", async () => {
    const first = deferred();
    const parse = vi.fn(({ commandString }) => {
      if (commandString === "first") return first.promise;
      return parsed(commandString, { active: 0, tray: 3, slot: 4 });
    });
    detachParser = respond(
      fixture.eventBus,
      "parser:parse-command-string",
      parse,
    );

    const normalization = service.normalizeCommandsForDisplay([
      "first",
      { command: "second" },
    ]);
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
    expect(parse).toHaveBeenLastCalledWith({
      commandString: "first",
      options: { generateDisplayText: false },
    });

    first.resolve(parsed("first", { tray: 1, slot: 2 }));
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(2));
    expect(parse).toHaveBeenLastCalledWith({
      commandString: "second",
      options: { generateDisplayText: false },
    });
    await expect(normalization).resolves.toEqual([
      "+TrayExecByTray 1 2",
      "TrayExecByTray 0 3 4",
    ]);
  });

  it("falls back per command after parser or projection failure and continues", async () => {
    const malformed = {};
    Object.defineProperty(malformed, "signature", {
      get() {
        throw new Error("unreadable signature");
      },
    });
    const parse = vi.fn(({ commandString }) => {
      if (commandString === "parser-failure") {
        throw new Error("parser unavailable");
      }
      if (commandString === "projection-failure") {
        return { commands: [malformed] };
      }
      if (commandString === "malformed-result") return null;
      return parsed(commandString, { tray: 5, slot: 6 });
    });
    detachParser = respond(
      fixture.eventBus,
      "parser:parse-command-string",
      parse,
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      service.normalizeCommandsForDisplay([
        "",
        { command: "" },
        "parser-failure",
        "projection-failure",
        "malformed-result",
        "success",
      ]),
    ).resolves.toEqual([
      "parser-failure",
      "projection-failure",
      "malformed-result",
      "+TrayExecByTray 5 6",
    ]);
    expect(parse.mock.calls.map(([payload]) => payload.commandString)).toEqual([
      "parser-failure",
      "projection-failure",
      "malformed-result",
      "success",
    ]);
    expect(warn).toHaveBeenCalledTimes(3);
  });
});
