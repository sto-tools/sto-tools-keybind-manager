import { describe, expect, it, vi } from "vitest";

import {
  materializePreferenceMutation,
  materializePreferenceSettingsMutation,
  materializeSyncFolderSettingsMutation,
} from "../../../src/js/components/services/preferencesMutationBoundary.js";
import { extensionPreferenceKey } from "../../../src/js/components/services/preferenceKeys.js";

describe("preferences mutation materializers", () => {
  it("materializes the exact known and extension mutation shapes once", () => {
    const known = Object.freeze({
      key: "autoSave",
      value: false,
      extension: false,
    });
    const extensionValue = Object.freeze({
      panels: Object.freeze([{ id: "commands", visible: true }]),
    });
    const extension = Object.freeze({
      key: extensionPreferenceKey("plugin:layout"),
      value: extensionValue,
      extension: true,
    });

    expect(materializePreferenceMutation(known)).toEqual(known);
    const detached = materializePreferenceMutation(extension);
    expect(detached).toEqual(extension);
    expect(detached).not.toBe(extension);
    expect(detached?.value).not.toBe(extensionValue);
  });

  it("rejects inexact or descriptor-hostile single-setting envelopes without invoking accessors", () => {
    const keyGetter = vi.fn(() => "autoSave");
    const nestedGetter = vi.fn(() => "compact");
    const accessorEnvelope = { value: false };
    Object.defineProperty(accessorEnvelope, "key", {
      enumerable: true,
      get: keyGetter,
    });
    const accessorValue = {};
    Object.defineProperty(accessorValue, "density", {
      enumerable: true,
      get: nestedGetter,
    });
    const hiddenEnvelope = { key: "autoSave" };
    Object.defineProperty(hiddenEnvelope, "value", {
      enumerable: false,
      value: false,
    });
    class MutationEnvelope {
      constructor() {
        this.key = "autoSave";
        this.value = false;
      }
    }
    const hostileProxy = new Proxy(
      { key: "autoSave", value: false },
      {
        ownKeys() {
          throw new Error("producer reflection failure");
        },
      },
    );

    for (const candidate of [
      { key: "autoSave", value: false, extra: true },
      accessorEnvelope,
      {
        key: extensionPreferenceKey("plugin:layout"),
        value: accessorValue,
        extension: true,
      },
      hiddenEnvelope,
      new MutationEnvelope(),
      hostileProxy,
    ]) {
      expect(() => materializePreferenceMutation(candidate)).not.toThrow();
      expect(materializePreferenceMutation(candidate)).toBeNull();
    }
    expect(keyGetter).not.toHaveBeenCalled();
    expect(nestedGetter).not.toHaveBeenCalled();
  });

  it("materializes a bulk patch as detached JSON data while retaining extension fields", () => {
    const nested = Object.assign(Object.create(null), {
      density: "compact",
      rows: [{ id: "primary", enabled: true }],
    });
    const patch = Object.assign(Object.create(null), {
      autoSave: false,
      "plugin:layout": nested,
    });

    const materialized = materializePreferenceSettingsMutation(patch);

    expect(materialized).toEqual({
      autoSave: false,
      "plugin:layout": {
        density: "compact",
        rows: [{ id: "primary", enabled: true }],
      },
    });
    expect(materialized).not.toBe(patch);
    expect(materialized?.["plugin:layout"]).not.toBe(nested);
  });

  it("rejects descriptor-hostile bulk data without invoking accessors", () => {
    const settingGetter = vi.fn(() => false);
    const nestedGetter = vi.fn(() => "compact");
    const accessorPatch = {};
    Object.defineProperty(accessorPatch, "autoSave", {
      enumerable: true,
      get: settingGetter,
    });
    const nested = {};
    Object.defineProperty(nested, "density", {
      enumerable: true,
      get: nestedGetter,
    });
    const hiddenPatch = {};
    Object.defineProperty(hiddenPatch, "autoSave", {
      enumerable: false,
      value: false,
    });
    class SettingsPatch {
      autoSave = false;
    }
    const hostileProxy = new Proxy(
      { autoSave: false },
      {
        getOwnPropertyDescriptor() {
          throw new Error("producer reflection failure");
        },
      },
    );

    for (const candidate of [
      accessorPatch,
      { "plugin:layout": nested },
      hiddenPatch,
      new SettingsPatch(),
      hostileProxy,
      { autoSave: "false" },
      JSON.parse('{"constructor":{"polluted":true}}'),
    ]) {
      expect(() =>
        materializePreferenceSettingsMutation(candidate),
      ).not.toThrow();
      expect(materializePreferenceSettingsMutation(candidate)).toBeNull();
    }
    expect(settingGetter).not.toHaveBeenCalled();
    expect(nestedGetter).not.toHaveBeenCalled();
  });

  it("materializes only the exact sync-folder mutation shape", () => {
    const canonical = Object.freeze({
      syncFolderName: "Fleet Builds",
      syncFolderPath: "Selected folder: Fleet Builds",
      syncFolderFallback: false,
      autoSync: true,
    });

    expect(materializeSyncFolderSettingsMutation(canonical)).toEqual(canonical);
    expect(
      materializeSyncFolderSettingsMutation({
        ...canonical,
        language: "de",
      }),
    ).toBeNull();
  });

  it("rejects descriptor-hostile sync-folder envelopes without invoking accessors", () => {
    const folderNameGetter = vi.fn(() => "Fleet Builds");
    const accessorEnvelope = {
      syncFolderPath: "Selected folder: Fleet Builds",
      syncFolderFallback: false,
      autoSync: true,
    };
    Object.defineProperty(accessorEnvelope, "syncFolderName", {
      enumerable: true,
      get: folderNameGetter,
    });
    const hiddenEnvelope = {
      syncFolderName: "Fleet Builds",
      syncFolderPath: "Selected folder: Fleet Builds",
      syncFolderFallback: false,
    };
    Object.defineProperty(hiddenEnvelope, "autoSync", {
      enumerable: false,
      value: true,
    });
    class SyncFolderEnvelope {
      syncFolderName = "Fleet Builds";
      syncFolderPath = "Selected folder: Fleet Builds";
      syncFolderFallback = false;
      autoSync = true;
    }
    const hostileProxy = new Proxy(
      {
        syncFolderName: "Fleet Builds",
        syncFolderPath: "Selected folder: Fleet Builds",
        syncFolderFallback: false,
        autoSync: true,
      },
      {
        ownKeys() {
          throw new Error("producer reflection failure");
        },
      },
    );

    for (const candidate of [
      accessorEnvelope,
      hiddenEnvelope,
      new SyncFolderEnvelope(),
      hostileProxy,
    ]) {
      expect(() =>
        materializeSyncFolderSettingsMutation(candidate),
      ).not.toThrow();
      expect(materializeSyncFolderSettingsMutation(candidate)).toBeNull();
    }
    expect(folderNameGetter).not.toHaveBeenCalled();
  });
});
