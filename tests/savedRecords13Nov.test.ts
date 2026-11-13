import { describe, expect, it } from 'bun:test';
import {
  companyAliasMap,
  displayCompany,
  displayJob,
  displayLocation,
  stripPlaceFromTitle,
  tidyJobForSave,
  unwrapJobTitle,
} from '../src/lib/jobRecords';
import { countSubmitted, documentStatusLabel, groupDocumentsByJob } from '../src/lib/documentGroups';
import { matchLabel, profileSkillNames, rankTopMatches, scoreJob } from '../src/lib/profileMatch';
import { matchesKeywordSearch, matchesLiveFeedSearch, remoteRegionIncludes, type LiveFeedCheck } from '../src/lib/liveFeedFilter';
import { expandQuery, locationTerms, skillOverlap } from '../src/lib/jobSearch';
import { decodeEntities, employerPlainText, employerReadableText } from '../supabase/functions/_shared/employerText';
import { groupedSkillsPreview, normaliseProfileForSave, tidyExcludedCompanies, tidySkillsForSave } from '../src/lib/profileValidation';

// Fixtures only: no network, no saved account data.

describe('F. job titles and company names on saved records', () => {
  it('unwraps the Stripe page title, keeping the " - " inside the role', () => {
    const out = unwrapJobTitle('Job Application for Account Executive, Product (Global Payouts - Hunter) at Stripe', '');
    expect(out).toEqual({ title: 'Account Executive, Product (Global Payouts - Hunter)', company: 'Stripe' });
  });

  it('leaves "Application Support Engineer" unchanged', () => {
    expect(unwrapJobTitle('Application Support Engineer', 'Acme')).toEqual({ title: 'Application Support Engineer', company: 'Acme' });
  });

  it('unwraps "Application for the <role> at <employer>" and splits at the last " at "', () => {
    expect(unwrapJobTitle('Application for the Head of Data at Scale at Acme', '').title).toBe('Head of Data at Scale');
    expect(unwrapJobTitle('Application for the Head of Data at Scale at Acme', '').company).toBe('Acme');
  });

  it('drops only a site suffix after the employer', () => {
    expect(unwrapJobTitle('Job Application for Engineer at Stripe | Greenhouse', '').company).toBe('Stripe');
    expect(unwrapJobTitle('Job Application for Engineer at Acme - Careers', '').company).toBe('Acme');
  });

  it('uses the employer as company only when the row has none', () => {
    expect(unwrapJobTitle('Job Application for Engineer at Stripe', 'Stripe Payments Europe').company).toBe('Stripe Payments Europe');
    expect(unwrapJobTitle('Job Application for Engineer at Stripe', 'Unknown Company').company).toBe('Stripe');
  });

  it('shows a title without the place the location already holds', () => {
    expect(stripPlaceFromTitle('Senior Product Manager, Marketing AI Dublin, Ireland', 'Dublin, Ireland').title).toBe(
      'Senior Product Manager, Marketing AI',
    );
    // A different place in the title is not the location's, so it stays.
    expect(stripPlaceFromTitle('Software Engineer, London', 'Dublin, Ireland').title).toBe('Software Engineer, London');
  });

  it('never prints empty brackets or a city paired with another country', () => {
    expect(displayLocation('Republic of Ireland ()')).toBe('Republic of Ireland');
    expect(displayLocation('Dublin, US')).toBe('Dublin, Ireland');
    expect(displayLocation('Dublin ()')).toBe('Dublin');
    expect(displayLocation('Munich, Munich')).toBe('Munich');
  });

  it('shows web-address company names as the spelling the user\'s other rows use', () => {
    const aliases = companyAliasMap(['Qube Research & Technologies', 'Signal & Strand', 'Stripe']);
    expect(displayCompany('Quberesearchandtechnologies', aliases)).toBe('Qube Research & Technologies');
    expect(displayCompany('Signalandstrand', aliases)).toBe('Signal & Strand');
    expect(displayCompany('Monzo', aliases)).toBe('Monzo');
  });

  it('applies the same tidy-up on save and on display of an old row', () => {
    const row = { title: 'Job Application for Account Executive, Product (Global Payouts - Hunter) at Stripe', company: '', location: 'Dublin, US' };
    expect(tidyJobForSave(row)).toEqual({ title: 'Account Executive, Product (Global Payouts - Hunter)', company: 'Stripe', location: 'Dublin, Ireland' });
    expect(displayJob(row).title).toBe('Account Executive, Product (Global Payouts - Hunter)');
  });
});

describe('G. one Documents entry per job', () => {
  const job = { title: 'Job Application for Data Engineer at Stripe', company: 'Stripe', url: 'https://job-boards.greenhouse.io/stripe/jobs/1?jr_id=a' };
  const versions = [
    { id: 'old', updated_at: '2026-11-01T10:00:00Z', tailored_resume: 'cv1', tailored_cover_letter: 'l1', applied_at: null, job },
    { id: 'new', updated_at: '2026-11-12T10:00:00Z', tailored_resume: 'cv2', tailored_cover_letter: 'l2', applied_at: null, job: { ...job, url: 'https://job-boards.greenhouse.io/stripe/jobs/1?jr_id=b' } },
    { id: 'other', updated_at: '2026-11-05T10:00:00Z', tailored_resume: 'cv3', tailored_cover_letter: null, applied_at: null, job: { title: 'Analyst', company: 'Monzo', url: null } },
  ];

  it('groups by job with the newest version first and earlier versions reachable', () => {
    const groups = groupDocumentsByJob(versions);
    expect(groups).toHaveLength(2);
    expect(groups[0].latest.id).toBe('new');
    expect(groups[0].earlier.map((v) => v.id)).toEqual(['old']);
  });

  it('labels documents without a reported submission "Prepared" and counts submissions per job', () => {
    expect(documentStatusLabel({ applied_at: null })).toBe('Prepared');
    expect(documentStatusLabel({ applied_at: '2026-11-12T10:00:00Z' })).toBe('Applied');
    expect(countSubmitted(versions)).toBe(0);
    expect(countSubmitted([...versions, { ...versions[0], id: 'sent', applied_at: '2026-11-12T11:00:00Z' }])).toBe(1);
  });
});

describe('H. Overview numbers', () => {
  const profile = {
    skills: [{ name: 'Python' }, { name: 'Apache Spark' }, 'Technical: Kafka, Airflow'],
    professional_experience: [{ title: 'Data Engineer', bullets: ['Built Snowflake pipelines with dbt for 40 analysts.'] }],
    relevant_projects: [{ name: 'Feed', techStack: 'Terraform, AWS' }],
  };

  it('shows "Not scored", not 0%, for a job with no description', () => {
    const result = scoreJob(profile, { title: 'Data Engineer', description: '' });
    expect(result.percent).toBeNull();
    expect(matchLabel(result)).toBe('Not scored');
  });

  it('does not score a job that names fewer than three skills', () => {
    expect(scoreJob(profile, { title: 'Account Executive', description: 'Sell our SaaS and Python tooling.' }).percent).toBeNull();
  });

  it('scores from every skill, bullet and project', () => {
    const result = scoreJob(profile, { title: 'Data Engineer', description: 'We use Python, Kafka, Snowflake, Terraform and Java.' });
    expect(result.matched.map((t) => t.toLowerCase()).sort()).toEqual(['kafka', 'python', 'snowflake', 'terraform']);
    expect(result.missing.map((t) => t.toLowerCase())).toEqual(['java']);
    expect(result.percent).toBe(80);
  });

  it('ranks by score and preferred location, with unscored jobs last', () => {
    const ranked = rankTopMatches(
      [
        { title: 'A', description: 'Python, Kafka, Java and Go-live plans', location: 'San Francisco' },
        { title: 'B', description: 'Python, Kafka, Java and Go-live plans', location: 'Dublin, Ireland' },
        { title: 'C', description: '', location: 'Dublin' },
      ],
      profile,
      ['Dublin'],
    );
    expect(ranked.map((r) => r.job.title)).toEqual(['B', 'A', 'C']);
  });
});

describe('I. Live feed search filters', () => {
  const check: LiveFeedCheck = {
    terms: expandQuery('data engineer'),
    locationTerms: locationTerms('Dublin', true),
    workplace: [],
    country: 'Ireland',
  };

  it('returns no San Francisco sales role for "data engineer" in Dublin', () => {
    const job = { title: 'Account Executive', description: 'Sell to data teams and engineering leaders.', location: 'San Francisco Bay Area', workplace_type: 'Onsite' };
    expect(matchesLiveFeedSearch(job, check)).toBe(false);
  });

  it('returns no Brazil-only role', () => {
    const job = { title: 'Data Engineer', description: 'Build pipelines.', location: 'Sao Paulo, BR', workplace_type: 'Onsite' };
    expect(matchesLiveFeedSearch(job, check)).toBe(false);
  });

  it('keeps a Dublin data engineer and a synonym in the description', () => {
    expect(matchesLiveFeedSearch({ title: 'Data Engineer', description: null, location: 'Dublin, IE', workplace_type: 'Hybrid' }, check)).toBe(true);
    expect(matchesKeywordSearch({ title: 'Engineer II', description: 'Join us as an analytics engineer.' }, check.terms)).toBe(true);
    expect(matchesKeywordSearch({ title: 'DevOps Engineer - Unified Data Layer', description: '' }, check.terms)).toBe(false);
  });

  it('shows remote roles only when the remote region includes the user\'s country', () => {
    const remote = (location: string) => ({ title: 'Data Engineer', description: '', location, workplace_type: 'Remote' });
    expect(matchesLiveFeedSearch(remote('Remote - EMEA'), check)).toBe(true);
    expect(matchesLiveFeedSearch(remote('Remote within United States'), check)).toBe(false);
    expect(matchesLiveFeedSearch(remote('Remote'), check)).toBe(false);
    expect(matchesLiveFeedSearch(remote('Remote - EMEA'), { ...check, workplace: ['Onsite'] })).toBe(false);
    expect(remoteRegionIncludes('Remote (UK & Ireland)', 'Ireland')).toBe(true);
  });

  it('keeps "We’re looking" with its apostrophe', () => {
    expect(employerReadableText('<p>We’re looking for you</p>')).toBe('We’re looking for you');
    expect(employerPlainText('&lt;p&gt;We&amp;#8217;re looking&lt;/p&gt;')).toBe('We’re looking');
    expect(decodeEntities('&ldquo;Hi&rdquo; &lsquo;x&rsquo;')).toBe('“Hi” ‘x’');
    expect(employerReadableText('We re looking and we don t stop')).toBe("We're looking and we don't stop");
  });

  it('counts every saved skill, splitting grouped entries', () => {
    const names = profileSkillNames([{ name: 'SQL' }, 'Technical: Python, Java, ETL', { items: ['Kafka', 'python'] }, '']);
    expect(names).toEqual(['SQL', 'Python', 'Java', 'ETL', 'Kafka']);
    const overlap = skillOverlap('We use Python, SQL and Kafka.', 'Data Engineer', names);
    expect(overlap.matched).toEqual(['SQL', 'Python', 'Kafka']);
    expect(overlap.matched.length + overlap.missing.length).toBe(5);
  });
});

describe('K. Profile tidy-ups', () => {
  it('drops empty skills and case-insensitive duplicates on save', () => {
    const skills = [{ name: 'ETL', category: 'technical' }, { name: 'etl ', category: 'technical' }, { name: '' }, '', { name: 'Python' }];
    expect(tidySkillsForSave(skills)).toEqual([{ name: 'ETL', category: 'technical' }, { name: 'Python' }]);
    expect(normaliseProfileForSave({ skills }).skills).toHaveLength(2);
  });

  it('puts Google Cloud Platform in Cloud & DevOps and Apache Spark in Data & AI', () => {
    const groups = groupedSkillsPreview([{ name: 'Google Cloud Platform' }, { name: 'Apache Spark' }]);
    expect(groups.find((g) => g.group === 'Cloud & DevOps')?.terms).toEqual(['Google Cloud Platform']);
    expect(groups.find((g) => g.group === 'Data & AI')?.terms).toEqual(['Apache Spark']);
  });

  it('collapses excluded companies differing by case, spacing or "-careers", keeping the first spelling', () => {
    expect(
      tidyExcludedCompanies(['Shield AI', 'TRIO', 'flock safety', 'chainalysis-careers', 'chainalysis', 'trio', 'Flock Safety', 'shieldai', 'Commure-Athelas', 'commure']),
    ).toEqual(['Shield AI', 'TRIO', 'flock safety', 'chainalysis-careers', 'Commure-Athelas', 'commure']);
  });
});
