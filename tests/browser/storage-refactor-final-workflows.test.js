import { describe, it } from "vitest";
import {
  resetRetryAndRestart,
  syncRestoreRetryAndRestart,
} from "../fixtures/ui/finalStorageBrowserWorkflows.js";

describe("R1/R9/R10/R11 final checked-bundle storage workflows", () => {
  it("retries a partial scoped reset and restarts without reseeding durable state", async () => {
    await resetRetryAndRestart();
  });

  it("reads a native sync artifact, retries only activation, and recovers the persisted folder after restart", async () => {
    await syncRestoreRetryAndRestart();
  });
});
