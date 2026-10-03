import { describe, it } from "vitest";
import { commandMutation } from "../fixtures/ui/commandBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("command-mutation-boundary checked-bundle DOM boundary", () => {
  it("keeps failure silent and serializes non-destructive owner mutations (visible DOM/durable counterpart)", async () => {
    await commandMutation();
  });
});
