import { mergeProfiles, resolveConflict } from '../profile/merge';
import { profileFromExtracted, type Profile } from '../profile/schema';
import { recording } from '../profile/test-helpers';
import type { Field } from '../snapshot';

let n = 0;
export function field(label: string, extra: Partial<Field> = {}): Field {
  return {
    id: `f${++n}`,
    frameId: 0,
    kind: 'text',
    widget: 'native',
    label,
    required: false,
    value: '',
    constraints: {},
    ...extra,
  };
}

export const yesNo = [
  { value: '1', label: 'Yes' },
  { value: '0', label: 'No' },
];

/** Alex Rivera, CV + LinkedIn merged with CV values, plus work preferences. */
export function alex(): Profile {
  let state = mergeProfiles(
    profileFromExtracted(recording('alex-rivera-profile-cv'), 'cv'),
    profileFromExtracted(recording('alex-rivera-profile-linkedin'), 'linkedin'),
  );
  for (const c of state.conflicts) state = resolveConflict(state.profile, state.conflicts, c.path, { pick: 'cv' });
  const p = state.profile;
  const u = <T>(value: T) => ({ value, source: 'user' as const });
  p.sponsorshipNeeded = u(false);
  p.workAuthorization = [u({ country: 'United States', authorized: true })];
  p.relocation = u({ willing: true, locations: [] });
  p.noticePeriod = u('4 weeks');
  p.salaryExpectation = u({ amount: 165000, currency: 'USD', period: 'year' as const, askEachTime: false });
  return p;
}
