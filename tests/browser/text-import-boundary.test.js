import { describe, it } from "vitest";
import { textImport } from "../fixtures/ui/importBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("text-import-boundary checked-bundle DOM boundary", () => {
  it("commits a valid keybind through the checked-bundle owner chain (visible DOM/durable counterpart)", async () => {
    await textImport();
  });
  it("merges aliases with exact accounting through the checked-bundle owner chain (visible DOM/durable counterpart)", async () => {
    await textImport({ aliases: true });
  });
  it("rejects oversized content through checked-bundle RPC import:keybind-file before persistence (visible DOM/durable counterpart)", async () => {
    await textImport({ oversized: true, aliases: false });
  });
  it("rejects oversized content through checked-bundle RPC import:alias-file before persistence (visible DOM/durable counterpart)", async () => {
    await textImport({ oversized: true, aliases: true });
  });
  it("rejects an unterminated bracket alias in bounded time without owner effects (visible DOM/durable counterpart)", async () => {
    await textImport({ aliases: true, malformed: true });
  });
});
