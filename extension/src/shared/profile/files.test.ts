import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { openLazyApplyDb } from '../db';
import { deleteAllData } from '../wipe';
import { getFile, saveFile } from './files';
import { fixtureBytes } from './test-helpers';

describe('file store', () => {
  beforeEach(() => fakeBrowser.reset());

  // AC-PI-8
  it('round-trips the CV bytes exactly', async () => {
    const bytes = fixtureBytes('alex-rivera-cv.pdf');
    await saveFile({ kind: 'resume', name: 'alex-rivera-cv.pdf', type: 'application/pdf', size: bytes.byteLength, bytes }, 'files-test');
    const stored = await getFile('resume', 'files-test');
    expect(stored?.name).toBe('alex-rivera-cv.pdf');
    expect(new Uint8Array(stored?.bytes ?? new ArrayBuffer(0))).toEqual(new Uint8Array(bytes));
  });
});

describe('deleteAllData', () => {
  // AC-PS-8
  it('clears extension storage and deletes the IndexedDB database', async () => {
    await fakeBrowser.storage.local.set({ 'profile.v1': { any: 1 }, 'settings.model.v1': {} });
    const bytes = fixtureBytes('alex-rivera-cv.pdf');
    await saveFile({ kind: 'resume', name: 'cv.pdf', type: 'application/pdf', size: bytes.byteLength, bytes }, 'wipe-test');

    await deleteAllData('wipe-test');

    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
    const db = await openLazyApplyDb('wipe-test');
    expect(await db.count('files')).toBe(0);
    db.close();
  });
});
