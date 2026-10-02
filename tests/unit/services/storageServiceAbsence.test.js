import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { componentStateOwnerNames } from "../../../src/js/core/componentState.js";
import * as services from "../../../src/js/components/services/index.js";

const root = resolve(process.cwd(), "src/js");
const retiredSurface =
  /\b(?:StorageService|StorageServiceCapability|StorageStateSnapshot|SavedStorageData|storageService|storageWrites)\b|storage:data-(?:changed|reset)/;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return entry.isFile() && /\.(?:js|ts)$/.test(entry.name) ? [file] : [];
  });
}

describe("StorageService final retirement [R2 R3 R6 R12 R14]", () => {
  it("has no class, service export or late-join state registration", () => {
    expect(
      existsSync(join(root, "components/services/StorageService.js")),
    ).toBe(false);
    expect(existsSync(join(root, "components/services/storageWrites.js"))).toBe(
      false,
    );
    expect(services).not.toHaveProperty("StorageService");
    expect(componentStateOwnerNames).not.toContain("StorageService");
    expect(componentStateOwnerNames).toEqual(
      expect.arrayContaining([
        "DataCoordinator",
        "PreferencesService",
        "CommandPresentationService",
        "KeyBrowserService",
      ]),
    );
  });

  it("keeps the removed facade, transport and capability absent from all production source and types", () => {
    for (const file of sourceFiles(root)) {
      expect(readFileSync(file, "utf8"), relative(root, file)).not.toMatch(
        retiredSurface,
      );
    }
  });

  it("keeps the same retired surfaces absent from the checked production bundle", () => {
    const bundle = readFileSync(resolve("src/dist/bundle.js"), "utf8");
    expect(bundle.length).toBeGreaterThan(0);
    expect(bundle).not.toMatch(retiredSurface);
  });

  it("does not replace the test facade with a renamed general-purpose storage service", () => {
    for (const file of [
      "tests/fixtures/core/storage.js",
      "tests/fixtures/index.js",
      "tests/fixtures/services/harness.js",
      "tests/fixtures/services/importedProfileCommit.js",
      "tests/fixtures/services/importProjectOwner.js",
    ]) {
      const source = readFileSync(resolve(file), "utf8");
      expect(source, file).not.toMatch(
        /\b(?:mockStorageService|storageService)\b/,
      );
      expect(source, file).not.toMatch(
        /\b(?:getAllData|saveAllData|getProfile|saveProfile|deleteProfile|invalidateCache)\b/,
      );
    }
  });
});
