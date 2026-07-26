import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src/js");
const persistedScalarCallPattern = /\.(key|getItem|setItem|removeItem)\s*\(/g;

const expectedCallsByFile = Object.freeze({
  "components/services/StorageService.js": 13,
  "components/services/commandPresentationState.js": 6,
  "components/services/dataCoordinatorInitialState.js": 1,
  "components/services/keyBrowserViewState.js": 8,
  "core/welcomeMessage.js": 5,
  "dev/DevMonitor.js": 1,
});

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "dist" ? [] : javascriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}

describe("persistence access architecture ratchet", () => {
  it("keeps every direct scalar-storage call in an explicitly inventoried file", () => {
    const actualCallsByFile = {};

    for (const file of javascriptFiles(sourceRoot)) {
      const content = readFileSync(file, "utf8");
      const count = [...content.matchAll(persistedScalarCallPattern)].length;
      if (count > 0) {
        actualCallsByFile[relative(sourceRoot, file)] = count;
      }
    }

    expect(actualCallsByFile).toEqual(expectedCallsByFile);
    expect(
      Object.values(actualCallsByFile).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(34);
  });
});
