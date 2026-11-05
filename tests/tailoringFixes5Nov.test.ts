import { describe, expect, it } from 'bun:test';
import { dropUnbackedSkills, isSoftSkill } from '../supabase/functions/tailor-application/guards';
import { shortenClause, endsAtNaturalBreak } from '../supabase/functions/_shared/summaryShape';
import { excludedKeyword, filterJobKeywords } from '../supabase/functions/_shared/keywordChecks';

const PROFILE = [
  'Resolved a production failure that had recurred monthly for over a year by leading the incident review.',
  'Led the IFRS 9 staging criteria review, testing it against four years of loan performance data.',
  'Closed all but three gaps found in a regulated financial services client\'s ISO 27001 pre-audit as security architecture lead.',
  'Defined the HIPAA and patient data requirements, covering audit logging and role-based access control.',
  'Mentored two junior engineers and an intern who converted to a permanent role.',
].join('\n');

const CV = ['Maxmilliam Okafor', 'Engineer', '', 'PROFESSIONAL EXPERIENCE', 'Meta', '• Led the incident review.', '', 'TECHNICAL SKILLS',
  'Programming: Python, SQL',
  'Domain: Agile, Compliance, Leadership, Intune, Device Management, Equipment Lifecycle',
  'Professional: Communication, Collaboration, Decision Making, Innovation, Stakeholder Management',
  'Languages: English (fluent)', '', 'EDUCATION', 'BSc'].join('\n');

describe('the skills section: soft skills and skills your work shows stay', () => {
  const out = dropUnbackedSkills(CV, PROFILE);
  it('the soft skills line stays whole', () => {
    expect(out).toContain('Professional: Communication, Collaboration, Decision Making, Innovation, Stakeholder Management');
  });
  it('Leadership (led, mentored) and Compliance (regulated, audit) are backed by the work', () => {
    expect(out).toMatch(/Domain: [^\n]*Compliance/);
    expect(out).toMatch(/Domain: [^\n]*Leadership/);
  });
  it('a tool the profile never names still goes', () => {
    expect(out).not.toContain('Intune');
    expect(out).not.toContain('Equipment Lifecycle');
  });
  it('knows a soft skill', () => {
    expect(isSoftSkill('Decision Making')).toBe(true);
    expect(isSoftSkill('Kubernetes')).toBe(false);
  });
});

describe('the summary never stops inside a list of names', () => {
  const clause = 'Brought the overnight impression reporting run down from six hours to under one by rebuilding the PySpark and Presto pipeline';
  it('"by rebuilding the PySpark" is not a natural break', () => {
    expect(endsAtNaturalBreak(clause, 'Brought the overnight impression reporting run down from six hours to under one by rebuilding the PySpark')).toBe(false);
    expect(endsAtNaturalBreak(clause, 'Brought the overnight impression reporting run down from six hours to under one')).toBe(true);
  });
  for (const max of [60, 80, 95, 110, 140]) {
    it(`shortened to ${max} characters, it ends cleanly`, () => {
      const out = shortenClause(clause, max);
      expect(out.endsWith('PySpark')).toBe(false);
      expect(endsAtNaturalBreak(clause, out)).toBe(true);
    });
  }
});

describe('places are not keywords', () => {
  it('"Dubai UAE", "Hong Kong SAR", "Kuala Lumpur, Malaysia", "UK Remote" go', () => {
    for (const k of ['Dubai UAE', 'Hong Kong SAR', 'Kuala Lumpur, Malaysia', 'UK Remote', 'Singapore']) expect(excludedKeyword(k)).toBe(true);
  });
  it('"Employee Engagement", "Multi-country", "Workday" and "Java" stay', () => {
    expect(filterJobKeywords(['Employee Engagement', 'Multi-country', 'Workday', 'Java'], '')).toEqual(['Employee Engagement', 'Multi-country', 'Workday', 'Java']);
  });
});
