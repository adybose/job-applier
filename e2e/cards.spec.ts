import type { Page } from '@playwright/test';
import { expect, mockReset, startRun, submitClicks, test, USE_OLLAMA, type ChromeGlobal } from './harness';


const card = (panel: Page, heading: string | RegExp) =>
  panel.locator('.card').filter({ has: panel.getByRole('heading', { name: heading }) });

const savedCustom = (panel: Page) =>
  panel.evaluate(async () => {
    const stored = await (globalThis as unknown as ChromeGlobal).chrome.storage.local.get('profile.v1');
    return (stored['profile.v1'] as { custom: Record<string, { value: string }> }).custom;
  });

test.describe('approval and question cards', () => {
  test.beforeEach(async () => {
    if (!USE_OLLAMA) await mockReset();
  });

  // AC-HL-1, AC-HL-2, AC-AL-11
  test('edit and approve, remember, and keep filling meanwhile', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'greenhouse.html');
    const salary = card(panel, 'Desired salary (USD)');
    await expect(salary).toContainText('165,000 USD per year');
    // Other fields were filled while the card waited.
    await expect(page.locator('#first_name')).toHaveValue('Alex');
    await expect(page.locator('#job_application_answers_attributes_4_text_value')).toHaveValue('');

    // Sensitive answers are not remembered by default.
    await expect(salary.getByRole('checkbox', { name: 'Remember this answer' })).not.toBeChecked();
    await salary.getByRole('button', { name: 'Edit' }).click();
    await salary.getByRole('textbox', { name: /Answer for Desired salary/ }).fill('170,000 USD per year');
    await salary.getByRole('checkbox', { name: 'Remember this answer' }).check();
    await salary.getByRole('button', { name: 'Approve edit' }).click();

    await expect(page.locator('#job_application_answers_attributes_4_text_value')).toHaveValue('170,000 USD per year');
    await expect(salary).toHaveCount(0);
    await expect(panel.locator('.log')).toContainText('Desired salary (USD) → 170,000 USD per year (edited)');
    await expect.poll(async () => (await savedCustom(panel))['Desired salary (USD)']?.value).toBe('170,000 USD per year');

    // Plain approval of a proposed option.
    const gender = card(panel, 'Gender');
    await gender.getByRole('button', { name: 'Approve' }).click();
    await expect(page.locator('#job_application_gender')).toHaveValue('3');
    await expect(panel.locator('.log')).toContainText('Gender → Decline To Self Identify (approved)');

    // A consent checkbox is a legal attestation: it waits for approval, then gets ticked.
    const consent = card(panel, /I agree to Acme Robotics/);
    await expect(consent).toContainText('Yes (tick the box)');
    await consent.getByRole('button', { name: 'Approve' }).click();
    await expect(page.locator('#job_application_data_compliance_gdpr_consent_given')).toBeChecked();
    expect(await submitClicks(page)).toBe(0);
  });

  // Spec 05 R-AL-10 / spec 06 R-HL-1: drafted text is always reviewed.
  test('a required essay question is drafted for review', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'greenhouse.html');
    const why = card(panel, 'Why do you want to work at Acme Robotics?');
    await expect(why).toContainText('Written answer: please review.');
    await expect(why).toContainText('300 field technicians');
    await expect(why.getByRole('button', { name: 'Regenerate' })).toBeVisible();
    await expect(page.locator('#job_application_answers_attributes_5_text_value')).toHaveValue('');
    await why.getByRole('button', { name: 'Approve' }).click();
    await expect(page.locator('#job_application_answers_attributes_5_text_value')).toHaveValue(/300 field technicians/);
  });

  // R-AL-14 / R-HL-4: "ask me each time" salary becomes a question card.
  test('a question card asks you, fills, and does not remember sensitive answers by default', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'greenhouse.html', { askSalary: true });
    const salary = card(panel, 'Desired salary (USD)');
    await expect(salary).toContainText('Question');
    await expect(salary.getByRole('checkbox', { name: 'Remember this answer' })).not.toBeChecked();
    await salary.getByRole('textbox').fill('175,000');
    await salary.getByRole('button', { name: 'Use this answer' }).click();
    await expect(page.locator('#job_application_answers_attributes_4_text_value')).toHaveValue('175,000');
    expect((await savedCustom(panel))['Desired salary (USD)']).toBeUndefined();
  });

  test('skip leaves the field empty and marks it skipped', async ({ context, openPanel }) => {
    const { page, panel } = await startRun(context, openPanel, 'greenhouse.html');
    const veteran = card(panel, 'Veteran Status');
    await veteran.getByRole('button', { name: 'Skip' }).click();
    await expect(veteran).toHaveCount(0);
    await expect(page.locator('#job_application_veteran_status')).toHaveValue('');
    await expect(panel.locator('.log')).toContainText('Veteran Status: skipped');
  });

  // AC-HL-9
  test('an approved value that does not stick becomes a handoff', async ({ context, openPanel }) => {
    const { panel } = await startRun(context, openPanel, 'generic.html', { prepare: async (page) => {
      await page.evaluate(() => {
        const label = document.createElement('label');
        label.htmlFor = 'stubborn-salary';
        label.textContent = 'Expected salary';
        const input = document.createElement('input');
        input.id = 'stubborn-salary';
        input.addEventListener('input', () => setTimeout(() => (input.value = ''), 50));
        document.getElementById('generic-form')?.prepend(label, input);
      });
    } });
    const salary = card(panel, 'Expected salary');
    await salary.getByRole('button', { name: 'Approve' }).click();
    const handoff = panel.locator('.card-handoff').filter({ has: panel.getByRole('heading', { name: 'Expected salary' }) });
    await expect(handoff).toBeVisible();
    await expect(handoff).toContainText('Please fill in "Expected salary" yourself.');
  });
});
