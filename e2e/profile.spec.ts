import { resolve } from 'node:path';
import { expect, mockReset, test, USE_OLLAMA, type ChromeGlobal } from './harness';

const CV = resolve(import.meta.dirname, '../fixtures/profiles/alex-rivera-cv.pdf');
const LINKEDIN = resolve(import.meta.dirname, '../fixtures/profiles/alex-rivera-linkedin.pdf');

test.describe('profile ingestion', () => {
  test.beforeEach(async () => {
    if (!USE_OLLAMA) await mockReset();
  });

  test('reads both PDFs, resolves conflicts, saves, and deletes everything', async ({ openPanel }) => {
    const panel = await openPanel();
    await panel.getByRole('button', { name: 'Profile' }).click();

    await panel.getByLabel('Your CV (PDF, up to 10 MB)').setInputFiles(CV);
    await panel.getByLabel('Your LinkedIn profile PDF').setInputFiles(LINKEDIN);
    await panel.getByRole('button', { name: 'Read my files' }).click();

    // Extraction results are merged into the editor (AC-PI-4/5).
    await expect(panel.getByLabel(/^Full name/)).toHaveValue('Alex Rivera', { timeout: USE_OLLAMA ? 120_000 : 10_000 });
    await expect(panel.getByLabel(/^LinkedIn/)).toHaveValue('www.linkedin.com/in/alex-rivera-example');
    await expect(panel.getByRole('group', { name: 'Hooli' })).toBeVisible();

    // AC-PI-6: conflicts block saving until resolved.
    const conflicts = panel.locator('.conflicts');
    await expect(conflicts.getByRole('group', { name: 'Email' })).toBeVisible();
    await panel.getByRole('button', { name: 'Save profile' }).click();
    await expect(panel.getByRole('alert')).toContainText('Choose a value');

    await conflicts.getByRole('button', { name: 'Use CV: alex.rivera@example.com' }).click();
    while ((await conflicts.count()) > 0) {
      await conflicts.getByRole('button', { name: /^Use CV:/ }).first().click();
    }
    await expect(panel.getByLabel(/^Email/)).toHaveValue('alex.rivera@example.com');
    await panel.getByRole('button', { name: 'Save profile' }).click();
    await expect(panel.getByRole('status').filter({ hasText: 'Profile saved.' })).toBeVisible();

    // The saved profile survives a reload; the CV file is stored for resume uploads.
    await panel.reload();
    await panel.getByRole('button', { name: 'Profile' }).click();
    await expect(panel.getByLabel(/^Full name/)).toHaveValue('Alex Rivera');

    // AC-PS-8 end to end.
    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('button', { name: 'Delete all my data' }).click();
    await panel.getByRole('button', { name: 'Yes, delete everything' }).click();
    await expect(panel.getByText('All your data was deleted.')).toBeVisible();
    const leftovers = await panel.evaluate(async () => {
      const storage = await (globalThis as unknown as ChromeGlobal).chrome.storage.local.get(null);
      const dbs = await indexedDB.databases();
      return { keys: Object.keys(storage), dbs: dbs.map((d) => d.name) };
    });
    expect(leftovers).toEqual({ keys: [], dbs: [] });
  });

  test('rejects a file that is not a PDF', async ({ openPanel }) => {
    const panel = await openPanel();
    await panel.getByRole('button', { name: 'Profile' }).click();
    await panel.getByLabel('Your CV (PDF, up to 10 MB)').setInputFiles({
      name: 'photo.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    await panel.getByRole('button', { name: 'Read my files' }).click();
    await expect(panel.getByRole('alert')).toContainText("This doesn't look like a PDF.");
  });
});
