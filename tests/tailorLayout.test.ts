import { describe, expect, it } from 'bun:test';
import {
  acceptRewrite, applyLetterDate, bulletLengthOk, chooseHeldHeadline, findBadBullets, formatLetterDate, formatSkillsSection,
} from '../supabase/functions/tailor-application/guards';

const one = 'Cut month-end close from nine days to three by moving reconciliations into Python and SQL jobs.'; // 95
const long = 'Cut month-end close from nine days to three by moving reconciliations into Python and SQL jobs, and then rolled the same approach out to two other teams.'; // ~150

describe('bullet length', () => {
  it('accepts 85-105 and 175-210 only', () => {
    expect(bulletLengthOk(85)).toBe(true); expect(bulletLengthOk(105)).toBe(true);
    expect(bulletLengthOk(106)).toBe(false); expect(bulletLengthOk(174)).toBe(false);
    expect(bulletLengthOk(175)).toBe(true); expect(bulletLengthOk(210)).toBe(true); expect(bulletLengthOk(211)).toBe(false);
  });
  it('finds only out-of-range experience bullets', () => {
    const cv = `PROFESSIONAL EXPERIENCE\nEngineer | Acme | 2020 - 2023\n• ${one}\n• ${long}\n\nTECHNICAL SKILLS\nPython`;
    const bad = findBadBullets(cv);
    expect(one.length).toBeGreaterThanOrEqual(85);
    expect(bad.length).toBe(1);
    expect(bad[0].text).toBe(long);
  });
  it('rejects a rewrite that loses a number or keyword', () => {
    expect(acceptRewrite(long, one, ['Python', 'SQL'])).toBe(true);
    expect(acceptRewrite(long, one.replace('Python and ', ''), ['Python'])).toBe(false);
    expect(acceptRewrite('Cut costs 30% using Python across teams', one, [])).toBe(false);
  });
});

describe('headline', () => {
  it('uses the target when held or one level below', () => {
    expect(chooseHeldHeadline('Senior Software Engineer', ['Software Engineer'], 'Software Engineer', 'AI')).toBe('Senior Software Engineer');
  });
  it('falls back for unheld executive titles', () => {
    expect(chooseHeldHeadline('VP of Engineering', ['Software Engineer'], 'Software Engineer', 'AI and Data Platforms'))
      .toBe('Software Engineer | AI and Data Platforms');
    expect(chooseHeldHeadline('Head of Data', ['Data Engineer'], 'Data Engineer', '')).toBe('Data Engineer');
  });
});

describe('skills format', () => {
  it('outputs labelled lines in order and drops non-skills', () => {
    const cv = 'TECHNICAL SKILLS\nTools: Docker, Python, React, KYC, Irish citizen, Industrial Designers\nLanguages & Citizenship: English (fluent), French\nSoft: Stakeholder Management\n\nEDUCATION\nBSc';
    const { text, dropped } = formatSkillsSection(cv);
    expect(text).toContain('Programming: Python\nFrameworks: React\nCloud & DevOps: Docker\nRisk & Compliance: KYC\nProfessional: Stakeholder Management\nLanguages: English (fluent), French');
    expect(dropped).toEqual(['Irish citizen', 'Industrial Designers']);
    expect(text).toContain('\nEDUCATION');
  });
});

describe('letter date', () => {
  const d = new Date(Date.UTC(2026, 9, 5));
  it('formats by country', () => {
    expect(formatLetterDate(d, false)).toBe('5 October 2026');
    expect(applyLetterDate('Date: 01/02/2026\nDear Hiring Team,\nBody', 'Austin, TX', d)).toBe('October 5, 2026\n\nDear Hiring Team,\nBody');
  });
});
