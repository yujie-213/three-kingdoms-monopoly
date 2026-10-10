import { exportSave, importSave } from './save.js';

// Stable storage slot also finds existing snapshots; the JSON envelope is v6.
export const AUTO_SAVE_KEY = 'three-kingdoms-monopoly.autosave.v4';
export const AUTO_SAVE_BACKUP_KEY = `${AUTO_SAVE_KEY}.backup`;

export function createAutoSave(getStorage = () => globalThis.localStorage) {
  let lastGood = null;
  return {
    restore() {
      try {
        const storage = getStorage();
        let damaged = false;
        for (const key of [AUTO_SAVE_KEY, AUTO_SAVE_BACKUP_KEY]) {
          const raw = storage.getItem(key);
          if (!raw) continue;
          try {
            const state = importSave(raw); lastGood = raw;
            return { state, message: key === AUTO_SAVE_BACKUP_KEY ? '自动存档损坏，已恢复上一份备份。' : '已恢复上次对局。' };
          } catch { damaged = true; }
        }
        return { state: null, damaged, message: damaged ? '自动存档无法读取，已暂停以保留原档。请导入 JSON，或开始新局。' : '' };
      } catch {
        return { state: null, message: '此浏览器无法读取自动存档，请使用导出存档保留进度。' };
      }
    },
    save(state) {
      try {
        const storage = getStorage();
        const raw = exportSave(state);
        if (raw === lastGood) {
          if (storage.getItem(AUTO_SAVE_KEY) !== raw) storage.setItem(AUTO_SAVE_KEY, raw);
          return true;
        }
        if (lastGood) storage.setItem(AUTO_SAVE_BACKUP_KEY, lastGood);
        storage.setItem(AUTO_SAVE_KEY, raw); lastGood = raw;
        return true;
      } catch { return false; }
    },
  };
}
