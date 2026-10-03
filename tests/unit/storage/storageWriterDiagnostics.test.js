import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STORAGE_DIAGNOSTIC_REGISTRATIONS } from "../../../src/js/components/storage/storageDiagnosticSnapshot.js";
import {
  concreteAdapters,
  storageRepresentations,
} from "../../fixtures/tooling/storageArchitectureInventory.js";
import {
  adapterRegistrations,
  indexedDbWriterMethods,
  representationWriterRoutes,
  runtimeDiagnosticEscapes,
  storageArchitectureViolations,
} from "../../fixtures/tooling/storageArchitectureScanner.js";
import {
  scalarCallsites,
  sourceEntries,
} from "../../fixtures/tooling/persistenceScanner.js";

describe("storage writer structural diagnostics", () => {
  const entries = sourceEntries();
  let routes;
  let registrations;
  let architectureViolations;
  let sourceEscapes;
  let bundleEscapes;
  let indexedDbMethods;

  // Repository and minified-bundle analysis is bounded suite setup, not a
  // per-assertion scan. Coverage amplifies traversal cost; immutable snapshots
  // share ASTs and each complete observation is computed once. Assertion and
  // negative-probe tests retain the existing 10-second test timeout.
  beforeAll(() => {
    routes = representationWriterRoutes(entries);
    sourceEscapes = runtimeDiagnosticEscapes(entries);
    architectureViolations = storageArchitectureViolations(entries);
    registrations = adapterRegistrations(entries);
    indexedDbMethods = indexedDbWriterMethods(entries);
    const bundle = readFileSync(
      join(process.cwd(), "src/dist/bundle.js"),
      "utf8",
    );
    const bundleEntries = Object.freeze([
      Object.freeze(["src/dist/bundle.js", bundle]),
    ]);
    bundleEscapes = runtimeDiagnosticEscapes(bundleEntries);
  }, 60000);

  it("keeps source and the checked production bundle free of retired live-runtime diagnostic registries", () => {
    expect(sourceEscapes).toEqual([]);
    expect(bundleEscapes).toEqual([]);
  });

  it.each([
    "devMonitor.runtimeDiagnostics = { eventBus, projectRepository };",
    "devMonitor.getRuntimeDiagnostics = () => ({ dataCoordinator });",
    "devMonitor.registerRuntimeDiagnostics({ eventBus });",
    "devMonitor?.clearRuntimeDiagnostics();",
    'devMonitor["getRuntime" + "Diagnostics"]();',
    String.raw`devMonitor.getRuntime\u0044iagnostics();`,
    'const registry = { ["runtimeDiagnostics"]: { eventBus } };',
    'class Monitor { ["registerRuntimeDiagnostics"](runtime) { return runtime; } }',
    'Object.defineProperty(devMonitor, "runtimeDiagnostics", { value: owners });',
    'Reflect.set(devMonitor, "registerRuntimeDiagnostics", register);',
  ])("rejects a reintroduced live diagnostic escape: %s", (source) => {
    expect(runtimeDiagnosticEscapes([["probe.js", source]])).not.toHaveLength(
      0,
    );
  });

  it("does not treat inert comments or descriptive text as live runtime capabilities", () => {
    expect(
      runtimeDiagnosticEscapes([
        [
          "probe.js",
          '// runtimeDiagnostics is retired\nconst documentation = "getRuntimeDiagnostics";',
        ],
      ]),
    ).toEqual([]);
  });

  it("never reuses a stale AST for mutable probes or newly captured source", () => {
    const mutable = [["probe.js", "storage.setItem(key, value);"]];
    expect(storageArchitectureViolations(mutable)).not.toHaveLength(0);
    mutable[0][1] = "const safe = 1;";
    expect(storageArchitectureViolations(mutable)).toEqual([]);
    Object.freeze(mutable);
    expect(runtimeDiagnosticEscapes(mutable)).toEqual([]);
    mutable[0][1] = "devMonitor.getRuntimeDiagnostics();";
    expect(runtimeDiagnosticEscapes(mutable)).not.toHaveLength(0);
    const snapshot = Object.freeze(
      mutable.map((entry) => Object.freeze([...entry])),
    );
    const first = runtimeDiagnosticEscapes(snapshot);
    first.length = 0;
    expect(runtimeDiagnosticEscapes(snapshot)).not.toHaveLength(0);
    expect(storageArchitectureViolations(snapshot)).toEqual([]);
    const changedSnapshot = Object.freeze([
      Object.freeze(["probe.js", "storage.removeItem(key);"]),
    ]);
    expect(runtimeDiagnosticEscapes(changedSnapshot)).toEqual([]);
    expect(storageArchitectureViolations(changedSnapshot)).not.toHaveLength(0);
  });

  it("keeps the migration receipt materializer pure (relocated from the physical access ratchet)", () => {
    const file = "components/storage/storageSchemaMigrationReceipt.js";
    const source = new Map(entries).get(file);
    expect(source).not.toMatch(
      /^\s*import\b|\b(?:localStorage|storage|eventBus|ComponentBase)\b\s*(?:\.|\()/m,
    );
    expect(scalarCallsites([[file, source]])).toEqual({});
  });

  it("rejects direct persistence capabilities, extraction, and dynamic storage access outside approved boundaries", () => {
    expect(architectureViolations).toEqual([]);
    for (const source of [
      'localStorage.setItem("root", candidate);',
      'window?.["localStorage"].getItem("root");',
      'globalThis["local" + "Storage"].removeItem("root");',
      "const alias = localStorage; alias[action](key, value);",
      "const { localStorage: alias } = window; alias.setItem(key, value);",
      'const { ["localStorage"]: alias } = window; alias[verb](key, value);',
      'const { "indexedDB": alias } = globalThis; alias[verb](name);',
      "const put = capability.setItem; put(key, value);",
      'const { ["setItem"]: put } = capability; put(key, value);',
      "storage[method](key, value);",
      "store[operation](value, key);",
      "database.transaction(storeName, mode);",
      "objectStore.put(value, key);",
      "const { put: write } = capability; write(value, key);",
      'globalThis["indexed" + "DB"].open(name);',
      'import("../storage/LocalStorageProjectRepository.js");',
      "import(dynamicModule);",
    ]) {
      expect(
        storageArchitectureViolations([
          ["components/services/probe.js", source],
        ]),
        source,
      ).not.toHaveLength(0);
    }
    expect(
      storageArchitectureViolations([
        [
          "probe.js",
          '// localStorage.setItem(key, value)\nconst text = "indexedDB.put(value)";',
        ],
      ]),
    ).toEqual([]);
  });

  it("keeps development diagnostic registrations identical to the independent static authority matrix", () => {
    const domains = new Map(
      storageRepresentations.map(({ domain, owner, port, adapter }) => [
        domain,
        { domain, owner, port, adapter },
      ]),
    );
    expect([...domains.values()]).toEqual(STORAGE_DIAGNOSTIC_REGISTRATIONS);
    expect(Object.isFrozen(STORAGE_DIAGNOSTIC_REGISTRATIONS)).toBe(true);
    expect(STORAGE_DIAGNOSTIC_REGISTRATIONS.every(Object.isFrozen)).toBe(true);
  });

  it("registers every concrete domain adapter once at the production composition root", () => {
    expect(
      registrations.toSorted((a, b) => a.adapter.localeCompare(b.adapter)),
    ).toEqual(
      concreteAdapters
        .map((adapter) => ({ file: "main.js", adapter }))
        .sort((a, b) => a.adapter.localeCompare(b.adapter)),
    );
  });

  it("assigns one authority to every maintained key or UI-state family", () => {
    expect(storageRepresentations).toHaveLength(14);
    expect(
      new Set(storageRepresentations.map((row) => row.representation)).size,
    ).toBe(14);
    expect(
      [...new Set(storageRepresentations.map((row) => row.domain))].sort(),
    ).toEqual([
      "diagnostic",
      "key-browser",
      "presentation",
      "project",
      "settings",
      "sync-capability",
      "welcome",
    ]);
    for (const row of storageRepresentations) {
      const writers = routes.filter((route) =>
        route.representations.includes(row.representation),
      );
      expect(
        [...new Set(writers.map((writer) => writer.adapter))],
        row.representation,
      ).toEqual(row.access === "read-only" ? [] : [row.adapter]);
    }
  });

  it("keeps exact per-representation route counts, including generic sync key methods", () => {
    expect(indexedDbMethods).toEqual({ put: 5, delete: 4 });
    const counts = Object.fromEntries(
      storageRepresentations.map(({ representation }) => [
        representation,
        routes
          .filter((route) => route.representations.includes(representation))
          .reduce((sum, route) => sum + route.count, 0),
      ]),
    );
    expect(counts).toEqual({
      sto_keybind_manager: 3,
      sto_keybind_manager_backup: 3,
      sto_app_reset: 2,
      sto_keybind_settings: 2,
      "commandCategory_*_collapsed": 1,
      "commandGroup_*_collapsed": 2,
      keyViewMode: 1,
      "keyCategory_*_collapsed": 1,
      "keyTypeCategory_*_collapsed": 1,
      "bindsetSection_*_collapsed": 1,
      sto_keybind_manager_visited: 3,
      "dev-mode": 0,
      "sto-sync-handles/directories/sync-folder": 5,
      "sto-sync-handles/directories/sync-folder-transition-pending": 6,
    });
    // Shared category and generic sync key routes appear in multiple rows;
    // these representation counts are not additional physical write sites.
    expect(routes.reduce((sum, route) => sum + route.count, 0)).toBe(30);
    const transport = routes.filter(
      (route) => route.adapter === "scoped-transport",
    );
    expect(transport.map((route) => route.callsite)).toEqual([
      "components/storage/scopedLocalStorage.js|this.#storage|setItem|key|value",
      "components/storage/scopedLocalStorage.js|this.#storage|removeItem|key",
    ]);
    expect(
      routes.filter(
        (route) =>
          route.adapter !== "scoped-transport" &&
          route.representations.length === 0,
      ),
    ).toEqual([]);
  });

  it("keeps privileged migration under the existing project adapter authority", () => {
    const privileged = routes.filter((route) =>
      route.callsite.startsWith(
        "components/storage/projectSchemaMigrationPersistence.js|",
      ),
    );
    expect(privileged).toHaveLength(2);
    expect(
      privileged.every(
        (route) => route.adapter === "LocalStorageProjectRepository",
      ),
    ).toBe(true);
    expect(
      registrations.filter((row) => /Migration|Scoped/.test(row.adapter)),
    ).toEqual([]);
  });

  it("reports every unregistered writer rather than absorbing it into the matrix", () => {
    const probes = [
      [
        "components/storage/SecondProjectWriter.js",
        'storage.setItem("sto_keybind_manager", candidate);',
      ],
      [
        "components/storage/LocalStorageProjectRepository.js",
        "storage.setItem(OTHER_KEY, candidate);",
      ],
    ];
    for (const probe of probes) {
      const observed = representationWriterRoutes([probe]);
      expect(observed).toHaveLength(1);
      expect(observed[0].representations).toEqual([]);
    }
  });

  it("recognizes duplicate and moved imported constructor aliases", () => {
    const alias =
      'import Writer from "./components/storage/LocalStorageProjectRepository.js"; new Writer(options); new Writer(options);';
    expect(adapterRegistrations([["main.js", alias]])).toEqual([
      { file: "main.js", adapter: "LocalStorageProjectRepository" },
      { file: "main.js", adapter: "LocalStorageProjectRepository" },
    ]);
    expect(
      storageArchitectureViolations([["app.js", alias]]).map((row) => row.code),
    ).toEqual([
      "adapter_import_outside_composition",
      "adapter_constructor_outside_composition",
      "adapter_constructor_outside_composition",
    ]);
    for (const source of [
      'import { default as Writer } from "./storage/LocalStorageProjectRepository.js"; new Writer(options);',
      'import * as Adapter from "./storage/LocalStorageProjectRepository.js"; new Adapter.default(options);',
      'import * as Adapter from "./storage/LocalStorageProjectRepository.js"; new Adapter["default"](options);',
      'import Writer from "./storage/LocalStorageProjectRepository.js"; const Alias = Writer; new Alias(options);',
    ]) {
      expect(adapterRegistrations([["main.js", source]]), source).toEqual([
        { file: "main.js", adapter: "LocalStorageProjectRepository" },
      ]);
    }
    expect(
      indexedDbWriterMethods([
        [
          "components/services/FileSystemService.js",
          "renamedStore.put(value, key); renamedStore.clear();",
        ],
      ]),
    ).toEqual({ put: 1, clear: 1 });
  });
});
