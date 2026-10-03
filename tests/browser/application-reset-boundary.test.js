import { describe, it } from "vitest";
import { resetApplication } from "../fixtures/ui/storageBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("application-reset-boundary checked-bundle DOM boundary", () => {
  it("routes the confirmed UI action through both owners before reporting success (visible DOM/durable counterpart)", async () => {
    await resetApplication();
  });
});
