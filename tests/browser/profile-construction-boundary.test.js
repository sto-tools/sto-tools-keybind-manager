import { describe, it } from "vitest";
import {
  profileConstruction,
  defaultProfiles,
} from "../fixtures/ui/profileBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("profile-construction-boundary checked-bundle DOM boundary", () => {
  it("creates and clones through the owner while adopting durable readbacks (visible DOM/durable counterpart)", async () => {
    await profileConstruction();
  });
  it("constructs exact normalized static defaults and fallback profiles (visible DOM/durable counterpart)", async () => {
    await defaultProfiles();
  });
});
