import type { Page } from '@playwright/test';
import { expect, mockReset, startRun, submitClicks, test, USE_OLLAMA } from './harness';

const handoff = (panel: Page, heading: string | RegExp) =>
  panel.locator('.card-handoff').filter({ has: panel.getByRole('heading', { name: heading }) });

test.describe('handoffs', () => {
  test.beforeEach(async () => {
    if (!USE_OLLAMA) await mockReset();
  });

  // AC-HL-3, AC-HL-4, AC-HL-5, AC-HL-6
  test('ashby: portfolio upload and CAPTCHA are yours; Lazy Apply notices when you are done', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'ashby.html');

    const portfolio = handoff(panel, 'Portfolio (PDF)');
    await expect(portfolio).toContainText('Upload your portfolio here.');
    await expect(page.locator('[data-lazyapply-overlay=handoff]').first()).toBeAttached();

    // While the handoff is open, React-controlled fields and toggles were filled (AC-HL-5).
    await expect(page.locator('#_systemfield_name')).toHaveAttribute('data-state', 'Alex Rivera');
    await expect(page.locator('#_systemfield_email')).toHaveAttribute('data-state', 'alex.rivera@example.com');
    await expect.poll(() => page.evaluate(() => (document.getElementById('_systemfield_resume') as HTMLInputElement).files?.length)).toBe(1);

    // The human uploads the file; the card resolves on its own (AC-HL-4).
    await page.locator('#portfolio-ashby').setInputFiles({ name: 'portfolio.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await expect(portfolio).toHaveCount(0, { timeout: 10_000 });
    await expect(panel.locator('.log')).toContainText('Portfolio (PDF): done by you');

    // A solved CAPTCHA fills its response token (AC-HL-6).
    const captcha = handoff(panel, 'A CAPTCHA check');
    await expect(captcha).toBeVisible();
    await page.evaluate(() => {
      const token = document.createElement('textarea');
      token.name = 'cf-turnstile-response';
      token.value = 'solved-token';
      token.style.display = 'none';
      document.querySelector('.cf-turnstile')?.appendChild(token);
    });
    await expect(captcha).toHaveCount(0, { timeout: 10_000 });
    expect(await submitClicks(page)).toBe(0);
  });

  test('a removed CAPTCHA widget resolves its handoff, and "I did it" always works', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'generic.html');
    const captcha = handoff(panel, 'A CAPTCHA check');
    await expect(captcha).toBeVisible();
    await page.evaluate(() => document.querySelector('.g-recaptcha')?.remove());
    await expect(captcha).toHaveCount(0, { timeout: 10_000 });

    // The password field: the human signs up themselves, or says so.
    const password = handoff(panel, /Create a password/);
    await expect(password).toContainText('Sign in or create the account yourself');
    await password.getByRole('button', { name: 'I did it' }).click();
    await expect(password).toHaveCount(0);

    // Lazy Apply never typed the password.
    await expect(page.locator('#pw')).toHaveValue('');
  });

  test('a typed answer on a waiting card counts as done by you', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'greenhouse.html');
    const cover = handoff(panel, 'Cover Letter');
    await expect(cover).toBeVisible();
    const why = panel.locator('.card').filter({ has: panel.getByRole('heading', { name: /Why do you want to work/ }) });
    await expect(why).toBeVisible();
    await page.locator('#job_application_answers_attributes_5_text_value').fill('Because I love robots.');
    await expect(why).toHaveCount(0, { timeout: 10_000 });
    await expect(panel.locator('.log')).toContainText('Why do you want to work at Acme Robotics?: done by you');
  });
});
