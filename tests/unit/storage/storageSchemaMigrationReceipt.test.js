import { describe, expect, it, vi } from "vitest";
import {
  materializeStorageMigrationRecord,
  materializeStorageSchemaMigrationReceipt,
} from "../../../src/js/components/storage/storageSchemaMigrationReceipt.js";

const materialize = materializeStorageSchemaMigrationReceipt;
const receipts = [
  { status: "absent", settingsVerified: true },
  ...["legacy", "recovered_invalid", "missing"].flatMap((source) =>
    [false, true].map((exactPriorRootBackedUp) => ({
      status: "complete",
      settingsVerified: true,
      source,
      exactPriorRootBackedUp,
      rootLayout: "settings-free",
    })),
  ),
  ...["legacy_root_backup", "canonical_root_commit"].map((stage) => ({
    status: "pending",
    settingsVerified: true,
    stage,
  })),
  ...[
    "settings_read",
    "settings_write",
    "settings_verify",
    "legacy_root_decode",
    "legacy_root_backup",
    "canonical_root_commit",
    "canonical_root_verify",
  ].flatMap((stage) =>
    [false, true].map((settingsVerified) => ({
      status: "failed",
      settingsVerified,
      stage,
      error: "verification_failed",
    })),
  ),
];

describe("closed storage schema migration receipt", () => {
  it.each(receipts)("detaches design receipt %#", (receipt) => {
    const result = materialize(receipt);
    expect(result).toEqual(receipt);
    expect(result).not.toBe(receipt);
    receipt = structuredClone(receipt);
    receipt.status = "caller-mutated";
    expect(result.status).not.toBe(receipt.status);
  });

  it.each([
    "invalid_json",
    "invalid_data",
    "serialization_failed",
    "storage_read_failed",
    "storage_write_failed",
    "backup_write_failed",
    "verification_failed",
    "operation_cancelled",
  ])("accepts only closed safe diagnostic code %s", (error) => {
    const receipt = {
      status: "failed",
      settingsVerified: false,
      stage: "settings_read",
      error,
    };
    expect(materialize(receipt)).toEqual(receipt);
  });

  it.each(receipts)(
    "rejects missing, extra and invalid fields %#",
    (receipt) => {
      for (const key of Object.keys(receipt)) {
        const missing = { ...receipt };
        delete missing[key];
        expect(materialize(missing), key).toBeNull();
        expect(materialize({ ...receipt, [key]: 1 }), key).toBeNull();
        expect(materialize({ ...receipt, [key]: null }), key).toBeNull();
        expect(
          materialize({ ...receipt, [key]: "unapproved" }),
          key,
        ).toBeNull();
      }
      expect(materialize({ ...receipt, raw: "private user data" })).toBeNull();
      expect(
        materialize({ ...receipt, stage: "secret arbitrary stage" }),
      ).toBeNull();
    },
  );

  it.each([undefined, null, [], true, 1, "complete", new Date(), {}])(
    "rejects non-receipt %#",
    (input) => expect(materialize(input)).toBeNull(),
  );

  it("rejects accessors, inherited fields, symbols and hidden data without evaluation", () => {
    const getter = vi.fn(() => "absent");
    const input = { settingsVerified: true };
    Object.defineProperty(input, "status", { get: getter, enumerable: true });
    expect(materialize(input)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    const inherited = Object.create({ status: "absent" });
    inherited.settingsVerified = true;
    expect(materialize(inherited)).toBeNull();
    expect(materialize({ ...receipts[0], [Symbol("data")]: true })).toBeNull();
    const hidden = { ...receipts[0] };
    Object.defineProperty(hidden, "status", { enumerable: false });
    expect(materialize(hidden)).toBeNull();
    expect(
      materialize(Object.assign(Object.create(null), receipts[0])),
    ).toEqual(receipts[0]);
  });

  it("contains reflective failures and never returns thrown user data", () => {
    for (const trap of [
      "getPrototypeOf",
      "ownKeys",
      "getOwnPropertyDescriptor",
    ]) {
      const input = new Proxy(
        { ...receipts[0] },
        {
          [trap]() {
            throw new Error("private profile/command/settings");
          },
        },
      );
      expect(materialize(input)).toBeNull();
    }
    const vanished = new Proxy(
      { ...receipts[0] },
      {
        getOwnPropertyDescriptor: () => undefined,
      },
    );
    expect(materialize(vanished)).toBeNull();
  });

  it("bounds the flat envelope before inspecting payloads and keeps raw strings exact", () => {
    expect(
      materializeStorageMigrationRecord({ a: "one", b: "two" }, ["a"]),
    ).toBeNull();
    expect(
      materializeStorageMigrationRecord({ raw: ' { "x": "\\n" } ' }, ["raw"]),
    ).toEqual({ raw: ' { "x": "\\n" } ' });
    expect(materializeStorageMigrationRecord({ raw: null }, ["raw"])).toEqual({
      raw: null,
    });
  });

  it("requires positive settings verification for nonfailure receipts", () => {
    for (const receipt of receipts.filter(
      ({ status }) => status !== "failed",
    )) {
      expect(materialize({ ...receipt, settingsVerified: false })).toBeNull();
    }
  });
});
