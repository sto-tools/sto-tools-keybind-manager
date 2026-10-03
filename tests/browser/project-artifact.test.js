import { describe, it } from "vitest";
import { artifactParity } from "../fixtures/ui/artifactBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("project-artifact checked-bundle DOM boundary", () => {
  it("downloads and syncs byte-identical artifacts from the live owner state (visible DOM/durable counterpart)", async () => {
    await artifactParity();
  });
});
