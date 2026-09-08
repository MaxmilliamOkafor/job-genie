import { describe, expect, it } from 'bun:test';
import {
  areOpposites,
  buildMemoryPayload,
  confirmationGate,
  matchAnswer,
  mergeAnswers,
  normaliseQuestion,
  selectionCommitted,
  type ScreeningAnswer,
} from '../src/lib/screeningAnswers';

const NOW = new Date('2026-09-08T00:00:00Z');
const fresh = (over: Partial<ScreeningAnswer> = {}): ScreeningAnswer => ({
  question: 'Are you legally authorised to work in Ireland?',
  answer: 'Yes',
  scope: 'Ireland',
  confirmed_at: '2026-09-01T00:00:00Z',
  ...over,
});

describe('normalisation', () => {
  it('ignores punctuation, case and the required marker', () => {
    expect(normaliseQuestion('  Do you need SPONSORSHIP? *required')).toBe('do you need sponsorship');
  });
});

describe('exact reuse', () => {
  it('reuses an exact question inside scope', () => {
    const r = matchAnswer('Are you legally authorised to work in Ireland?', [fresh()], {
      scope: 'Ireland',
      now: NOW,
    });
    expect(r.kind).toBe('exact');
    expect(r.needsConfirmation).toBe(false);
  });

  it('does not reuse outside scope', () => {
    const r = matchAnswer('Are you legally authorised to work in Ireland?', [fresh()], {
      scope: 'United States',
      now: NOW,
    });
    expect(r.kind).toBe('none');
  });

  it('leaves an unknown question unanswered', () => {
    expect(matchAnswer('Do you hold a forklift licence?', [fresh()], { now: NOW }).kind).toBe('none');
  });
});

describe('opposite questions', () => {
  it('treats sponsorship polarity pairs as different questions', () => {
    expect(areOpposites('Do you need sponsorship?', 'Can you work without sponsorship?')).toBe(true);
    const saved = [fresh({ question: 'Do you now or in the future require sponsorship?', answer: 'No', scope: '' })];
    const r = matchAnswer('Can you work without requiring sponsorship?', saved, { now: NOW });
    expect(r.kind).not.toBe('exact');
    expect(r.answer).toBeUndefined();
  });
});

describe('suggestions', () => {
  it('suggests a reworded question and asks for confirmation', () => {
    const saved = [fresh({ question: 'How many years of Python experience do you have?', answer: '5' })];
    const r = matchAnswer('Years of Python experience?', saved, { scope: 'Ireland', now: NOW });
    expect(r.kind).toBe('suggestion');
    expect(r.needsConfirmation).toBe(true);
  });
});

describe('fresh confirmation rules', () => {
  it('always re-asks consent and legal declarations', () => {
    expect(confirmationGate(fresh({ question: 'I certify that the information given is accurate and complete' }), NOW)).toBeTruthy();
    expect(confirmationGate(fresh({ question: 'Do you consent to a background check?' }), NOW)).toBeTruthy();
  });

  it('re-asks time-sensitive answers once they age out', () => {
    const stale = fresh({ question: 'What is your notice period?', confirmed_at: '2025-01-01T00:00:00Z' });
    expect(confirmationGate(stale, NOW)).toContain('Notice period');
  });

  it('re-asks when the candidate flagged changed circumstances', () => {
    expect(confirmationGate(fresh({ review_after: '2026-01-01T00:00:00Z' }), NOW)).toBeTruthy();
  });
});

describe('sync payload', () => {
  it('excludes answers that need fresh confirmation', () => {
    const p = buildMemoryPayload(
      [fresh(), fresh({ question: 'Do you consent to a background check?', answer: 'Yes' })],
      NOW
    );
    expect(Object.keys(p.application_answers)).toHaveLength(1);
    expect(p.screening_answers).toHaveLength(2);
    expect(p.always_confirm_questions).toContain('Do you consent to a background check?');
  });
});

describe('merge', () => {
  it('keeps existing entries and prefers the newer confirmation', () => {
    const merged = mergeAnswers([fresh({ answer: 'No' })], [fresh({ answer: 'Yes', confirmed_at: '2026-09-05T00:00:00Z' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].answer).toBe('Yes');
  });

  it('never drops an unrelated entry', () => {
    const merged = mergeAnswers([fresh()], [fresh({ question: 'Do you hold a driving licence?', answer: 'Yes' })]);
    expect(merged).toHaveLength(2);
  });
});

describe('selection verification', () => {
  it('fails when the form did not commit the value', () => {
    expect(selectionCommitted(['Yes'], [''])).toBe(false);
    expect(selectionCommitted(['Yes', 'No'], ['No', 'Yes'])).toBe(true);
  });
});
