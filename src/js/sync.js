import i18next from 'i18next'
import { saveDirectoryHandle, getDirectoryHandle, KEY_SYNC_FOLDER } from './fsHandles.js'

export async function writeFile(dirHandle, relativePath, contents) {
  const parts = relativePath.split('/');
  const fileName = parts.pop();
  let current = dirHandle;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await current.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

export default class STOSyncManager {
  async setSyncFolder() {
    try {
      const handle = await window.showDirectoryPicker();
      await saveDirectoryHandle(KEY_SYNC_FOLDER, handle);
      stoUI.showToast(i18next.t('sync_folder_set'), 'success');
      return handle;
    } catch (error) {
      if (error && error.name !== 'AbortError') {
        stoUI.showToast(
          i18next.t('failed_to_set_sync_folder', { error: error.message }),
          'error'
        );
      }
      return null;
    }
  }

  async getSyncFolderHandle() {
    try {
      return await getDirectoryHandle(KEY_SYNC_FOLDER);
    } catch (err) {
      console.error('Failed to retrieve directory handle', err);
      return null;
    }
  }

  async ensurePermission(handle) {
    if (!handle) return false;
    try {
      const opts = { mode: 'readwrite' };
      const perm = await handle.queryPermission(opts);
      if (perm === 'granted') return true;
      const req = await handle.requestPermission(opts);
      return req === 'granted';
    } catch (err) {
      console.error('Permission request failed', err);
      return false;
    }
  }

  async syncProject() {
    const handle = await this.getSyncFolderHandle();
    if (!handle) {
      stoUI.showToast(i18next.t('no_sync_folder_selected'), 'warning');
      return;
    }
    const allowed = await this.ensurePermission(handle);
    if (!allowed) {
      stoUI.showToast(i18next.t('permission_denied_to_folder'), 'error');
      return;
    }
    try {
      await stoExport.syncToFolder(handle);
      stoUI.showToast(i18next.t('project_synced_successfully'), 'success');
    } catch (error) {
      stoUI.showToast(
        i18next.t('failed_to_sync_project', { error: error.message }),
        'error'
      );
    }
  }
}
