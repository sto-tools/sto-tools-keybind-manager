import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import ImportService from "../../../src/js/components/services/ImportService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const FIXTURE_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/storage",
);

function readCompleteProfile() {
  const root = JSON.parse(
    readFileSync(join(FIXTURE_DIRECTORY, "complete-current-root.json"), "utf8"),
  );
  return root.profiles["complete-profile"];
}

describe("standalone profile import fidelity", () => {
  const fixtures = [];
  const services = [];

  afterEach(() => {
    services.splice(0).forEach((service) => service.destroy());
    fixtures.splice(0).forEach((fixture) => fixture.destroy());
  });

  it("preserves every canonical profile field while dropping legacy compatibility fields", async () => {
    const fixture = createServiceFixture();
    const service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    fixtures.push(fixture);
    services.push(service);
    service.init();

    const canonicalProfile = structuredClone(readCompleteProfile());
    delete canonicalProfile.keys;
    delete canonicalProfile.keybinds;

    const result = await service.importProfileFile(
      JSON.stringify({
        ...canonicalProfile,
        keys: { F5: ["LegacyFlattenedKey"] },
        keybinds: { space: { F6: ["LegacyEnvironmentKey"] } },
        unsupportedExtension: { shouldBeDropped: true },
      }),
      { profileId: "complete-profile" },
    );

    expect(result).toEqual({
      success: true,
      profileId: "complete-profile",
      profile: canonicalProfile,
    });
    expect(fixture.storage.saveProfile).toHaveBeenCalledWith(
      "complete-profile",
      canonicalProfile,
    );
    expect(result.profile).not.toHaveProperty("keys");
    expect(result.profile).not.toHaveProperty("keybinds");
    expect(result.profile).not.toHaveProperty("unsupportedExtension");
  });
});
