import { describe, expect, it } from "vitest";
import { materializeStorageSchemaMigrationReceipt } from "../../../src/js/components/storage/storageSchemaMigrationReceipt.js";
import {
  BACKUP,
  ROOT,
  SETTINGS,
  TIMESTAMP,
  legacyRoot,
  migrationFixture,
} from "../../fixtures/persistence/storageMigration.js";

describe("production structural settings migration", () => {
  it("verifies standalone defaults and exact backup before replacing the legacy root", () => {
    const raw = JSON.stringify(legacyRoot, null, 2);
    const fixture = migrationFixture([[ROOT, raw]]);
    const receipt = fixture.run();
    expect(receipt).toEqual({
      status: "complete",
      settingsVerified: true,
      source: "legacy",
      exactPriorRootBackedUp: true,
      rootLayout: "settings-free",
    });
    expect(materializeStorageSchemaMigrationReceipt(receipt)).toEqual(receipt);
    expect(JSON.parse(fixture.durable.get(SETTINGS))).toEqual(fixture.defaults);
    expect(JSON.parse(fixture.durable.get(BACKUP))).toEqual({
      data: raw,
      timestamp: TIMESTAMP,
      version: "2.0.0",
    });
    const { settings: retired, ...canonical } = legacyRoot;
    expect(JSON.parse(fixture.durable.get(ROOT))).toEqual(canonical);
    expect(retired.theme).toBe("embedded-must-not-win");
    const writes = fixture.trace.filter(([operation]) => operation === "write");
    expect(writes.map(([, key]) => key)).toEqual([SETTINGS, BACKUP, ROOT]);
    const before = fixture.durable.get(BACKUP);
    expect(fixture.restart()).toEqual({
      status: "absent",
      settingsVerified: true,
    });
    expect(fixture.durable.get(BACKUP)).toBe(before);
  });

  it.each([
    null,
    false,
    "ignored",
    ["ignored"],
    JSON.parse('{"__proto__":{"polluted":true}}'),
  ])("ignores hostile embedded settings %#", (settings) => {
    const fixture = migrationFixture([
      [ROOT, JSON.stringify({ ...legacyRoot, settings })],
    ]);
    expect(fixture.run().status).toBe("complete");
    expect(JSON.parse(fixture.durable.get(ROOT)).extension).toEqual(
      legacyRoot.extension,
    );
    expect(JSON.parse(fixture.durable.get(SETTINGS))).toEqual(fixture.defaults);
    expect({}.polluted).toBeUndefined();
  });

  it.each([ROOT, SETTINGS])(
    "blocks every owner before any write on %s read throw",
    (key) => {
      const fixture = migrationFixture();
      const read = fixture.storage.getItem.getMockImplementation();
      fixture.storage.getItem.mockImplementation((candidate) => {
        if (candidate === key)
          throw new DOMException("blocked", "SecurityError");
        return read(candidate);
      });
      const receipt = fixture.run();
      expect(receipt.status).toBe("failed");
      expect(receipt.settingsVerified).toBe(false);
      expect(receipt.error).toBe("storage_read_failed");
      expect(fixture.storage.setItem).not.toHaveBeenCalled();
      expect(fixture.durable.get(ROOT)).toBe(JSON.stringify(legacyRoot));
    },
  );

  it.each([SETTINGS, BACKUP, ROOT])(
    "remains restart-safe when %s write fails",
    (key) => {
      const fixture = migrationFixture();
      const write = fixture.storage.setItem.getMockImplementation();
      fixture.storage.setItem.mockImplementation((candidate, value) => {
        if (candidate === key)
          throw new DOMException("full", "QuotaExceededError");
        write(candidate, value);
      });
      expect(fixture.run().status).toBe("failed");
      expect(fixture.durable.get(ROOT)).toBe(JSON.stringify(legacyRoot));
      fixture.storage.setItem.mockImplementation(write);
      expect(fixture.restart().status).toBe("complete");
      expect(JSON.parse(fixture.durable.get(ROOT))).not.toHaveProperty(
        "settings",
      );
      expect(JSON.parse(fixture.durable.get(BACKUP)).data).toBe(
        JSON.stringify(legacyRoot),
      );
    },
  );

  it("does not rewrite a missing root or invent a migration marker", () => {
    const fixture = migrationFixture([]);
    expect(fixture.run()).toEqual({ status: "absent", settingsVerified: true });
    expect(fixture.durable.has(ROOT)).toBe(false);
    expect(fixture.durable.has(BACKUP)).toBe(false);
  });

  it.each([null, JSON.stringify({ ...legacyRoot, settings: undefined })])(
    "rejects a stale no-op root snapshot %#",
    (raw) => {
      const fixture = migrationFixture(raw === null ? [] : [[ROOT, raw]]);
      const write = fixture.storage.setItem.getMockImplementation();
      fixture.storage.setItem.mockImplementation((key, value) => {
        write(key, value);
        if (key === SETTINGS)
          fixture.durable.set(ROOT, JSON.stringify(legacyRoot));
      });
      expect(fixture.run()).toMatchObject({
        status: "failed",
        error: "operation_cancelled",
      });
      expect(fixture.durable.get(ROOT)).toBe(JSON.stringify(legacyRoot));
      expect(fixture.durable.has(BACKUP)).toBe(false);
    },
  );

  it.each([3, 4, 5])(
    "classifies explicit settings verification read failure %s",
    (failAt) => {
      const fixture = migrationFixture();
      const read = fixture.storage.getItem.getMockImplementation();
      let count = 0;
      fixture.storage.getItem.mockImplementation((key) => {
        if (key === SETTINGS && ++count === failAt)
          throw new Error("read blocked");
        return read(key);
      });
      expect(fixture.run()).toMatchObject({
        status: "failed",
        error: "storage_read_failed",
      });
    },
  );

  it("recovers invalid root bytes only after preserving their exact source", () => {
    const fixture = migrationFixture([[ROOT, "{not-json"]]);
    expect(fixture.run()).toMatchObject({
      status: "complete",
      source: "recovered_invalid",
    });
    expect(JSON.parse(fixture.durable.get(BACKUP)).data).toBe("{not-json");
    expect(JSON.parse(fixture.durable.get(ROOT))).toEqual({
      version: "2.0.0",
      created: TIMESTAMP,
      lastModified: TIMESTAMP,
      currentProfile: null,
      profiles: {},
      globalAliases: {},
    });
  });
});
