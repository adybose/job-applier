import { describe, expect, it } from 'vitest';
import { scriptedClient } from '../profile/test-helpers';
import { route } from '../policy/route';
import { promptTokens } from './planner';
import { buildDraftMessages, cleanDraft, DRAFT_OUTPUT_RESERVE, draftAnswer, dropUngroundedNumbers, fitLength, shouldDraft } from './drafter';
import { alex, field } from './test-fixtures';

const why = field('Why do you want to work at Acme Robotics?', { id: 'why', kind: 'textarea', required: true, constraints: { maxLength: 500 } });
const JD = 'Acme Robotics builds warehouse robots. You will build React dashboards for 2,000 robots.';

describe('fitLength (AC-AL-10)', () => {
  it('cuts a 2,000-character answer to 500 at a sentence boundary', () => {
    const long = Array.from({ length: 40 }, (_, i) => `This is sentence number ${i} of the answer.`).join(' ');
    expect(long.length).toBeGreaterThan(1500);
    const out = fitLength(long, 500);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out.endsWith('.')).toBe(true);
  });

  it('leaves short answers alone and falls back to a word boundary', () => {
    expect(fitLength('Short answer.', 500)).toBe('Short answer.');
    const out = fitLength('one two three four five six seven eight nine ten', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('draft cleanup and grounding', () => {
  it('strips quotes, markdown, headings and bullets', () => {
    expect(cleanDraft('"## Answer\n- I **love** robots."')).toBe('I love robots.');
  });

  it('drops sentences with numbers that are not in the profile or posting', () => {
    const facts = 'cut alert latency by 60%. 2,000 robots. 2018';
    const { text, dropped } = dropUngroundedNumbers(
      'I cut alert latency by 60% at Globex. I led a team of 12 engineers. I am excited about 2,000 robots.',
      facts,
    );
    expect(text).toBe('I cut alert latency by 60% at Globex. I am excited about 2,000 robots.');
    expect(dropped).toBe(1);
  });

  it('drafts required and cover-letter questions, not optional extras', () => {
    expect(shouldDraft(why)).toBe(true);
    expect(shouldDraft(field('Anything else? (optional)', { kind: 'contenteditable' }))).toBe(false);
    expect(shouldDraft(field('Additional information', { kind: 'textarea', helpText: 'Add a cover letter or anything else' }))).toBe(true);
  });
});

describe('draftAnswer', () => {
  it('uses the drafting slot at temperature 0.6 and always routes to approval', async () => {
    const { client, sent } = scriptedClient(['I want to build the React dashboards Acme operators use, like the one I built for 300 field technicians at Globex.']);
    const proposal = await draftAnswer(client, why, alex(), JD, 16384);
    expect(proposal).toMatchObject({ origin: 'draft', action: 'fill' });
    expect(proposal?.value).toContain('300 field technicians');
    expect(sent[0]).toMatchObject({ options: { temperature: 0.6 } });
    expect(route(why, proposal, { failed: new Set(), written: new Map() }).route).toBe('approval');
  });

  it('notes removed sentences in the rationale', async () => {
    const { client } = scriptedClient(['I love robots. I shipped 47 features last year.']);
    const proposal = await draftAnswer(client, why, alex(), JD, 16384);
    expect(proposal?.value).toBe('I love robots.');
    expect(proposal?.rationale).toMatch(/Removed 1 sentence/);
  });

  it('fits num_ctx 8192 with a long profile and job description', () => {
    const messages = buildDraftMessages(why, alex(), 'x'.repeat(12_000), 8192);
    expect(promptTokens(messages) + DRAFT_OUTPUT_RESERVE).toBeLessThanOrEqual(8192);
    expect(messages[1]?.content).toContain('<<<PAGE_DATA\nWhy do you want to work at Acme Robotics?\nPAGE_DATA>>>');
  });
});
