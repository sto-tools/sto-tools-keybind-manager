import { describe, it } from "vitest";
import { clearChain } from "../fixtures/ui/commandBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("command-chain-clear-boundary checked-bundle DOM boundary", () => {
  it("does not publish a failed clear and converges owner, cache, and storage after success (visible DOM/durable counterpart)", async () => {
    await clearChain();
  });
});
