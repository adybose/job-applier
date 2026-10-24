import { clearCards, expect, mockReset, startRun, submitClicks, test, USE_OLLAMA } from './harness';

const count = (page: import('@playwright/test').Page, name: string) =>
  page.evaluate((n) => (window as unknown as Record<string, number | undefined>)[n] ?? 0, name);

test.describe('multi-step forms (spec 05 R-AL-16)', () => {
  test.beforeEach(async () => {
    if (!USE_OLLAMA) await mockReset();
  });

  test('asks before each Next, re-scans each step, and never submits', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'shadow-multistep.html');
    const host = page.locator('tailspin-apply');

    // Step 1 is filled inside the shadow root; the hidden step-3 CAPTCHA is not a blocker yet.
    await expect(host.locator('#given')).toHaveValue('Alex');
    await expect(host.locator('#mail')).toHaveValue('alex.rivera@example.com');
    await expect(panel.locator('.card').filter({ hasText: 'CAPTCHA' })).toHaveCount(0);

    // Lazy Apply asks before clicking Next, and clicks only after approval.
    const nav = panel.locator('.card').filter({ has: panel.getByRole('heading', { name: 'Go to the next step?' }) });
    await expect(nav).toContainText('Lazy Apply will click "Next"');
    expect(await count(page, '__nextClicks')).toBe(0);
    await nav.getByRole('button', { name: 'Approve and go to the next step' }).click();
    await expect(page.locator('#step-label')).toHaveText('Step 2 of 3');
    expect(await count(page, '__nextClicks')).toBe(1);

    // Step 2: the CV is uploaded, the cover letter is the human's, the essay is drafted.
    await expect.poll(() => host.locator('#cv').evaluate((el) => (el as HTMLInputElement).files?.length ?? 0)).toBe(1);
    await expect(panel.locator('.card-handoff').filter({ hasText: 'Cover letter (PDF)' })).toBeVisible();
    await expect(panel.locator('.card').filter({ hasText: 'Why do you want to join Tailspin Air?' })).toContainText(
      'Written answer: please review.',
    );

    // Work through the rest like a user; the approval loop also approves the next Next.
    await clearCards(panel);
    await expect(page.locator('#step-label')).toHaveText('Step 3 of 3');
    expect(await count(page, '__nextClicks')).toBe(2);
    expect(await count(page, '__backClicks')).toBe(0);

    // Final review: Submit (inside the shadow root) is outlined, never clicked.
    await expect(page.locator('[data-lazyapply-overlay=submit]')).toBeAttached();
    expect(await submitClicks(page)).toBe(0);
    expect(await count(page, '__submitEvents')).toBe(0);
  });

  test('"Not yet" keeps you on the step', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'shadow-multistep.html');
    const nav = panel.locator('.card').filter({ has: panel.getByRole('heading', { name: 'Go to the next step?' }) });
    await nav.getByRole('button', { name: 'Not yet' }).click();
    await expect(nav).toHaveCount(0);
    await page.waitForTimeout(2000);
    await expect(page.locator('#step-label')).toHaveText('Step 1 of 3');
    expect(await count(page, '__nextClicks')).toBe(0);
  });
});
