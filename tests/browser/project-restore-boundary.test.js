import { describe, it } from "vitest";
import { restoreProject } from "../fixtures/ui/importBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("project-restore-boundary checked-bundle DOM boundary", () => {
  it("adopts the exact durable repository result without a post-write reload (visible DOM/durable counterpart)", async () => {
    await restoreProject();
  });
});
