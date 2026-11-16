import type { Page } from '@playwright/test';
import { clearCards, expect, mockReset, startRun, submitClicks, test, USE_OLLAMA } from './harness';

// Real pages (fixtures/captures/), end to end with the mock model. "Any ordinary application form should work":
// profile fields are filled, the resume is uploaded, questions become cards, every required field is accounted for,
// and Submit is only highlighted.

const cardFor = (panel: Page, name: string | RegExp) =>
  panel.locator('.card').filter({ has: panel.getByRole('heading', { name }) });

/** Required controls on the page, counting a radio group once. */
const requiredCount = (page: Page) =>
  page.evaluate(() => {
    const keys = new Set<string>();
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input[required], textarea[required], select[required]').forEach((el, i) => {
      if (el instanceof HTMLInputElement && el.type === 'hidden') return;
      keys.add(el instanceof HTMLInputElement && el.type === 'radio' ? `radio:${el.name}` : `${i}`);
    });
    return keys.size;
  });

test.describe('real captures', () => {
  test.beforeEach(async () => {
    if (!USE_OLLAMA) await mockReset();
  });

  test('recruitee (clanx-real): fills the profile, uploads the CV, asks the rest, never submits', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'captures/clanx-real.html');

    // Stage 1 (deterministic mapper) fills identity and contact fields from the profile.
    await expect(page.locator('input[name="candidate.name"]')).toHaveValue('Alex Rivera', { timeout: 20_000 });
    await expect(page.locator('input[name="candidate.email"]')).toHaveValue('alex.rivera@example.com');
    // The field starts as "+91"; the profile number must replace it, not be appended to it.
    await expect.poll(async () => (await page.locator('input[name="candidate.phone"]').inputValue()).replace(/\D/g, '')).toMatch(/^1?5035550142$/);
    await expect(page.locator('input[name="candidate.openQuestionAnswers.7726127.content"]')).toHaveValue(
      'https://www.linkedin.com/in/alex-rivera-example',
    );
    await expect(panel.locator('.log')).toContainText('CV or resume → alex-rivera-cv.pdf (filled)');
    await expect
      .poll(() => page.evaluate(() => document.querySelector<HTMLInputElement>('input[name="candidate.cv"]')?.files?.[0]?.name))
      .toBe('alex-rivera-cv.pdf');

    // Free-text questions are drafted and wait for review; nothing drafted lands before approval.
    const leave = cardFor(panel, 'Why do you want to leave your current role?');
    await expect(leave).toContainText('Written answer: please review.');
    await expect(page.locator('textarea[name="candidate.openQuestionAnswers.7726131.content"]')).toHaveValue('');
    // Salary questions are never auto-filled.
    await expect(page.locator('input[name="candidate.openQuestionAnswers.7726126.content"]')).toHaveValue('');
    // A radio question the profile answers (relocation) gets either a fill or a card, never silence.
    await expect
      .poll(async () => {
        const checked = await page.locator('input[name="candidate.openQuestionAnswers.7726117.flag"]:checked').count();
        const card = await cardFor(panel, /willing to relocate to Bengaluru/).count();
        return checked + card;
      })
      .toBeGreaterThan(0);

    await clearCards(panel);

    // Every required control on the page is known to the run (the review counts them all).
    const total = await requiredCount(page);
    // 4 contact/CV + 8 radio groups + 2 text + 1 number + 6 textareas.
    expect(total).toBe(21);
    await expect(panel.locator('.review')).toContainText(`of ${total} required fields are done.`);

    // Submit ("Send") is outlined for the human and never clicked.
    await expect(page.locator('[data-lazyapply-overlay=submit]')).toHaveCount(1);
    expect(await submitClicks(page)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __submitEvents: number }).__submitEvents)).toBe(0);
  });
});
