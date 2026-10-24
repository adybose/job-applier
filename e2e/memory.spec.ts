import { clearCards, expect, mockReset, startRun, test, USE_OLLAMA } from './harness';

test.describe('answer memory and stats', () => {
  test.beforeEach(async () => {
    if (!USE_OLLAMA) await mockReset();
  });

  // AC-AM-6, AC-HL-2 (memory), spec 08 Stats
  test('a remembered answer makes the second application faster, and Stats counts both', async ({ context, openPanel }) => {
    // First application: approve the travel question with "Remember" (on by default for non-sensitive answers).
    const first = await startRun(context, openPanel, 'lever.html');
    const travel = first.panel.locator('.card').filter({ has: first.panel.getByRole('heading', { name: /open to occasional travel/ }) });
    await expect(travel.getByRole('checkbox', { name: 'Remember this answer' })).toBeChecked();
    const firstCards = await first.panel.locator('.card').count();
    await clearCards(first.panel);
    await expect(first.page.locator('input[name="cards[q1][field0]"][value=Yes]')).toBeChecked();

    // Second application on a fresh copy of the form.
    const second = await startRun(context, openPanel, 'lever.html');
    await expect(second.page.locator('input[name="cards[q1][field0]"][value=Yes]')).toBeChecked();
    await expect(second.panel.locator('.log')).toContainText('Are you open to occasional travel to our Austin office? → Yes (filled)');
    await expect(second.panel.locator('.card').filter({ has: second.panel.getByRole('heading', { name: /open to occasional travel/ }) })).toHaveCount(0);
    await expect(second.panel.locator('.thinking')).toHaveCount(0, { timeout: 20_000 });
    expect(await second.panel.locator('.card').count()).toBeLessThan(firstCards);
    await clearCards(second.panel);

    // The saved answer is listed, with its use count, in the Profile view.
    await second.panel.getByRole('button', { name: 'Profile', exact: true }).click();
    const saved = second.panel.getByRole('group', { name: /Saved answers/ });
    await expect(saved).toContainText('Are you open to occasional travel to our Austin office?');
    await expect(saved).toContainText('used 1 time');

    // Stats counts both applications and shows the model.
    await second.panel.getByRole('button', { name: 'Stats', exact: true }).click();
    await expect(second.panel.locator('.stat-tiles')).toContainText('Applications filled2');
    if (!USE_OLLAMA) await expect(second.panel.getByRole('table', { name: 'Models' })).toContainText('gemma3:4b-it-qat');
  });
});
