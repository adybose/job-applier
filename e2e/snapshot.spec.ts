import type { Field, FormSnapshot } from '../extension/src/shared/snapshot';
import { expect, openFixture, panelCall, test } from './harness';

const byLabel = (s: FormSnapshot, label: string | RegExp): Field | undefined =>
  s.fields.find((f) => (typeof label === 'string' ? f.label === label : label.test(f.label)));

test.describe('FormSnapshot', () => {
  test('generic form: every label strategy, shadow DOM, skipped fields, groups, blockers, buttons', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { tabId } = await openFixture(context, panel, 'generic.html');
    await panelCall(panel, 'injectContent', tabId);
    const s = await panelCall(panel, 'snapshotTab', tabId);

    // AC-PP-1
    for (const label of ['First name', 'Last name', 'Email address', 'Phone number', 'City', 'Portfolio URL', 'github_url']) {
      expect(byLabel(s, label), label).toBeDefined();
    }
    expect(byLabel(s, 'First name')).toMatchObject({ kind: 'text', required: true, autocomplete: 'given-name' });
    expect(byLabel(s, 'Email address')).toMatchObject({ kind: 'email', required: true });

    // AC-PP-2
    expect(byLabel(s, 'Preferred name')).toMatchObject({ kind: 'text' });

    // AC-PP-3
    const names = s.fields.map((f) => f.name);
    for (const hidden of ['hidden_display', 'employee_id', 'zero_size', 'email_confirm_hp', 'csrf']) {
      expect(names, hidden).not.toContain(hidden);
    }

    // AC-PP-4
    const auth = s.fields.filter((f) => f.name === 'uk_auth');
    expect(auth).toHaveLength(1);
    expect(auth[0]).toMatchObject({ kind: 'radio-group', label: 'Are you authorized to work in the UK?', required: true });
    expect(auth[0]?.options?.map((o) => o.label)).toEqual(['Yes', 'No']);
    expect(byLabel(s, 'Do you consider yourself to have a disability?')?.options).toHaveLength(3);

    // Other kinds.
    expect(byLabel(s, /Tell us about a data project/)).toMatchObject({
      kind: 'textarea',
      required: true,
      constraints: { maxLength: 500 },
      helpText: 'Two or three short paragraphs is plenty.',
    });
    expect(byLabel(s, 'Anything else? (optional)')).toMatchObject({ kind: 'contenteditable' });
    expect(byLabel(s, 'Resume / CV')).toMatchObject({ kind: 'file', required: true, constraints: { accept: '.pdf' } });
    expect(byLabel(s, 'Gender identity')).toMatchObject({ kind: 'select', section: 'Equality and diversity monitoring (optional)' });
    expect(byLabel(s, 'Gender identity')?.options?.map((o) => o.label)).toContain('Prefer not to say');
    expect(byLabel(s, 'Country')?.options?.[0]?.label).toBe('United Kingdom');
    expect(byLabel(s, /I confirm the information/)).toMatchObject({ kind: 'checkbox', required: true, value: 'false' });
    expect(byLabel(s, /Create a password/)).toMatchObject({ kind: 'password' });

    // AC-PP-6
    expect(s.blockers.map((b) => b.type).sort()).toEqual(['captcha', 'login', 'oauth']);

    // AC-PP-9 and spec 01 R-PS-7
    const submitLike = s.buttons.filter((b) => b.isSubmitLike).map((b) => b.text);
    expect(submitLike).toEqual(expect.arrayContaining(['Apply with LinkedIn', 'Apply', 'Send', 'Finish', 'Go', 'Submit application']));
    expect(s.buttons.find((b) => b.text === 'Save draft')).toMatchObject({ isSubmitLike: false, isNavLike: false });

    // AC-PP-8 (generic): the job description comes from the article, not the form.
    expect(s.jobDescription).toContain('We move 40,000 parcels a day');
    expect(s.jobDescription).not.toContain('First name');
  });

  test('greenhouse: labels, EEO, combobox options, job description', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, tabId } = await openFixture(context, panel, 'greenhouse.html');
    await panelCall(panel, 'injectContent', tabId);
    const s = await panelCall(panel, 'snapshotTab', tabId);

    expect(byLabel(s, 'First Name')).toMatchObject({ required: true, name: 'job_application[first_name]' });
    expect(byLabel(s, 'Resume/CV')).toMatchObject({ kind: 'file', required: true });
    expect(byLabel(s, 'Cover Letter')).toMatchObject({ kind: 'file', required: false });
    expect(byLabel(s, /legally authorized to work/)).toMatchObject({ kind: 'select', required: true });
    expect(byLabel(s, /Why do you want to work at Acme Robotics/)).toMatchObject({ kind: 'textarea', required: true });
    expect(byLabel(s, /I agree to Acme Robotics storing/)).toMatchObject({ kind: 'checkbox', required: true });
    expect(byLabel(s, 'Gender')).toMatchObject({ section: 'U.S. Equal Employment Opportunity Information' });
    expect(s.fields.map((f) => f.name)).not.toContain('job_application[website_url]');
    expect(s.blockers.map((b) => b.type)).toEqual(['captcha']);
    expect(s.buttons.find((b) => b.text === 'Submit Application')?.isSubmitLike).toBe(true);

    // AC-PP-8
    expect(s.jobDescription).toContain('Acme Robotics builds warehouse robots');
    expect(s.jobDescription).not.toContain('First Name');

    // AC-PP-5
    const race = byLabel(s, 'Race');
    expect(race).toMatchObject({ kind: 'combobox', widget: 'react-select' });
    const options = await panelCall(panel, 'readOptions', tabId, race?.frameId ?? 0, race?.id ?? '');
    expect(options.map((o) => o.label)).toContain('Decline To Self Identify');
    await expect(page.locator('#race-select [role=listbox]')).toHaveCount(0);
  });

  test('lever and ashby: wrapped labels, radio cards, toggles, hidden upload input', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const lever = await openFixture(context, panel, 'lever.html');
    await panelCall(panel, 'injectContent', lever.tabId);
    const l = await panelCall(panel, 'snapshotTab', lever.tabId);
    expect(byLabel(l, 'Resume/CV')).toMatchObject({ kind: 'file', required: true });
    expect(byLabel(l, 'Full name')).toMatchObject({ autocomplete: 'name', required: true });
    expect(byLabel(l, 'LinkedIn URL')).toMatchObject({ name: 'urls[LinkedIn]' });
    expect(byLabel(l, /open to occasional travel/)).toMatchObject({ kind: 'radio-group', required: true });
    expect(byLabel(l, 'Work samples (optional)')).toMatchObject({ kind: 'file' });
    expect(l.blockers.map((b) => b.type)).toEqual(['captcha']);
    expect(l.jobDescription).toContain('Northwind Labs makes logistics software');

    const ashby = await openFixture(context, panel, 'ashby.html');
    await panelCall(panel, 'injectContent', ashby.tabId);
    const a = await panelCall(panel, 'snapshotTab', ashby.tabId);
    expect(byLabel(a, 'Resume')).toMatchObject({ kind: 'file', required: true });
    expect(byLabel(a, 'Portfolio (PDF)')).toMatchObject({ kind: 'file', constraints: { accept: 'application/pdf' } });
    expect(byLabel(a, /legally authorized to work/)).toMatchObject({
      kind: 'radio-group',
      widget: 'toggle-buttons',
      required: true,
      options: [
        { value: 'Yes', label: 'Yes' },
        { value: 'No', label: 'No' },
      ],
    });
    expect(byLabel(a, 'Gender')).toMatchObject({ kind: 'radio-group' });
    expect(byLabel(a, /What excites you/)).toMatchObject({ constraints: { maxLength: 1000 }, required: true });
    expect(a.buttons.map((b) => b.text)).not.toContain('Yes');
  });

  test('greenhouse embed: the cross-origin frame is snapshotted and merged', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { tabId } = await openFixture(context, panel, 'greenhouse-embed.html');
    await panelCall(panel, 'injectContent', tabId);
    const s = await panelCall(panel, 'snapshotTab', tabId);
    const first = byLabel(s, 'First Name');
    expect(first).toBeDefined();
    expect(first?.frameId).not.toBe(0);
    // Both frames carry a posting; the longer one (inside the embed) wins.
    expect(s.jobDescription).toContain('Acme Robotics');
    expect(s.jobDescription).not.toContain('First Name');
    expect(s.url).toContain('greenhouse-embed.html');
  });

  // AC-PP-7
  test('ids stay stable across re-renders and re-injection', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, tabId } = await openFixture(context, panel, 'generic.html');
    await panelCall(panel, 'injectContent', tabId);
    const before = await panelCall(panel, 'snapshotTab', tabId);

    await page.evaluate(() => {
      const old = document.getElementById('fname') as HTMLInputElement;
      const replacement = document.createElement('input');
      for (const a of ['id', 'name', 'type', 'autocomplete', 'required']) {
        const v = old.getAttribute(a);
        if (v !== null) replacement.setAttribute(a, v);
      }
      old.replaceWith(replacement);
    });
    await panelCall(panel, 'injectContent', tabId);
    const after = await panelCall(panel, 'snapshotTab', tabId);
    expect(byLabel(after, 'First name')?.id).toBe(byLabel(before, 'First name')?.id);
    expect(after.fields.map((f) => f.id)).toEqual(before.fields.map((f) => f.id));
  });

  test('a Next button is navigation, not submit', async ({ context, openPanel }) => {
    const panel = await openPanel();
    const { page, tabId } = await openFixture(context, panel, 'generic.html');
    await page.evaluate(() => {
      const next = document.createElement('button');
      next.type = 'submit';
      next.textContent = 'Next';
      document.querySelector('.buttons')?.prepend(next);
    });
    await panelCall(panel, 'injectContent', tabId);
    const s = await panelCall(panel, 'snapshotTab', tabId);
    expect(s.buttons.find((b) => b.text === 'Next')).toMatchObject({ isNavLike: true, isSubmitLike: false });
  });
});
