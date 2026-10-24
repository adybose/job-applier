import type { Page } from '@playwright/test';
import { clearCards, expect, mockMode, mockReset, startRun, submitClicks, test, USE_OLLAMA } from './harness';

// Spec 10 R-TE-4/R-TE-6: every P0 fixture, end to end, with the mock model.
interface Expectations {
  fixture: string;
  resume: string;
  nonResume: string;
  eeo: RegExp;
  freeText: RegExp;
}

const FIXTURES: Expectations[] = [
  { fixture: 'greenhouse.html', resume: 'Resume/CV', nonResume: 'Cover Letter', eeo: /^Gender$/, freeText: /Why do you want to work/ },
  { fixture: 'greenhouse-embed.html', resume: 'Resume/CV', nonResume: 'Cover Letter', eeo: /^Gender$/, freeText: /Why do you want to work/ },
  { fixture: 'lever.html', resume: 'Resume/CV', nonResume: 'Work samples (optional)', eeo: /^Gender$/, freeText: /Add a cover letter/ },
  { fixture: 'ashby.html', resume: 'Resume', nonResume: 'Portfolio (PDF)', eeo: /^Gender$/, freeText: /What excites you/ },
  { fixture: 'generic.html', resume: 'Resume / CV', nonResume: 'Academic transcript (PDF)', eeo: /^Gender identity$/, freeText: /Tell us about a data project/ },
];

const cardFor = (panel: Page, name: string | RegExp) =>
  panel.locator('.card').filter({ has: panel.getByRole('heading', { name }) });

for (const f of FIXTURES) {
  test(`${f.fixture}: full run to review, never submits`, async ({ context, openPanel }) => {
    if (!USE_OLLAMA) await mockReset();
    const { page, panel } = await startRun(context, openPanel, f.fixture);

    // Resume upload is automatic; another upload is a handoff; EEO waits for approval with "decline" proposed;
    // free text is drafted for review; the CAPTCHA is the human's.
    await expect(panel.locator('.log')).toContainText(`${f.resume} → alex-rivera-cv.pdf (filled)`, { timeout: 20_000 });
    await expect(cardFor(panel, f.nonResume).locator('.card-kind')).toHaveText('Your turn');
    const eeo = cardFor(panel, f.eeo);
    await expect(eeo).toContainText(/decline|prefer not/i);
    await expect(cardFor(panel, f.freeText)).toContainText('Written answer: please review.');
    await expect(cardFor(panel, 'A CAPTCHA check')).toBeVisible();

    await clearCards(panel);
    // The outline is drawn in the frame that holds Submit (the iframe, for the embed).
    await expect
      .poll(async () => {
        let n = 0;
        for (const frame of page.frames()) n += await frame.locator('[data-lazyapply-overlay=submit]').count();
        return n;
      })
      .toBe(1);
    expect(await submitClicks(page)).toBe(0);
    for (const frame of page.frames()) {
      const clicks = await frame.evaluate(() => (window as unknown as { __submitClicks?: number }).__submitClicks ?? 0).catch(() => 0);
      expect(clicks, frame.url()).toBe(0);
    }
  });
}

// AC-TE-4 / AC-AL-8: a model that keeps returning invalid JSON turns its fields into questions.
test('invalid model output becomes questions, and the run still finishes', async ({ context, openPanel }) => {
  test.skip(USE_OLLAMA, 'needs the mock');
  await mockReset();
  await mockMode('invalid-json');
  const { page, panel } = await startRun(context, openPanel, 'lever.html');
  const travel = cardFor(panel, /open to occasional travel/);
  await expect(travel.locator('.card-kind')).toHaveText('Question');
  await expect(panel.locator('.log')).toContainText('The model could not answer some fields. They need you.');
  // Stage 1 does not need the model, so the profile fields are still filled.
  await expect(page.locator('input[name=email]')).toHaveValue('alex.rivera@example.com');
  await clearCards(panel);
  expect(await submitClicks(page)).toBe(0);
});
