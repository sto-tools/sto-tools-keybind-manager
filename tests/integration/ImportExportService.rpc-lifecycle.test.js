import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExportService from "../../src/js/components/services/ExportService.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import { createServiceFixture } from "../fixtures/index.js";

const activeTopics = [
  "export:generate-filename",
  "export:generate-alias-filename",
  "export:generate-keybind-file",
  "export:generate-alias-file",
  "export:sync-to-folder",
  "import:keybind-file",
  "import:alias-file",
  "import:kbf-file",
  "import:project-file",
  "parse-kbf-file",
];

const retiredTopics = [
  "export:extract-keys",
  "export:import-from-file",
  "import:from-file",
  "import:validate-kbf-file",
  "import:validate-keybind-file",
];

const expectResponderCount = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.getListenerCount(`rpc:${topic}`), topic).toBe(expected);
  }
};

describe("ImportService and ExportService RPC lifecycle", () => {
  let fixture;
  const services = [];

  const createServicePair = () => {
    const exportService = new ExportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    const importService = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });

    services.push(exportService, importService);
    return { exportService, importService };
  };

  beforeEach(() => {
    fixture = createServiceFixture();
  });

  afterEach(() => {
    for (const service of services.reverse()) {
      if (!service.destroyed) service.destroy();
    }
    services.length = 0;
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("transfers one complete responder set to replacement services", async () => {
    const predecessor = createServicePair();
    const predecessorImportProjectFile = vi
      .spyOn(predecessor.importService, "importProjectFile")
      .mockResolvedValue({
        success: true,
        message: "predecessor_imported",
        imported: { profiles: 0, settings: false },
        currentProfile: null,
      });

    expectResponderCount(fixture.eventBus, activeTopics, 0);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);

    predecessor.exportService.init();
    predecessor.importService.init();
    predecessor.exportService.setupRequestHandlers();
    predecessor.importService.setupRequestHandlers();
    predecessor.exportService.setupRequestHandlers();
    predecessor.importService.setupRequestHandlers();

    expectResponderCount(fixture.eventBus, activeTopics, 1);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);

    predecessor.exportService.destroy();
    predecessor.importService.destroy();

    expectResponderCount(fixture.eventBus, activeTopics, 0);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);

    const replacement = createServicePair();
    const replacementResult = {
      success: true,
      message: "replacement_imported",
      imported: { profiles: 1, settings: false },
      currentProfile: "replacement",
    };
    const replacementImportProjectFile = vi
      .spyOn(replacement.importService, "importProjectFile")
      .mockResolvedValue(replacementResult);

    replacement.exportService.init();
    replacement.importService.init();
    replacement.exportService.setupRequestHandlers();
    replacement.importService.setupRequestHandlers();

    expectResponderCount(fixture.eventBus, activeTopics, 1);
    expectResponderCount(fixture.eventBus, retiredTopics, 0);

    const content = JSON.stringify({
      app: "sto-keybind-manager",
      data: { profiles: {} },
    });

    await expect(
      replacement.importService.request("import:project-file", { content }),
    ).resolves.toEqual(replacementResult);
    expect(predecessorImportProjectFile).not.toHaveBeenCalled();
    expect(replacementImportProjectFile).toHaveBeenCalledOnce();
    expect(replacementImportProjectFile).toHaveBeenCalledWith(content, {});
  });
});
