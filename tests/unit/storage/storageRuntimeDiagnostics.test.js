import { describe, expect, it, vi } from "vitest";
import { createStorageRuntimeDiagnostics } from "../../../src/js/components/storage/storageRuntimeDiagnostics.js";
import { materializeStorageDiagnosticSnapshot } from "../../../src/js/components/storage/storageDiagnosticSnapshot.js";

const row = (recorder, domain) =>
  recorder.snapshot().domains.find((value) => value.domain === domain);
const projectPort = (overrides = {}) => ({
  load: vi.fn(() => ({
    status: "current",
    value: { secret: "project contents" },
  })),
  commit: vi.fn(() => ({
    status: "committed",
    value: { secret: "project contents" },
  })),
  reset: vi.fn(() => ({ status: "reset" })),
  ...overrides,
});

describe("read-only storage runtime diagnostic observation", () => {
  it("distinguishes nominal domains, registered ports, and observed outcomes without querying", () => {
    const recorder = createStorageRuntimeDiagnostics();
    expect(recorder.snapshot().domains).toHaveLength(7);
    for (const domain of recorder.snapshot().domains) {
      expect(domain.portRegistered).toBe(false);
      expect(domain.structuralLayout).toBe("not-observed");
      expect(domain.lastOperation).toBeNull();
    }
    const raw = projectPort();
    const port = recorder.observeProjectRepository(raw);
    expect(Object.keys(port)).toEqual(["load", "commit", "reset"]);
    expect(Object.isFrozen(port)).toBe(true);
    expect(row(recorder, "project").portRegistered).toBe(true);
    expect(row(recorder, "project").lastOperation).toBeNull();
    recorder.snapshot();
    recorder.snapshot();
    expect(raw.load).not.toHaveBeenCalled();
    expect(raw.commit).not.toHaveBeenCalled();
    expect(raw.reset).not.toHaveBeenCalled();
  });

  it("preserves project call arity, argument identity, receiver, and exact result", () => {
    const recorder = createStorageRuntimeDiagnostics();
    const value = { private: "input graph" };
    const output = { status: "committed", value };
    const raw = projectPort({
      commit: vi.fn(function () {
        expect(this).toBe(raw);
        return output;
      }),
    });
    const port = recorder.observeProjectRepository(raw);
    expect(port.commit(value)).toBe(output);
    expect(raw.commit.mock.calls).toEqual([[value]]);
    const options = { verification: "required" };
    expect(port.commit(value, options)).toBe(output);
    expect(raw.commit.mock.calls[1]).toEqual([value, options]);
    expect(row(recorder, "project")).toMatchObject({
      structuralLayout: "settings-free",
      lastOperation: { status: "committed", committed: true },
    });
    expect(JSON.stringify(recorder.snapshot())).not.toContain("input graph");
  });

  it("retains successful root durability while reporting best-effort backup failure", () => {
    const recorder = createStorageRuntimeDiagnostics();
    const raw = projectPort({
      commit: vi.fn(() => ({
        status: "committed",
        value: { profiles: { sensitive: {} } },
        rootWrite: { status: "acknowledged" },
        backup: {
          status: "indeterminate",
          error: "backup_write_failed",
          category: "quota",
        },
        verification: { status: "not_requested" },
      })),
    });
    recorder.observeProjectRepository(raw).commit({});
    expect(row(recorder, "project").lastOperation).toMatchObject({
      status: "committed",
      committed: true,
      error: "backup_write_failed",
      category: "quota",
      stages: expect.arrayContaining([
        {
          stage: "backup",
          status: "indeterminate",
          committed: "indeterminate",
          error: "backup_write_failed",
          category: "quota",
        },
      ]),
    });
  });

  it.each([
    "missing",
    "invalid_json",
    "invalid_data",
    "legacy",
    "reset_pending",
  ])(
    "observes %s repair requirements and preserves their layout on failed writes",
    (reason) => {
      const recorder = createStorageRuntimeDiagnostics();
      const raw = projectPort({
        load: vi.fn(() => ({ status: "repair_required", reason, value: {} })),
        commit: vi.fn(() => ({
          status: "write_failed",
          error: "storage_write_failed",
          rootWrite: {
            status: "indeterminate",
            category: "security",
            error: "storage_write_failed",
          },
        })),
      });
      const port = recorder.observeProjectRepository(raw);
      port.load();
      const layout = row(recorder, "project").structuralLayout;
      expect(row(recorder, "project").lastOperation.reason).toBe(reason);
      port.commit({});
      expect(row(recorder, "project").structuralLayout).toBe(layout);
      expect(row(recorder, "project").lastOperation).toMatchObject({
        error: "storage_write_failed",
        category: "security",
        committed: "indeterminate",
      });
    },
  );

  it("records separate verified settings and clear outcomes without retaining settings", () => {
    const recorder = createStorageRuntimeDiagnostics();
    const settings = {
      language: "private-language",
      extensions: "private settings",
    };
    const raw = {
      load: vi.fn(() => ({ status: "current", value: settings })),
      replace: vi.fn(() => ({
        status: "committed",
        value: settings,
        write: { status: "acknowledged" },
        verification: { status: "verified" },
      })),
      clear: vi.fn(() => ({
        status: "cleared",
        removal: { status: "acknowledged" },
      })),
    };
    const port = recorder.observeSettingsRepository(raw);
    expect(port.load().value).toBe(settings);
    expect(port.replace(settings).value).toBe(settings);
    expect(row(recorder, "settings").structuralLayout).toBe(
      "standalone-settings",
    );
    expect(raw.replace).toHaveBeenCalledExactlyOnceWith(settings);
    port.clear();
    expect(row(recorder, "settings").structuralLayout).toBe("missing");
    expect(JSON.stringify(recorder.snapshot())).not.toContain(
      "private settings",
    );
  });

  it("records positively acknowledged root removal even when a later reset stage fails", () => {
    const recorder = createStorageRuntimeDiagnostics();
    const port = recorder.observeProjectRepository(
      projectPort({
        reset: () => ({
          status: "reset_failed",
          rootRemoval: { status: "acknowledged" },
          backupRemoval: {
            status: "indeterminate",
            error: "storage_write_failed",
            category: "quota",
          },
          sentinelWrite: { status: "not_attempted" },
        }),
      }),
    );
    port.load();
    expect(row(recorder, "project").structuralLayout).toBe("settings-free");
    port.reset();
    expect(row(recorder, "project")).toMatchObject({
      structuralLayout: "missing",
      lastOperation: {
        status: "reset_failed",
        error: "storage_write_failed",
        category: "quota",
      },
    });
    expect(row(recorder, "project").lastOperation.stages).toContainEqual({
      stage: "rootRemoval",
      status: "acknowledged",
      committed: true,
      error: null,
      category: null,
    });
  });

  it("covers each scalar operation with exactly the original port receiver/args/result", () => {
    const recorder = createStorageRuntimeDiagnostics();
    const secret = { names: ["private bindset/category"] };
    const cases = [
      [
        "observeCommandPresentation",
        "presentation",
        {
          load: [],
          replaceCategory: ["category", true],
          replaceGroup: ["pivot", false],
        },
      ],
      [
        "observeKeyBrowser",
        "key-browser",
        {
          load: [],
          replaceMode: ["grid"],
          replaceCategory: ["category", "key-type", true],
          replaceBindset: ["private bindset", false],
          isCategoryCollapsed: ["category", "key-type"],
          isBindsetCollapsed: ["private bindset"],
        },
      ],
      [
        "observeVisitedState",
        "welcome",
        {
          loadExact: [],
          markVisited: [],
          compensate: ["expected-private-marker", "previous-private-marker"],
        },
      ],
      ["observeDevelopmentFlag", "diagnostic", { isEnabled: [] }],
    ];
    for (const [factory, domain, operations] of cases) {
      const raw = {};
      for (const name of Object.keys(operations))
        raw[name] = vi.fn(function () {
          expect(this).toBe(raw);
          return secret;
        });
      const port = recorder[factory](raw);
      for (const [name, args] of Object.entries(operations)) {
        expect(port[name](...args)).toBe(secret);
        expect(raw[name]).toHaveBeenCalledExactlyOnceWith(...args);
        expect(row(recorder, domain).lastOperation.operation).toBe(name);
      }
    }
    expect(JSON.stringify(recorder.snapshot())).not.toContain(
      "private bindset",
    );
    expect(
      materializeStorageDiagnosticSnapshot(recorder.snapshot()),
    ).not.toBeNull();
  });

  it("observes welcome absence, not arbitrary marker contents", () => {
    const recorder = createStorageRuntimeDiagnostics();
    const port = recorder.observeVisitedState({
      loadExact: () => null,
      markVisited() {},
      compensate: () => false,
    });
    expect(port.loadExact()).toBeNull();
    expect(row(recorder, "welcome").structuralLayout).toBe("missing");
    expect(port.compensate("secret", "prior")).toBe(false);
    expect(row(recorder, "welcome").lastOperation.committed).toBeNull();
  });

  it("returns the original asynchronous promise and records capability presence, never validity", async () => {
    const recorder = createStorageRuntimeDiagnostics();
    const handle = { name: "private directory", getFileHandle() {} };
    const result = { handle, transitionPending: false };
    const promise = Promise.resolve(result);
    const raw = {
      getSyncDirectoryState: vi.fn(() => promise),
      beginSyncDirectoryTransition: vi.fn(() => Promise.resolve()),
      completeSyncDirectoryTransition: vi.fn(() => Promise.resolve()),
      restoreSyncDirectoryState: vi.fn(() => Promise.resolve()),
    };
    const port = recorder.observeFileSystem(raw);
    expect(port.getSyncDirectoryState()).toBe(promise);
    expect(await promise).toBe(result);
    expect(raw.getSyncDirectoryState).toHaveBeenCalledOnce();
    expect(row(recorder, "sync-capability").structuralLayout).toBe(
      "capability-present",
    );
    await port.beginSyncDirectoryTransition(handle);
    expect(raw.beginSyncDirectoryTransition).toHaveBeenCalledExactlyOnceWith(
      handle,
    );
    expect(row(recorder, "sync-capability").structuralLayout).toBe(
      "transition-pending",
    );
    await port.completeSyncDirectoryTransition();
    expect(row(recorder, "sync-capability").structuralLayout).toBe(
      "transition-clean",
    );
    await port.restoreSyncDirectoryState(result);
    expect(raw.restoreSyncDirectoryState).toHaveBeenCalledExactlyOnceWith(
      result,
    );
    expect(row(recorder, "sync-capability").structuralLayout).toBe(
      "not-observed",
    );
    expect(JSON.stringify(recorder.snapshot())).not.toContain(
      "private directory",
    );
  });

  it("does not invoke own Promise constructor accessors or subclass species while observing", () => {
    const recorder = createStorageRuntimeDiagnostics();
    recorder.observeProjectRepository(projectPort());
    const constructor = vi.fn(() => Promise);
    const promise = Promise.resolve({ success: true });
    Object.defineProperty(promise, "constructor", { get: constructor });
    const observed = recorder.observeWorkflowAction(
      "project",
      "restore",
      () => promise,
    );
    expect(observed()).toBe(promise);
    expect(constructor).not.toHaveBeenCalled();
    expect(row(recorder, "project").lastOperation).toBeNull();
    const species = vi.fn(() => Promise);
    class PrivatePromise extends Promise {
      static get [Symbol.species]() {
        return species();
      }
    }
    const subclass = new PrivatePromise((resolve) =>
      resolve({ success: true }),
    );
    const observer = recorder.observeWorkflowAction(
      "project",
      "activation",
      () => subclass,
    );
    expect(observer()).toBe(subclass);
    expect(species).not.toHaveBeenCalled();
    expect(row(recorder, "project").lastOperation).toBeNull();
  });

  it.each(["QuotaExceededError", "SecurityError"])(
    "preserves exact thrown %s without retaining exception text",
    async (name) => {
      const recorder = createStorageRuntimeDiagnostics();
      const error = new DOMException("private directory/profile", name);
      const promise = Promise.reject(error);
      const raw = {
        getSyncDirectoryState: vi.fn(() => promise),
        beginSyncDirectoryTransition: vi.fn(),
        completeSyncDirectoryTransition: vi.fn(),
        restoreSyncDirectoryState: vi.fn(),
      };
      const port = recorder.observeFileSystem(raw);
      expect(port.getSyncDirectoryState()).toBe(promise);
      await expect(promise).rejects.toBe(error);
      expect(row(recorder, "sync-capability").lastOperation).toMatchObject({
        status: "read_failed",
        category: name === "SecurityError" ? "security" : "quota",
      });
      expect(JSON.stringify(recorder.snapshot())).not.toContain(error.message);
    },
  );

  it("records closed partial workflow stages without altering synchronous or async completion", async () => {
    const recorder = createStorageRuntimeDiagnostics();
    const raw = projectPort();
    recorder.observeProjectRepository(raw);
    const result = {
      success: false,
      durable: true,
      error: "operation_cancelled",
      params: { reason: "private text" },
      receipt: {
        project: {
          status: "complete",
          committed: true,
          fingerprint: "private bytes",
        },
        dataActivation: {
          status: "failed",
          committed: false,
          error: "operation_cancelled",
        },
      },
    };
    const completion = { result, settlement: Promise.resolve() };
    const argument = { secret: "import bytes" };
    const owner = {
      action: vi.fn(function (...args) {
        expect(this).toBe(owner);
        expect(args).toEqual([argument]);
        return completion;
      }),
    };
    const sync = recorder.observeWorkflowAction(
      "project",
      "restore",
      owner.action.bind(owner),
    );
    expect(sync(argument)).toBe(completion);
    expect(owner.action).toHaveBeenCalledOnce();
    expect(row(recorder, "project").lastOperation).toMatchObject({
      status: "failed",
      error: "operation_cancelled",
      committed: true,
      stages: expect.arrayContaining([
        {
          stage: "dataActivation",
          status: "failed",
          committed: false,
          error: "operation_cancelled",
          category: null,
        },
      ]),
    });
    const promise = Promise.resolve(completion);
    const asyncAction = vi.fn(() => promise);
    expect(
      recorder.observeWorkflowAction(
        "project",
        "activation",
        asyncAction,
      )(argument),
    ).toBe(promise);
    await promise;
    expect(asyncAction).toHaveBeenCalledExactlyOnceWith(argument);
    expect(raw.load).not.toHaveBeenCalled();
    expect(JSON.stringify(recorder.snapshot())).not.toMatch(
      /private text|private bytes|import bytes/,
    );
  });

  it("classifies closed native lifecycle cancellation while preserving the same rejection", async () => {
    const recorder = createStorageRuntimeDiagnostics();
    recorder.observeProjectRepository(projectPort());
    const error = new Error("operation_cancelled");
    const sync = recorder.observeWorkflowAction("project", "reset", () => {
      throw error;
    });
    expect(sync).toThrow(error);
    expect(row(recorder, "project").lastOperation.error).toBe(
      "operation_cancelled",
    );
    const promise = Promise.reject(error);
    const observed = recorder.observeWorkflowAction(
      "project",
      "restore",
      () => promise,
    );
    expect(observed()).toBe(promise);
    await expect(promise).rejects.toBe(error);
    expect(row(recorder, "project").lastOperation.error).toBe(
      "operation_cancelled",
    );
  });

  it("contains hostile observation metadata and does not change a successful result or Promise", async () => {
    const recorder = createStorageRuntimeDiagnostics();
    const result = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("private trap");
        },
      },
    );
    const raw = projectPort({ load: vi.fn(() => result) });
    expect(recorder.observeProjectRepository(raw).load()).toBe(result);
    const promise = Promise.resolve({ result });
    expect(
      recorder.observeWorkflowAction("project", "restore", () => promise)(),
    ).toBe(promise);
    await promise;
    expect(row(recorder, "project").lastOperation.status).toBe(
      "invalid_observation",
    );
    expect(
      materializeStorageDiagnosticSnapshot(recorder.snapshot()),
    ).not.toBeNull();
  });
});
