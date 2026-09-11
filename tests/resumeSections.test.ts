import { describe, expect, it } from 'bun:test';
import { enforceEducationSection } from '../supabase/functions/_shared/resumeSections.ts';

const EDUCATION = [
  {
    degree: 'MSc Artificial Intelligence and Machine Learning',
    institution: 'Imperial College London',
    start_year: 'August 2020',
    end_year: 'June 2021',
  },
  {
    degree: 'Bachelor of Science in Computer Science',
    institution: 'University of Derby',
    start_year: 'August 2016',
    end_year: 'July 2020',
  },
];

describe('education section enforcement', () => {
  it('restores a missing section without printing study dates', () => {
    const result = enforceEducationSection('NAME\n\nPROFESSIONAL EXPERIENCE\nRole', EDUCATION);
    expect(result.restored).toBe(true);
    expect(result.text).toContain('EDUCATION\nMSc Artificial Intelligence and Machine Learning\nImperial College London');
    expect(result.text).not.toContain('2020');
    expect(result.text).not.toContain('2021');
  });

  it('replaces model-written dated education while preserving employment dates elsewhere', () => {
    const resume = 'PROFESSIONAL EXPERIENCE\nRole\nJanuary 2023 - Present\n\nEDUCATION\nMSc AI\nImperial College London\n2020 - 2021';
    const result = enforceEducationSection(resume, EDUCATION);
    expect(result.restored).toBe(false);
    expect(result.text).toContain('January 2023 - Present');
    expect(result.text).not.toContain('2020 - 2021');
  });
});