import { deleteDB } from 'idb';
import { browser } from 'wxt/browser';
import { DB_NAME } from './db';

/** Spec 01 R-PS-5: "Delete all my data". */
export async function deleteAllData(dbName = DB_NAME): Promise<void> {
  await browser.storage.local.clear();
  await browser.storage.session?.clear();
  await deleteDB(dbName);
}
