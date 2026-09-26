export const destinationRoot = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: "existing",
  profiles: {
    existing: {
      name: "Existing",
      description: "Destination profile",
      currentEnvironment: "space",
      migrationVersion: "2.1.1",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases: {},
    },
  },
  globalAliases: {},
  settings: {},
};

export const importedProject = {
  version: "1.0.0",
  exported: "2026-07-17T00:00:00.000Z",
  type: "project",
  data: {
    profiles: {
      imported: {
        id: "imported",
        name: "Imported",
        description: "Authoritative reload target",
        currentEnvironment: "ground",
        migrationVersion: "2.1.1",
        builds: {
          space: { keys: {} },
          ground: { keys: { G: ["Sprint", "Aim"] } },
        },
        aliases: {},
      },
    },
    settings: { theme: "light", language: "de" },
    currentProfile: "imported",
  },
};
