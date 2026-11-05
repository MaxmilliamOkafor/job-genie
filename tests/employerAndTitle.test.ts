import { describe, expect, it } from 'bun:test';
import { employerAndTitle, profileBullets } from '../supabase/functions/tailor-application/letterSlots';

// "At Software Engineer, I cut response times..." (Naphora letter, 5 Nov):
// a saved role with its company and title the wrong way round.
describe('a saved role is read the right way round', () => {
  it('swaps a job title saved as the company', () => {
    expect(employerAndTitle({ company: 'Software Engineer', title: 'Meta' })).toEqual({ company: 'Meta', title: 'Software Engineer' });
    expect(employerAndTitle({ company: 'AI Product Manager', title: 'SolimHealth' })).toEqual({ company: 'SolimHealth', title: 'AI Product Manager' });
  });
  it('leaves a correct role alone, and two titles alone', () => {
    expect(employerAndTitle({ company: 'Meta', title: 'Software Engineer' })).toEqual({ company: 'Meta', title: 'Software Engineer' });
    expect(employerAndTitle({ company: 'Lead Engineer', title: 'Staff Engineer' })).toEqual({ company: 'Lead Engineer', title: 'Staff Engineer' });
  });
  it('the letter lines carry the employer', () => {
    const b = profileBullets([{ company: 'Software Engineer', title: 'Meta', bullets: ['Cut response times on backend services by running calls in parallel.'] }]);
    expect(b[0].company).toBe('Meta');
  });
});
