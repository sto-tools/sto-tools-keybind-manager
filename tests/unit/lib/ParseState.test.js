import { describe, expect, it } from "vitest";
import ParseState from "../../../src/js/lib/kbf/parsers/ParseState.js";

describe("ParseState", () => {
  it("resets diagnostics and the active decoder layer", () => {
    const state = new ParseState();
    state.currentLayer = 5;
    state.addError("broken record");
    state.addWarning("suspicious record");

    state.reset();

    expect(state.currentLayer).toBe(0);
    expect(state.errors).toEqual([]);
    expect(state.warnings).toEqual([]);
  });
});
