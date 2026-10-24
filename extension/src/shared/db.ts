import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CallStat } from './model/stats';

export const DB_NAME = 'lazyapply';

// All IndexedDB stores the extension owns (spec 01 R-PS-1). Add stores here with a version bump.
export interface LazyApplyDB extends DBSchema {
  calls: { key: number; value: CallStat };
}

export function openLazyApplyDb(name = DB_NAME): Promise<IDBPDatabase<LazyApplyDB>> {
  return openDB<LazyApplyDB>(name, 1, {
    upgrade(db) {
      db.createObjectStore('calls', { autoIncrement: true });
    },
  });
}
