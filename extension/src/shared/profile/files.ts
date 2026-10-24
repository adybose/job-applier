import { withDb } from '../db';

// Spec 02 R-PI-12/R-PI-13. Bytes are stored as an ArrayBuffer so any context can rebuild a File.
export interface StoredFile {
  kind: 'resume' | 'linkedin';
  name: string;
  type: string;
  size: number;
  bytes: ArrayBuffer;
  savedAt: number;
}

export function saveFile(file: Omit<StoredFile, 'savedAt'>, dbName?: string): Promise<void> {
  return withDb(async (db) => {
    await db.put('files', { ...file, savedAt: Date.now() });
  }, dbName);
}

export function getFile(kind: StoredFile['kind'], dbName?: string): Promise<StoredFile | undefined> {
  return withDb((db) => db.get('files', kind), dbName);
}

export function deleteFile(kind: StoredFile['kind'], dbName?: string): Promise<void> {
  return withDb((db) => db.delete('files', kind), dbName);
}
