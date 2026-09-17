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
  it('drops a restating sentence but keeps the paragraph that also has an original one', () => {
    const letter = [
      'Dear Hiring Team,',
      'Your platform team owns two roadmaps at once; the same tradeoff decisions are what I would take on here. I architected a UK retail client\'s migration to AWS microservices and delivered all 47 services in 11 months.',
    ].join('\n\n');
    // Short fixture: the floor is set aside so the removal rule itself is what is measured.
    const out = enforceCoverLetterOriginality(letter, BULLETS, { minBodyWords: 0 });
    expect(out.text).not.toContain('47 services');
    expect(out.removedSentences.length).toBe(1);
    expect(out.text).toContain('two roadmaps');
    expect(out.emptiedParagraphs).toEqual([]);
  });

  // A letter reached a real employer at 85 words of body, opening "Additionally,
  // I mentored two junior engineers" with nothing in front of it.
  it('thins a wholly restating paragraph instead of deleting it, and reports it', () => {
    const letter = [
      'Dear Hiring Team,',
      'I architected a UK retail client\'s migration to AWS microservices and delivered all 47 services in 11 months. Automating triage with Python and Airflow cut the manual review queue by 40%.',
      'Additionally, I mentored two junior engineers through their first on-call rotation.',
    ].join('\n\n');
    const out = enforceCoverLetterOriginality(letter, BULLETS);
    const paragraphs = out.text.split('\n\n');
    expect(paragraphs.length).toBe(3);
    expect(paragraphs[1].trim().length).toBeGreaterThan(0);
    expect(out.emptiedParagraphs.length).toBe(1);
  });

  it('strips a connective opening the first body paragraph, and leaves later ones alone', () => {
    const letter = [
      'Dear Hiring Team,',
      'Additionally, two roadmaps served by one team is the constraint this role exists to remove.',
      'Furthermore, the same judgement applies to the incident work the posting describes.',
    ].join('\n\n');
    const out = enforceCoverLetterOriginality(letter, BULLETS);
    expect(out.text).toContain('Two roadmaps served by one team');
    expect(out.text).not.toContain('Additionally');
    expect(out.text).toContain('Furthermore, the same judgement');
  });

  it('keeps at most one past example in a paragraph', () => {
    const para =
      'Your despatch volumes need triage that holds. Automating triage with Python cut a review queue by 40%. Migrating services to AWS microservices delivered 47 of them.';
    const out = enforceCoverLetterOriginality(`Dear Team,\n\n${para}`, BULLETS, { minBodyWords: 0 });
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

// Thinning kept every paragraph in place but still let a letter come out as
// three sentences. Removal now stops at a 150-word body.
describe('removal stops at a 150-word body', () => {
  const LONG_BULLETS = [
    'Booked 42 qualified meetings a quarter by running outbound sequences across Outreach and HubSpot for mid-market accounts',
    'Grew pipeline coverage to 3.2x quota by rebuilding the territory list and qualifying inbound within one hour',
  ];

  it('keeps a short letter whole rather than cutting it to three sentences', () => {
    const letter = [
      'Dear Hiring Team,',
      'I booked 42 qualified meetings a quarter by running outbound sequences across Outreach and HubSpot for mid-market accounts. I grew pipeline coverage to 3.2x quota by rebuilding the territory list. Your team sells into mid-market operations buyers.',
      'Sincerely,\nMax Okafor',
    ].join('\n\n');
    const out = enforceCoverLetterOriginality(letter, LONG_BULLETS);
    expect(out.text).toContain('42 qualified meetings');
    expect(out.removedSentences.length).toBe(0);
    expect(out.emptiedParagraphs.length).toBeGreaterThan(0);
  });

  it('still removes a restatement when the letter is long enough to lose it', () => {
    const filler = Array.from({ length: 16 }, (_, i) =>
      `Your outbound motion depends on judgement about which accounts deserve a second touch and which do not, and that is the argument in its ${i + 1} form.`,
    ).join(' ');
    const letter = [
      'Dear Hiring Team,',
      `${filler} I booked 42 qualified meetings a quarter by running outbound sequences across Outreach and HubSpot for mid-market accounts.`,
      'Sincerely,\nMax Okafor',
    ].join('\n\n');
    const out = enforceCoverLetterOriginality(letter, LONG_BULLETS);
    expect(out.text).not.toContain('42 qualified meetings');
  });

  it('honours an explicit floor of zero for callers that want raw removal', () => {
    const letter = 'Dear Team,\n\nI booked 42 qualified meetings a quarter by running outbound sequences across Outreach and HubSpot.';
    const out = enforceCoverLetterOriginality(letter, LONG_BULLETS, { minBodyWords: 0 });
    expect(out.removedSentences.length).toBe(0);
  });
});
