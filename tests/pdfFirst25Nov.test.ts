import { describe, expect, it } from 'bun:test';
import { stripNonRequirementSections } from '../supabase/functions/_shared/postingRequirements.ts';
import { filterJobKeywords } from '../supabase/functions/_shared/keywordChecks.ts';
import { buildSummary, findViolations, type SummaryContext } from '../supabase/functions/_shared/summaryShape.ts';
import { finalExperienceQuality, misplacedKeywordBrackets, canonicalToolNames } from '../supabase/functions/_shared/cvFinalQuality.ts';
import { finalCvRules } from '../supabase/functions/tailor-application/finalRules.ts';
import { documentEnvelope, documentFileName } from '../supabase/functions/generate-pdf/fileDelivery.ts';

const posting = `About us
Our joint venture with T-Mobile supports thought leadership.
Responsibilities
Investigate incident response and maintain ISO 27001 controls.
Requirements
PowerShell and GitHub experience.
Benefits
We have:
HSA, FSA, EAP, 401k, PTO, pension, dental, vision, gym, wellness, Cycle to Work.
We offer:
Insurance and take ownership of your work.
Including:
PyTorch workshops.
Pay Range
Power BI bonus.
Why Lumos
Kubernetes powers our platform.
Equal opportunity
All qualified applicants receive consideration.`;

describe('25 Nov requirement-only keywords', () => {
  it('keeps a benefits section excluded across short lead-ins', () => {
    const text = stripNonRequirementSections(posting).text;
    expect(text).toContain('PowerShell and GitHub experience');
    expect(text).not.toContain('PyTorch');
    expect(text).not.toContain('Kubernetes');
    expect(text).not.toContain('Power BI');
  });
  it('never restores an all-benefits posting', () => {
    expect(stripNonRequirementSections('Benefits\nWe offer:\nPyTorch workshops').text).toBe('');
  });
  it('excludes every named perk, partner and company-pitch term', () => {
    const terms = ['HSA','FSA','EAP','401k','PTO','pension','dental','vision','gym','wellness','Cycle to Work','insurance','T-Mobile','thought leadership','take ownership of your work','PyTorch','Power BI','Kubernetes','PowerShell','GitHub','incident response'];
    expect(filterJobKeywords(terms, posting, 'Lumos')).toEqual(['PowerShell','GitHub','incident response']);
  });
  it('retains a genuine GDPR requirement and a genuine partner-tool requirement', () => {
    expect(stripNonRequirementSections('Requirements\nExperience with GDPR and data protection\nPrivacy notice\nWe store your personal data.').text).toContain('Experience with GDPR');
    expect(filterJobKeywords(['T-Mobile'], 'Our joint venture with T-Mobile.\nRequirements\nExperience with T-Mobile systems.')).toEqual(['T-Mobile']);
  });
  it('filters flattened inline headings without reopening benefits at lead-ins', () => {
    const text = stripNonRequirementSections('Build Python scripts. Why Lumos: Our joint venture with T-Mobile. What You’ll Do: Maintain GitHub integrations. Benefits & Perks: We have: HSA and PyTorch workshops. We offer: Power BI training.').text;
    expect(text).toContain('Python scripts');
    expect(text).toContain('GitHub integrations');
    expect(text).not.toContain('T-Mobile');
    expect(text).not.toContain('PyTorch');
    expect(text).not.toContain('Power BI');
  });
});

const bullets = ['Delivered a data warehouse migration for 40 teams.', 'Resolved a recurring security incident by leading the incident response review.', 'Authored ISO 27001 controls and PowerShell scripts for the security team.'];
const ctx: SummaryContext = { jobAppliedFor: true, heldTitles: ['Software Engineer'], targetTitle: 'IT Security Analyst', requirements: ['PowerShell', 'incident response', 'ISO 27001'], experienceBullets: bullets, outcomeBullets: ['Reduced data processing from six hours to one.'] };
describe('25 Nov target-field summary', () => {
  it('chooses security ahead of a newer larger data achievement, and uses exactly one CV achievement', () => {
    const summary = buildSummary(ctx);
    expect(summary).toContain('Background in IT security, with strengths in');
    expect(summary).toContain(bullets[2]);
    expect(summary).not.toContain('40 teams');
    expect(summary).not.toContain('six hours');
    expect(summary).not.toContain(';');
    expect(findViolations(summary, ctx)).toEqual([]);
  });
  it('uses a data achievement for a data role', () => {
    expect(buildSummary({ ...ctx, targetTitle: 'Data Analyst', requirements: ['data warehouse'] })).toContain(bullets[0]);
  });
  it('cannot use a saved achievement omitted from the final CV', () => {
    expect(buildSummary({ ...ctx, experienceBullets: [bullets[2]] })).not.toContain(bullets[1]);
  });
  it('preserves maker casing', () => {
    expect(canonicalToolNames('power bi powershell github pytorch')).toBe('Power BI PowerShell GitHub PyTorch');
    expect(buildSummary({ ...ctx, requirements: ['PowerShell', 'ISO 27001'] })).toContain('PowerShell');
  });
});

describe('25 Nov final CV quality', () => {
  it('removes a keyword after the opening verb', () => {
    expect(misplacedKeywordBrackets('Authored (Documentation) controls for the team.', '')).toBe('Authored controls for the team.');
  });
  it('removes a keyword inside a product name', () => {
    expect(misplacedKeywordBrackets('Built GitHub (version control) Actions for the team.', '')).toBe('Built GitHub Actions for the team.');
  });
  it('preserves an evidenced acronym expansion', () => {
    expect(misplacedKeywordBrackets('Built infrastructure as code (IaC) modules.', 'IaC')).toBe('Built infrastructure as code (IaC) modules.');
  });
  it('removes a copied achievement only from the older role and leaves it a bullet', () => {
    const cv = 'PROFESSIONAL EXPERIENCE\nMeta\nSoftware Engineer\n2023 - Present\n- Resolved an incident for 40 teams.\n\nCiti\nAnalyst\n2017 - 2021\n- Resolved an incident for 40 teams.\n- Built data reports for 24 analysts.\n\nEDUCATION\nDerby 2020';
    const result = finalExperienceQuality(cv, cv).cv;
    expect(result.match(/Resolved an incident for 40 teams/g)?.length).toBe(1);
    expect(result.split('Citi')[1]).toContain('Built data reports for 24 analysts');
    expect(finalExperienceQuality(result, cv).cv).toBe(result);
  });
  it('makes Deliver and Hold past tense when most of the role is past tense', () => {
    const cv = 'PROFESSIONAL EXPERIENCE\nMeta\n2023 - Present\n- Delivered a report.\n- Built a pipeline.\n- Authored controls.\n- Deliver audit findings.\n- Hold incident reviews.';
    const result = finalExperienceQuality(cv, cv).cv;
    expect(result).toContain('- Delivered audit findings.');
    expect(result).toContain('- Held incident reviews.');
  });
  it('restores a copied sole bullet from that role’s own evidence', () => {
    const cv = 'PROFESSIONAL EXPERIENCE\nMeta\nEngineer\n2023 - Present\n- Built dashboards for 24 analysts.\n\nCiti\nAnalyst\n2017 - 2021\n- Built dashboards for 24 analysts.';
    const roles = [{ company: 'Meta', title: 'Engineer', endDate: 'Present', bullets: ['Built dashboards for 24 analysts.'] }, { company: 'Citi', title: 'Analyst', endDate: '2021-03', bullets: ['Resolved daily feed failures for the reporting team.'] }];
    const result = finalExperienceQuality(cv, roles.flatMap((r) => r.bullets).join('\n'), roles).cv;
    expect(result.match(/Built dashboards for 24 analysts/g)?.length).toBe(1);
    expect(result.split('Citi')[1]).toContain('Resolved daily feed failures');
  });
  it('removes unbacked tools, certifications and posting-only core words without removing backed skills', () => {
    const cv = 'TECHNICAL SKILLS\nTools: PowerShell, GitHub, Splunk\nCore Competencies: Threat Hunting, PowerShell\nCERTIFICATIONS\nCISSP';
    const result = finalCvRules(cv, { profileText: 'PowerShell, GitHub', profileBullets: [] }).cv;
    expect(result).not.toContain('Splunk');
    expect(result).not.toContain('CISSP');
    expect(result).not.toContain('Threat Hunting');
    expect(result).toContain('PowerShell');
    expect(result).toContain('GitHub');
  });
});

describe('25 Nov PDF-first file delivery', () => {
  it('defaults filenames and primary bytes to PDF with a separate Word option', () => {
    const out = documentEnvelope('JVBERi0xLjQ=', 'UEsDBAo=', 'Max_Okafor_IT_Security_Analyst_CV.docx');
    expect(out.fileName).toBe('Max_Okafor_IT_Security_Analyst_CV.pdf');
    expect(out.docxFileName).toBe('Max_Okafor_IT_Security_Analyst_CV.docx');
    expect(out.pdf).toBe('JVBERi0xLjQ=');
    expect(documentFileName('Max_Okafor_IT_Security_Analyst_Cover_Letter.pdf', 'docx')).toBe('Max_Okafor_IT_Security_Analyst_Cover_Letter.docx');
  });
  it('never disguises Word bytes as a PDF', () => {
    expect(() => documentEnvelope('UEsDBAo=', 'UEsDBAo=', 'CV')).toThrow('No valid PDF');
  });
});