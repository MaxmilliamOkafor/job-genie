import { describe, expect, it } from 'bun:test';
import {
  buildRequirementList,
  collapseRequirements,
  isFurniture,
} from '../supabase/functions/_shared/evidence.ts';

describe('benefits, logistics and boilerplate are not requirements', () => {
  it('drops what a candidate cannot evidence', () => {
    for (const term of ['competitive salary', '401k', 'dental', 'vision', 'paid time off', 'PTO', 'health insurance', 'stock options', 'bonus', 'full-time', 'hybrid', 'equal opportunity', 'fast-paced', 'apply now', 'submit resume']) {
      expect(isFurniture(term)).toBe(true);
    }
  });

  it('keeps real technical and management requirements', () => {
    for (const term of ['reliability', 'availability', 'automation', 'scalability', 'observability', 'collaboration', 'stakeholder management']) {
      expect(isFurniture(term)).toBe(false);
    }
  });
});

describe('one entry per requirement, not one per phrasing', () => {
  it('collapses qualifier and phrasing variants onto the canonical form', () => {
    const { terms } = collapseRequirements(['payroll', 'global payroll', 'payroll management']);
    expect(terms).toEqual(['payroll']);
    expect(collapseRequirements(['Linux systems', 'Linux']).terms).toEqual(['Linux']);
    expect(collapseRequirements(['AI', 'AI building']).terms).toEqual(['AI']);
    expect(collapseRequirements(['performance management', 'feedback', 'team performance']).terms.length).toBe(1);
  });

  it('never merges requirements that mean different things', () => {
    const { terms } = collapseRequirements(['reliability', 'availability', 'observability', 'project management', 'performance management']);
    expect(terms.length).toBe(5);
  });

  it('returns a denominator in the honest range for a typical posting', () => {
    const raw = ['payroll', 'global payroll', 'payroll management', 'Linux systems', 'Linux', 'AI', 'AI building', 'performance management', 'feedback', 'team performance', 'competitive salary', '401k', 'dental', 'PTO', 'reliability', 'availability', 'automation', 'scalability', 'observability', 'collaboration', 'stakeholder management', 'stakeholder engagement', 'SQL', 'Power BI', 'fast-paced', 'apply now'];
    const { terms } = buildRequirementList(raw, ['Meta'], 'Manager, Payroll Operations');
    expect(terms.length).toBeGreaterThanOrEqual(10);
    expect(terms.length).toBeLessThanOrEqual(20);
    expect(terms).toContain('payroll');
    expect(terms).not.toContain('dental');
  });
});
