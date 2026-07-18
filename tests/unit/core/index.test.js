import { describe, expect, it } from "vitest";

import {
  APP_VERSION,
  DISPLAY_VERSION,
  InvalidEffectError,
  InvalidEnvironmentError,
  STOError,
  UNSAFE_KEYBINDS,
  VertigoError,
  createEventBusSetup,
  isBrowser,
  isNode,
} from "../../../src/js/core/index.js";

describe("core public API", () => {
  it("exports the application constants that exist in the core module", () => {
    expect(DISPLAY_VERSION).toBe(`v${APP_VERSION}`);
    expect(UNSAFE_KEYBINDS).toContain("Alt+F4");
  });

  it("creates a usable event bus request/response setup", () => {
    const setup = createEventBusSetup();

    expect(setup.eventBus).toBeDefined();
    expect(setup.respond).toBeTypeOf("function");
    expect(setup.request).toBeTypeOf("function");
  });

  it("keeps the public error hierarchy as module exports only", () => {
    expect(new STOError("failure")).toMatchObject({
      name: "STOError",
      code: "STO_ERROR",
    });
    expect(new VertigoError("failure")).toBeInstanceOf(STOError);
    expect(new InvalidEnvironmentError("invalid")).toBeInstanceOf(VertigoError);
    expect(new InvalidEffectError("effect", "invalid")).toBeInstanceOf(
      VertigoError,
    );

    for (const name of [
      "STOError",
      "VertigoError",
      "InvalidEnvironmentError",
      "InvalidEffectError",
    ]) {
      expect(window[name]).toBeUndefined();
    }
  });

  it("reports the active jsdom and Node environments", () => {
    expect(isBrowser()).toBe(true);
    expect(isNode()).toBe(process.versions.node);
  });
});
