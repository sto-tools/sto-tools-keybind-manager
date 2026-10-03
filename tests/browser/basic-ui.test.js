import { describe, it } from "vitest";
import {
  shellAndMenus,
  bindsetDialog,
  emptyStates,
  visibleConvergence,
} from "../fixtures/ui/profileBrowserWorkflows.js";
import { commandPresentation } from "../fixtures/ui/commandBrowserWorkflows.js";
import { restoreProject } from "../fixtures/ui/importBrowserWorkflows.js";

// Exact internal assertions remain in the matching source-only integration cohort.
describe("basic-ui checked-bundle DOM boundary", () => {
  it("boots the translated shell and handles the settings menu (visible DOM/durable counterpart)", async () => {
    await shellAndMenus();
  });
  it("opens the injected bindset input dialog without a browser global (visible DOM/durable counterpart)", async () => {
    await bindsetDialog();
  });
  it("keeps DataService module-scoped while serving late-join state (visible DOM/durable counterpart)", async () => {
    await shellAndMenus();
  });
  it("uses local projections without retired state, static-data, or computation RPCs (visible DOM/durable counterpart)", async () => {
    await commandPresentation();
  });
  it("renders translated key and alias empty states from accepted caches (visible DOM/durable counterpart)", async () => {
    await emptyStates();
  });
  it("hydrates one immutable DataCoordinator snapshot in consumers (visible DOM/durable counterpart)", async () => {
    await visibleConvergence();
  });
  it("rejects deeply invalid project data before the live import route writes (visible DOM/durable counterpart)", async () => {
    await restoreProject({ invalid: true });
  });
  it("restores a valid wrapped project through the live owner chain (visible DOM/durable counterpart)", async () => {
    await restoreProject();
  });
});
