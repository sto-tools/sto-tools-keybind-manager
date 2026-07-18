import { describe, expect, it, vi } from "vitest";

import {
  bindsetErrorTranslationKey,
  countBindsetKeys,
  planBindsetDeletion,
  planBindsetMutation,
  validateBindsetName,
} from "../../../src/js/components/ui/keyBrowserBindsetWorkflow.js";

const i18n = {
  t: vi.fn((key, params) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  ),
};

const createProfile = () => ({
  bindsets: {
    Tactical: {
      space: { keys: { F1: ["FireAll"], F2: ["Target_Enemy_Near"] } },
      ground: { keys: { G1: ["Target_Next_Enemy"] } },
    },
    Empty: {
      space: { keys: {} },
      ground: { keys: {} },
    },
  },
});

describe("keyBrowserBindsetWorkflow", () => {
  it("counts one accepted bindset snapshot across space and ground", () => {
    const profile = createProfile();

    expect(countBindsetKeys(profile, "Tactical")).toBe(3);
    expect(countBindsetKeys(profile, "Empty")).toBe(0);
    expect(countBindsetKeys(profile, "Missing")).toBe(0);
    expect(countBindsetKeys(null, "Tactical")).toBe(0);
  });

  it("returns an empty-bindset deletion plan without mutating the snapshot", async () => {
    const profile = createProfile();
    const before = structuredClone(profile);
    const confirmDialog = { confirm: vi.fn(async () => true) };
    const bindsetDeleteConfirm = { confirm: vi.fn() };

    const plan = await planBindsetDeletion({
      profile,
      bindsetName: "Empty",
      confirmDialog,
      bindsetDeleteConfirm,
      i18n,
    });

    expect(plan).toEqual({
      topic: "bindset:delete",
      payload: { name: "Empty" },
      keyCount: 0,
    });
    expect(confirmDialog.confirm).toHaveBeenCalledWith(
      'confirm_delete_bindset:{"name":"Empty"}',
      "confirm_delete",
      "danger",
      "bindsetDelete",
    );
    expect(bindsetDeleteConfirm.confirm).not.toHaveBeenCalled();
    expect(profile).toEqual(before);
  });

  it("uses the multi-step confirmation for nonempty bindsets", async () => {
    const profile = createProfile();
    const confirmDialog = { confirm: vi.fn() };
    const bindsetDeleteConfirm = { confirm: vi.fn(async () => true) };

    await expect(
      planBindsetDeletion({
        profile,
        bindsetName: "Tactical",
        confirmDialog,
        bindsetDeleteConfirm,
        i18n,
      }),
    ).resolves.toEqual({
      topic: "bindset:delete-with-keys",
      payload: { name: "Tactical" },
      keyCount: 3,
    });
    expect(bindsetDeleteConfirm.confirm).toHaveBeenCalledWith(
      "Tactical",
      3,
      "bindsetDelete",
    );
    expect(confirmDialog.confirm).not.toHaveBeenCalled();
  });

  it("returns no deletion plan when confirmation is cancelled or unavailable", async () => {
    const profile = createProfile();

    await expect(
      planBindsetDeletion({
        profile,
        bindsetName: "Tactical",
        confirmDialog: { confirm: vi.fn() },
        bindsetDeleteConfirm: { confirm: vi.fn(async () => false) },
        i18n,
      }),
    ).resolves.toBeNull();
    await expect(
      planBindsetDeletion({
        profile,
        bindsetName: "Empty",
        confirmDialog: null,
        bindsetDeleteConfirm: { confirm: vi.fn() },
        i18n,
      }),
    ).resolves.toBeNull();
    await expect(
      planBindsetDeletion({
        profile,
        bindsetName: "",
        confirmDialog: { confirm: vi.fn() },
        bindsetDeleteConfirm: { confirm: vi.fn() },
        i18n,
      }),
    ).resolves.toBeNull();
  });

  it.each([
    [
      "create",
      undefined,
      "  Science  ",
      { topic: "bindset:create", payload: { name: "Science" } },
      undefined,
    ],
    [
      "clone",
      "Tactical",
      " Tactical Copy ",
      {
        topic: "bindset:clone",
        payload: {
          sourceBindset: "Tactical",
          targetBindset: "Tactical Copy",
        },
      },
      "Tactical copy_suffix",
    ],
    [
      "rename",
      "Tactical",
      "  Weapons  ",
      {
        topic: "bindset:rename",
        payload: { oldName: "Tactical", newName: "Weapons" },
      },
      "Tactical",
    ],
  ])(
    "plans a %s operation from the prompted name",
    async (operation, sourceName, answer, expected, defaultValue) => {
      const inputDialog = { prompt: vi.fn(async () => answer) };

      const plan = await planBindsetMutation({
        operation,
        sourceName,
        existingNames: ["Tactical", "Engineering"],
        inputDialog,
        i18n,
      });

      expect(plan).toEqual(expected);
      expect(inputDialog.prompt).toHaveBeenCalledWith(
        "enter_bindset_name",
        expect.objectContaining({
          title: `${operation}_bindset`,
          placeholder: "bindset_name",
          ...(defaultValue === undefined ? {} : { defaultValue }),
          validate: expect.any(Function),
        }),
      );
    },
  );

  it("uses the translated primary-bindset clone default", async () => {
    const inputDialog = { prompt: vi.fn(async () => "Primary Copy") };

    await planBindsetMutation({
      operation: "clone",
      sourceName: "Primary Bindset",
      existingNames: ["Primary Bindset"],
      inputDialog,
      i18n,
    });

    expect(inputDialog.prompt.mock.calls[0][1].defaultValue).toBe(
      "primary_bindset_copy_default",
    );
  });

  it.each([null, undefined, "", "   ", "Tactical"])(
    "returns no mutation plan for a cancelled or unchanged prompt (%s)",
    async (answer) => {
      const inputDialog = { prompt: vi.fn(async () => answer) };

      await expect(
        planBindsetMutation({
          operation: "rename",
          sourceName: "Tactical",
          existingNames: ["Tactical"],
          inputDialog,
          i18n,
        }),
      ).resolves.toBeNull();
    },
  );

  it("does not prompt when no input dialog is available", async () => {
    await expect(
      planBindsetMutation({
        operation: "create",
        existingNames: [],
        inputDialog: null,
        i18n,
      }),
    ).resolves.toBeNull();
  });

  it.each([
    ["", "name_required"],
    [" Tactical ", "name_unchanged"],
    [" Engineering ", "name_exists"],
    ["Science", true],
  ])("validates a proposed bindset name %j", (value, expected) => {
    expect(
      validateBindsetName(value, {
        existingNames: ["Tactical", "Engineering"],
        sourceName: "Tactical",
        i18n,
      }),
    ).toBe(expected);
  });

  it.each([
    ["invalid_name", "invalid_name"],
    ["name_exists", "bindset_name_in_use"],
    ["not_found", "not_found"],
    ["not_empty", "bindset_not_empty"],
    ["unexpected", "error"],
    [null, "error"],
  ])("maps %j to translation key %s", (error, expected) => {
    expect(bindsetErrorTranslationKey(error)).toBe(expected);
  });
});
