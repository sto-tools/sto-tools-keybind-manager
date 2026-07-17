import { afterEach, beforeEach, describe, expect, it } from "vitest";

import ExportService from "../../../src/js/components/services/ExportService.js";
import ImportService from "../../../src/js/components/services/ImportService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const activeTopics = [
  "export:generate-filename",
  "export:generate-alias-filename",
  "export:import-from-file",
  "export:generate-keybind-file",
  "export:generate-alias-file",
  "export:sync-to-folder",
  "import:keybind-file",
  "import:alias-file",
  "import:kbf-file",
  "import:project-file",
  "import:from-file",
  "parse-kbf-file",
];

const retiredTopics = [
  "export:extract-keys",
  "import:validate-kbf-file",
  "import:validate-keybind-file",
];

const expectResponderState = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.hasListeners(`rpc:${topic}`), topic).toBe(expected);
  }
};

describe("import/export helper responders", () => {
  let fixture;
  let exportService;
  let importService;

  beforeEach(() => {
    fixture = createServiceFixture();
    exportService = new ExportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    importService = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
  });

  afterEach(() => {
    if (!exportService.destroyed) exportService.destroy();
    if (!importService.destroyed) importService.destroy();
    fixture.destroy();
  });

  it("registers every remaining route without restoring retired helpers", () => {
    exportService.init();
    importService.init();

    expectResponderState(fixture.eventBus, activeTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);
  });
});
