import { describe, expect, it } from 'vitest';
import { groundExtraction, linkedinSummary } from './grounding';
import { EMPTY_EXTRACTED } from './schema';

const DOC = `Globex Robotics
Staff Software Engineer
March 2021 - Present
Led the rewrite of the fleet telemetry pipeline in TypeScript.
Oregon State University
Skills: TypeScript, React`;

describe('groundExtraction', () => {
  it('drops invented bullets and keeps grounded ones', () => {
    const { data, report } = groundExtraction(
      {
        ...EMPTY_EXTRACTED,
        experience: [
          {
            company: 'Globex Robotics',
            title: 'Staff Software Engineer',
            start: '2021-03',
            end: 'present',
            location: null,
            bullets: [
              'Led the rewrite of the fleet telemetry pipeline in TypeScript.',
              'Collaborated with cross-functional teams to deliver high-quality software.',
            ],
          },
        ],
      },
      DOC,
    );
    expect(data.experience[0]?.bullets).toEqual(['Led the rewrite of the fleet telemetry pipeline in TypeScript.']);
    expect(report.droppedBullets).toBe(1);
  });

  it('drops LinkedIn Summary text copied into job bullets', () => {
    const doc = `Summary\nEngineer who likes turning messy data into tools people trust.\nExperience\nGlobex Robotics\nStaff Software Engineer`;
    expect(linkedinSummary(doc)).toBe('Engineer who likes turning messy data into tools people trust.');
    const { data } = groundExtraction(
      {
        ...EMPTY_EXTRACTED,
        experience: [
          {
            company: 'Globex Robotics',
            title: 'Staff Software Engineer',
            start: '2021',
            end: 'present',
            location: null,
            bullets: ['Engineer who likes turning messy data into tools people trust.'],
          },
        ],
      },
      doc,
      { notBullets: linkedinSummary(doc) },
    );
    expect(data.experience[0]?.bullets).toEqual([]);
  });

  it('drops invented jobs, schools, skills and certifications', () => {
    const { data, report } = groundExtraction(
      {
        ...EMPTY_EXTRACTED,
        experience: [
          { company: 'Umbrella Corp', title: 'CTO', start: '2010', end: '2012', location: null, bullets: [] },
        ],
        education: [
          { institution: 'Oregon State University', degree: null, field: null, start: null, end: null, grade: null },
          { institution: 'Harvard University', degree: null, field: null, start: null, end: null, grade: null },
        ],
        skills: ['TypeScript', 'Kubernetes'],
        certifications: [{ name: 'PMP', issuer: null, year: null }],
      },
      DOC,
    );
    expect(data.experience).toEqual([]);
    expect(data.education.map((e) => e.institution)).toEqual(['Oregon State University']);
    expect(data.skills).toEqual(['TypeScript']);
    expect(data.certifications).toEqual([]);
    expect(report.droppedEntries).toBe(2);
  });
});
