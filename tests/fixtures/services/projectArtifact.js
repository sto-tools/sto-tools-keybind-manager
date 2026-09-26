import { serializeProjectArtifact } from "../../../src/js/components/services/projectArtifact.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";

/**
 * Build the narrow serializer capability used by artifact workflow tests that
 * do not need to exercise the real owner leases. The fixed capture is detached
 * on every call so a consumer cannot mutate the fixture's accepted state.
 *
 * @param {{
 *   project?: {profiles: Record<string, unknown>, currentProfile: string | null},
 *   settings?: Record<string, unknown>,
 *   source?: {preferencesAuthorityEpoch: number, preferencesRevision: number, dataAuthorityEpoch: number, dataRevision: number},
 *   exported?: string,
 *   version?: string
 * }} [options]
 */
export function createCurrentArtifactSerializerFixture(options = {}) {
  const accepted = {
    project: options.project ?? { profiles: {}, currentProfile: null },
    settings: options.settings ?? createDefaultPreferencesSettings(),
    source: options.source ?? {
      preferencesAuthorityEpoch: 1,
      preferencesRevision: 1,
      dataAuthorityEpoch: 2,
      dataRevision: 1,
    },
  };
  const exported = options.exported ?? "2026-07-18T01:02:03.000Z";
  const version = options.version ?? "1.0.0";
  const calls = [];

  return {
    calls,
    async serialize() {
      const capture = structuredClone(accepted);
      const artifact = serializeProjectArtifact(
        capture.project,
        capture.settings,
        { version, exported },
      );
      const result = { artifact, capture, exported };
      calls.push(structuredClone(result));
      return result;
    },
  };
}
