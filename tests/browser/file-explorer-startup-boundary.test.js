import { describe, it } from "vitest";
import { explorer } from "../fixtures/ui/profileBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("file-explorer-startup-boundary checked-bundle DOM boundary", () => {
  it("opens through its initialized event consumer without a late callback (visible DOM/durable counterpart)", async () => {
    await explorer();
  });
  it("renders the accepted coordinator snapshot without reading stale storage (visible DOM/durable counterpart)", async () => {
    await explorer({ stale: true });
  });
});
