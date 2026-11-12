import { describe, expect, it } from 'bun:test';
import {
  graftPast, hasGraftedAbility, languageTheAdAsks, needsFromTheAd, noForeignUsAuthorisation, noGraftedAbility,
  noHomeRelocation, noRepeatedOpeners, oneEntryPerLanguage, postingSays, skillsReadRight, strayGloss, unwrapPageTitle,
} from '../supabase/functions/_shared/postingLessons.ts';
import { finalCvRules } from '../supabase/functions/tailor-application/finalRules.ts';
import { finalLetterRules } from '../supabase/functions/tailor-application/letterRules.ts';
import { jobCountry } from '../supabase/functions/tailor-application/guards.ts';
import { rejectReason } from '../supabase/functions/tailor-application/review.ts';

// A real Stripe application in Dublin (12 Nov) for "Account Executive,
// Platforms Hunter (German fluency)", from a candidate who lives in Dublin.
const POSTING = 'Stripe is hiring an Account Executive. You will be prospecting to businesses and segment the market. Requirements: 3+ years of client-facing closing sales experience. High professional fluency in German. Ability to understand complex technical ecosystems. Cross functional work with product.';
const PROFILE_BULLETS = [
  "Architected a UK retailer's migration to 47 AWS microservices on EKS, cutting annual infrastructure cost.",
  'Served as technical lead on five pre-sales bids, presenting solutions to client CTOs.',
];
const PROFILE_TEXT = PROFILE_BULLETS.join('\n') + '\nSkills: Python, SQL, SaaS, analytical skills, cross-functional work\nLanguages: English (fluent), German (advanced)';

const CV = [
  'Max Okafor',
  'Account Executive',
  'Dublin, Ireland | Relocating to Dublin, US | US work authorised | max@example.com',
  '',
  'PROFESSIONAL EXPERIENCE',
  'Accenture | Solutions Architect | 04-2021 - 07-2022',
  "• Understood complex technical ecosystems by architecting a UK retailer's migration to 47 AWS microservices on EKS, cutting annual (operational efficiency) infrastructure cost.",
  '• Served as technical lead on five pre-sales bids, presenting solutions to client CTOs.',
  '',
  'TECHNICAL SKILLS',
  'Programming: Python, SQL',
  'Professional: Analytical Ability, Segment, SaaS, Cross Functional',
  'Languages: English (fluent), German (advanced), German',
  '',
  'EDUCATION',
  'BSc Computer Science',
].join('\n');

const runCv = (cv = CV) => finalCvRules(cv, { profileText: PROFILE_TEXT, profileBullets: PROFILE_BULLETS, posting: POSTING, homeCity: 'Dublin', jobCountry: jobCountry('Dublin') }).cv;

const LETTER = [
  'Max Okafor', '', 'Dear Hiring Team,', '',
  'The Account Executive role at Stripe asks for operational efficiency, and I have done it. At Accenture, I served as technical lead on five pre-sales bids, presenting solutions to client CTOs and winning the work.', '',
  "At Accenture, the client faced slow releases across forty teams. I also understood complex technical ecosystems by architecting a UK retailer's migration to 47 AWS microservices on EKS, cutting annual (operational efficiency) infrastructure cost for the retailer.", '',
  'I am happy to relocate to Dublin. I am available for a call whenever suits you.', '',
  'Kind regards,', '', 'Max Okafor',
].join('\n');

describe('Stripe Dublin lessons (12 Nov)', () => {
  it('a bare city means its capital or major city', () => {
    expect(jobCountry('Dublin')).toBe('ireland');
    expect(jobCountry('Paris')).toBe('france');
    expect(jobCountry('Sydney')).toBe('australia');
  });

  it('a requirement is never the bullet verb: the work leads', () => {
    const out = runCv();
    expect(out).toContain("• Architected a UK retailer's migration");
    expect(out).not.toContain('Understood complex');
    expect(graftPast('leading')).toBe('Led');
    expect(graftPast('applying')).toBe('Applied');
    expect(graftPast('running')).toBe('Ran');
    expect(noGraftedAbility('Demonstrated leadership by building a team of six.')).toBe('Built a team of six.');
  });

  it('no bracketed word between an adjective and its noun, but fine after a tool name', () => {
    expect(runCv()).toContain('cutting annual infrastructure cost');
    expect(strayGloss('Built GitHub Actions (CI/CD) pipelines for twelve services.')).toBe('Built GitHub Actions (CI/CD) pipelines for twelve services.');
  });

  it('one entry per language, the one with the level kept', () => {
    expect(runCv()).toMatch(/^Languages: English \(fluent\), German \(advanced\)$/m);
    expect(oneEntryPerLanguage('Languages & Citizenship: English (native), German, German (advanced) - EU Citizen'))
      .toBe('Languages & Citizenship: English (native), German (advanced) - EU Citizen');
  });

  it('a word-named product only when the profile shows it; half-phrases written as skills', () => {
    const out = runCv();
    const pro = (out.match(/^Professional:.*$/m) || [''])[0];
    expect(pro).not.toMatch(/\bSegment\b/);
    expect(pro).toContain('Cross-functional Collaboration');
    expect(pro).toContain('Analytical Skills');
    expect(pro).not.toMatch(/Cross Functional\b|Analytical Ability/);
    const shown = skillsReadRight('TECHNICAL SKILLS\nData: Segment, SQL', 'Built event tracking in Segment.').cv;
    expect(shown).toContain('Segment');
  });

  it('no relocation to the home city and no US authorisation for a Dublin job', () => {
    const out = runCv();
    expect(out).not.toMatch(/Relocating to Dublin/);
    expect(out).not.toMatch(/US work authori[sz]ed/);
    expect(out).toContain('Dublin, Ireland | max@example.com');
    // A US job keeps it; another city keeps the relocation line.
    expect(noForeignUsAuthorisation('Dublin | US work authorised | a@b.com', 'united states')).toContain('US work authorised');
    expect(noHomeRelocation('Dublin | Relocating to Berlin | a@b.com', 'Dublin')).toContain('Relocating to Berlin');
  });

  it('a page title gives the role and the company, never "Job Application for"', () => {
    expect(unwrapPageTitle('Job Application for Account Executive, Platforms Hunter (German fluency) at Stripe'))
      .toEqual({ title: 'Account Executive, Platforms Hunter (German fluency)', company: 'Stripe' });
    expect(unwrapPageTitle('Job Application for Front-End Engineer at Acme').title).toBe('Front-End Engineer');
    expect(unwrapPageTitle('Job Application for Intake Specialist at The Advocates - Greenhouse').company).toBe('The Advocates');
    expect(unwrapPageTitle('Senior Data Engineer').title).toBe('Senior Data Engineer');
  });

  it('the letter: needs from the ad only, pre-sales is not sales, no repeated "At" opener, no graft, no home relocation, German said at the CV level before the closing line', () => {
    const cv = runCv();
    const L = finalLetterRules(LETTER, { role: 'Account Executive', company: 'Stripe', cv, posting: POSTING, homeCity: 'Dublin', jobCountry: 'ireland' }).letter;
    expect(L).not.toMatch(/operational efficiency/);
    expect(L).toContain('I am applying for the Account Executive role at Stripe.');
    expect(postingSays('sales', 'Led five pre-sales bids.')).toBe(false);
    expect(postingSays('sales', 'closing sales experience')).toBe(true);
    expect(L).toContain('Also at Accenture, the client faced');
    expect(L).toMatch(/I also architected a UK retailer's migration/);
    expect(L).not.toMatch(/relocate to Dublin/);
    expect(L).toContain('I speak German at an advanced level.');
    expect(L.indexOf('I speak German')).toBeLessThan(L.indexOf('I am available'));
    expect(L.match(/I speak German/g)?.length).toBe(1);
  });

  it('the role title "(German fluency)" does not count as saying German', () => {
    const letter = 'Dear Hiring Team,\n\nI am applying for the Account Executive (German fluency) role at Stripe. I am available for a call whenever suits you.\n\nKind regards,\nMax';
    expect(languageTheAdAsks(letter, POSTING, 'Languages: German (advanced)')).toContain('I speak German at an advanced level.');
  });

  it('needs the posting states are kept', () => {
    const l = 'The Account Executive role at Stripe asks for prospecting, and I have done it.';
    expect(needsFromTheAd(l, POSTING)).toBe(l);
    expect(noRepeatedOpeners(['At Meta, I built X. At Meta, I ran Y.'])[0]).toBe('At Meta, I built X. Also at Meta, I ran Y.');
  });

  it('running the CV and letter rules a second time changes nothing', () => {
    const once = runCv();
    expect(runCv(once)).toBe(once);
    const ctx = { role: 'Account Executive', company: 'Stripe', cv: once, posting: POSTING, homeCity: 'Dublin', jobCountry: 'ireland' };
    const L1 = finalLetterRules(LETTER, ctx).letter;
    expect(finalLetterRules(L1, ctx).letter).toBe(L1);
  });

  it('a review edit that grafts the ability or brackets mid-phrase is rejected', () => {
    const doc = CV.replace("• Understood complex technical ecosystems by architecting a UK retailer's migration to 47 AWS microservices on EKS, cutting annual (operational efficiency) infrastructure cost.", "• Architected a UK retailer's migration to 47 AWS microservices on EKS, cutting annual infrastructure cost.");
    const ctx = { profileText: PROFILE_TEXT, protectedTerms: [], jobTitle: 'Account Executive' } as any;
    const old = "Architected a UK retailer's migration to 47 AWS microservices on EKS, cutting annual infrastructure cost.";
    expect(hasGraftedAbility("Understood complex systems by architecting a migration.")).toBe(true);
    expect(rejectReason(doc, { doc: 'cv', old, new: "Understood complex technical ecosystems by architecting a UK retailer's migration to 47 AWS microservices on EKS, cutting annual infrastructure cost.", reason: 'criterion' } as any, ctx)).toMatch(/by \.\.\.ing/);
    expect(rejectReason(doc, { doc: 'cv', old, new: "Architected a UK retailer's migration to 47 AWS microservices on EKS, cutting annual (operational efficiency) infrastructure cost.", reason: 'style' } as any, ctx)).toMatch(/bracketed word/);
  });
});
