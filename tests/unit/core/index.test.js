import { describe, expect, it } from "vitest";

import {
  APP_VERSION,
  DISPLAY_VERSION,
  UNSAFE_KEYBINDS,
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

  it("reports the active jsdom and Node environments", () => {
    expect(isBrowser()).toBe(true);
    expect(isNode()).toBe(process.versions.node);
  });
});
