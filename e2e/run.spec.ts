import { expect, mockMode, mockReset, mockRequests, startRun, submitClicks, test, USE_OLLAMA } from './harness';


test.describe('run', () => {
  test.beforeEach(async () => {
    if (!USE_OLLAMA) await mockReset();
  });

  test('greenhouse: fills from the profile, asks about sensitive fields, hands off what it must not do', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'greenhouse.html');

    // Stage 1 auto-fills (spec 05 R-AL-3) land in the page.
    await expect(page.locator('#first_name')).toHaveValue('Alex');
    await expect(page.locator('#last_name')).toHaveValue('Rivera');
    await expect(page.locator('#email')).toHaveValue('alex.rivera@example.com');
    await expect(page.locator('#phone')).toHaveValue('+1 503 555 0142');
    await expect(page.locator('#job_application_answers_attributes_0_text_value')).toHaveValue(
      'https://www.linkedin.com/in/alex-rivera-example',
    );
    await expect.poll(() => page.evaluate(() => (document.getElementById('resume') as HTMLInputElement).files?.[0]?.name)).toBe(
      'alex-rivera-cv.pdf',
    );

    // Cards: handoffs for the cover letter and CAPTCHA; approvals for sensitive answers.
    const cards = panel.locator('.cards');
    await expect(cards.locator('.card-handoff')).toHaveCount(2);
    await expect(cards.getByRole('heading', { name: 'Cover Letter' })).toBeVisible();
    await expect(cards.getByRole('heading', { name: 'A CAPTCHA check' })).toBeVisible();
    await expect(cards.getByRole('heading', { name: 'Desired salary (USD)' })).toBeVisible();
    await expect(cards.getByRole('heading', { name: 'Gender' })).toBeVisible();
    await expect(cards.locator('.card-approval', { hasText: 'Gender' })).toContainText('Decline To Self Identify');
    await expect(cards.locator('.card-approval', { hasText: 'sponsorship' })).toContainText('No');

    // Sensitive answers are proposed but not filled until approved.
    await expect(page.locator('#job_application_answers_attributes_4_text_value')).toHaveValue('');
    await expect(page.locator('#job_application_gender')).toHaveValue('');

    // The page shows a handoff overlay; nothing was submitted.
    await expect(page.locator('[data-lazyapply-overlay=handoff]').first()).toBeAttached();
    await expect(panel.getByRole('status').filter({ hasText: 'Your turn' })).toBeVisible();
    await expect(panel.locator('.progress')).toContainText('required fields');
    await expect(panel.locator('.log')).toContainText('First Name → Alex (filled)');
    expect(await submitClicks(page)).toBe(0);

    // AC-PS-6 end to end: the posting's injection line reaches the model only inside PAGE_DATA.
    if (!USE_OLLAMA) {
      await expect.poll(async () => (await mockRequests()).filter((r) => r.path === '/api/chat').length).toBeGreaterThan(0);
      for (const r of (await mockRequests()).filter((x) => x.path === '/api/chat')) {
        const messages = (r.body.messages as { role: string; content: string }[]) ?? [];
        for (const m of messages) {
          let at = m.content.indexOf('Ignore previous instructions');
          while (at !== -1) {
            expect(m.role).toBe('user');
            expect(m.content.lastIndexOf('<<<PAGE_DATA', at)).toBeGreaterThan(m.content.lastIndexOf('PAGE_DATA>>>', at));
            at = m.content.indexOf('Ignore previous instructions', at + 1);
          }
        }
      }
    }
  });

  // AC-HL-8
  test('pause stops new actions until resume', async ({ context, openPanel }) => {
    test.skip(USE_OLLAMA, 'needs the mock');
    await mockMode('ok', { delayMs: 1500 });
    const { page, panel } = await startRun(context, openPanel, 'lever.html');
    // Stage 1 runs before the (slow) model call; pause while the planner is waiting.
    await expect(page.locator('input[name=name]')).toHaveValue('Alex Rivera');
    await panel.getByRole('button', { name: 'Pause' }).click();
    await expect(panel.getByRole('status').filter({ hasText: 'Paused' })).toBeVisible();
    const values = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select')).map((e) =>
          e.type === 'checkbox' || e.type === 'radio' ? String(e.checked) : e.type === 'file' ? String(e.files?.length) : e.value,
        ),
      );
    const before = await values();
    await page.waitForTimeout(2500);
    expect(await values()).toEqual(before);
    await panel.getByRole('button', { name: 'Resume' }).click();
    await expect(panel.getByRole('status')).not.toHaveText('Paused');
    // Work queued during the pause lands after resuming.
    await expect(page.locator('input[name="cards[q2][field0]"]')).toHaveValue('4 weeks');
    await expect(page.locator('input[name=urls\\[GitHub\\]]')).toHaveValue('https://github.com/alexrivera-dev');
  });

  // AC-PS-9
  test('closing the panel stops the run', async ({ context, openPanel }) => {
    test.skip(USE_OLLAMA, 'needs the mock');
    await mockMode('ok', { delayMs: 1500 });
    const { page, panel } = await startRun(context, openPanel, 'generic.html');
    await expect(page.locator('#fname')).toHaveValue('Alex');
    await panel.close();
    await page.waitForTimeout(2500);
    // "Send me news" would be set by the model's plan; the run died with the panel.
    await expect(page.locator('input[name=newsletter]')).not.toBeChecked();
    expect(await submitClicks(page)).toBe(0);
  });
});
