import { describe, it } from "vitest";
import {
  bindsetDialog,
  profileConstruction,
  defaultProfiles,
  aliasAndVfxEdits,
} from "../fixtures/ui/profileBrowserWorkflows.js";
import {
  textImport,
  kbfImport,
} from "../fixtures/ui/importBrowserWorkflows.js";
import {
  captureKey,
  commandMutation,
  environmentSwitch,
} from "../fixtures/ui/commandBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("profile-mutation-owner-cohorts checked-bundle DOM boundary", () => {
  it("routes key, command, selection and bindset mutations through accepted owner actions (visible DOM/durable counterpart)", async () => {
    await bindsetDialog({ create: true });
    await captureKey();
    await commandMutation();
  });
  it("keeps profile CRUD, environment and default-data transitions durable and visible (visible DOM/durable counterpart)", async () => {
    await profileConstruction();
    await environmentSwitch();
    await defaultProfiles();
  });
  it("commits text, KBF, alias and visible VFX edits without alternative state authorities (visible DOM/durable counterpart)", async () => {
    await textImport();
    await kbfImport();
    await aliasAndVfxEdits();
  });
});
