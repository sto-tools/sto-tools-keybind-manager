export function createProjectRestoreSuccess() {
  return {
    success: true,
    currentProfile: null,
    imported: { profiles: 0, settings: false },
  };
}
