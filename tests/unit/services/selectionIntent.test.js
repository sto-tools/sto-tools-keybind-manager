import { describe, expect, it } from "vitest";

import { createSelectionIntentTracker } from "../../../src/js/components/services/selectionIntent.js";

describe("selection intent tracker", () => {
  it("keeps only the newest intent for a selection slot", () => {
    const tracker = createSelectionIntentTracker();
    const first = tracker.track("space", "S1", Promise.resolve(true));
    const second = tracker.track("space", "S2", Promise.resolve(true));

    expect(tracker.get("space")).toBe(second);
    expect(tracker.finish(first)).toBe(false);
    expect(tracker.get("space")).toBe(second);
    expect(tracker.finish(second)).toBe(true);
    expect(tracker.get("space")).toBe(null);
  });

  it("tracks environments independently and clears authority changes", () => {
    const tracker = createSelectionIntentTracker();
    const space = tracker.track("space", "S1", Promise.resolve(true));
    const ground = tracker.track("ground", "G1", Promise.resolve(true));

    expect(tracker.get("space")).toBe(space);
    expect(tracker.get("ground")).toBe(ground);
    expect(tracker.some((intent) => intent.selection === "G1")).toBe(true);
    expect(tracker.some((intent) => intent.selection === "missing")).toBe(
      false,
    );

    tracker.clear();
    expect(tracker.get("space")).toBe(null);
    expect(tracker.get("ground")).toBe(null);
  });
});
