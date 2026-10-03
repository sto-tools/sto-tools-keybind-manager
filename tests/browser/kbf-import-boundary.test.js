import { describe, it } from "vitest";
import { kbfImport } from "../fixtures/ui/importBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("kbf-import-boundary checked-bundle DOM boundary", () => {
  it("commits canonical nested data through the checked-bundle owner chain (visible DOM/durable counterpart)", async () => {
    await kbfImport();
  });
  it("imports one visibly selected bindset through the checked-bundle menu workflow (visible DOM/durable counterpart)", async () => {
    await kbfImport({ single: true });
  });
  it("settles Escape and overlay import cancellation without durable effects (visible DOM/durable counterpart)", async () => {
    await kbfImport({ cancel: true });
  });
  it("rejects a prototype-sensitive nested key without owner or durable effects (visible DOM/durable counterpart)", async () => {
    await kbfImport({ invalid: "a prototype-sensitive nested key" });
  });
  it("rejects an unbounded activity range without owner or durable effects (visible DOM/durable counterpart)", async () => {
    await kbfImport({ invalid: "an unbounded activity range" });
  });
  it("rejects malformed Base64 activity text without owner or durable effects (visible DOM/durable counterpart)", async () => {
    await kbfImport({ invalid: "malformed Base64 activity text" });
  });
  it("rejects a control character in a combo token without owner or durable effects (visible DOM/durable counterpart)", async () => {
    await kbfImport({ invalid: "a control character in a combo token" });
  });
  it("rejects an excessive combo chord without owner or durable effects (visible DOM/durable counterpart)", async () => {
    await kbfImport({ invalid: "an excessive combo chord" });
  });
  it("rejects a negative execution order without owner or durable effects (visible DOM/durable counterpart)", async () => {
    await kbfImport({ invalid: "a negative execution order" });
  });
  it("rejects a prototype-sensitive destination without owner or durable effects (visible DOM/durable counterpart)", async () => {
    await kbfImport({ invalid: "a prototype-sensitive destination" });
  });
});
