import { describe, expect, it } from 'bun:test';
import { capKeywordAdditions, dropUnheldQualifications, hasSelfTalk, removeSelfTalkFromCv, renameToPostingWords, restorePostingGrafts, tidySkillsSection } from '../supabase/functions/_shared/documentRules.ts';
import { filterJobKeywords } from '../supabase/functions/_shared/keywordChecks.ts';
import { stripNonRequirementSections } from '../supabase/functions/_shared/evidence.ts';
import { keywordsAtWork } from '../supabase/functions/_shared/keywordsAtWork.ts';
import { whatChanged } from '../supabase/functions/_shared/whatChanged.ts';
import { composeResult } from '../supabase/functions/tailor-application/letterSlots.ts';
import { trimHeadline } from '../supabase/functions/tailor-application/guards.ts';
import { finalLetterRules } from '../supabase/functions/tailor-application/letterRules.ts';
import { finalCvRules } from '../supabase/functions/tailor-application/finalRules.ts';
import { extractCriteria, rejectReason } from '../supabase/functions/tailor-application/review.ts';
import { contactSourceLabel } from '../src/lib/contactSource';
import { isSupportedJobUrl } from '../src/lib/jobSites';
import { whatChangedLines } from '../src/lib/whatChanged';

const PROFILE_BULLETS = [
  'Ran monthly close reporting for four entities in NetSuite, cutting the close from eight days to five.',
  'Ran a four-week live test on pricing pages that lifted conversion by 2.1%.',
  'Rebuilt the overnight reporting run in PySpark, cutting it from six hours to under one.',
  'Built GitHub Actions pipelines for twelve services with Terraform modules.',
];
const PROFILE_TEXT = PROFILE_BULLETS.join('\n') + '\nSkills: NetSuite, Excel, PySpark, Python, Terraform, GitHub Actions, AWS, Kubernetes';

const CV = [
  'Max Okafor',
  'Lead Accountant',
  'max@example.com | +353 87 000 0000',
  'PROFESSIONAL SUMMARY',
  'Lead accountant with month-end close delivery across four entities. Skilled in keyword extraction and aligning resume content to ATS requirements.',
  'PROFESSIONAL EXPERIENCE',
  '• Ran monthly close reporting for four entities in NetSuite, cutting the close from eight days to five.',
  '• Ran a four-week live test (A/B testing) on pricing pages that lifted conversion by 2.1%.',
  '• Rebuilt the overnight reporting run in PySpark (Python, ETL, Spark), cutting it from six hours to under one.',
  '• Built GitHub Actions pipelines for twelve services with Terraform modules, optimised for ATS screening.',
  'TECHNICAL SKILLS',
  'Accounting: Month-End Close, Reconciliations, ACCA, CPA',
  'Tools: NetSuite, Excel',
  'Tools & Platforms: GitHub',
  'Core Competencies: Kubernetes',
  'Cloud: AWS',
  'Languages: English',
].join('\n');

describe('A. the documents never talk about themselves', () => {
  it('a CV containing ATS, keyword or resume content is rejected and regenerated from the profile', () => {
    expect(hasSelfTalk(CV)).toBe(true);
    const out = removeSelfTalkFromCv(CV, PROFILE_BULLETS);
    expect(hasSelfTalk(out.cv)).toBe(false);
    expect(out.summaryChanged).toBe(true);
    // The bullet is regenerated from the saved profile line that tells the same story.
    expect(out.cv).toContain('• Built GitHub Actions pipelines for twelve services with Terraform modules.');
  });
  it('a review edit that adds ATS or keyword wording is rejected', () => {
    const doc = 'PROFESSIONAL SUMMARY\nLead accountant with month-end close delivery.';
    const reason = rejectReason(doc, { doc: 'cv', old: 'month-end close delivery', new: 'month-end close delivery and ATS keyword alignment', reason: 'style' } as any, { profileText: PROFILE_TEXT, protectedTerms: [], criteriaTerms: [], jobTitle: 'Lead Accountant', heldTitles: [] } as any);
    expect(reason).toBe('talks about the document itself (ATS, keywords or resume content)');
  });
  it('a letter sentence about keywords or ATS is taken out', () => {
    const letter = letterWith('At Meta, I cut the overnight reporting run from six hours to under one. I matched my keywords to your ATS requirements.');
    expect(hasSelfTalk(finalLetterRules(letter, CTX).letter)).toBe(false);
  });
});

describe('B. keywords go in the bullet that shows the work', () => {
  it('"monthly close" becomes "month-end close" in the bullet', () => {
    const out = renameToPostingWords(CV, ['month-end close']).cv;
    expect(out).toContain('• Ran month-end close reporting for four entities');
    expect(out).not.toMatch(/monthly close/i);
  });
  it('a keyword no bullet shows stays in Skills only', () => {
    const out = keywordsAtWork(renameToPostingWords(CV, ['Snowflake']).cv, { must: ['Snowflake'], asked: ['Snowflake'], profileBullets: PROFILE_BULLETS }).cv;
    const bullets = out.split('\n').filter((l) => l.startsWith('•'));
    expect(bullets.some((b) => /Snowflake/.test(b))).toBe(false);
  });
  it('at most one added keyword per bullet', () => {
    const out = capKeywordAdditions(CV, PROFILE_BULLETS).cv;
    expect(out).toContain('(Python)');
    expect(out).not.toMatch(/ETL|Spark\)/);
  });
  it('at most six added keywords per CV', () => {
    const src = Array.from({ length: 8 }, (_, i) => `Built reporting service number ${i + 1} for the finance operations team.`);
    const cv = ['PROFESSIONAL EXPERIENCE', ...src.map((b, i) => `• ${b.replace(/\.$/, '')} (Tool${i + 1}).`)].join('\n');
    const out = capKeywordAdditions(cv, src);
    expect((out.cv.match(/\(Tool\d\)/g) || []).length).toBe(6);
    expect(out.cut).toEqual(['Tool7', 'Tool8']);
  });
});

describe('B. never a keyword in a bullet whose work does not show it', () => {
  it('a bullet that copies a posting duty the profile never states gets the profile line back', () => {
    const profile = ['Owned the product roadmap and wrote the requirements and acceptance criteria for each release.'];
    const cv = 'PROFESSIONAL EXPERIENCE\n- Shipped features to production every week by owning the product roadmap and writing the requirements and acceptance criteria for each release.';
    const out = restorePostingGrafts(cv, profile, 'Requirements\n- Shipping features to production every week\n- Shipped features to production every week', profile[0]);
    expect(out.cv).toBe('PROFESSIONAL EXPERIENCE\n- Owned the product roadmap and wrote the requirements and acceptance criteria for each release.');
    expect(restorePostingGrafts(out.cv, profile, 'Shipped features to production every week', profile[0]).cv).toBe(out.cv);
  });
});

describe('C. the skills section reads like a person wrote it', () => {
  const out = tidySkillsSection(CV, PROFILE_TEXT).cv;
  const skillLines = out.split('\n').slice(out.split('\n').indexOf('TECHNICAL SKILLS') + 1);
  it('no single-item skill line except Languages and Soft Skills', () => {
    for (const l of skillLines) {
      const [label, items] = l.split(/:\s*/);
      if (/^(Languages|Soft Skills)$/.test(label)) continue;
      expect(items.split(/\s*,\s*/).length).toBeGreaterThan(1);
    }
  });
  it('no Core Competencies or Additional Skills line, and Tools is one line', () => {
    expect(out).not.toMatch(/Core Competencies|Additional Skills|Tools & Platforms/);
    expect(out).toContain('Cloud: AWS, Kubernetes');
  });
  it('a tool named in a bullet appears under its full name', () => {
    expect(out).toMatch(/Tools: NetSuite, Excel, GitHub Actions/);
  });
  it('ACA, ACCA and CPA are never listed when the profile does not hold them', () => {
    expect(out).not.toMatch(/\b(ACA|ACCA|CPA)\b/);
    const summary = dropUnheldQualifications('PROFESSIONAL SUMMARY\nACA-qualified lead accountant. Runs month-end close.', PROFILE_TEXT).cv;
    expect(summary).not.toMatch(/\bACA\b/);
    expect(tidySkillsSection(CV, PROFILE_TEXT + '\nCertifications: ACCA').cv).toContain('ACCA');
  });
});

describe('D. headline', () => {
  it('"Lead Accountant" stays whole', () => {
    expect(trimHeadline(CV, 'Python').split('\n')[1]).toBe('Lead Accountant');
  });
  it('a platform the experience never shows still comes off', () => {
    expect(trimHeadline(CV.replace('Lead Accountant', 'Lead Accountant (Salesforce)'), PROFILE_TEXT).split('\n')[1]).toBe('Lead Accountant');
  });
});

describe('E. what counts as a requirement', () => {
  const posting = `New Relic is hiring a Lead Accountant.
Our leadership team is growing. You will partner with FP&A, Tax and Treasury.
Requirements: 6+ years in accounting; US GAAP; SOX controls; NetSuite.
You will help with shipping features to production.`;
  const kept = filterJobKeywords(['New Relic', '6+', 'FP', 'Hiring', 'Shipping', 'Leadership', 'GAAP', 'SOX IT Controls', 'NetSuite', 'Tax', 'Treasury'], posting, 'New Relic');
  it('the employer name, 6+, FP, Hiring, Shipping and Leadership are not requirements', () => {
    for (const t of ['New Relic', '6+', 'FP', 'Hiring', 'Shipping', 'Leadership', 'Tax', 'Treasury']) expect(kept).not.toContain(t);
  });
  it('GAAP under US GAAP is US GAAP, and SOX controls is SOX', () => {
    expect(kept).toEqual(['US GAAP', 'SOX', 'NetSuite']);
  });
  it('the employer name stays when the posting asks for experience with it by name', () => {
    expect(filterJobKeywords(['New Relic'], 'Acme is hiring. Experience with New Relic or Datadog.', 'Acme')).toEqual(['New Relic']);
  });
  it('a GDPR requirement line is read; a notice about the applicant\'s data is not', () => {
    const p = 'About the role\nYou will build pipelines.\nExposure to GDPR and dbt\nYou will model data in dbt.\nWe process your personal data in line with our privacy notice.\nRequirements\n- Python';
    const text = stripNonRequirementSections(p).text;
    expect(text).toContain('Exposure to GDPR and dbt');
    expect(text).not.toContain('personal data');
    const crit = extractCriteria('Requirements\n- Experience with dbt and exposure to GDPR\n- We will process your personal data for recruitment\n');
    expect(crit.map((c) => c.requirement)).toEqual(['Experience with dbt and exposure to GDPR']);
  });
});

const FILLER = 'At Accenture, I reduced environment provisioning to a single automated pipeline run by authoring the Terraform modules the client still operates, so new teams started work in days rather than weeks and stopped waiting on tickets. At Meta, I rebuilt the overnight reporting run in PySpark and cut it from six hours to under one, which let finance close the books two days earlier each month.';
const CTX = { role: 'Data Engineer', company: 'Acme Ltd', cv: CV + '\nGo, Rust, C++', postingTerms: ['Python', 'Go'] };
function letterWith(extra: string, opening = 'I am writing to apply for the Data Engineer role. I would bring Python, Go, C++, Rust and Snowflake (CI/CD) to your team.') {
  return `Max Okafor\nData Engineer\nmax@example.com\n\nDear Hiring Team,\n\n${opening}\n\nThank you for considering my application.\n\n${FILLER} The test lifted conversion by 2.1%. ${extra}\n\nI am available for a call whenever suits you.\n\nKind regards,\nMax Okafor`;
}

describe('F. cover letter', () => {
  const LONGER = 'At Meta, I also moved the finance team from spreadsheets to a shared reporting model that four regional controllers now use every week, which ended the monthly reconciliation dispute between offices and gave each controller the same numbers on the same day. The same model now feeds the quarterly board pack without any manual copying.';
  const out = finalLetterRules(letterWith(`${LONGER} I have a proven track record of bridging technical and business stakeholders.`), CTX).letter;
  const body = out.split('Dear Hiring Team,')[1].split('Kind regards,')[0];
  it('names the employer in its opening', () => {
    expect(body.trim().split('\n')[0]).toMatch(/^I am applying for the Data Engineer role at Acme\./);
    expect(out).not.toMatch(/I am writing to apply/);
    expect(out).toContain('to the Acme team');
  });
  it('every result sentence has its subject, including irregular verbs', () => {
    expect(composeResult('Gave risk and finance a single agreed set of daily exposure figures', 'Citigroup')).toBe('At Citigroup, I gave risk and finance a single agreed set of daily exposure figures.');
  });
  it('lists at most three tools and never one the CV does not show', () => {
    expect(out).toContain('Python, Go and C++');
    expect(out).not.toMatch(/Snowflake|Rust/);
  });
  it('carries the CV figures and has no bracketed shorthand', () => {
    expect(out).toContain('from six hours to under one');
    expect(out).toContain('2.1%');
    expect(out).not.toMatch(/\(CI\/CD\)|\(/);
  });
  it('drops sentences any candidate could have written and puts the thanks last', () => {
    expect(out).not.toMatch(/proven track record/);
    expect(body.trim().split('\n\n').pop()).toMatch(/^Thank you for considering/);
  });
  it('never takes the body under the 150-word floor to drop a generic sentence', () => {
    const short = finalLetterRules(letterWith('I have a proven track record of delivery.'), CTX).letter;
    expect(short).toContain('proven track record');
  });
  it('keeps "That is why I am applying" after a company paragraph, once', () => {
    const l = letterWith('', 'Acme builds payment software for hospitals and clinics across Europe.');
    const once = finalLetterRules(l, CTX).letter;
    expect(once.match(/That is why I am applying for the Data Engineer role\./g)?.length).toBe(1);
    expect(finalLetterRules(once, CTX).letter).toBe(once);
  });
  it('writes the what-I-would-bring line at most once', () => {
    const line = 'For the Data Engineer role at Acme, I would bring hands-on Kafka and Airflow from that work.';
    const l = letterWith(`${line} ${line}`);
    expect(finalLetterRules(l, CTX).letter.split(line).length - 1).toBeLessThanOrEqual(1);
  });
});

describe('G. stable output', () => {
  it('the same inputs give the same CV and letter, and a second pass changes nothing', () => {
    const ctx = { profileText: PROFILE_TEXT, profileBullets: PROFILE_BULLETS };
    const a = finalCvRules(CV, ctx).cv;
    const b = finalCvRules(CV, ctx).cv;
    expect(a).toBe(b);
    expect(finalCvRules(a, ctx).cv).toBe(a);
    const l1 = finalLetterRules(letterWith(''), CTX).letter;
    expect(finalLetterRules(letterWith(''), CTX).letter).toBe(l1);
    expect(finalLetterRules(l1, CTX).letter).toBe(l1);
    expect(l1.match(/\(/g)).toBeNull();
  });
});

describe('website changes', () => {
  it('"What changed" reports coverage before and after, new terms and what was not added', () => {
    const lines = whatChanged({ profileText: 'Monthly close in NetSuite and Python.', cvBefore: CV, cvAfter: tidySkillsSection(CV, PROFILE_TEXT).cv + '\nETL', keywords: ['NetSuite', 'Python', 'ETL', 'Snowflake'] });
    expect(lines[0]).toBe('Keyword coverage: 50% in your own CV, 75% now (3 of 4).');
    expect(lines[1]).toBe("Now says, in the job's own words: ETL.");
    expect(lines[lines.length - 1]).toBe('Not added, because your CV does not show them: Snowflake. Add them yourself only if they are true.');
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(whatChanged({ profileText: '', cvBefore: '', cvAfter: '', keywords: [] })).toEqual([]);
    expect(whatChanged({ profileText: '', cvBefore: '', cvAfter: 'Python', keywords: ['Gdpr'], posting: 'Exposure to GDPR' }).pop()).toContain('show them: GDPR.');
  });
  it('the box shows plain text only', () => {
    expect(whatChangedLines(['<b>Keyword coverage</b>: 71%', 3, null])).toEqual(['Keyword coverage: 71%']);
    expect(whatChangedLines(undefined)).toEqual([]);
  });
  it('a LeadOcean contact is labelled, not rejected', () => {
    expect(contactSourceLabel('leadocean')).toBe('Found through LeadOcean');
    expect(contactSourceLabel('flow-linkedin')).toBe('Found through Flow (LinkedIn)');
    expect(contactSourceLabel('something-new')).toBeNull();
  });
  it('UKG / UltiPro, Phenom, Eightfold and ClearCompany links are accepted', () => {
    for (const u of ['https://recruiting.ultipro.com/ACME/JobBoard/1/OpportunityDetail?opportunityId=2', 'https://acme.ukg.net/jobs/1', 'https://jobs.phenompeople.com/acme/job/1', 'https://acme.eightfold.ai/careers/job/1', 'https://acme.clearcompany.com/careers/jobs/1', 'https://acme.hrmdirect.com/employment/job-opening.php?req=1']) {
      expect(isSupportedJobUrl(u)).toBe(true);
    }
    expect(isSupportedJobUrl('https://example.com/job')).toBe(false);
  });
});
