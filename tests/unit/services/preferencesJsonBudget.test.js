import { describe, expect, it, vi } from "vitest";
import { hasBoundedPreferencesJson } from "../../../src/js/components/services/preferencesJsonBudget.js";
import {
  MAX_PROJECT_JSON_BYTES,
  MAX_PROJECT_JSON_DEPTH,
} from "../../../src/js/components/services/jsonDataBoundary.js";
import { materializePreferenceSettingsMutation } from "../../../src/js/components/services/preferencesMutationBoundary.js";
import { materializeSettingsWriteResult } from "../../../src/js/components/services/preferencesRepositoryBoundary.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";

describe("detached preferences JSON budget", () => {
  it.each([
    null,
    true,
    false,
    0,
    -0,
    1e100,
    "",
    "ascii",
    " ~\u007f",
    "\u001f",
    '"',
    "\\",
    "\u0080",
    "é",
    "中",
    "😀",
    "\ud800",
    "\udfff",
    "\ud800x\udfff",
    '"\\\b\t\n\f\r\u0000\u001f',
    [1, "é", null],
    { '😀"': [false, "\ud800"] },
  ])("matches exact encoded JSON bytes for %j", (value) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    expect(hasBoundedPreferencesJson(value, bytes - 1)).toBe(false);
    expect(hasBoundedPreferencesJson(value, bytes)).toBe(true);
    expect(hasBoundedPreferencesJson(value, bytes + 1)).toBe(true);
  });

  it("includes every repeated subtree without expanding a shared DAG", () => {
    const leaf = { value: "é" };
    const shared = { first: leaf, second: leaf };
    const bytes = new TextEncoder().encode(JSON.stringify(shared)).byteLength;
    expect(hasBoundedPreferencesJson(shared, bytes)).toBe(true);
    expect(hasBoundedPreferencesJson(shared, bytes - 1)).toBe(false);
    let expanded = { leaf: true };
    for (let index = 0; index < 60; index += 1)
      expanded = { first: expanded, second: expanded };
    expect(hasBoundedPreferencesJson(expanded)).toBe(false);
  });

  it("checks deepest expanded paths even when a subtree was memoized shallowly", () => {
    let shared = { leaf: true };
    for (let index = 0; index < 50; index += 1) shared = { next: shared };
    let deep = shared;
    for (let index = 0; index < 49; index += 1) deep = { next: deep };
    expect(hasBoundedPreferencesJson(deep)).toBe(true);
    expect(hasBoundedPreferencesJson({ shallow: shared, deep })).toBe(false);
    let exact = true;
    for (let index = 0; index < MAX_PROJECT_JSON_DEPTH; index += 1)
      exact = { next: exact };
    expect(hasBoundedPreferencesJson(exact)).toBe(true);
    expect(hasBoundedPreferencesJson({ next: exact })).toBe(false);
  });

  it("rejects cycles without serialization or recursion overflow", () => {
    const cyclic = {};
    cyclic.self = cyclic;
    expect(hasBoundedPreferencesJson(cyclic)).toBe(false);
  });

  it("accepts near and exact production limits but rejects the next byte", () => {
    const exact = "x".repeat(MAX_PROJECT_JSON_BYTES - 2);
    expect(hasBoundedPreferencesJson(exact.slice(1))).toBe(true);
    expect(hasBoundedPreferencesJson(exact)).toBe(true);
    expect(hasBoundedPreferencesJson(`${exact}x`)).toBe(false);
  });

  it("does not charge receipt metadata against the canonical value byte limit", () => {
    const value = { ...createDefaultPreferencesSettings(), extension: "" };
    const overhead = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    value.extension = "x".repeat(MAX_PROJECT_JSON_BYTES - overhead);
    const receipt = {
      status: "committed",
      value,
      write: { status: "acknowledged" },
      verification: { status: "verified" },
    };
    expect(
      materializeSettingsWriteResult(receipt)?.value.extension.length,
    ).toBe(value.extension.length);
    value.extension += "x";
    expect(materializeSettingsWriteResult(receipt)).toBeNull();
  });

  it("does not charge receipt nesting against canonical value depth", () => {
    let extension = true;
    for (let index = 1; index < MAX_PROJECT_JSON_DEPTH; index += 1)
      extension = { next: extension };
    const value = { ...createDefaultPreferencesSettings(), extension };
    expect(
      materializeSettingsWriteResult({
        status: "committed",
        value,
        write: { status: "acknowledged" },
        verification: { status: "verified" },
      }),
    ).not.toBeNull();
  });

  it("reflects each caller identity once and only measures detached values", () => {
    const ownKeys = vi.fn(Reflect.ownKeys);
    const getOwnPropertyDescriptor = vi.fn(Reflect.getOwnPropertyDescriptor);
    const get = vi.fn(() => {
      throw new Error("caller reread");
    });
    const shared = new Proxy(
      { text: "é" },
      { ownKeys, getOwnPropertyDescriptor, get },
    );
    const detached = materializePreferenceSettingsMutation({
      first: shared,
      second: shared,
    });
    expect(detached).toEqual({ first: { text: "é" }, second: { text: "é" } });
    expect(ownKeys).toHaveBeenCalledTimes(1);
    expect(getOwnPropertyDescriptor).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  });
});
