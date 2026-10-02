import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import { normalizeProfile } from "../../../src/js/lib/profileNormalizer.js";
import {
  BACKUP,
  ROOT,
  TIMESTAMP,
  migrationFixture,
} from "../../fixtures/persistence/storageMigration.js";

const RESET = "sto_app_reset";
const recoveryOptions = {
  verification: "required",
  purpose: "startup_recovery",
  consumeResetSentinel: "pending reset",
};

afterEach(() => vi.restoreAllMocks());

describe("verified startup checkpoint retry boundaries", () => {
  it("retains exact legacy-profile checkpoint after normalization and failed-sentinel restart", () => {
    const raw = readFileSync(
      "tests/fixtures/storage/legacy-space-root.json",
      "utf8",
    );
    const fixture = migrationFixture([[ROOT, raw]]);
    expect(fixture.run().status).toBe("complete");
    fixture.durable.set(RESET, "pending reset");
    const candidate = fixture.projectRepository.load().value;
    for (const profile of Object.values(candidate.profiles))
      normalizeProfile(profile);
    fixture.storage.removeItem.mockImplementationOnce(() => {
      throw new Error("blocked removal");
    });
    const first = fixture.projectRepository.commit(candidate, recoveryOptions);
    expect(first).toMatchObject({
      status: "sentinel_failed",
      rootWrite: { status: "acknowledged" },
      verification: { status: "verified" },
    });
    expect(JSON.parse(fixture.durable.get(BACKUP)).data).toBe(raw);
    const currentRaw = fixture.durable.get(ROOT);
    const exactBackup = fixture.durable.get(BACKUP);
    const restarted = new LocalStorageProjectRepository({
      storage: fixture.storage,
      version: "2.0.0",
      now: () => TIMESTAMP,
    });
    const current = restarted.load();
    fixture.storage.setItem.mockClear();
    const result = restarted.commit(current.value, recoveryOptions);
    expect(result).toMatchObject({
      status: "committed",
      backup: { status: "not_attempted" },
      rootWrite: { status: "skipped", reason: "already_current" },
      verification: { status: "verified" },
      resetSentinel: { status: "acknowledged" },
      value: current.value,
    });
    expect(fixture.storage.setItem).not.toHaveBeenCalled();
    expect(fixture.durable.get(ROOT)).toBe(currentRaw);
    expect(fixture.durable.get(BACKUP)).toBe(exactBackup);
    expect(fixture.durable.has(RESET)).toBe(false);
  });

  it.each([ROOT, BACKUP])(
    "fails closed on denied startup %s proof reads but leaves ordinary backup behavior advisory",
    (failedKey) => {
      const fixture = migrationFixture();
      expect(fixture.run().status).toBe("complete");
      const currentRaw = fixture.durable.get(ROOT);
      const exactBackup = fixture.durable.get(BACKUP);
      const candidate = fixture.projectRepository.load().value;
      const get = fixture.storage.getItem.getMockImplementation();
      fixture.storage.getItem.mockImplementation((key) => {
        if (key === failedKey)
          throw new DOMException("private read details", "SecurityError");
        return get(key);
      });
      fixture.storage.setItem.mockClear();
      expect(
        fixture.projectRepository.commit(candidate, {
          verification: "required",
          purpose: "startup_recovery",
        }),
      ).toEqual({
        status: "rejected",
        error: "storage_read_failed",
        backup: { status: "not_attempted" },
        rootWrite: { status: "not_attempted" },
        verification: { status: "not_attempted" },
        resetSentinel: { status: "not_attempted" },
      });
      expect(fixture.storage.setItem).not.toHaveBeenCalled();
      expect(fixture.durable.get(ROOT)).toBe(currentRaw);
      expect(fixture.durable.get(BACKUP)).toBe(exactBackup);
      expect(fixture.projectRepository.commit(candidate).status).toBe(
        "committed",
      );
    },
  );

  it("does not consume sentinel or touch backup when no-op current-root verification cannot read", () => {
    const fixture = migrationFixture();
    expect(fixture.run().status).toBe("complete");
    fixture.durable.set(RESET, "pending reset");
    const candidate = fixture.projectRepository.load().value;
    const get = fixture.storage.getItem.getMockImplementation();
    fixture.storage.getItem.mockImplementation((key) => {
      if (key === ROOT) throw new Error("denied verification read");
      return get(key);
    });
    fixture.storage.setItem.mockClear();
    expect(
      fixture.projectRepository.commit(candidate, recoveryOptions),
    ).toMatchObject({ status: "rejected", error: "storage_read_failed" });
    expect(fixture.storage.setItem).not.toHaveBeenCalled();
    expect(fixture.storage.removeItem).not.toHaveBeenCalled();
    expect(fixture.durable.get(RESET)).toBe("pending reset");
  });
});
