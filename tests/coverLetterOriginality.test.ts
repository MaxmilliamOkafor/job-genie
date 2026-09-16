import { describe, expect, it } from 'bun:test';
import {
  chooseHeadline,
  contentWords,
  enforceCoverLetterOriginality,
  isEmployerNameLine,
  overlapRatio,
} from '../supabase/functions/_shared/coverLetter.ts';

const BULLETS = [
  '- Architected a UK retail client\'s migration to AWS microservices, delivering all 47 services in 11 months',
  '- Cut the manual review queue by 40% by automating triage with Python and Airflow',
];

describe('the letter never restates a CV bullet', () => {
  it('drops a paragraph sentence that re-tells the bullet', () => {
    const letter = [
      'Dear Hiring Team,',
      'I architected a UK retail client\'s migration to AWS microservices and delivered all 47 services in 11 months.',
      'Your platform team owns two roadmaps at once; the same tradeoff decisions are what I would take on here.',
    ].join('\n\n');
    const out = enforceCoverLetterOriginality(letter, BULLETS);
    expect(out.text).not.toContain('47 services');
    expect(out.removedSentences.length).toBe(1);
    expect(out.text).toContain('two roadmaps');
  });

  it('keeps at most one past example in a paragraph', () => {
    const para =
      'Your despatch volumes need triage that holds. Automating triage with Python cut a review queue by 40%. Migrating services to AWS microservices delivered 47 of them.';
    const out = enforceCoverLetterOriginality(`Dear Team,\n\n${para}`, BULLETS);
    const sentences = out.text.split(/(?<=\.)\s+/).filter((s) => /\w/.test(s));
    const examples = sentences.filter((s) => /40%|47/.test(s));
    expect(examples.length).toBeLessThanOrEqual(1);
  });

  it('leaves an employer-problem paragraph with no CV wording untouched', () => {
    const para = 'Two roadmaps served by one team is the constraint this role exists to remove, and the judgement it needs is on tradeoffs rather than throughput.';
    const out = enforceCoverLetterOriginality(`Dear Team,\n\n${para}`, BULLETS);
    expect(out.text).toContain(para);
    expect(out.removedSentences.length).toBe(0);
  });

  it('never touches the salutation, signature or contact block', () => {
    const letter = 'Dear Hiring Team,\n\nYour team ships weekly.\n\nSincerely,\nMax Okafor\n\nmax@example.com | +44 7000';
    const out = enforceCoverLetterOriginality(letter, BULLETS);
    expect(out.text).toContain('Dear Hiring Team,');
    expect(out.text).toContain('max@example.com');
  });

  it('keeps a decimal figure intact', () => {
    const letter = 'Dear Team,\n\nYour market moved £2.6bn last year and that is the scale this role serves.';
    expect(enforceCoverLetterOriginality(letter, BULLETS).text).toContain('£2.6bn');
  });

  it('reports the measured overlap it left behind', () => {
    const out = enforceCoverLetterOriginality('Dear Team,\n\nYour roadmap needs owning.', BULLETS);
    expect(out.maxSentenceOverlap).toBeLessThan(0.45);
    expect(out.paragraphOverlaps.every((p) => p < 0.45)).toBe(true);
  });

  it('measures overlap on content words only', () => {
    expect(contentWords('the a of and')).toEqual([]);
    expect(overlapRatio('Airflow triage automation', BULLETS[1])).toBeGreaterThan(0.5);
    expect(overlapRatio('warehouse despatch scheduling', BULLETS[1])).toBeLessThan(0.2);
  });
});

describe('the line under the name is a job title, never the company', () => {
  it('uses the posting title when there is one', () => {
    expect(chooseHeadline({ targetTitle: 'Platform Engineer', company: 'Mercury', currentTitle: 'Senior Developer' }).headline)
      .toBe('Platform Engineer');
  });

  it('falls back to the held title when the title IS the company name', () => {
    const out = chooseHeadline({ targetTitle: 'Mercury', company: 'Mercury', currentTitle: 'Senior Developer' });
    expect(out.headline).toBe('Senior Developer');
    expect(out.usedFallback).toBe(true);
  });

  it('falls back when no title is supplied', () => {
    const out = chooseHeadline({ targetTitle: '', company: 'Anthropic', heldTitles: ['Data Engineer'] });
    expect(out.headline).toBe('Data Engineer');
    expect(out.usedFallback).toBe(true);
  });

  it('keeps a title that merely contains the company name', () => {
    expect(chooseHeadline({ targetTitle: 'Mercury Platform Engineer', company: 'Mercury' }).headline)
      .toBe('Mercury Platform Engineer');
  });

  it('recognises an employer-name line', () => {
    expect(isEmployerNameLine('Mercury', 'Mercury')).toBe(true);
    expect(isEmployerNameLine('Platform Engineer', 'Mercury')).toBe(false);
  });
});
