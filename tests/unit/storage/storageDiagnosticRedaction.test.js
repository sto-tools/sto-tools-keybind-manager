import { describe, expect, it, vi } from "vitest";
import { createStorageRuntimeDiagnostics } from "../../../src/js/components/storage/storageRuntimeDiagnostics.js";
import {
  DIAGNOSTIC_ERRORS,
  DIAGNOSTIC_REASONS,
  DIAGNOSTIC_STAGE_NAMES,
  DIAGNOSTIC_STATUSES,
  STORAGE_DIAGNOSTIC_REGISTRATIONS,
  materializeStorageDiagnosticSnapshot,
} from "../../../src/js/components/storage/storageDiagnosticSnapshot.js";

const snapshot = () => createStorageRuntimeDiagnostics().snapshot();
const mutable = () => structuredClone(snapshot());
const validObservation = () => ({
  operation: "load",
  status: "current",
  error: null,
  category: null,
  committed: null,
  reason: null,
  stages: [],
});

function expectDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const item of Object.values(value)) expectDeepFrozen(item);
}

describe("closed detached storage diagnostic snapshots", () => {
  it("re-materializes all seven exact registered identities as deep frozen own data", () => {
    const input = mutable();
    const output = materializeStorageDiagnosticSnapshot(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output.domains).not.toBe(input.domains);
    expectDeepFrozen(output);
    input.domains[0].owner = "secret owner name";
    expect(output.domains[0].owner).toBe("DataCoordinator");
  });

  it("returns detached and temporally stable copies of observed receipts", () => {
    const recorder = createStorageRuntimeDiagnostics();
    const receipt = {
      status: "complete",
      settingsVerified: true,
      source: "legacy",
      exactPriorRootBackedUp: true,
      rootLayout: "settings-free",
    };
    recorder.recordMigrationReceipt(receipt);
    const first = recorder.snapshot();
    expect(first.domains[0].lastMigration).toEqual(receipt);
    receipt.source = "secret profile name";
    recorder.recordMigrationReceipt({
      status: "failed",
      settingsVerified: true,
      stage: "canonical_root_commit",
      error: "storage_write_failed",
    });
    expect(first.domains[0].lastMigration.source).toBe("legacy");
    expect(recorder.snapshot().domains[0].lastMigration.status).toBe("failed");
    expect(recorder.snapshot().domains[0].structuralLayout).toBe(
      "settings-free",
    );
    expect(first.domains[0].lastMigration).not.toBe(
      first.domains[1].lastMigration,
    );
    expectDeepFrozen(first);
  });

  it("does not invent settings-free project evidence from an absent migration receipt", () => {
    const recorder = createStorageRuntimeDiagnostics();
    recorder.recordMigrationReceipt({
      status: "absent",
      settingsVerified: true,
    });
    expect(recorder.snapshot().domains[0]).toMatchObject({
      structuralLayout: "not-observed",
      lastMigration: { status: "absent", settingsVerified: true },
    });
    expect(recorder.snapshot().domains[1].structuralLayout).toBe(
      "standalone-settings",
    );
    expect(
      materializeStorageDiagnosticSnapshot(recorder.snapshot()),
    ).not.toBeNull();
  });

  it("discards user content and never evaluates result value/raw/cause/path accessors", () => {
    const recorder = createStorageRuntimeDiagnostics();
    const getter = vi.fn(() => "private content");
    const result = { status: "current", arbitrary: () => "service lookup" };
    for (const key of ["value", "raw", "cause", "path", "params", "toJSON"])
      Object.defineProperty(result, key, { get: getter, enumerable: true });
    const port = recorder.observeProjectRepository({
      load: () => result,
      commit() {},
      reset() {},
    });
    expect(port.load()).toBe(result);
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(recorder.snapshot())).not.toMatch(
      /private content|arbitrary|service lookup/,
    );
    expect(
      materializeStorageDiagnosticSnapshot(recorder.snapshot()),
    ).not.toBeNull();
  });

  it.each(["operation", "status", "error", "category", "committed", "reason"])(
    "rejects arbitrary observation %s strings",
    (key) => {
      const input = mutable();
      input.domains[0].portRegistered = true;
      input.domains[0].lastOperation = {
        ...validObservation(),
        [key]: "private user data",
      };
      expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    },
  );

  it.each(["owner", "port", "adapter", "domain"])(
    "rejects forged static %s identity",
    (key) => {
      const input = mutable();
      input.domains[0][key] = "private user data";
      expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    },
  );

  it("enforces exact root/row/observation/stage shapes and bounded arrays", () => {
    expect(
      materializeStorageDiagnosticSnapshot({ ...snapshot(), eventBus: {} }),
    ).toBeNull();
    for (const key of Object.keys(mutable().domains[0])) {
      const input = mutable();
      delete input.domains[0][key];
      expect(materializeStorageDiagnosticSnapshot(input), key).toBeNull();
    }
    for (const extra of ["service", "repository", "getState", "contents"]) {
      const input = mutable();
      input.domains[0][extra] = () => {};
      expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    }
    const input = mutable();
    input.domains[0].portRegistered = true;
    input.domains[0].lastOperation = validObservation();
    input.domains[0].lastOperation.stages = [
      {
        stage: "rootWrite",
        status: "acknowledged",
        committed: true,
        error: null,
        category: null,
      },
    ];
    expect(materializeStorageDiagnosticSnapshot(input)).not.toBeNull();
    input.domains[0].lastOperation.stages.push({
      ...input.domains[0].lastOperation.stages[0],
    });
    expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    input.domains[0].lastOperation.stages = Array.from(
      { length: DIAGNOSTIC_STAGE_NAMES.length + 1 },
      () => ({}),
    );
    expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    expect(
      materializeStorageDiagnosticSnapshot({
        domains: Array(100).fill(input.domains[0]),
      }),
    ).toBeNull();
  });

  it("rejects observations on unregistered ports and cross-domain operations/layouts", () => {
    const input = mutable();
    input.domains[0].lastOperation = validObservation();
    expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    input.domains[0].portRegistered = true;
    input.domains[0].lastOperation.operation = "isEnabled";
    expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    input.domains[0].lastOperation = null;
    input.domains[0].structuralLayout = "capability-present";
    expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    input.domains[0].structuralLayout = "not-observed";
    input.domains[1].structuralLayout = "settings-free";
    expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    input.domains[1].structuralLayout = "not-observed";
    input.domains[2].lastMigration = {
      status: "absent",
      settingsVerified: true,
    };
    expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
  });

  it("rejects accessors, hidden fields, inherited fields, symbols, sparse arrays and extra array keys without evaluation", () => {
    const getter = vi.fn(() => "private content");
    const input = mutable();
    Object.defineProperty(input.domains[0], "owner", {
      get: getter,
      enumerable: true,
    });
    expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    const inherited = Object.create(snapshot());
    expect(materializeStorageDiagnosticSnapshot(inherited)).toBeNull();
    const hidden = mutable();
    Object.defineProperty(hidden.domains[0], "secret", {
      value: "private",
      enumerable: false,
    });
    expect(materializeStorageDiagnosticSnapshot(hidden)).toBeNull();
    const symbol = mutable();
    symbol[Symbol("secret")] = "private";
    expect(materializeStorageDiagnosticSnapshot(symbol)).toBeNull();
    const sparse = mutable();
    delete sparse.domains[2];
    expect(materializeStorageDiagnosticSnapshot(sparse)).toBeNull();
    const accessorArray = mutable();
    Object.defineProperty(accessorArray.domains, "0", {
      get: getter,
      enumerable: true,
    });
    expect(materializeStorageDiagnosticSnapshot(accessorArray)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    const extraArray = mutable();
    extraArray.domains.secret = "private";
    expect(materializeStorageDiagnosticSnapshot(extraArray)).toBeNull();
  });

  it.each(["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"])(
    "contains hostile %s proxy failures",
    (trap) => {
      const input = new Proxy(snapshot(), {
        [trap]() {
          throw new Error("private exception");
        },
      });
      expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
    },
  );

  it("rejects poisoned migration metadata and ignores it in recorder without evaluating accessors", () => {
    const recorder = createStorageRuntimeDiagnostics();
    const getter = vi.fn(() => "absent");
    const receipt = { settingsVerified: true };
    Object.defineProperty(receipt, "status", { get: getter, enumerable: true });
    recorder.recordMigrationReceipt(receipt);
    expect(recorder.snapshot().domains[0].lastMigration).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    const input = mutable();
    input.domains[0].lastMigration = {
      status: "absent",
      settingsVerified: true,
      raw: "private data",
    };
    expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
  });

  it("keeps exported registry and enum tables immutable so consumers cannot extend accepted codes", () => {
    expectDeepFrozen(STORAGE_DIAGNOSTIC_REGISTRATIONS);
    for (const table of [
      DIAGNOSTIC_ERRORS,
      DIAGNOSTIC_REASONS,
      DIAGNOSTIC_STATUSES,
      DIAGNOSTIC_STAGE_NAMES,
    ]) {
      expect(Object.isFrozen(table)).toBe(true);
      expect(() => table.push("private data")).toThrow(TypeError);
      expect(table.add).toBeUndefined();
    }
    const input = mutable();
    input.domains[0].portRegistered = true;
    input.domains[0].lastOperation = {
      ...validObservation(),
      error: "private data",
    };
    expect(materializeStorageDiagnosticSnapshot(input)).toBeNull();
  });
});
