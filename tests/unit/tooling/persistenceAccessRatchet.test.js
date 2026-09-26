import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  expectedCallsByFile,
  expectedIndexedDbCallsites,
  expectedNamedMethodCalls,
  expectedScalarCallsites,
  expectedScalarWrites,
  expectedStorageServiceCallsByMethod,
  repositoryCandidateNames,
  routineStateQueryTopics,
  rpcActionTopics,
  rpcComputationTopics,
  storageCallsiteDispositions,
  storageServiceCallClass,
  storageServiceMethodNames,
} from "../../fixtures/tooling/persistenceInventory.js";
import {
  constructorCallsites,
  declaredRpcTopics,
  indexedDbCallsites,
  javascriptFiles,
  namedMethodCallCounts,
  observedRpcTopics,
  rpcTypeRoot,
  scalarCallsites,
  sourceEntries,
  sourceRoot,
  storageServiceCallsites,
} from "../../fixtures/tooling/persistenceScanner.js";

describe("persistence access architecture ratchet", () => {
  // One immutable disk snapshot per suite; fresh reads still produce new snapshots.
  const entries = sourceEntries();

  it("keeps every direct scalar-storage call in an explicitly inventoried file", () => {
    const actualCallsites = scalarCallsites(entries);
    const actualCallsByFile = Object.fromEntries(
      Object.keys(expectedCallsByFile).map((fileName) => [
        fileName,
        Object.entries(actualCallsites)
          .filter(([key]) => key.startsWith(`${fileName}|`))
          .reduce((sum, [, count]) => sum + count, 0),
      ]),
    );

    expect(actualCallsites).toEqual(expectedScalarCallsites);
    expect(actualCallsByFile).toEqual(expectedCallsByFile);
    expect(
      Object.values(actualCallsByFile).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(34);
  });

  it("freezes the exact physical scalar writers and their owner-bound modules", () => {
    const actualWrites = {};
    for (const [callsite, count] of Object.entries(scalarCallsites(entries))) {
      const [fileName, , method] = callsite.split("|");
      if (!["setItem", "removeItem", "clear"].includes(method)) continue;
      const key = `${fileName}|${method}`;
      actualWrites[key] = (actualWrites[key] || 0) + count;
    }

    expect(actualWrites).toEqual(expectedScalarWrites);
    expect(
      Object.values(actualWrites).reduce((total, count) => total + count, 0),
    ).toBe(18);
  });

  it("freezes all IndexedDB boundary blocks inside FileSystemService", () => {
    const actual = indexedDbCallsites(entries);
    expect(actual).toEqual(expectedIndexedDbCallsites);
    expect(
      Object.entries(actual)
        .filter(([key]) => key.includes("|transaction|"))
        .reduce((sum, [, count]) => sum + count, 0) +
        Object.entries(actual)
          .filter(([key]) => key.includes("|indexedDB|open|"))
          .reduce((sum, [, count]) => sum + count, 0),
    ).toBe(8);
    expect(
      Object.entries(actual)
        .filter(([key]) => /\|(put|delete)\|/.test(key))
        .reduce((sum, [, count]) => sum + count, 0),
    ).toBe(9);
  });

  it("gives every StorageService call an owner/workflow/projection/compatibility/dead disposition", () => {
    const allNamedCallsites = storageServiceCallsites(entries);
    const expected = Object.fromEntries(
      Object.entries(storageCallsiteDispositions).map(([key, [count]]) => [
        key,
        count,
      ]),
    );
    const actual = Object.fromEntries(
      Object.keys(expected).map((key) => [key, allNamedCallsites[key]]),
    );
    expect(actual).toEqual(expected);

    const dispositionTotals = {};
    for (const [key, [count, disposition, targetTranche]] of Object.entries(
      storageCallsiteDispositions,
    )) {
      dispositionTotals[disposition] =
        (dispositionTotals[disposition] || 0) + count;
      expect(targetTranche, key).toMatch(/^\d+(?:-\d+)?$/);
    }
    expect(dispositionTotals).toEqual({
      owner: 15,
      workflow: 13,
      projection: 7,
      compatibility: 13,
      dead: 1,
    });
  });

  it("freezes every named StorageService caller and its disposition", () => {
    const actual = namedMethodCallCounts(entries);
    expect(actual).toEqual(expectedNamedMethodCalls);

    const storageTotals = Object.fromEntries(
      storageServiceMethodNames.map((method) => [method, 0]),
    );
    const classTotals = { external: 0, helper: 0, internal: 0 };
    for (const [key, classification] of Object.entries(
      storageServiceCallClass,
    )) {
      const count = actual[key];
      expect(count, key).toBeTypeOf("number");
      const method = key.slice(key.lastIndexOf("|") + 1);
      storageTotals[method] += count;
      classTotals[classification] += count;
    }

    expect(storageTotals).toEqual(expectedStorageServiceCallsByMethod);
    expect(classTotals).toEqual({ external: 33, helper: 6, internal: 10 });
    expect(
      Object.values(storageTotals).reduce((sum, count) => sum + count, 0),
    ).toBe(49);
  });

  it("records the approved legacy writers and proves repository adapters are not active", () => {
    const storageDirectory = join(sourceRoot, "components/storage");
    expect(existsSync(storageDirectory)).toBe(false);

    const source = javascriptFiles(sourceRoot)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const candidate of repositoryCandidateNames) {
      expect(source).not.toContain(candidate);
    }

    expect(
      constructorCallsites(entries, [
        "StorageService",
        ...repositoryCandidateNames,
      ]),
    ).toEqual({
      "main.js|StorageService|{ eventBus, i18n: i18next }": 1,
    });

    expect(
      Object.keys(expectedScalarWrites).map((row) => row.split("|")[0]),
    ).toEqual([
      "components/services/StorageService.js",
      "components/services/StorageService.js",
      "components/services/commandPresentationState.js",
      "components/services/commandPresentationState.js",
      "components/services/keyBrowserViewState.js",
      "core/welcomeMessage.js",
      "core/welcomeMessage.js",
    ]);
  });

  it("freezes exact storage namespace, key, prefix, and value definitions", () => {
    const snippetsByFile = {
      "components/services/StorageService.js": [
        'storageKey = "sto_keybind_manager"',
        'backupKey = "sto_keybind_manager_backup"',
        'settingsKey = "sto_keybind_settings"',
        'localStorage.getItem("sto_app_reset")',
        'localStorage.setItem("sto_app_reset", "true")',
      ],
      "components/services/commandPresentationState.js": [
        'const collapsedSuffix = "_collapsed"',
        'const commandCategoryPrefix = "commandCategory_"',
        'const commandGroupPrefix = "commandGroup_"',
      ],
      "components/services/keyBrowserViewState.js": [
        'const collapsedSuffix = "_collapsed"',
        'const commandCategoryPrefix = "keyCategory_"',
        'const keyTypeCategoryPrefix = "keyTypeCategory_"',
        'const bindsetPrefix = "bindsetSection_"',
        'const keyViewModeStorageKey = "keyViewMode"',
      ],
      "components/services/FileSystemService.js": [
        'const DB_NAME = "sto-sync-handles"',
        'const STORE_NAME = "directories"',
        'export const KEY_SYNC_FOLDER = "sync-folder"',
        'const KEY_SYNC_FOLDER_TRANSITION = "sync-folder-transition-pending"',
        "const SYNC_FOLDER_TRANSITION_MARKER = true",
      ],
      "core/welcomeMessage.js": [
        'const VISITED_KEY = "sto_keybind_manager_visited"',
      ],
      "dev/DevMonitor.js": ['localStorage.getItem("dev-mode") === "true"'],
    };

    for (const [fileName, snippets] of Object.entries(snippetsByFile)) {
      const source = readFileSync(join(sourceRoot, fileName), "utf8");
      for (const snippet of snippets)
        expect(source, fileName).toContain(snippet);
    }
  });

  it("keeps routine state access out of production and RPC declarations", () => {
    const allowedTopics = [...rpcActionTopics, ...rpcComputationTopics].sort();
    const typeEntries = readdirSync(rpcTypeRoot)
      .filter((entry) => entry.endsWith(".d.ts"))
      .map((entry) => [entry, readFileSync(join(rpcTypeRoot, entry), "utf8")]);
    const declarations = declaredRpcTopics(typeEntries);
    const observed = observedRpcTopics(entries);

    expect(declarations).toEqual(allowedTopics);
    expect(observed.filter((topic) => !allowedTopics.includes(topic))).toEqual(
      [],
    );

    for (const topic of routineStateQueryTopics) {
      expect(declarations, topic).not.toContain(topic);
      expect(observed, topic).not.toContain(topic);
    }
  });

  it("does not hide changed source behind snapshot reuse", () => {
    expect(Object.isFrozen(entries)).toBe(true);
    expect(entries.every((entry) => Object.isFrozen(entry))).toBe(true);

    const mutable = [["probe.js", 'storage.setItem("first", "true");']];
    const baseline = scalarCallsites(mutable);
    mutable[0][1] = 'storage.setItem("second", "true");';
    expect(scalarCallsites(mutable)).not.toEqual(baseline);

    // Freezing only the outer array must not enable stale parse reuse.
    Object.freeze(mutable);
    const second = scalarCallsites(mutable);
    mutable[0][1] = 'storage.setItem("third", "true");';
    expect(scalarCallsites(mutable)).not.toEqual(second);

    const snapshot = Object.freeze(
      mutable.map((entry) => Object.freeze([...entry])),
    );
    const result = scalarCallsites(snapshot);
    expect(result).toEqual(scalarCallsites(snapshot));
    result[Object.keys(result)[0]] = 99;
    expect(scalarCallsites(snapshot)).not.toEqual(result);

    const changedSnapshot = Object.freeze([
      Object.freeze(["probe.js", 'storage.setItem("fourth", "true");']),
    ]);
    expect(scalarCallsites(changedSnapshot)).not.toEqual(
      scalarCallsites(snapshot),
    );
  });

  it("retains unusual and escaped literal calls through candidate filtering", () => {
    const baseline = scalarCallsites([
      ["probe.js", 'storage.setItem("approved", "true");'],
    ]);
    for (const source of [
      'storage.setItem\n\t("approved", "true");',
      'storage.setItem/* comment */("approved", "true");',
      'storage.setItem// comment\n("approved", "true");',
      'storage.setItem?.("approved", "true");',
      'storage[\n"setItem"\n]("approved", "true");',
      'storage[`setItem`]("approved", "true");',
      String.raw`storage.s\u0065tItem("approved", "true");`,
      String.raw`storage["s\x65tItem"]("approved", "true");`,
      String.raw`storage["set\
Item"]("approved", "true");`,
    ]) {
      expect(scalarCallsites([["probe.js", source]]), source).toEqual(baseline);
    }

    expect(
      indexedDbCallsites([["probe.js", String.raw`store.p\u0075t(value);`]]),
    ).toEqual({ "probe.js|top|store|put|value": 1 });
    expect(
      namedMethodCallCounts([
        ["probe.js", String.raw`storage["saveAll\u0044ata"](candidate);`],
      ]),
    ).toEqual({ "probe.js|storage|saveAllData": 1 });

    const snapshot = Object.freeze([
      Object.freeze([
        "probe.js",
        "const key = 1; storage.saveAllData(candidate);",
      ]),
    ]);
    expect(scalarCallsites(snapshot)).toEqual({});
    expect(namedMethodCallCounts(snapshot)).toEqual({
      "probe.js|storage|saveAllData": 1,
    });
    // Constructors can omit parentheses and must not use the call-method filter.
    expect(
      constructorCallsites(
        [["probe.js", "new StorageService;"]],
        ["StorageService"],
      ),
    ).toEqual({ "probe.js|StorageService": 1 });
  });

  it("detects unregistered scalar, IndexedDB, and RPC mutations", () => {
    const scalarBaseline = scalarCallsites([
      ["probe.js", 'storage.setItem("approved", "true");'],
    ]);
    for (const mutation of [
      'storage["setItem"]("other", "true");',
      'storage?.setItem("approved", "true"); storage.clear();',
      'storage.setItem("changed", "true");',
    ]) {
      expect(scalarCallsites([["probe.js", mutation]])).not.toEqual(
        scalarBaseline,
      );
    }

    const indexedDbBaseline = indexedDbCallsites([
      [
        "probe.js",
        'async function write(){ const tx = db.transaction("store", "readwrite"); const store = tx.objectStore("store"); store.put(value, "one"); }',
      ],
    ]);
    const extraIndexedDbWrite = indexedDbCallsites([
      [
        "probe.js",
        'async function write(){ const tx = db.transaction("store", "readwrite"); const store = tx.objectStore("store"); store.put(value, "one"); store.put(value, "two"); }',
      ],
    ]);
    expect(extraIndexedDbWrite).not.toEqual(indexedDbBaseline);
    for (const mutation of [
      "function wipe(){ store.clear(); }",
      'function drop(){ indexedDB.deleteDatabase("db"); }',
      'function open(){ window.indexedDB.open("db"); }',
    ]) {
      expect(
        Object.keys(indexedDbCallsites([["probe.js", mutation]])),
      ).not.toHaveLength(0);
    }

    const namedBaseline = namedMethodCallCounts([
      ["probe.js", "storage.saveAllData(candidate);"],
    ]);
    for (const mutation of [
      'storage["saveAllData"](candidate); storage.saveAllData(other);',
      "storage?.saveAllData(candidate); storage.saveAllData(other);",
    ]) {
      expect(namedMethodCallCounts([["probe.js", mutation]])).not.toEqual(
        namedBaseline,
      );
    }

    expect(
      observedRpcTopics([["probe.js", "service.request(`data:get-state`);"]]),
    ).toEqual(["data:get-state"]);
    expect(
      observedRpcTopics([
        [
          "probe.js",
          'eventBus.on("rpc:data:get-state", handler); eventBus.emit("rpc:preferences:read-state", payload);',
        ],
      ]),
    ).toEqual(["data:get-state", "preferences:read-state"]);
    expect([...rpcActionTopics, ...rpcComputationTopics]).not.toContain(
      "data:get-state",
    );
  });
});
