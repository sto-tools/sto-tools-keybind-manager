import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AliasBrowserService from "../../src/js/components/services/AliasBrowserService.js";
import ExportService from "../../src/js/components/services/ExportService.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../fixtures/index.js";

describe("storage action ingress before owner capture", () => {
  let fixture;
  const services = [];
  const own = (service) => {
    services.push(service);
    service.init();
    return service;
  };

  beforeEach(() => {
    fixture = createServiceFixture();
  });
  afterEach(() => {
    for (const service of services.splice(0).reverse()) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it.each([
    [ImportService, "import:project-file", "content", "importProjectFile"],
    [AliasBrowserService, "alias-browser:create", "name", "createAlias"],
    [ExportService, "export:sync-to-folder", "dirHandle", "syncToFolder"],
  ])(
    "rejects %s envelope getters before invoking its action",
    async (Service, topic, field, method) => {
      const service = own(new Service({ eventBus: fixture.eventBus }));
      const action = vi.spyOn(service, method);
      const getter = vi.fn();
      const payload = Object.defineProperty({}, field, {
        enumerable: true,
        get: getter,
      });
      await expect(fixture.eventBus.request(topic, payload)).rejects.toThrow(
        "invalid_mutation_request",
      );
      expect(getter).not.toHaveBeenCalled();
      expect(action).not.toHaveBeenCalled();
    },
  );

  it("detaches project content and options before forwarding the import", async () => {
    const service = own(new ImportService({ eventBus: fixture.eventBus }));
    const action = vi.spyOn(service, "importProjectFile").mockResolvedValue({
      success: false,
      error: "storage_not_available",
    });
    const payload = {
      content: { data: { profiles: {} } },
      options: { importSettings: false },
    };
    await fixture.eventBus.request("import:project-file", payload);
    const [content, options] = action.mock.calls[0];
    expect(content).toEqual(payload.content);
    expect(options).toEqual(payload.options);
    expect(content).not.toBe(payload.content);
    expect(options).not.toBe(payload.options);
    payload.content.data.profiles.changed = {};
    payload.options.importSettings = true;
    expect(content.data.profiles).toEqual({});
    expect(options.importSettings).toBe(false);
  });

  it("rejects invalid sync capability before capturing an artifact", async () => {
    const serialize = vi.fn();
    own(
      new ExportService({
        eventBus: fixture.eventBus,
        currentArtifactSerializer: { serialize },
      }),
    );
    await expect(
      fixture.eventBus.request("export:sync-to-folder", {
        dirHandle: {},
      }),
    ).rejects.toThrow("Invalid sync directory capability");
    expect(serialize).not.toHaveBeenCalled();
  });

  it("rejects nonempty save and malformed preference events without writes", async () => {
    const service = own(
      new PreferencesService({
        eventBus: fixture.eventBus,
        settingsRepository: fixture.settingsRepository,
      }),
    );
    await service.initialStateReady;
    const before = service.getCurrentState();
    fixture.settingsRepository.replace.mockClear();
    const capture = vi.spyOn(service, "getSettings");
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const getter = vi.fn();
    const language = Object.defineProperty({}, "language", {
      get: getter,
      enumerable: true,
    });
    await expect(
      fixture.eventBus.request("preferences:save-settings", {
        unexpected: true,
      }),
    ).rejects.toThrow("invalid_mutation_request");
    await fixture.eventBus.emit("language:change", language);
    await fixture.eventBus.emit("theme:toggle", { unexpected: true });
    expect(getter).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toEqual(before);
    expect(report).toHaveBeenCalledTimes(2);
  });
});
