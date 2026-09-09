import { describe, expect, it } from 'bun:test';
import { buildCandidateLocation, normaliseLocation } from '../supabase/functions/_shared/location';

describe('the candidate location prints once and prints cleanly', () => {
  it('collapses the repeated segments that produced "Dublin, Dublin, IE, Ireland, Ireland"', () => {
    expect(normaliseLocation('Dublin, Dublin, IE, Ireland, Ireland')).toBe('Dublin, Ireland');
  });

  it('drops a bare ISO code when the full country name is present', () => {
    expect(normaliseLocation('Dublin, IE, Ireland')).toBe('Dublin, Ireland');
  });

  it('keeps a short two-part location untouched', () => {
    expect(normaliseLocation('Dublin, IE')).toBe('Dublin, IE');
    expect(buildCandidateLocation('Dublin', 'Ireland')).toBe('Dublin, Ireland');
  });

  it('returns nothing when there is nothing saved, rather than inventing a city', () => {
    expect(normaliseLocation('')).toBe('');
    expect(buildCandidateLocation('', '')).toBe('');
  });
});
