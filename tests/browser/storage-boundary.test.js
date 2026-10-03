import { describe, it } from "vitest";
import {
  writerRouting,
  failedSettings,
  syncFolderFailure,
  savedPreferences,
  migratedRoot,
} from "../fixtures/ui/storageBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("storage-boundary checked-bundle DOM boundary", () => {
  it("uses the sole settings owner and the sole project adapter in production composition (visible DOM/durable counterpart)", async () => {
    await writerRouting();
  });
  it("keeps the preference owner unchanged when the checked bundle cannot persist (visible DOM/durable counterpart)", async () => {
    await failedSettings();
  });
  it("keeps accepted preferences unchanged after an acknowledged write fails readback (visible DOM/durable counterpart)", async () => {
    await failedSettings({ readback: true });
  });
  it("does not publish sync-folder success when the checked bundle cannot persist its settings (visible DOM/durable counterpart)", async () => {
    await syncFolderFailure();
  });
  it("waits for saved consumers before resolving a checked-bundle mutation (visible DOM/durable counterpart)", async () => {
    await savedPreferences();
  });
  it("validates and durably adopts roots and settings through the checked-in owner chain (visible DOM/durable counterpart)", async () => {
    await migratedRoot();
  });
});
