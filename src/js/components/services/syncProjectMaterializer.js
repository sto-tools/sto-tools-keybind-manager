import { writeFile } from "./SyncService.js";
import { serializeProjectArtifact } from "./projectArtifact.js";
import { requireSyncDirectoryCapability } from "./syncFolderBoundary.js";

/**
 * Materialize one coherent project snapshot into a runtime-validated directory
 * capability. The lifecycle-owning ExportService remains the public facade.
 *
 * @param {import('./ExportService.js').default} service
 * @param {unknown} rawDirectory
 * @param {string | undefined} version
 */
export async function materializeSyncProject(service, rawDirectory, version) {
  if (!service.storage) throw new Error("Storage is required to sync exports");
  const directory = requireSyncDirectoryCapability(rawDirectory).raw;
  const data = service.storage.getAllData();
  const exported = new Date().toISOString();
  const projectArtifact = serializeProjectArtifact(
    data,
    service.storage.getSettings(),
    { version, exported },
  );
  const profiles = data.profiles || {};

  for (const profile of Object.values(profiles)) {
    if (!profile || !profile.name) continue;
    const sanitizedName = profile.name.replace(/[^a-zA-Z0-9_-]/g, "_");

    for (const environment of ["space", "ground"]) {
      if (
        profile.builds?.[environment]?.keys &&
        Object.keys(profile.builds[environment].keys).length > 0
      ) {
        const keybindContent = await service.generateSTOKeybindFile(profile, {
          environment,
          syncMode: true,
        });
        const filename = `${sanitizedName}/${sanitizedName}_${environment}.txt`;
        await writeFile(directory, filename, keybindContent);
      }
    }

    const aliasContent = await service.generateAliasFile(profile);
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
