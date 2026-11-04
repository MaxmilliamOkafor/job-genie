import { describe, expect, it } from 'bun:test';
import {
  polishTailoredDocuments,
  unstitchBullet,
  mergeNamedToolsIntoSkills,
  dropUnbackedSkills,
  trimHeadline,
  dedupeLetterHeader,
  fixIndustryPhrasing,
} from '../supabase/functions/tailor-application/guards.ts';

const PROFILE = 'Data Engineer at Acme\nBuilt pipelines with Python and SQL\nSkills: Python, SQL';

describe('rule 1: stitched posting duty comes off', () => {
  it('drops the duty and past-tenses the -ing verb', () => {
    expect(unstitchBullet('Worked with cross-functional teams to design, implement, test and support reliable, scalable data engineering solutions, closing all but three gaps in the audit trail'))
      .toBe('Closed all but three gaps in the audit trail');
    expect(unstitchBullet('Built and optimized data transformation workflows, ensuring efficient data processing by replacing a 40-tab Excel pack with an automated pipeline'))
      .toBe('Replaced a 40-tab Excel pack with an automated pipeline');
  });
  it('collapses a mid-bullet -ing stitch into "and"', () => {
    expect(unstitchBullet('Presented results to the board, communicating findings effectively and won sign-off'))
      .toBe('Presented results to the board and won sign-off');
  });
  it('leaves a normal bullet alone', () => {
    const normal = 'Built and tested data pipelines processing 2m records daily with Python and SQL.';
    expect(unstitchBullet(normal)).toBe(normal);
  });
});

describe('rule 2: named tools join the matching skills line', () => {
  const cv = [
    'Sam Example',
    'Data Engineer',
    '',
    'PROFESSIONAL EXPERIENCE',
    'Data Engineer | Acme | 01-2020 - Present',
    '• Built streaming jobs with PySpark and Kafka for the payments platform.',
    '• Scheduled nightly loads in Airflow.',
    '',
    'TECHNICAL SKILLS',
    'Programming: Python, SQL',
    'Data & ML: Pandas',
  ].join('\n');
  it('adds PySpark, Kafka and Airflow to existing lines only', () => {
    const out = mergeNamedToolsIntoSkills(cv);
    expect(out).toContain('Data & ML: Pandas, PySpark, Kafka, Airflow');
    expect(out).toContain('Programming: Python, SQL');
    expect(out).not.toContain('Cloud & DevOps:');
  });
  it('never duplicates a tool in any form and never adds one covered by a listed tool', () => {
    const withDupes = cv.replace('Data & ML: Pandas', 'Data & ML: Pandas, Data Pipeline, AWS');
    const out = mergeNamedToolsIntoSkills(withDupes + '\n• Modeled Data Pipelines and AWS Transcribe jobs.');
    expect(out.match(/Data Pipeline/g)!.length).toBe(2); // one in skills, one in the bullet
    expect(out).not.toContain('AWS Transcribe,');
    expect(out).not.toContain('Data Pipelines,');
  });
  it('collapses "Data Pipeline (Data Pipelines)" to "Data Pipeline"', () => {
    const out = mergeNamedToolsIntoSkills(cv.replace('Data & ML: Pandas', 'Data & ML: Data Pipeline (Data Pipelines)'));
    expect(out).toContain('Data & ML: Data Pipeline');
    expect(out).not.toContain('(Data Pipelines)');
  });
  it('leaves a skills line that already has the tool unchanged', () => {
    const already = cv.replace('Data & ML: Pandas', 'Data & ML: Pandas, Kafka');
    const out = mergeNamedToolsIntoSkills(already);
    expect(out.match(/Kafka/g)!.length).toBe(2); // skills line plus the bullet
  });
});

describe('rule 3: unbacked skills items are dropped', () => {
  const cv = [
    'Sam Example',
    'IT Support Engineer',
    '',
    'PROFESSIONAL EXPERIENCE',
    'IT Support Engineer | Acme | 01-2020 - Present',
    '• Resolved incident management tickets for 200 staff using ServiceNow.',
    '',
    'TECHNICAL SKILLS',
    'Professional: Major Incident Management, ServiceNow, Ticketing, Intune, Equipment Lifecycle, Device Management',
    'Languages: English (fluent)',
  ].join('\n');
  it('drops items the profile and CV never show, keeps backed ones with modifiers', () => {
    const out = dropUnbackedSkills(cv, 'ServiceNow ticketing and incident management');
    expect(out).toContain('Professional: Major Incident Management, ServiceNow, Ticketing');
    expect(out).not.toContain('Intune');
    expect(out).not.toContain('Equipment Lifecycle');
    expect(out).not.toContain('Device Management');
  });
  it('never touches a Languages line', () => {
    const out = dropUnbackedSkills(cv, 'nothing relevant at all');
    expect(out).toContain('Languages: English (fluent)');
  });
  it('changes nothing when more than 60% of items would go', () => {
    const thin = cv.replace(
      'Professional: Major Incident Management, Intune, Equipment Lifecycle, Device Management',
      'Professional: Intune, Equipment Lifecycle, Device Management, Sage, SAP',
    );
    expect(dropUnbackedSkills(thin, 'unrelated profile text')).toBe(thin);
  });
});

describe('rule 4: headline drops an unshown platform', () => {
  const cv = [
    'Sam Example',
    'Data Engineer Informatica Intelligent Data Management Cloud (IDMC) & ETL Development',
    '',
    'PROFESSIONAL SUMMARY',
    'Data engineer with strong delivery record.',
    '',
    'PROFESSIONAL EXPERIENCE',
    'Data Engineer | Acme | 01-2020 - Present',
    '• Built ETL jobs in Python and SQL.',
    '',
    'TECHNICAL SKILLS',
    'Programming: Python, SQL',
  ].join('\n');
  it('keeps the role and drops the platform the CV never shows', () => {
    const out = trimHeadline(cv, PROFILE);
    expect(out.split('\n')[1]).toBe('Data Engineer');
  });
  it('keeps a fully backed headline', () => {
    const backed = cv.replace(
      'Data Engineer Informatica Intelligent Data Management Cloud (IDMC) & ETL Development',
      'Data Engineer | Python and SQL',
    );
    expect(trimHeadline(backed, PROFILE).split('\n')[1]).toBe('Data Engineer | Python and SQL');
  });
});

describe('rule 5: repeated letter header lines are written once', () => {
  const letter = [
    'Sam Example',
    'https://linkedin.com/in/maxokafor',
    'linkedin.com/in/maxokafor/',
    'sam@example.com',
    '',
    '4 November 2026',
    '',
    'Dear Hiring Team,',
    '',
    'Body paragraph one.',
  ].join('\n');
  it('counts urls as one ignoring https://, www. and a trailing slash', () => {
    const out = dedupeLetterHeader(letter);
    expect(out.match(/linkedin\.com\/in\/maxokafor/g)!.length).toBe(1);
    expect(out).toContain('sam@example.com');
  });
  it('leaves a header with no repeats unchanged', () => {
    const clean = ['Sam Example', 'sam@example.com', '', 'Dear Hiring Team,', '', 'Body.'].join('\n');
    expect(dedupeLetterHeader(clean)).toBe(clean);
  });
});

describe('rule 6: industry phrasing', () => {
  it('reads "solutions for financial services"', () => {
    expect(fixIndustryPhrasing('I built solutions of financial services and products of retail banking.'))
      .toBe('I built solutions for financial services and products for retail banking.');
  });
  it('leaves other "of" phrasing alone', () => {
    expect(fixIndustryPhrasing('the scale of the platform')).toBe('the scale of the platform');
  });
});

describe('polishTailoredDocuments', () => {
  it('runs all six rules and returns both documents', () => {
    const cv = [
      'Sam Example',
      'Data Engineer Informatica (IDMC)',
      '',
      'PROFESSIONAL EXPERIENCE',
      'Data Engineer | Acme | 01-2020 - Present',
      '• Worked with teams to deliver reliable solutions, closing all but three gaps in reporting with Kafka.',
      '',
      'TECHNICAL SKILLS',
      'Programming: Python, SQL',
      'Data & ML: Pandas',
    ].join('\n');
    const letter = 'Sam Example\nhttps://linkedin.com/in/maxokafor\nlinkedin.com/in/maxokafor/\n\nDear Hiring Team,\n\nI built solutions of financial services.';
    const { cv: outCv, letter: outLetter } = polishTailoredDocuments(cv, letter, PROFILE);
    expect(outCv).toContain('Closed all but three gaps in reporting with Kafka.');
    expect(outCv).toContain('Data & ML: Pandas, Kafka');
    expect(outCv.split('\n')[1]).toBe('Data Engineer');
    expect(outLetter.match(/linkedin\.com\/in\/maxokafor/g)!.length).toBe(1);
    expect(outLetter).toContain('solutions for financial services');
  });
  it('uses no em or en dashes in its output', () => {
    const { cv, letter } = polishTailoredDocuments('Sam Example\nData Engineer', 'Dear Hiring Team,', PROFILE);
    expect(cv).not.toMatch(/[—–]/);
    expect(letter).not.toMatch(/[—–]/);
  });
});
