import { describe, it } from "vitest";
import { captureKey } from "../fixtures/ui/commandBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("key-capture-boundary checked-bundle DOM boundary", () => {
  it("captures, confirms, persists, cancels, and reopens through the checked bundle (visible DOM/durable counterpart)", async () => {
    await captureKey();
  });
});
