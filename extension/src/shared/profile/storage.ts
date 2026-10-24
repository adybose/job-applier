import { browser } from 'wxt/browser';
import { ProfileSchema, type Conflict, type Profile } from './schema';

const PROFILE_KEY = 'profile.v1';
const DRAFT_KEY = 'profile.draft.v1';

export async function loadProfile(): Promise<Profile | undefined> {
  const stored = await browser.storage.local.get(PROFILE_KEY);
  const parsed = ProfileSchema.safeParse(stored[PROFILE_KEY]);
  return parsed.success ? parsed.data : undefined;
}

/** Spec 02 R-PI-8/R-PI-14: a profile with unresolved conflicts cannot be saved. */
export async function saveProfile(
  profile: Profile,
  conflicts: readonly Conflict[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (conflicts.length) {
    return { ok: false, error: `Choose a value for ${conflicts.length === 1 ? 'the conflict' : `all ${conflicts.length} conflicts`} first.` };
  }
  const parsed = ProfileSchema.safeParse(profile);
  if (!parsed.success) return { ok: false, error: 'Some profile fields are not valid.' };
  await browser.storage.local.set({ [PROFILE_KEY]: parsed.data });
  await browser.storage.local.remove(DRAFT_KEY);
  return { ok: true };
}

export interface ProfileDraft {
  profile: Profile;
  conflicts: Conflict[];
  errors: string[];
}

export async function loadDraft(): Promise<ProfileDraft | undefined> {
  const stored = await browser.storage.local.get(DRAFT_KEY);
  return stored[DRAFT_KEY] as ProfileDraft | undefined;
}

export async function saveDraft(draft: ProfileDraft): Promise<void> {
  await browser.storage.local.set({ [DRAFT_KEY]: draft });
}
