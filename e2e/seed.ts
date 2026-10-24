import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeProfiles, resolveConflict } from '../extension/src/shared/profile/merge';
import { profileFromExtracted, type ExtractedProfile, type Profile } from '../extension/src/shared/profile/schema';

const recording = (name: string): ExtractedProfile =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../mock-model/recordings', `${name}.json`), 'utf8')).response;

/** Alex Rivera: CV + LinkedIn merged with CV values, plus work preferences (same as the unit-test profile). */
export function alexProfile(): Profile {
  let state = mergeProfiles(
    profileFromExtracted(recording('alex-rivera-profile-cv'), 'cv'),
    profileFromExtracted(recording('alex-rivera-profile-linkedin'), 'linkedin'),
  );
  for (const c of state.conflicts) state = resolveConflict(state.profile, state.conflicts, c.path, { pick: 'cv' });
  const p = state.profile;
  const u = <T,>(value: T) => ({ value, source: 'user' as const });
  p.sponsorshipNeeded = u(false);
  p.workAuthorization = [u({ country: 'United States', authorized: true })];
  p.relocation = u({ willing: true, locations: [] });
  p.noticePeriod = u('4 weeks');
  p.salaryExpectation = u({ amount: 165000, currency: 'USD', period: 'year' as const, askEachTime: false });
  return p;
}
