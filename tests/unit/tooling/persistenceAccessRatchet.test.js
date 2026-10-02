import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  closedReadCohortRules,
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
  unusedRepositoryScalarCallsites,
  unusedRepositoryScalarWrites,
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

    expect(actualCallsites).toEqual({
      ...expectedScalarCallsites,
      ...unusedRepositoryScalarCallsites,
    });
    expect(actualCallsByFile).toEqual(expectedCallsByFile);
    expect(
      Object.values(actualCallsByFile).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(48);
  });

  it("freezes the exact physical scalar writers and their owner-bound modules", () => {
    const actualWrites = {};
    for (const [callsite, count] of Object.entries(scalarCallsites(entries))) {
      const [fileName, , method] = callsite.split("|");
      if (!["setItem", "removeItem", "clear"].includes(method)) continue;
      const key = `${fileName}|${method}`;
      actualWrites[key] = (actualWrites[key] || 0) + count;
    }

    expect(actualWrites).toEqual({
      ...expectedScalarWrites,
      ...unusedRepositoryScalarWrites,
    });
    expect(
      Object.values(actualWrites).reduce((sum, count) => sum + count, 0),
    ).toBe(21);
    expect(
      Object.entries(actualWrites)
        .filter(([key]) => !key.startsWith("components/storage/"))
        .reduce((total, [, count]) => total + count, 0),
    ).toBe(0);
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
    expect(dispositionTotals).toEqual({});
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
    expect(classTotals).toEqual({ external: 0, helper: 0, internal: 0 });
    expect(
      Object.values(storageTotals).reduce((sum, count) => sum + count, 0),
    ).toBe(0);
  });

  it("keeps the closed read cohort off storage and repository access", () => {
    const sourceByFile = new Map(entries);

    for (const [fileName, rule] of Object.entries(closedReadCohortRules)) {
      const source = sourceByFile.get(fileName);
      expect(source, fileName).toBeTypeOf("string");

      if (rule.forbidStorageDependency) {
        expect(source, fileName).not.toMatch(
          /\b(?:this|service)\s*(?:\.|\?\.)\s*storage\b/,
        );
        expect(source, fileName).not.toMatch(
          /(?:constructor\s*\(\s*\{|@param\s*\{\{)[^}]*\bstorage\??\s*:/s,
        );
      }

      if (rule.forbidRepositoryDependency) {
        expect(source, fileName).not.toMatch(
          /\b(?:project|settings)?repository\b|\/storage\//i,
        );
      }

      for (const method of rule.forbiddenStorageMethods || []) {
        expect(source, fileName).not.toMatch(
          new RegExp(
            `\\b(?:this\\s*(?:\\.|\\?\\.)\\s*)?storage\\s*(?:\\.|\\?\\.)\\s*${method}\\b`,
          ),
        );
      }
    }
  });

  it("activates exactly one project adapter and no legacy project writer", () => {
    const storageDirectory = join(sourceRoot, "components/storage");
    expect(existsSync(storageDirectory)).toBe(true);
    expect(readdirSync(storageDirectory).sort()).toEqual([
      "CommandPresentationPersistencePort.js",
      "DevelopmentFlagPort.js",
      "KeyBrowserPersistencePort.js",
      "LocalStorageCommandPresentationPersistence.js",
      "LocalStorageDevelopmentFlagPersistence.js",
      "LocalStorageKeyBrowserPersistence.js",
      "LocalStorageProjectRepository.js",
      "LocalStorageSettingsRepository.js",
      "LocalStorageVisitedStatePersistence.js",
      "ProjectRepository.js",
      "SettingsRepository.js",
      "VisitedStatePort.js",
      "projectRepositoryBoundary.js",
      "projectSchemaMigrationPersistence.js",
      "repositoryJsonBoundary.js",
      "repositoryResults.js",
      "scopedLocalStorage.js",
      "settingsRepositoryBoundary.js",
      "storageSchemaMigration.js",
      "storageSchemaMigrationReceipt.js",
    ]);

    const receiptImport =
      'import { materializeStorageSchemaMigrationReceipt } from "../storage/storageSchemaMigrationReceipt.js";';
    const preferencesFile = "components/services/PreferencesService.js";
    const preferencesSource = new Map(entries).get(preferencesFile);
    expect(preferencesSource.split(receiptImport)).toHaveLength(2);
    const source = entries
      .filter(
        ([file]) =>
          !file.startsWith("components/storage/") && file !== "main.js",
      )
      .map(([file, contents]) => {
        // This one exact pure receipt import is not a concrete adapter or a
        // privileged persistence capability; all other runtime imports stay shut.
        return file === preferencesFile
          ? contents.replace(receiptImport, "")
          : contents;
      })
      .join("\n");
    // Type-only port references are allowed; concrete runtime imports are not.
    expect(source).not.toMatch(/(?:from\s*|import\s*)["'][^"']*\/storage\//);
    const composition = ["main.js", "app.js"]
      .map((file) => readFileSync(join(sourceRoot, file), "utf8"))
      .join("\n");
    expect(`${source}\n${composition}`).not.toMatch(
      /preflightStorageSchemaMigration|projectRepository\s*\.\s*createMigrationInspectionPort/,
    );
    expect(source).not.toMatch(
      /storageSchemaMigration|runStorageSchemaMigration|createSchemaMigrationPort|createProjectSchemaMigrationPort|createMigrationInspectionPort/,
    );
    const mainSource = readFileSync(join(sourceRoot, "main.js"), "utf8");
    expect(mainSource).toContain(
      'import { runStorageSchemaMigration } from "./components/storage/storageSchemaMigration.js";',
    );
    const compactMain = mainSource.replace(/\s+/g, " ").trim();
    const startupCall =
      /const startupMigration = runStorageSchemaMigration\(\{.*?\}\);/g;
    const ownerFacade = /projectRepository:\s*Object\.freeze\(\{.*?\}\)/g;
    expect(compactMain.match(startupCall)).toEqual([
      "const startupMigration = runStorageSchemaMigration({ settingsRepository, settingsInspection: settingsRepository.createMigrationInspectionPort(), projectMigration: projectRepository.createSchemaMigrationPort(), defaults, version: stoData.settings.version, now: () => new Date().toISOString(), });",
    ]);
    expect(compactMain.match(ownerFacade)).toEqual([
      "projectRepository: Object.freeze({ load: projectRepository.load.bind(projectRepository), commit: projectRepository.commit.bind(projectRepository), reset: projectRepository.reset.bind(projectRepository), })",
    ]);
    const receiptSource = readFileSync(
      join(storageDirectory, "storageSchemaMigrationReceipt.js"),
      "utf8",
    );
    expect(receiptSource).not.toMatch(
      /^\s*import\b|\b(?:localStorage|storage|eventBus|ComponentBase)\b\s*(?:\.|\()/m,
    );
    expect(
      scalarCallsites([["storageSchemaMigrationReceipt.js", receiptSource]]),
    ).toEqual({});
    for (const candidate of repositoryCandidateNames.filter((name) =>
      name.startsWith("LocalStorage"),
    )) {
      expect(source).not.toContain(candidate);
    }
    expect(
      entries
        .filter(
          ([file, contents]) =>
            !file.startsWith("components/storage/") &&
            contents.includes("settingsRepository"),
        )
        .map(([file]) => file)
        .sort(),
    ).toEqual([
      "components/services/PreferencesService.js",
      "components/services/preferencesApplicationReset.js",
      "components/services/preferencesImportActivation.js",
      "components/services/preferencesOwnerMutationOperations.js",
      "main.js",
    ]);

    expect(constructorCallsites(entries, ["StorageService"])).toEqual({});
    expect(constructorCallsites(entries, repositoryCandidateNames)).toEqual({
      "main.js|LocalStorageSettingsRepository|{ storage: settingsStorage, defaults, }": 1,
      "main.js|LocalStorageProjectRepository|{ storage: settingsStorage, version: stoData.settings.version, now: () => new Date().toISOString(), }": 1,
      "main.js|LocalStorageVisitedStatePersistence|{ storage: settingsStorage, }": 1,
      "main.js|LocalStorageCommandPresentationPersistence|{ storage: settingsStorage, }": 1,
      "main.js|LocalStorageKeyBrowserPersistence|{ storage: settingsStorage, }": 1,
      "main.js|LocalStorageDevelopmentFlagPersistence|{ storage: settingsStorage, }": 1,
    });

    const dataCoordinatorSource = readFileSync(
      join(sourceRoot, "components/services/DataCoordinator.js"),
      "utf8",
    );
    expect(dataCoordinatorSource).not.toMatch(
      /constructor\s*\(\s*\{[^}]*\bstorage\b/s,
    );
    expect(dataCoordinatorSource).not.toContain("this.storage");
    expect(
      existsSync(join(sourceRoot, "components/services/storageWrites.js")),
    ).toBe(false);

    const storageServiceSource = readFileSync(
      join(sourceRoot, "components/services/StorageService.js"),
      "utf8",
    );
    expect(storageServiceSource).not.toMatch(
      /\b(?:getAllData|saveAllData|getProfile|saveProfile|deleteProfile|createBackup|invalidateCache)\s*\(/,
    );

    expect(
      Object.keys(expectedScalarWrites).every((row) =>
        row.startsWith("components/storage/"),
      ),
    ).toBe(true);

    for (const file of javascriptFiles(storageDirectory)) {
      const adapterSource = readFileSync(file, "utf8");
      expect(adapterSource, file).not.toMatch(
        /\b(?:localStorage|window|eventBus|ComponentBase)\b/,
      );
      expect(adapterSource, file).not.toMatch(
        /\.(?:emit|respond|request|addEventListener)\s*\(/,
      );
    }
  });

  it("freezes exact storage namespace, key, prefix, and value definitions", () => {
    const snippetsByFile = {
      "components/storage/LocalStorageProjectRepository.js": [
        'const ROOT_KEY = "sto_keybind_manager"',
        'const BACKUP_KEY = "sto_keybind_manager_backup"',
        'const RESET_KEY = "sto_app_reset"',
        'this.#storage.setItem(RESET_KEY, "true")',
      ],
      "components/storage/LocalStorageSettingsRepository.js": [
        'const SETTINGS_KEY = "sto_keybind_settings"',
      ],
      "components/storage/projectSchemaMigrationPersistence.js": [
        'const ROOT_KEY = "sto_keybind_manager"',
        'const BACKUP_KEY = "sto_keybind_manager_backup"',
      ],
      "components/storage/LocalStorageCommandPresentationPersistence.js": [
        'const SUFFIX = "_collapsed"',
        'const CATEGORY_PREFIX = "commandCategory_"',
        "`commandGroup_${group}${SUFFIX}`",
      ],
      "components/storage/LocalStorageKeyBrowserPersistence.js": [
        'const SUFFIX = "_collapsed"',
        '"keyCategory_"',
        '"keyTypeCategory_"',
        "`bindsetSection_${bindsetName}${SUFFIX}`",
        'const MODE_KEY = "keyViewMode"',
      ],
      "components/services/FileSystemService.js": [
        'const DB_NAME = "sto-sync-handles"',
        'const STORE_NAME = "directories"',
        'export const KEY_SYNC_FOLDER = "sync-folder"',
        'const KEY_SYNC_FOLDER_TRANSITION = "sync-folder-transition-pending"',
        "const SYNC_FOLDER_TRANSITION_MARKER = true",
      ],
      "components/storage/LocalStorageVisitedStatePersistence.js": [
        'const VISITED_KEY = "sto_keybind_manager_visited"',
      ],
      "components/storage/LocalStorageDevelopmentFlagPersistence.js": [
        'this.#storage.getItem("dev-mode") === "true"',
      ],
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
