import { describe, expect, it } from 'bun:test';
import { applyReviewEdits, runReview } from '../supabase/functions/tailor-application/review';
import { stripDashes } from '../supabase/functions/tailor-application/guards';

const profileText = 'Accenture. Software Engineer. Deployed services on Kubernetes, cutting release time by 30%. Led a team of 5.';
const ctx = { profileText, protectedTerms: ['Kubernetes'] };
const cv = 'PROFESSIONAL EXPERIENCE\n- Deployed services on Kubernetes, cutting release time by 30%.\n- Led a team of 5 engineers.\n- Led a team of 5 engineers.';
const docs = { cv, letter: 'Dear Hiring Manager,\nI worked at Accenture.' };

describe('hiring-manager review edits', () => {
  it('rejects old text that is not in the draft', () => {
    const r = applyReviewEdits(docs, [{ doc: 'cv', old: 'Built a rocket', new: 'Built a boat', reason: 'style' }], ctx);
    expect(r.review.applied).toBe(0);
    expect(r.review.rejected[0].reason).toBe('old text not found');
  });

  it('rejects old text that matches twice', () => {
    const r = applyReviewEdits(docs, [{ doc: 'cv', old: 'Led a team of 5 engineers.', new: 'Led 5 engineers.', reason: 'style' }], ctx);
    expect(r.review.rejected[0].reason).toBe('old text occurs more than once');
  });

  it('rejects an added number not in the profile', () => {
    const r = applyReviewEdits(docs, [{ doc: 'cv', old: 'cutting release time by 30%.', new: 'cutting release time by 30% and costs by 40%.', reason: 'angle' }], ctx);
    expect(r.review.rejected[0].reason).toContain('40');
    expect(r.cv).toBe(cv);
  });

  it('rejects an added employer not in the profile', () => {
    const r = applyReviewEdits(docs, [{ doc: 'letter', old: 'I worked at Accenture.', new: 'I worked at Accenture and Google.', reason: 'angle' }], ctx);
    expect(r.review.rejected[0].reason).toContain('Google');
  });

  it('rejects an edit that removes a required term', () => {
    const r = applyReviewEdits(docs, [{ doc: 'cv', old: 'Deployed services on Kubernetes,', new: 'Deployed services,', reason: 'style' }], ctx);
    expect(r.review.rejected[0].reason).toContain('Kubernetes');
  });

  it('applies a valid style edit and still strips dashes afterwards', async () => {
    const out = await runReview(
      async () => JSON.stringify({ edits: [{ doc: 'letter', old: 'I worked at Accenture.', new: 'I worked at Accenture \u2014 as a Software Engineer.', reason: 'style' }], gaps: ['Go'] }),
      docs, ctx, (_d, t) => stripDashes(t),
    );
    expect(out.review?.applied).toBe(1);
    expect(out.letter).toContain('Software Engineer');
    expect(out.letter).not.toMatch(/[\u2013\u2014]/);
    expect(out.review?.gaps).toEqual(['Go']);
  });

  it('returns the documents unchanged when the review call fails', async () => {
    const out = await runReview(async () => { throw new Error('boom'); }, docs, ctx, () => 'CHANGED');
    expect(out.review).toBeNull();
    expect(out.cv).toBe(docs.cv);
    expect(out.letter).toBe(docs.letter);
  });
});
