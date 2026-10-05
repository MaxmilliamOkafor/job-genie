import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  acceptRewrite, applyLetterDate, bulletLengthOk, bulletTarget, acceptLetterRewording, copiesBullet, dropClaimSentences, findCopiedSentences, findBadBullets, shapeCoverLetter, formatLetterDate, formatSkillsSection,
} from '../supabase/functions/tailor-application/guards';

const one = 'Cut month-end close from nine days to three by moving reconciliations into Python and SQL jobs.'; // 95
const long = 'Cut month-end close from nine days to three by moving reconciliations into Python and SQL jobs, and then rolled the same approach out to two other teams.'; // ~150

describe('bullet length', () => {
  it('accepts 85-105 and 175-210 only', () => {
    expect(bulletLengthOk(59)).toBe(false); expect(bulletLengthOk(60)).toBe(true); expect(bulletLengthOk(85)).toBe(true); expect(bulletLengthOk(105)).toBe(true);
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
    expect(bulletTarget(140)).toBe('one line, 85 to 105 characters');
    expect(bulletTarget(174)).toBe('one line, 85 to 105 characters');
    expect(bulletTarget(211)).toBe('two lines, 175 to 210 characters');
    expect(acceptRewrite('Cut costs 30% using Python across teams', one, [])).toBe(false);
  });
});

describe('headline', () => {
  it('never writes a headline line into the CV text', () => {
    const src = readFileSync('supabase/functions/tailor-application/index.ts', 'utf8');
    expect(src).not.toContain('chooseHeldHeadline(');
    expect(src).not.toContain('enforceTargetRoleLine(result.tailoredResume)');
  });
});

describe('bullet rewrite adds nothing', () => {
  it('rejects longer rewrites and new content words', () => {
    expect(acceptRewrite(long, one + ' enhancing overall system efficiency.'.slice(0, 5), ['Python'])).toBe(false);
    expect(acceptRewrite(long, 'Cut month-end close from nine days to three with Python and SQL jobs, enhancing user experience.', ['Python', 'SQL'])).toBe(false);
    expect(acceptRewrite(long, 'Cut month-end close from nine working days to three with Python and SQL jobs.', ['Python', 'SQL'])).toBe(false);
    expect(acceptRewrite(long, 'Cut month-end close from nine days to three by moving reconciliations into Python and SQL jobs.', ['Python', 'SQL'])).toBe(true);
  });
});

describe('claim removal', () => {
  it('drops the whole sentence, never only the words', () => {
    const { text, removed } = dropClaimSentences('Dear Hiring Team,\nAt Acme I built a Figma library where I implemented Figma to refine user experiences. I cut costs by 20%.', ['Figma']);
    expect(text).toBe('Dear Hiring Team,\nI cut costs by 20%.');
    expect(removed.length).toBe(1);
    expect(text).not.toContain('implemented to');
  });
});

describe('cover letter shape', () => {
  const bullet = 'Cut month-end close from nine days to three by moving reconciliations into Python and SQL jobs';
  it('three body paragraphs, no Also, copied bullet kept when not reworded, header kept', () => {
    const letter = 'Dear Hiring Team,\n\nAcme needs faster reporting.\n\nAlso, I know SQL well.\n\n' + bullet + '. Your team grows fast.\n\nI can start in a month.\n\nKind regards,\nJane Doe';
    const { text } = shapeCoverLetter(letter, [bullet], { name: 'Jane Doe', contact: 'Dublin | +353 1 | jane@x.com' });
    const paras = text.split('\n\n');
    expect(paras[0]).toBe('Jane Doe\nDublin | +353 1 | jane@x.com');
    expect(paras[1]).toBe('Dear Hiring Team,');
    expect(paras.length).toBe(6);
    expect(paras[3]).toBe('I know SQL well. ' + bullet + '. Your team grows fast.');
    expect(paras[4]).toBe('I can start in a month.');
    expect(text).toContain(bullet);
    expect(copiesBullet(bullet + '.', [bullet])).toBe(true);
    expect(text.split('\n\n').some((p) => /^Also,/.test(p))).toBe(false);
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
  it('keeps team and stakeholder keywords; governance and protection are Risk & Compliance', () => {
    const { text, dropped } = formatSkillsSection('TECHNICAL SKILLS\nCross-functional Teams, Stakeholders, Data Governance, Data Protection, Pandas, Software Engineers');
    expect(dropped).toEqual(['Software Engineers']);
    expect(text).toContain('Data & ML: Pandas\nRisk & Compliance: Data Governance, Data Protection\nProfessional: Cross-functional Teams, Stakeholders');
  });
});

describe('copied bullets are reworded, never deleted', () => {
  const b1 = 'Led ISO 27001 certification at Accenture across 4 delivery centres, closing 120 audit findings in 6 months';
  const b2 = 'Delivered a £3.2m cost reduction at Accenture by consolidating 14 legacy reporting tools into Power BI';
  const cv = `PROFESSIONAL EXPERIENCE\n• ${b1}\n• ${b2}`;
  const letter = `Dear Hiring Team,\n\nAcme needs an engineer who can secure its platform.\n\n${b1}. ${b2}.\n\nI am available to talk at your convenience.\n\nKind regards,\nJane Doe`;
  it('keeps the ISO 27001 and £3.2m sentences, reworded or as they were', () => {
    const copied = findCopiedSentences(letter, [b1, b2]);
    expect(copied.length).toBe(2);
    const good = 'At Accenture I led ISO 27001 certification across 4 delivery centres, closing 120 audit findings in 6 months.';
    const bad = 'At Accenture I led ISO 27001 certification, transforming security culture.';
    expect(acceptLetterRewording(copied[0], good, cv)).toBe(true);
    expect(acceptLetterRewording(copied[0], bad, cv)).toBe(false);
    const rew = { [copied[0]]: good };
    const { text } = shapeCoverLetter(letter, [b1, b2], { name: 'Jane Doe', contact: '' }, rew);
    expect(text).toContain('ISO 27001');
    expect(text).toContain('£3.2m');
    expect(text).toContain(good);
    expect(text).toContain(b2);
    const plain = shapeCoverLetter(letter, [b1, b2], { name: 'Jane Doe', contact: '' }).text;
    expect(plain).toContain(b1);
    expect(plain).toContain(b2);
    expect(plain.split('\n\n').every((p) => p.trim())).toBe(true);
  });
});

describe('letter date', () => {
  const d = new Date(Date.UTC(2026, 9, 5));
  it('formats by country', () => {
    expect(formatLetterDate(d, false)).toBe('5 October 2026');
    expect(applyLetterDate('Date: 01/02/2026\nDear Hiring Team,\nBody', 'Austin, TX', d)).toBe('October 5, 2026\n\nDear Hiring Team,\nBody');
    expect(applyLetterDate('Re: Data Engineer\nDear Hiring Team,\nBody', 'Berlin, Germany', d)).toBe('5 October 2026\n\nRe: Data Engineer\nDear Hiring Team,\nBody');
  });
});
