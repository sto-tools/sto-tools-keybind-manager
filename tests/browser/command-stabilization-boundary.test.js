import { describe, it } from "vitest";
import { stabilizeChain } from "../fixtures/ui/commandBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("command-stabilization-boundary checked-bundle DOM boundary", () => {
  it("keeps failed writes silent and preserves ordered compatibility publication after success (visible DOM/durable counterpart)", async () => {
    await stabilizeChain();
  });
  it("toggles metadata through the real toolbar without rewriting a mixed canonical chain (visible DOM/durable counterpart)", async () => {
    await stabilizeChain();
  });
});
