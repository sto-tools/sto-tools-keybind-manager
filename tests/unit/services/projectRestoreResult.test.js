import { describe, expect, it, vi } from "vitest";

import {
  classifyDataReloadResult,
  classifyProjectRestoreResult,
  isProjectImportFailure,
  isProjectImportSuccess,
  isProjectRestoreSuccess,
  materializeProjectImportSuccess,
} from "../../../src/js/components/services/projectRestoreResult.js";

const imported = { profiles: 2, settings: true };
const restoreSuccess = {
  success: true,
  currentProfile: "alpha",
  imported,
};

describe("project restore result boundary", () => {
  it("accepts only complete own-data import and restore success results", () => {
    expect(
      isProjectImportSuccess({
        ...restoreSuccess,
        message: "project_imported_successfully",
      }),
    ).toBe(true);
    expect(isProjectRestoreSuccess(restoreSuccess)).toBe(true);

    for (const malformed of [
      { success: true },
      { ...restoreSuccess, currentProfile: 42 },
      { ...restoreSuccess, imported: { profiles: -1, settings: true } },
      Object.create(restoreSuccess),
    ]) {
      expect(isProjectRestoreSuccess(malformed)).toBe(false);
    }
  });

  it("materializes a detached import-success receipt without invoking proxy reads", () => {
    const importedTarget = { profiles: 2, settings: true };
    const importedGet = vi.fn(() => {
      throw new Error("imported get trap must not run");
    });
    const resultGet = vi.fn(() => {
      throw new Error("result get trap must not run");
    });
    const importedProxy = new Proxy(importedTarget, { get: importedGet });
    const resultProxy = new Proxy(
      {
        success: true,
        message: "project_imported_successfully",
        currentProfile: "alpha",
        imported: importedProxy,
      },
      { get: resultGet },
    );

    const receipt = materializeProjectImportSuccess(resultProxy);

    expect(receipt).toEqual({
      currentProfile: "alpha",
      imported: { profiles: 2, settings: true },
    });
    expect(receipt?.imported).not.toBe(importedTarget);
    expect(resultGet).not.toHaveBeenCalled();
    expect(importedGet).not.toHaveBeenCalled();

    importedTarget.profiles = 9;
    expect(receipt?.imported.profiles).toBe(2);
  });

  it.each([
    { success: false, error: "storage_not_available" },
    { success: false, error: "import_failed_invalid_json" },
    {
      success: false,
      error: "invalid_project_file",
      params: { path: "$.data" },
    },
    {
      success: false,
      error: "invalid_project_options",
      params: { path: "$.options.importSettings" },
    },
    {
      success: false,
      error: "storage_write_failed",
      params: { operation: "profile", profileId: "alpha" },
      partial: true,
      committed: { profiles: ["alpha"], settings: false, project: false },
    },
  ])("accepts exact project import failure $error", (failure) => {
    expect(isProjectImportFailure(failure)).toBe(true);
  });

  it("rejects contradictory storage receipts", () => {
    const failure = {
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: false,
      committed: { profiles: ["alpha"], settings: false, project: false },
    };

    expect(isProjectImportFailure(failure)).toBe(false);
  });

  it("classifies exact phase failures without admitting inherited or sparse fields", () => {
    const reloadFailure = {
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "reload unavailable" },
      durable: true,
      currentProfile: "alpha",
      imported,
    };
    const storageFailure = {
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    };

    const classifiedReload = classifyProjectRestoreResult(reloadFailure);
    expect(classifiedReload).toEqual({
      kind: "activation-retryable-failure",
      error: "project_restore_reload_failed",
      params: { reason: "reload unavailable" },
      reason: "reload unavailable",
      receipt: {
        currentProfile: "alpha",
        imported: { profiles: 2, settings: true },
      },
    });
    expect(classifiedReload.receipt.imported).not.toBe(imported);
    expect(classifyProjectRestoreResult(storageFailure)).toMatchObject({
      kind: "terminal-failure",
      error: "storage_write_failed",
    });
    expect(
      classifyProjectRestoreResult({
        ...storageFailure,
        committed: { ...storageFailure.committed, profiles: new Array(1) },
      }),
    ).toMatchObject({ kind: "terminal-failure" });
    expect(classifyProjectRestoreResult(Object.create(reloadFailure))).toEqual({
      kind: "malformed",
    });
  });

  it.each([
    [
      "a consistent partial profile commit",
      true,
      { profiles: ["alpha"], settings: false, project: false },
    ],
    [
      "a committed settings write",
      true,
      { profiles: [], settings: true, project: false },
    ],
    [
      "a committed project write",
      true,
      { profiles: [], settings: false, project: true },
    ],
    [
      "committed writes hidden behind partial false",
      false,
      { profiles: ["alpha"], settings: false, project: false },
    ],
    [
      "partial true without an acknowledged write",
      true,
      { profiles: [], settings: false, project: false },
    ],
  ])("keeps storage failure with %s terminal", (_label, partial, committed) => {
    expect(
      classifyProjectRestoreResult({
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial,
        committed,
      }),
    ).toEqual({
      kind: "terminal-failure",
      error: "storage_write_failed",
      params: { operation: "project" },
    });
  });

  it("accepts an empty durable reload reason as an activation-only retry", () => {
    expect(
      classifyProjectRestoreResult({
        success: false,
        error: "project_restore_reload_failed",
        params: { reason: "" },
        durable: true,
        currentProfile: null,
        imported: { profiles: 0, settings: false },
      }),
    ).toEqual({
      kind: "activation-retryable-failure",
      error: "project_restore_reload_failed",
      params: { reason: "" },
      reason: "",
      receipt: {
        currentProfile: null,
        imported: { profiles: 0, settings: false },
      },
    });
  });

  it("keeps accessor- and proxy-backed storage receipts terminal", () => {
    const partialAccessor = {
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      committed: { profiles: [], settings: false, project: false },
    };
    Object.defineProperty(partialAccessor, "partial", {
      get() {
        throw new Error("partial getter must not run");
      },
    });
    const committedDescriptor = vi.fn(() => {
      throw new Error("committed descriptor trap");
    });
    const hostileCommitted = new Proxy(
      { profiles: [], settings: false, project: false },
      { getOwnPropertyDescriptor: committedDescriptor },
    );

    expect(() => classifyProjectRestoreResult(partialAccessor)).not.toThrow();
    expect(classifyProjectRestoreResult(partialAccessor)).toMatchObject({
      kind: "terminal-failure",
      error: "storage_write_failed",
    });
    expect(() =>
      classifyProjectRestoreResult({
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: false,
        committed: hostileCommitted,
      }),
    ).not.toThrow();
    expect(
      classifyProjectRestoreResult({
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: false,
        committed: hostileCommitted,
      }),
    ).toMatchObject({
      kind: "terminal-failure",
      error: "storage_write_failed",
    });
    expect(committedDescriptor).not.toHaveBeenCalled();
  });

  it("admits only own-data durable activation receipts without invoking accessors", () => {
    const accessorFailure = {
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "reload unavailable" },
      durable: true,
      imported: { profiles: 2, settings: true },
    };
    Object.defineProperty(accessorFailure, "currentProfile", {
      get() {
        throw new Error("currentProfile getter must not run");
      },
    });
    const inheritedImported = Object.create({ profiles: 2, settings: true });

    expect(() => classifyProjectRestoreResult(accessorFailure)).not.toThrow();
    expect(classifyProjectRestoreResult(accessorFailure)).toMatchObject({
      kind: "terminal-failure",
    });
    expect(
      classifyProjectRestoreResult({
        success: false,
        error: "project_restore_reload_failed",
        params: { reason: "reload unavailable" },
        durable: true,
        currentProfile: "alpha",
        imported: inheritedImported,
      }),
    ).toMatchObject({ kind: "terminal-failure" });
  });

  it("classifies proxy-backed own data without invoking property getters", () => {
    const topLevelGet = vi.fn(() => {
      throw new Error("top-level get trap must not run");
    });
    const importedGet = vi.fn(() => {
      throw new Error("imported get trap must not run");
    });
    const importedProxy = new Proxy(
      { profiles: 2, settings: true },
      {
        get: importedGet,
      },
    );

    const resultProxy = new Proxy(
      {
        success: false,
        error: "project_restore_reload_failed",
        params: { reason: "reload unavailable" },
        durable: true,
        currentProfile: "alpha",
        imported: importedProxy,
      },
      { get: topLevelGet },
    );

    expect(classifyProjectRestoreResult(resultProxy)).toEqual({
      kind: "activation-retryable-failure",
      error: "project_restore_reload_failed",
      params: { reason: "reload unavailable" },
      reason: "reload unavailable",
      receipt: {
        currentProfile: "alpha",
        imported: { profiles: 2, settings: true },
      },
    });
    expect(topLevelGet).not.toHaveBeenCalled();
    expect(importedGet).not.toHaveBeenCalled();
  });

  it("keeps a storage failure marker terminal when its discriminant is malformed", () => {
    expect(
      classifyProjectRestoreResult({
        success: "no",
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: false,
        committed: { profiles: [], settings: false, project: false },
      }),
    ).toEqual({
      kind: "terminal-failure",
      error: "storage_write_failed",
      params: { operation: "project" },
    });
  });

  it("keeps malformed success-like results distinct from terminal failures", () => {
    expect(classifyProjectRestoreResult({ success: true })).toEqual({
      kind: "malformed",
    });
    expect(
      classifyProjectRestoreResult({
        success: false,
        error: "invalid_project_file",
        params: { path: "$", reason: "ignored" },
      }),
    ).toEqual({
      kind: "terminal-failure",
      error: "invalid_project_file",
      params: { path: "$" },
    });
  });

  it("classifies complete reload acknowledgements and closes malformed variants", () => {
    expect(
      classifyDataReloadResult({
        success: true,
        profiles: 2,
        currentProfile: "alpha",
        environment: "space",
      }),
    ).toEqual({ kind: "success" });
    expect(
      classifyDataReloadResult({ success: false, error: "reload failed" }),
    ).toEqual({ kind: "failure", error: "reload failed" });
    expect(classifyDataReloadResult({ success: true })).toEqual({
      kind: "malformed",
    });
  });
});
