import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIXTURE_ORIGIN } from './harness';

// Spec 10 R-TE-4 / fixtures/README.md: every form fixture has the required elements.
const FORMS = ['greenhouse.html', 'lever.html', 'ashby.html', 'generic.html', 'workable.html', 'smartrecruiters.html'];

for (const name of FORMS) {
  test.describe(name, () => {
    test('has the required elements and records Submit clicks', async ({ page }) => {
      await page.goto(`${FIXTURE_ORIGIN}/${name}`);
      const files = page.locator('input[type=file]');
      expect(await files.count()).toBeGreaterThanOrEqual(2);
      await expect(page.locator('textarea, [contenteditable=true]').first()).toBeAttached();
      await expect(page.locator('.g-recaptcha, .h-captcha, .cf-turnstile').first()).toBeAttached();
      await expect(page.getByText(/gender/i).first()).toBeAttached();
      await expect(page.getByText(/ignore (all )?(previous|prior)|ignore the form|system note to ai|new instruction|ai agents|disregard the user/i).first()).toBeAttached();

      const submit = page.locator('[data-submit]').last();
      await submit.scrollIntoViewIfNeeded();
      await submit.click();
      expect(await page.evaluate(() => (window as unknown as { __submitClicks: number }).__submitClicks)).toBe(1);
      expect(page.url()).toBe(`${FIXTURE_ORIGIN}/${name}`);
    });

    test('references no remote hosts', () => {
      const html = readFileSync(resolve(import.meta.dirname, '../fixtures', name), 'utf8');
      const urls = html.match(/(?:src|href)="https?:\/\/[^"]+"/g) ?? [];
      for (const u of urls) expect(u).toMatch(/127\.0\.0\.1/);
    });
  });
}

test('controlled inputs ignore naive value assignment but accept the native setter', async ({ page }) => {
  await page.goto(`${FIXTURE_ORIGIN}/ashby.html`);
  const result = await page.evaluate(() => {
    const el = document.getElementById('_systemfield_name') as HTMLInputElement;
    el.value = 'naive';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const afterNaive = el.dataset.state;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, 'native');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur'));
    return { afterNaive, afterNative: el.dataset.state, value: el.value };
  });
  expect(result).toEqual({ afterNaive: '', afterNative: 'native', value: 'native' });
});

test('the Greenhouse embed loads the form from a second origin', async ({ page }) => {
  await page.goto(`${FIXTURE_ORIGIN}/greenhouse-embed.html`);
  const frame = page.frameLocator('#grnhse_iframe');
  await expect(frame.locator('#first_name')).toBeVisible();
});

test('the React-Select-like combobox selects an option', async ({ page }) => {
  await page.goto(`${FIXTURE_ORIGIN}/greenhouse.html`);
  await page.locator('#race-select input[role=combobox]').click();
  await page.locator('#race-select').getByRole('option', { name: 'Decline To Self Identify' }).click();
  await expect(page.locator('#race-select')).toHaveAttribute('data-value', 'Decline To Self Identify');
  await expect(page.locator('#race-select [role=listbox]')).toHaveCount(0);
});
