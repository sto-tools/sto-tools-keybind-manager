export const PROJECT_ROOT_KEY = "sto_keybind_manager";
export const PROJECT_BACKUP_KEY = "sto_keybind_manager_backup";
export const PROJECT_RESET_KEY = "sto_app_reset";

export function readProjectRoot() {
  const raw = localStorage.getItem(PROJECT_ROOT_KEY);
  return raw === null ? null : JSON.parse(raw);
}

export function readProjectProfile(profileId) {
  return readProjectRoot()?.profiles?.[profileId] ?? null;
}
