import { describe, expect, it } from 'bun:test';
import { letterBody } from '../supabase/functions/tailor-application/letterSlots';

// "Your cover letter starts with 'I am writing to apply'. So does everyone
// else's." (6 Nov). The company's work, and why it matches yours, opens the
// letter; the story follows it.
const base = {
  name: 'Max Okafor', contact: '', greeting: 'Dear Hiring Team,', role: 'Senior Corporate Security Engineer', company: 'GitLab',
  results: ['At Meta, I resolved a production failure that had recurred monthly for over a year by leading the incident review.'],
  rightToWork: '', notice: '', signOff: 'Kind regards,', employers: ['Meta', 'Accenture'],
  story: 'Clients at Accenture waited weeks for a test environment. I wrote the Terraform modules that turned that into one pipeline run.',
};
describe('the letter opens with them', () => {
  it('a company fact and its link to your work come first, then the role', () => {
    const body = letterBody({ ...base, companyFact: 'GitLab runs its own corporate security across thousands of remote laptops.', why: 'Keeping a large fleet secure and audit-ready is the work I did at Accenture.' });
    expect(body[0].startsWith('GitLab runs its own corporate security')).toBe(true);
    expect(body[0]).toContain('That is why I am applying for the Senior Corporate Security Engineer role at GitLab.');
    expect(body[0].startsWith('I am applying')).toBe(false);
    expect(body[1].startsWith('Clients at Accenture waited weeks')).toBe(true);
  });
  it('with no company fact, the story still comes first', () => {
    const body = letterBody(base);
    expect(body[0].startsWith('Clients at Accenture waited weeks')).toBe(true);
  });
});
