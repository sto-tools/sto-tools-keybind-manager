import { describe, it } from "vitest";
import {
  categoryCollapse,
  keySelectionAndFilter,
} from "../fixtures/ui/commandBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("key-browser-ui-boundary checked-bundle DOM boundary", () => {
  it("persists category collapse through the rendered delegated path (visible DOM/durable counterpart)", async () => {
    await categoryCollapse();
  });
  it("selects and filters rendered keys through the delegated grid path (visible DOM/durable counterpart)", async () => {
    await keySelectionAndFilter();
  });
});
