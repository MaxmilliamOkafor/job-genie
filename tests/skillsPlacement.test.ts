import { describe, expect, it } from 'bun:test';
import {
  categoriseSkill,
  isSoftCapability,
  placeSkillsInSection,
} from '../supabase/functions/_shared/skillsPlacement.ts';

const DRAFT = `MAXMILLIAM OKAFOR
Data Analyst
Dublin, Ireland | maxokafordev@gmail.com

PROFESSIONAL SUMMARY
Data analyst delivering reporting and reconciliation across regulated portfolios.

PROFESSIONAL EXPERIENCE
Citigroup
Data Analyst
January 2023 - Present
- Built reconciliation reporting in SQL and Python for three regulated portfolios

TECHNICAL SKILLS
Languages & Citizenship: English (native), French (native) - EU Citizen
Programming: Python, SQL
Data & Analytics: Power BI, ETL
Cloud & DevOps: Docker

PROJECTS
LedgerLens

EDUCATION
BSc Computer Science
`;

describe('category routing', () => {
  it('routes each term to its intended group', () => {
    expect(categoriseSkill('Java')).toBe('programming');
    expect(categoriseSkill('dbt')).toBe('data');
    expect(categoriseSkill('Terraform')).toBe('cloud');
    expect(categoriseSkill('ServiceNow')).toBe('tools');
    expect(categoriseSkill('Visio')).toBe('tools');
    expect(categoriseSkill('Jira')).toBe('tools');
    expect(categoriseSkill('UAT')).toBe('methods');
    expect(categoriseSkill('Process Design')).toBe('methods');
    expect(categoriseSkill('Scrum')).toBe('methods');
  });

  it('keeps capabilities out of the skills list', () => {
    expect(isSoftCapability('Communication')).toBe(true);
    expect(isSoftCapability('Mentorship')).toBe(true);
    expect(isSoftCapability('Kubernetes')).toBe(false);
  });
});

describe('placement into an existing grouped section', () => {
  const terms = ['Java', 'dbt', 'Terraform', 'Jira', 'ServiceNow', 'UAT', 'Agile', 'Communication', 'Python'];
  const first = placeSkillsInSection(DRAFT, terms);

  it('adds recorded items to the equivalent existing labels', () => {
    expect(first.text).toContain('Programming: Python, SQL, Java');
    expect(first.text).toContain('Data & Analytics: Power BI, ETL, dbt');
    expect(first.text).toContain('Cloud & DevOps: Docker, Terraform');
  });

  it('creates one labelled line when no group fits', () => {
    expect(first.text).toContain('Tools & Platforms: Jira, ServiceNow');
    expect(first.text).toContain('Methods & Delivery: UAT, Agile');
    expect(first.text.match(/Tools & Platforms:/g)!.length).toBe(1);
  });

  it('skips duplicates and capabilities', () => {
    const reasons = Object.fromEntries(first.skipped.map((s) => [s.term, s.reason]));
    expect(reasons['Python']).toBe('duplicate');
    expect(reasons['Communication']).toBe('soft capability');
  });

  it('preserves the citizenship line and every other section', () => {
    expect(first.text).toContain('Languages & Citizenship: English (native), French (native) - EU Citizen');
    for (const heading of ['PROFESSIONAL SUMMARY', 'PROFESSIONAL EXPERIENCE', 'TECHNICAL SKILLS', 'PROJECTS', 'EDUCATION']) {
      expect(first.text.match(new RegExp(heading, 'g'))!.length).toBe(1);
    }
    expect(first.text).toContain('January 2023 - Present');
    expect(first.text).toContain('BSc Computer Science');
  });

  it('is idempotent: a second run adds nothing', () => {
    const second = placeSkillsInSection(first.text, terms);
    expect(second.added).toHaveLength(0);
    expect(second.text).toBe(first.text);
  });

  it('reuses the candidate\'s own equivalent label rather than adding a new one', () => {
    const own = DRAFT.replace('Programming:', 'Languages & Frameworks:');
    const r = placeSkillsInSection(own, ['Java']);
    expect(r.text).toContain('Languages & Frameworks: Python, SQL, Java');
    expect(r.text).not.toContain('Programming: Java');
  });

  it('builds a grouped section when the CV has none', () => {
    const noSkills = DRAFT.replace(/TECHNICAL SKILLS[\s\S]*?\n\nPROJECTS/, 'PROJECTS');
    const r = placeSkillsInSection(noSkills, ['Java']);
    expect(r.skipped[0].reason).toBe('no skills section');
  });
});
