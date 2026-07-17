import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ImportService from "../../../src/js/components/services/ImportService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("ImportService boundary validation", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    service.init();
  });

  afterEach(() => {
    service.destroy();
    fixture.destroy();
  });

  it("rejects a non-object project root as an invalid project file", async () => {
    await expect(service.importProjectFile("null")).resolves.toEqual({
      success: false,
      error: "invalid_project_file",
    });
  });
});
