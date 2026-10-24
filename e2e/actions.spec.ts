import type { Page } from '@playwright/test';
import type { Action } from '../extension/src/shared/actions';
import type { FormSnapshot } from '../extension/src/shared/snapshot';
import { expect, openFixture, panelCall, test } from './harness';

async function setup(context: Parameters<typeof openFixture>[0], panel: Page, fixture: string) {
  const { page, tabId } = await openFixture(context, panel, fixture);
  await panelCall(panel, 'injectContent', tabId);
  const snap = await panelCall(panel, 'snapshotTab', tabId);
  const field = (label: string | RegExp) => {
    const f = snap.fields.find((x) => (typeof label === 'string' ? x.label === label : label.test(x.label)));
    if (!f) throw new Error(`no field ${label}`);
    return f;
  };
  const button = (text: string) => {
    const b = snap.buttons.find((x) => x.text === text);
    if (!b) throw new Error(`no button ${text}`);
    return b;
  };
  const act = (frameId: number, action: Action) => panelCall(panel, 'act', tabId, frameId, action);
  return { page, tabId, snap: snap as FormSnapshot, field, button, act };
}

const submitClicks = (page: Page) => page.evaluate(() => (window as unknown as { __submitClicks: number }).__submitClicks);

test.describe('actions', () => {
  // AC-AC-1
  test('fills React-controlled inputs so component state updates', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, field, act } = await setup(context, panel, 'ashby.html');
    const name = field('Name');
    expect(await act(name.frameId, { action: 'fill', fieldId: name.id, value: 'Alex Rivera' })).toEqual({
      ok: true,
      value: 'Alex Rivera',
    });
    await expect(page.locator('#_systemfield_name')).toHaveAttribute('data-state', 'Alex Rivera');

    const comp = field('Expected compensation (USD)');
    expect(await act(comp.frameId, { action: 'fill', fieldId: comp.id, value: '$160,000' })).toMatchObject({ ok: true, value: '160000' });
    await expect(page.locator('#comp-ashby')).toHaveAttribute('data-state', '160000');

    // Idempotent: the same fill again is a no-op success (R-AC-11).
    expect(await act(name.frameId, { action: 'fill', fieldId: name.id, value: 'Alex Rivera' })).toMatchObject({ ok: true });
  });

  // AC-AC-2
  test('fills contenteditable fields', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, field, act } = await setup(context, panel, 'generic.html');
    const note = field('Anything else? (optional)');
    expect(await act(note.frameId, { action: 'fill', fieldId: note.id, value: 'Happy to relocate.' })).toMatchObject({ ok: true });
    await expect(page.locator('#note')).toHaveText('Happy to relocate.');
  });

  // AC-AC-3 plus native selects, radios, toggles, checkboxes and dates.
  test('selects options in every kind of choice control', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const gh = await setup(context, panel, 'greenhouse.html');
    const race = gh.field('Race');
    expect(await gh.act(race.frameId, { action: 'select_option', fieldId: race.id, value: 'decline to self-identify' })).toEqual({
      ok: true,
      value: 'Decline To Self Identify',
    });
    await expect(gh.page.locator('#race-select')).toHaveAttribute('data-value', 'Decline To Self Identify');
    await expect(gh.page.locator('#race-select [role=listbox]')).toHaveCount(0);

    const auth = gh.field(/legally authorized/);
    expect(await gh.act(auth.frameId, { action: 'select_option', fieldId: auth.id, value: 'Yes' })).toMatchObject({ ok: true });
    await expect(gh.page.locator('#job_application_answers_attributes_2_boolean_value')).toHaveValue('1');
    expect(await gh.act(auth.frameId, { action: 'select_option', fieldId: auth.id, value: 'Maybe' })).toMatchObject({
      ok: false,
      reason: 'no-matching-option',
    });

    const consent = gh.field(/I agree to Acme Robotics/);
    expect(await gh.act(consent.frameId, { action: 'set_checked', fieldId: consent.id, checked: true })).toMatchObject({ ok: true });
    await expect(gh.page.locator('#job_application_data_compliance_gdpr_consent_given')).toBeChecked();

    const generic = await setup(context, panel, 'generic.html');
    const uk = generic.field('Are you authorized to work in the UK?');
    expect(await generic.act(uk.frameId, { action: 'select_option', fieldId: uk.id, value: 'no' })).toMatchObject({ ok: true, value: 'No' });
    await expect(generic.page.locator('input[name=uk_auth][value=no]')).toBeChecked();
    const start = generic.field('Earliest start date');
    expect(await generic.act(start.frameId, { action: 'fill', fieldId: start.id, value: '2026-12' })).toMatchObject({
      ok: true,
      value: '2026-12-01',
    });
    const pref = generic.field('Preferred name');
    expect(await generic.act(pref.frameId, { action: 'fill', fieldId: pref.id, value: 'Alex' })).toMatchObject({ ok: true });

    const ashby = await setup(context, panel, 'ashby.html');
    const sponsor = ashby.field(/require visa sponsorship/);
    expect(await ashby.act(sponsor.frameId, { action: 'select_option', fieldId: sponsor.id, value: 'No' })).toMatchObject({ ok: true });
    await expect(ashby.page.locator('[data-name=sponsorship] button', { hasText: 'No' })).toHaveAttribute('aria-pressed', 'true');
  });

  // AC-AC-4 / AC-AC-5
  test('uploads only the resume, through DataTransfer', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, field, act } = await setup(context, panel, 'greenhouse.html');
    await page.evaluate(() => {
      const w = window as unknown as { __changes: number };
      w.__changes = 0;
      document.getElementById('resume')?.addEventListener('change', () => w.__changes++);
    });
    const resume = field('Resume/CV');
    const file = { name: 'alex-rivera-cv.pdf', type: 'application/pdf', base64: Buffer.from('%PDF-1.4 test').toString('base64') };
    expect(await act(resume.frameId, { action: 'upload_file', fieldId: resume.id, fileKind: 'resume', file })).toMatchObject({ ok: true });
    expect(await page.evaluate(() => {
      const input = document.getElementById('resume') as HTMLInputElement;
      return { count: input.files?.length, name: input.files?.[0]?.name, changes: (window as unknown as { __changes: number }).__changes };
    })).toEqual({ count: 1, name: 'alex-rivera-cv.pdf', changes: 1 });

    const cover = field('Cover Letter');
    const rejected = await act(cover.frameId, {
      action: 'upload_file',
      fieldId: cover.id,
      fileKind: 'cover_letter' as 'resume',
      file,
    });
    expect(rejected).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await page.evaluate(() => (document.getElementById('cover_letter') as HTMLInputElement).files?.length)).toBe(0);
  });

  // AC-AC-6
  test('reports a value the page keeps resetting as not sticking', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, tabId } = await openFixture(context, panel, 'generic.html');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'stubborn';
      input.setAttribute('aria-label', 'Stubborn field');
      input.addEventListener('input', () => setTimeout(() => (input.value = ''), 100));
      document.getElementById('generic-form')?.prepend(input);
    });
    await panelCall(panel, 'injectContent', tabId);
    const snap = await panelCall(panel, 'snapshotTab', tabId);
    const stubborn = snap.fields.find((f) => f.label === 'Stubborn field');
    const result = await panelCall(panel, 'act', tabId, 0, { action: 'fill', fieldId: stubborn?.id ?? '', value: 'hello' });
    expect(result).toMatchObject({ ok: false, reason: 'did-not-stick' });
  });

  // AC-AC-7
  test('does not overwrite what the user typed without approval', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, field, act } = await setup(context, panel, 'generic.html');
    await page.locator('#fname').fill('foo');
    const first = field('First name');
    expect(await act(first.frameId, { action: 'fill', fieldId: first.id, value: 'bar' })).toMatchObject({
      ok: false,
      reason: 'needs-approval',
    });
    await expect(page.locator('#fname')).toHaveValue('foo');
    expect(await act(first.frameId, { action: 'fill', fieldId: first.id, value: 'bar', overwrite: true })).toMatchObject({ ok: true });
    await expect(page.locator('#fname')).toHaveValue('bar');
  });

  // AC-AC-8 and AC-PS-4
  test('never clicks a submit-like control, even when asked', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, snap, act } = await setup(context, panel, 'generic.html');
    for (const b of snap.buttons.filter((x) => x.isSubmitLike)) {
      expect(await act(b.frameId, { action: 'click', buttonId: b.id, approvedNav: true }), b.text).toMatchObject({
        ok: false,
        reason: 'not-allowed',
      });
    }
    expect(await submitClicks(page)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __submitEvents: number }).__submitEvents)).toBe(0);

    // Unknown or unapproved clicks are rejected by the schema.
    const save = snap.buttons.find((b) => b.text === 'Save draft');
    expect(await act(0, { action: 'click', buttonId: save?.id ?? '' } as unknown as Action)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await act(0, { action: 'submit', fieldId: 'x' } as unknown as Action)).toMatchObject({ ok: false, reason: 'invalid' });
  });

  // AC-AC-9
  test('never types into a password field', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, field, act } = await setup(context, panel, 'generic.html');
    const pw = field(/Create a password/);
    expect(await act(pw.frameId, { action: 'fill', fieldId: pw.id, value: 'hunter2' })).toMatchObject({ ok: false, reason: 'not-allowed' });
    await expect(page.locator('#pw')).toHaveValue('');
  });

  test('highlights without blocking the page, and clears', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, field, act } = await setup(context, panel, 'ashby.html');
    const portfolio = field('Portfolio (PDF)');
    await act(portfolio.frameId, { action: 'highlight', fieldId: portfolio.id, style: 'handoff', note: 'Your turn' });
    const overlay = page.locator('[data-lazyapply-overlay=handoff]');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveCSS('pointer-events', 'none');
    await expect(overlay).toContainText('Your turn');
    await act(portfolio.frameId, { action: 'clear_highlight' });
    await expect(overlay).toHaveCount(0);
  });

  test('works inside the cross-origin Greenhouse embed', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, field, act } = await setup(context, panel, 'greenhouse-embed.html');
    const first = field('First Name');
    expect(await act(first.frameId, { action: 'fill', fieldId: first.id, value: 'Alex' })).toMatchObject({ ok: true });
    await expect(page.frameLocator('#grnhse_iframe').locator('#first_name')).toHaveValue('Alex');
  });
});
