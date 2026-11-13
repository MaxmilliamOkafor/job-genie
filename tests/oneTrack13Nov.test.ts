import { readFileSync } from 'fs';
import { describe, expect, it } from 'bun:test';
import { buildSummary, enforceSummaryShape, findViolations, focusOpener, type SummaryContext } from '../supabase/functions/_shared/summaryShape.ts';
import { enforceEducationSection } from '../supabase/functions/_shared/resumeSections.ts';
import { educationDisplayDate, educationDisplayLine, educationStoredDates, educationYearOnly } from '../supabase/functions/_shared/educationDates.ts';
import { condenseEarlierRoles } from '../supabase/functions/_shared/twoPages.ts';
import { normaliseProfileForSave, validateEducationEntry } from '../src/lib/profileValidation';

// Section I and E of the 12-13 Nov brief: one track, two pages, graduation years.

const ROLES = [
  { title: 'Software Engineer', bullets: [
    'Brought the overnight reporting run down from six hours to under one with PySpark.',
    'Cut response times on backend services by running downstream calls in parallel.',
  ] },
  { title: 'AI Product Manager', bullets: ['Led AI and NLP development for a dementia detection product used by 40 clinicians.'] },
  { title: 'Solutions Architect', bullets: ['Architected a migration to 47 AWS microservices on EKS for a retail client.'] },
  { title: 'Data Analyst', bullets: ['Rebuilt the credit risk reporting suite, cutting month-end close from nine working days to three.'] },
];
const ctx = (careerFocus?: string, targetTitle = 'Senior Machine Learning Engineer'): SummaryContext => ({
  heldTitles: ROLES.map((r) => r.title),
  currentTitle: 'Software Engineer',
  targetTitle,
  careerFocus,
  requirements: ['machine learning', 'NLP', 'PySpark'],
  experienceBullets: ROLES.flatMap((r) => r.bullets.map((b) => `- ${b}`)),
  outcomeBullets: ROLES.flatMap((r) => r.bullets),
  outcomeRoles: ROLES,
  employers: ['Meta', 'SolimHealth', 'Accenture', 'Citigroup'],
  places: ['Dublin', 'London'],
});

describe('career focus leads the summary', () => {
  it('with careerFocus "Machine Learning Engineer" the summary opens as that track', () => {
    const summary = buildSummary(ctx('Machine Learning Engineer'));
    expect(summary.startsWith('Focused on machine learning engineering')).toBe(true);
  });

  it('never opens with "Background in" when a focus is set', () => {
    expect(buildSummary(ctx('Machine Learning Engineer'))).not.toMatch(/^Background in/i);
    const model = 'Background in software engineering, with strengths in NLP and PySpark. Brought the overnight reporting run down from six hours to under one; architected a migration to 47 AWS microservices.';
    const decision = enforceSummaryShape(model, ctx('Machine Learning Engineer'));
    expect(decision.rebuilt).toBe(true);
    expect(decision.summary).not.toMatch(/^Background in/i);
  });

  it('never claims a focus title the work history does not contain', () => {
    const summary = buildSummary(ctx('Machine Learning Engineer'));
    expect(summary).not.toMatch(/Machine Learning Engineer\b/i);
    expect(findViolations('Machine Learning Engineer with strengths in NLP and PySpark. Brought the overnight reporting run down from six hours to under one; architected 47 AWS microservices.', ctx('Machine Learning Engineer')))
      .toContain('career focus claimed as a title: Machine Learning Engineer');
  });

  it('a focus the work history contains opens with that held title', () => {
    expect(focusOpener('Solutions Architect', ROLES.map((r) => r.title))).toBe('Solutions Architect');
    expect(buildSummary(ctx('Solutions Architect', 'Cloud Architect')).startsWith('Solutions Architect')).toBe(true);
  });

  it('without a focus the summary follows the job title as before', () => {
    expect(buildSummary(ctx(undefined)).startsWith('Background in')).toBe(true);
  });
});

const EDUCATION = [
  { degree: 'MSc Artificial Intelligence and Machine Learning', institution: 'Imperial College London', start_year: 'August 2020', end_year: 'June 2021' },
  { degree: 'BSc Computer Science', institution: 'University of Derby', start_year: '2016', end_year: '2020' },
  { degree: 'MSc Data Science', institution: 'Trinity College Dublin', start_year: 'September 2025', end_year: 'Present' },
];

describe('education shows the graduation year only', () => {
  it('the CV education section carries graduation years and no start dates', () => {
    const cv = enforceEducationSection('PROFESSIONAL EXPERIENCE\nMeta\nSoftware Engineer\nJanuary 2023 - Present\n\nEDUCATION\nBSc\nDerby 2016 - 2020', EDUCATION).text;
    expect(cv).toContain('Imperial College London 2021');
    expect(cv).toContain('University of Derby 2020');
    expect(cv).toContain('Trinity College Dublin 2025 - Present');
    expect(cv).not.toContain('2016');
    expect(cv).not.toContain('August 2020');
    expect(cv).toContain('January 2023 - Present');
  });

  it('model-written ranges become graduation years when no rows are saved, and a rerun changes nothing', () => {
    const once = enforceEducationSection('EDUCATION\nBSc Computer Science\nUniversity of Derby August 2016 - July 2020', []).text;
    expect(once).toContain('University of Derby 2020');
    expect(educationYearOnly(once)).toBe(once);
  });

  it('a saved row reduces to its graduation year for generated documents', () => {
    expect(educationDisplayDate(EDUCATION[1])).toBe('2020');
    expect(educationDisplayLine(EDUCATION[1])).toBe('BSc Computer Science, University of Derby, 2020');
    expect(educationDisplayLine(EDUCATION[0])).toBe('MSc Artificial Intelligence and Machine Learning, Imperial College London, 2021');
    expect(educationDisplayDate({ dates: 'Sept 2016 - June 2020' })).toBe('2020');
  });

  it('the Profile page keeps showing the full stored dates', () => {
    expect(educationStoredDates({ ...EDUCATION[1], start_year: 'August 2016', end_year: 'July 2020' })).toBe('August 2016 - July 2020');
    expect(educationStoredDates(EDUCATION[0])).toBe('August 2020 - June 2021');
    expect(educationStoredDates(EDUCATION[2])).toBe('September 2025 - Present');
    expect(educationStoredDates({ dates: 'Sept 2016 - June 2020' })).toBe('Sept 2016 - June 2020');
    expect(educationStoredDates({ degree: 'BSc' })).toBe('');
    const page = readFileSync('src/pages/Profile.tsx', 'utf8');
    expect(page).toContain('educationStoredDates(edu)');
    expect(page).not.toContain('educationDisplayDate');
    expect(page).not.toContain('this page show the graduation year only');
  });

  it('both stored dates are still there after saving the profile', () => {
    const saved = normaliseProfileForSave({ education: [{ ...EDUCATION[1], start_year: 'August 2016', end_year: 'July 2020' }] } as any);
    expect(saved.education[0].start_year).toBe('August 2016');
    expect(saved.education[0].end_year).toBe('July 2020');
    expect(saved.education[0].graduation_year).toBe('2020');
    expect(validateEducationEntry(saved.education[0])).toEqual([]);
  });
});

const b = (s: string) => `- ${s}`;
const CV = [
  'Max Okafor', 'Account Executive', '',
  'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer', 'January 2023 - Present',
  ...[1, 2, 3, 4, 5].map((n) => b(`Meta result ${n} with Python.`)),
  'SolimHealth', 'AI Product Manager', 'August 2022 - December 2022',
  ...[1, 2, 3, 4, 5].map((n) => b(`SolimHealth result ${n}.`)),
  'Accenture', 'Solutions Architect', 'April 2021 - July 2022',
  b('Architected a migration to 47 AWS microservices.'),
  b('Served as technical lead on five pre-sales bids, presenting to client CTOs.'),
  b('Moved four teams to daily deployment.'),
  b('Established monitoring with Prometheus.'),
  b('Closed all but three ISO 27001 pre-audit gaps.'),
  b('Reduced provisioning to one pipeline run.'),
  'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
  ...[1, 2, 3, 4, 5].map((n) => b(`Citigroup result ${n}.`)),
  '',
  'TECHNICAL SKILLS', 'Programming: Python',
].join('\n');
const today = new Date(2026, 10, 12);
const bulletsOf = (cv: string, company: string) => {
  const lines = cv.split('\n');
  const at = lines.indexOf(company);
  const out: string[] = [];
  for (let i = at + 3; i < lines.length && lines[i].startsWith('- '); i++) out.push(lines[i]);
  return out;
};

describe('the CV fits two pages', () => {
  const out = condenseEarlierRoles(CV, { asked: ['pre-sales', 'Python'], today }).cv;
  it('the latest role keeps every bullet', () => expect(bulletsOf(out, 'Meta').length).toBe(5));
  it('a five-month role has at most three bullets', () => expect(bulletsOf(out, 'SolimHealth').length).toBe(3));
  it('a recent role keeps at most four', () => expect(bulletsOf(out, 'Accenture').length).toBe(4));
  it('a role that ended more than five years ago keeps at most three', () => expect(bulletsOf(out, 'Citigroup').length).toBe(3));
  it('the bullet the posting asks about stays', () => expect(bulletsOf(out, 'Accenture').some((l) => /pre-sales bids/.test(l))).toBe(true));
  it('running it again changes nothing', () => expect(condenseEarlierRoles(out, { asked: ['pre-sales', 'Python'], today }).cv).toBe(out));
  it('a CV with one role is left alone', () => {
    const single = 'PROFESSIONAL EXPERIENCE\nAcme\nEngineer\nJanuary 2010 - March 2012\n' + [1, 2, 3, 4, 5].map((n) => b(`Did thing ${n}.`)).join('\n');
    expect(condenseEarlierRoles(single, { today }).cv).toBe(single);
  });
});
