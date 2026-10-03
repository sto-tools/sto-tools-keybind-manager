import { describe, it } from "vitest";
import { editCommand } from "../fixtures/ui/commandBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("command-editing-boundary checked-bundle DOM boundary", () => {
  it("preserves parameter edit sessions and durably replaces the captured command (visible DOM/durable counterpart)", async () => {
    await editCommand();
  });
});
