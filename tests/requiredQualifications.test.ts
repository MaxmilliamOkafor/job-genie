import { describe, expect, it } from 'bun:test';
import { compareRevisionGaps, requiredQualifications } from '../supabase/functions/_shared/coverage.ts';
import { categoriseSkill, placeSkillsInSection } from '../supabase/functions/_shared/skillsPlacement.ts';

describe('required qualification priority', () => {
  it('puts required terms first before existing requirement-text and alphabetical priority', () => {
    const sorted = ['Azure', 'Python', 'Docker', 'Go'].map((term) => ({ term }))
      .sort((a, b) => compareRevisionGaps(a, b, ['python'], 'azure docker'));
    expect(sorted.map((g) => g.term)).toEqual(['Python', 'Azure', 'Docker', 'Go']);
  });
  it('matches whole terms, not JavaScript for Java', () => {
    const sorted = ['JavaScript', 'Python', 'Java'].map((term) => ({ term }))
      .sort((a, b) => compareRevisionGaps(a, b, ['Java'], 'python'));
    expect(sorted.map((g) => g.term)).toEqual(['Java', 'Python', 'JavaScript']);
  });
  it('reports shown, skills-only and absent terms from the final CV', () => {
    const report = requiredQualifications('PROFESSIONAL EXPERIENCE\nAcme\n- Built reporting with Python.\nTECHNICAL SKILLS\nCloud: Kubernetes', ['Python', 'Kubernetes', 'Go']);
    expect(report).toEqual({ total: 3, shown: 1, listedOnly: 1, absent: 1, label: 'Required by the ad: 1 of 3 shown in your work history (Workday grades on these).' });
  });
  for (const heading of ['EXPERIENCE', 'WORK EXPERIENCE', 'EMPLOYMENT HISTORY']) {
    it(`counts soft and hard terms equally under ${heading}`, () => {
      expect(requiredQualifications(`${heading}\n- Communication through Python reporting.\nSKILLS\nKubernetes`, ['Communication', 'python', 'PYTHON', 'Kubernetes']).shown).toBe(2);
    });
  }
});

describe('Professional skills placement', () => {
  it('places Communication on Professional and Docker on Cloud with no soft-capability skip', () => {
    const result = placeSkillsInSection('TECHNICAL SKILLS\nProgramming: Python\n\nEDUCATION\nBSc', ['Communication', 'Docker']);
    expect(result.text).toContain('Professional: Communication');
    expect(result.text).toContain('Cloud & DevOps: Docker');
    expect(result.skipped.filter((s) => s.reason === 'soft capability')).toHaveLength(0);
    expect(categoriseSkill('Communication')).toBe('professional');
  });
});