import { clearCards, expect, mockReset, startRun, submitClicks, test, USE_OLLAMA } from './harness';

test.describe('review', () => {
  test.beforeEach(async () => {
    if (!USE_OLLAMA) await mockReset();
  });

  // AC-HL-7, AC-OV-1
  test('lever: every card handled, review lists decisions and points at Submit', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'lever.html');

    // The run survives switching views.
    await expect(page.locator('input[name=name]')).toHaveValue('Alex Rivera');
    await panel.getByRole('button', { name: 'Settings', exact: true }).click();
    await panel.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(panel.locator('.log')).toContainText('Full name → Alex Rivera (filled)');

    await clearCards(panel);
    await expect(panel.getByRole('status').filter({ hasText: 'Ready for your review' })).toBeVisible();

    const table = panel.getByRole('table', { name: 'Every field Lazy Apply touched' });
    await expect(table.getByRole('row', { name: /Full name.*Alex Rivera.*Auto/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /Resume\/CV.*alex-rivera-cv\.pdf.*Auto/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /Gender.*Decline to self-identify.*Approved/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /Work samples.*You did it/ })).toBeVisible();

    // Submit is outlined for the human and was never clicked.
    const overlay = page.locator('[data-lazyapply-overlay=submit]');
    await expect(overlay).toBeAttached();
    await expect(overlay).toContainText('Review and click Submit yourself');
    expect(await submitClicks(page)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __submitEvents: number }).__submitEvents)).toBe(0);

    // The Review tab shows the same review.
    await panel.getByRole('button', { name: 'Review', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Review and click Submit yourself.' })).toBeVisible();
    await panel.getByRole('button', { name: "I've submitted it" }).click();
    await panel.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(panel.getByRole('status').filter({ hasText: 'Done' })).toBeVisible();
  });

  test('skipped required fields are flagged', async ({ context, openPanel }) => {
    const { panel } = await startRun(context, openPanel, 'greenhouse.html');
    const why = panel.locator('.card').filter({ has: panel.getByRole('heading', { name: /Why do you want to work/ }) });
    await why.getByRole('button', { name: 'Skip' }).click();
    await clearCards(panel);
    await expect(panel.getByRole('alert').filter({ hasText: /You skipped \d+ required field/ })).toBeVisible();
    await expect(panel.locator('.row-warn').filter({ hasText: 'Why do you want to work at Acme Robotics?' })).toHaveCount(1);
  });
});
