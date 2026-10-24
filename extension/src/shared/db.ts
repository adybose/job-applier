import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CallStat } from './model/stats';
import type { StoredFile } from './profile/files';

export const DB_NAME = 'lazyapply';

// All IndexedDB stores the extension owns (spec 01 R-PS-1). Add stores here with a version bump.
export interface LazyApplyDB extends DBSchema {
  calls: { key: number; value: CallStat };
  files: { key: StoredFile['kind']; value: StoredFile };
}

export function openLazyApplyDb(name = DB_NAME): Promise<IDBPDatabase<LazyApplyDB>> {
  return openDB<LazyApplyDB>(name, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore('calls', { autoIncrement: true });
      if (oldVersion < 2) db.createObjectStore('files', { keyPath: 'kind' });
    },
  });
}

/** Opens, runs, and always closes, so "Delete all my data" is never blocked by an idle connection. */
export async function withDb<T>(fn: (db: IDBPDatabase<LazyApplyDB>) => Promise<T>, name = DB_NAME): Promise<T> {
  const db = await openLazyApplyDb(name);
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}
