import { clearCards, expect, mockReset, startRun, submitClicks, test, USE_OLLAMA } from './harness';

const n = (page: import('@playwright/test').Page, name: string) =>
  page.evaluate((k) => (window as unknown as Record<string, number | undefined>)[k] ?? 0, name);

test.describe('Workday (P2, T22)', () => {
  test.beforeEach(async () => {
    if (!USE_OLLAMA) await mockReset();
  });

  test('button dropdowns, five steps of Save and Continue, never submits', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'workday.html');

    // Step 1: text fields from the profile, and the Country dropdown (a button with a popup listbox).
    await expect(page.locator('#firstName')).toHaveAttribute('data-state', 'Alex');
    await expect(page.locator('#email')).toHaveAttribute('data-state', 'alex.rivera@example.com');
    await expect(page.locator('[data-automation-id=countryDropdown]')).toHaveText('United States of America');
    await expect(page.locator('[role=listbox]')).toHaveCount(0);

    await clearCards(panel);
    expect(await n(page, '__nextClicks')).toBe(4);
    expect(await n(page, '__backClicks')).toBe(0);
    await expect(page.locator('[data-automation-id=progressBar]')).toHaveText('Step 5 of 5');

    // Answers that needed approval landed in their dropdowns.
    await expect(page.locator('button[aria-labelledby=gender-label]')).toHaveText('I do not wish to self-identify');
    await expect(page.locator('button[aria-labelledby=sponsor-label]')).toHaveText('No');
    await expect.poll(() => page.locator('#resume').evaluate((el) => (el as HTMLInputElement).files?.length ?? 0)).toBe(1);

    // Submit is outlined on the last step and never clicked.
    await expect(page.locator('[data-lazyapply-overlay=submit]')).toBeAttached();
    expect(await submitClicks(page)).toBe(0);
  });
});

test('never offers the next step before the new step has been read', async ({ context, openPanel }) => {
  if (!USE_OLLAMA) await mockReset();
  const { page, panel } = await startRun(context, openPanel, 'workday.html');
  const nav = panel.locator('.card').filter({ has: panel.getByRole('heading', { name: 'Go to the next step?' }) });
  await nav.getByRole('button', { name: 'Approve and go to the next step' }).click();
  await expect(page.locator('[data-automation-id=progressBar]')).toHaveText('Step 2 of 5');
  // Step 2 has a handoff (Other Documents); the next "Next" must wait for it and come last.
  await expect(panel.locator('.card').first()).toContainText('Other Documents (writing sample)');
  await expect(nav).toHaveCount(0);
  await panel.locator('.card-handoff').getByRole('button', { name: 'I did it' }).click();
  await expect(nav).toBeVisible();
  expect(await n(page, '__nextClicks')).toBe(1);
});
