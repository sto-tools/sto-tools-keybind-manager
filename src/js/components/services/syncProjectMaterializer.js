import { writeFile } from "./SyncService.js";
import { requireSyncDirectoryCapability } from "./syncFolderBoundary.js";

/**
 * Materialize one coherent project snapshot into a runtime-validated directory
 * capability. The lifecycle-owning ExportService remains the public facade.
 *
 * @param {import('./ExportService.js').default} service
 * @param {unknown} rawDirectory
 */
export async function materializeSyncProject(service, rawDirectory) {
  const directory = requireSyncDirectoryCapability(rawDirectory).raw;
  if (!service.currentArtifactSerializer) {
    throw new Error("Project artifact serializer is unavailable");
  }
  const serialized = await service.currentArtifactSerializer.serialize();
  const projectArtifact = serialized.artifact;
  const profiles = serialized.capture.project.profiles;
  const preferences = serialized.capture.settings;
  /**
   * @param {string} key
   * @param {Record<string, unknown>} [options]
   */
  const translate = (key, options = {}) =>
    service.translate(key, { ...options, lng: preferences.language });

  for (const profile of Object.values(profiles)) {
    if (!profile || !profile.name) continue;
    const sanitizedName = profile.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const exportProfile =
      /** @type {import('./serviceTypes.js').ProfileData & { name: string }} */ (
        /** @type {unknown} */ (profile)
      );

    for (const environment of ["space", "ground"]) {
      if (
        profile.builds?.[environment]?.keys &&
        Object.keys(profile.builds[environment].keys).length > 0
      ) {
        const keybindContent = await service.generateSTOKeybindFile(
          exportProfile,
          {
            environment,
            syncMode: true,
            preferences,
            translate,
          },
        );
        const filename = `${sanitizedName}/${sanitizedName}_${environment}.txt`;
        await writeFile(directory, filename, keybindContent);
      }
    }

    const aliasContent = await service.generateAliasFile(exportProfile, {
      preferences,
      translate,
    });
    await writeFile(
      directory,
      `${sanitizedName}/${sanitizedName}_aliases.txt`,
      aliasContent,
    );
  }

  // Commit the canonical artifact last so a reader never treats a partial
  // projection set as a newly completed project snapshot.
  await writeFile(directory, "project.json", projectArtifact);
}
