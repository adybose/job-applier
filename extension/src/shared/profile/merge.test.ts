import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { mergeProfiles, resolveConflict } from './merge';
import { profileFromExtracted } from './schema';
import { loadProfile, saveProfile } from './storage';
import { recording } from './test-helpers';

const cv = () => profileFromExtracted(recording('alex-rivera-profile-cv'), 'cv');
const li = () => profileFromExtracted(recording('alex-rivera-profile-linkedin'), 'linkedin');

describe('mergeProfiles', () => {
  beforeEach(() => fakeBrowser.reset());

  // AC-PI-5
  it('fills gaps from LinkedIn and keeps their source', () => {
    const { profile } = mergeProfiles(cv(), li());
    expect(profile.links.linkedin).toEqual({ value: 'www.linkedin.com/in/alex-rivera-example', source: 'linkedin' });
    expect(profile.links.github?.source).toBe('cv');
    expect(profile.contact.phone).toEqual({ value: '+1 503 555 0142', source: 'cv' });
  });

  it('only fills GitHub from LinkedIn when the CV lacks it', () => {
    const cvNoGithub = cv();
    delete cvNoGithub.links.github;
    const liWithGithub = li();
    liWithGithub.links.github = { value: 'github.com/alexrivera-dev', source: 'linkedin' };
    const { profile } = mergeProfiles(cvNoGithub, liWithGithub);
    expect(profile.links.github?.source).toBe('linkedin');
  });

  // AC-PI-6
  it('records a conflict for different emails and blocks saving until resolved', async () => {
    const merged = mergeProfiles(cv(), li());
    expect(merged.conflicts).toContainEqual({
      path: 'contact.email',
      cvValue: 'alex.rivera@example.com',
      linkedinValue: 'alex@rivera.example',
    });

    const blocked = await saveProfile(merged.profile, merged.conflicts);
    expect(blocked.ok).toBe(false);
    expect(await loadProfile()).toBeUndefined();

    let state = merged;
    for (const c of merged.conflicts) state = resolveConflict(state.profile, state.conflicts, c.path, { pick: 'cv' });
    expect(state.conflicts).toEqual([]);
    expect(await saveProfile(state.profile, state.conflicts)).toEqual({ ok: true });
    expect((await loadProfile())?.contact.email.value).toBe('alex.rivera@example.com');
  });

  it('ignores formatting-only differences', () => {
    const a = cv();
    const b = li();
    b.contact.email = { value: ' Alex.Rivera@Example.com ', source: 'linkedin' };
    b.contact.country = { value: 'USA', source: 'linkedin' };
    const { conflicts } = mergeProfiles(a, b);
    expect(conflicts.map((c) => c.path)).not.toContain('contact.email');
  });

  it('matches jobs by company and dates, keeps CV values, and adds LinkedIn-only jobs', () => {
    const { profile, conflicts } = mergeProfiles(cv(), li());
    expect(profile.experience.map((e) => [e.value.company, e.source])).toEqual([
      ['Globex Robotics', 'cv'],
      ['Initech', 'cv'],
      ['Hooli', 'linkedin'],
    ]);
    expect(profile.experience[0]?.value.title).toBe('Senior Software Engineer');
    expect(profile.experience[0]?.value.bullets).toHaveLength(3);
    expect(conflicts).toContainEqual({
      path: 'experience.0.title',
      cvValue: 'Senior Software Engineer',
      linkedinValue: 'Staff Software Engineer',
    });
  });

  it('unions skills, languages and certifications', () => {
    const { profile } = mergeProfiles(cv(), li());
    expect(profile.skills.map((s) => s.value)).toEqual([
      'TypeScript',
      'React',
      'Node.js',
      'PostgreSQL',
      'Python',
      'Docker',
      'AWS',
      'Distributed Systems',
    ]);
    expect(profile.languages).toHaveLength(2);
    expect(profile.certifications[0]?.source).toBe('linkedin');
  });

  it('resolves a conflict with a custom value as a user edit', () => {
    const merged = mergeProfiles(cv(), li());
    const { profile } = resolveConflict(merged.profile, merged.conflicts, 'experience.0.title', {
      custom: 'Lead Engineer',
    });
    expect(profile.experience[0]?.value.title).toBe('Lead Engineer');
    expect(profile.experience[0]?.source).toBe('user');
  });
});
