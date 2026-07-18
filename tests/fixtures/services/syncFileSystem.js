import { vi } from "vitest";

/**
 * Add the durable sync-transition surface to a test double that already owns
 * the legacy handle primitives. Legacy spies remain observable so existing
 * behavior assertions keep proving their original requirements.
 *
 * @param {{
 *   getDirectoryHandle: (key: string) => Promise<unknown | null>,
 *   saveDirectoryHandle: (key: string, handle: unknown) => Promise<unknown>,
 *   deleteDirectoryHandle: (key: string) => Promise<unknown>
 * } & Record<string, unknown>} fs
 * @param {{ transitionPending: boolean }} [state]
 */
export function addSyncTransitionMethods(
  fs,
  state = { transitionPending: false },
) {
  fs.getSyncDirectoryState = vi.fn(async () => ({
    handle: await fs.getDirectoryHandle("sync-folder"),
    transitionPending: state.transitionPending,
  }));
  fs.beginSyncDirectoryTransition = vi.fn(async (handle) => {
    await fs.saveDirectoryHandle("sync-folder", handle);
    state.transitionPending = true;
  });
  fs.completeSyncDirectoryTransition = vi.fn(async () => {
    state.transitionPending = false;
  });
  fs.restoreSyncDirectoryState = vi.fn(async (previousState) => {
    if (previousState.handle === null) {
      await fs.deleteDirectoryHandle("sync-folder");
    } else {
      await fs.saveDirectoryHandle("sync-folder", previousState.handle);
    }
    state.transitionPending = previousState.transitionPending;
  });
  return state;
}
