import { describe, expect, it } from 'vitest';
import type { FormSnapshot } from '../snapshot';
import { initialState, reduce, requiredProgress, type RunEvent, type RunState } from './machine';
import { field } from './test-fixtures';

const name = field('Name', { id: 'name', required: true });
const email = field('Email', { id: 'email', required: true });
const salary = field('Salary', { id: 'salary' });
const snap = (extra: Partial<FormSnapshot> = {}): FormSnapshot => ({
  frameId: 0,
  url: 'http://x/apply',
  title: 'Apply',
  fields: [name, email, salary],
  buttons: [],
  blockers: [],
  ...extra,
});
const run = (events: RunEvent[], from: RunState = initialState) => events.reduce(reduce, from);
const proposal = (fieldId: string, value: string) => ({
  fieldId,
  action: 'fill' as const,
  value,
  confidence: 1,
  rationale: '',
  sensitive: false,
  origin: 'mapper' as const,
});

// AC-AL-1
describe('run state machine', () => {
  it('needs a profile first', () => {
    expect(run([{ type: 'START', hasProfile: false }]).phase).toBe('NEEDS_PROFILE');
  });

  it('goes IDLE → SCANNING → FILLING → REVIEW → DONE', () => {
    let s = run([{ type: 'START', hasProfile: true }]);
    expect(s.phase).toBe('SCANNING');
    s = reduce(s, { type: 'SNAPSHOT', snapshot: snap() });
    expect(s.phase).toBe('FILLING');
    expect(s.order).toEqual(['name', 'email', 'salary']);
    s = run(
      [
        { type: 'ROUTED', fieldId: 'name', route: 'auto', reason: '', proposal: proposal('name', 'Alex') },
        { type: 'ROUTED', fieldId: 'email', route: 'auto', reason: '', proposal: proposal('email', 'a@x.com') },
        { type: 'ROUTED', fieldId: 'salary', route: 'skip', reason: '' },
        { type: 'FILLED', fieldId: 'name', value: 'Alex', decidedBy: 'auto' },
      ],
      s,
    );
    expect(s.phase).toBe('FILLING');
    expect(requiredProgress(s)).toEqual({ done: 1, total: 2 });
    s = reduce(s, { type: 'FILLED', fieldId: 'email', value: 'a@x.com', decidedBy: 'auto' });
    expect(s.phase).toBe('REVIEW');
    expect(reduce(s, { type: 'DONE' }).phase).toBe('DONE');
  });

  it('waits for approval and for the human, and keeps going meanwhile', () => {
    let s = run([
      { type: 'START', hasProfile: true },
      { type: 'SNAPSHOT', snapshot: snap() },
      { type: 'ROUTED', fieldId: 'salary', route: 'approval', reason: 'Sensitive', proposal: proposal('salary', '150k') },
    ]);
    expect(s.phase).toBe('WAITING_APPROVAL');
    expect(s.cards.map((c) => [c.id, c.type])).toEqual([['salary', 'approval']]);
    s = run(
      [
        { type: 'ROUTED', fieldId: 'name', route: 'auto', reason: '' },
        { type: 'FILLED', fieldId: 'name', value: 'Alex', decidedBy: 'auto' },
        { type: 'FILL_FAILED', fieldId: 'email', reason: "Didn't stick", instruction: 'Please fill in "Email" yourself.' },
      ],
      s,
    );
    expect(s.fields.name?.status).toBe('filled');
    expect(s.phase).toBe('WAITING_HUMAN');
    s = run(
      [
        { type: 'RESOLVED', id: 'email', decidedBy: 'human', value: 'a@x.com' },
        { type: 'RESOLVED', id: 'salary', decidedBy: 'edited', value: '160k' },
      ],
      s,
    );
    expect(s.phase).toBe('REVIEW');
    expect(s.fields.salary).toMatchObject({ decidedBy: 'edited', finalValue: '160k' });
  });

  it('turns blockers into handoffs, except OAuth buttons', () => {
    const s = run([
      { type: 'START', hasProfile: true },
      {
        type: 'SNAPSHOT',
        snapshot: snap({
          blockers: [
            { id: 'cap', frameId: 0, type: 'captcha', description: 'A CAPTCHA check', resolved: false },
            { id: 'oauth', frameId: 0, type: 'oauth', description: '"Apply with LinkedIn" button', resolved: false },
          ],
        }),
      },
    ]);
    expect(s.cards.map((c) => c.id)).toEqual(['cap']);
    expect(s.phase).toBe('WAITING_HUMAN');
    const after = reduce(s, { type: 'BLOCKER_RESOLVED', id: 'cap' });
    expect(after.cards).toEqual([]);
    // The same blocker in a later snapshot does not come back.
    expect(reduce(after, { type: 'SNAPSHOT', snapshot: snap({ blockers: s.blockers }) }).cards).toEqual([]);
  });

  it('pauses and resumes to the right phase, and stops for good', () => {
    let s = run([
      { type: 'START', hasProfile: true },
      { type: 'SNAPSHOT', snapshot: snap() },
      { type: 'PAUSE' },
    ]);
    expect(s.phase).toBe('PAUSED');
    s = reduce(s, { type: 'ROUTED', fieldId: 'salary', route: 'approval', reason: '' });
    expect(s.phase).toBe('PAUSED');
    s = reduce(s, { type: 'RESUME' });
    expect(s.phase).toBe('WAITING_APPROVAL');
    s = reduce(s, { type: 'STOP' });
    expect(s.phase).toBe('STOPPED');
    expect(s.cards).toEqual([]);
    expect(reduce(s, { type: 'ROUTED', fieldId: 'name', route: 'auto', reason: '' })).toBe(s);
  });

  it('ignores invalid events', () => {
    expect(reduce(initialState, { type: 'DONE' })).toBe(initialState);
    expect(reduce(initialState, { type: 'RESUME' })).toBe(initialState);
    expect(reduce(initialState, { type: 'SNAPSHOT', snapshot: snap() })).toBe(initialState);
    const filling = run([{ type: 'START', hasProfile: true }, { type: 'SNAPSHOT', snapshot: snap() }]);
    expect(reduce(filling, { type: 'START', hasProfile: true })).toBe(filling);
  });

  it('waits for model work before review', () => {
    let s = run([
      { type: 'START', hasProfile: true },
      { type: 'SNAPSHOT', snapshot: snap({ fields: [salary] }) },
      { type: 'WORK', delta: 1 },
      { type: 'ROUTED', fieldId: 'salary', route: 'skip', reason: '' },
    ]);
    expect(s.phase).toBe('FILLING');
    s = reduce(s, { type: 'WORK', delta: -1 });
    expect(s.phase).toBe('REVIEW');
  });

  it('re-scans after navigation and keeps field ids', () => {
    let s = run([{ type: 'START', hasProfile: true }, { type: 'SNAPSHOT', snapshot: snap() }]);
    s = reduce(s, { type: 'NAVIGATED', url: 'http://x/apply/step-2' });
    expect(s.phase).toBe('SCANNING');
    s = reduce(s, { type: 'SNAPSHOT', snapshot: snap({ fields: [name, field('Cover letter', { id: 'cl' })] }) });
    expect(s.order).toEqual(['name', 'email', 'salary', 'cl']);
  });

  // R-AL-16
  it('asks before going to the next step, then goes back to filling', () => {
    let s = run([
      { type: 'START', hasProfile: true },
      { type: 'SNAPSHOT', snapshot: snap({ fields: [salary] }) },
      { type: 'ROUTED', fieldId: 'salary', route: 'skip', reason: '' },
    ]);
    expect(s.phase).toBe('REVIEW');
    s = reduce(s, { type: 'NAV_PROPOSED', buttonId: 'next', frameId: 0, text: 'Next' });
    expect(s.phase).toBe('WAITING_APPROVAL');
    expect(s.cards[0]).toMatchObject({ id: 'next', nav: true, label: 'Go to the next step?' });
    expect(reduce(s, { type: 'NAV_PROPOSED', buttonId: 'next', frameId: 0, text: 'Next' })).toBe(s);
    s = reduce(s, { type: 'NAV_RESOLVED', buttonId: 'next', clicked: true });
    expect(s.cards).toEqual([]);
    s = reduce(s, { type: 'SNAPSHOT', snapshot: snap({ fields: [salary, field('Step 2 question', { id: 's2', required: true })] }) });
    expect(s.phase).toBe('FILLING');
  });
});
