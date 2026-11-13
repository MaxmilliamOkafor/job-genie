import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { keywordsAtWork, mustAtWork, noMoreThanThree, profileSentences, projectsForTheJob } from '../supabase/functions/_shared/keywordsAtWork.ts';

const CV = [
  'Maxmilliam Okafor', 'Solutions Architect', 'Dublin, Ireland | max@example.com',
  'PROFESSIONAL SUMMARY', 'Solutions architect and ML engineer with AWS and Python delivery across retail and finance.',
  'PROFESSIONAL EXPERIENCE',
  'Accenture', 'Solutions Architect | London, United Kingdom', 'April 2021 - July 2022',
  '• Reduced environment provisioning from a multi-week request to a single automated pipeline run.',
  '• Established monitoring and alerting with formal reliability targets (Prometheus, Grafana, Datadog).',
  'Meta', 'Software Engineer | Dublin, Ireland', 'January 2023 - Present',
  '• Cut response times on backend services by running downstream calls in parallel (Python, Go, Kubernetes).',
  '• Rebuilt the overnight reporting run in PySpark (Python, Kubernetes).',
  '• Shipped the feature store migration (Python, Kubernetes).',
  'TECHNICAL SKILLS', 'Cloud & DevOps: AWS, Kubernetes, Terraform', 'Programming: Python, Go, SQL', 'Domain: Kubernetes, RAG',
  'PROJECTS', '',
  'DriftGuard', 'Python, Evidently, Prometheus', '• Watches a deployed model for data and concept drift.', 'Code: https://github.com/x/driftguard', '',
  'SignalDesk', 'Python, LangChain, RAG, LLMs', '• Streams financial news through an LLM with inline source citations.', 'Code: https://github.com/x/signaldesk', '',
  'LedgerLens', 'Python, SQL', '• Scores ledger anomalies for risk teams.', '',
  'EDUCATION', 'MSc Artificial Intelligence'].join('\n');

const BULLETS = [
  'Reduced environment provisioning from a multi-week request to a single automated pipeline run by authoring the Terraform modules.',
  'Established monitoring and alerting with formal reliability targets using Prometheus, Grafana and Datadog.',
  'Cut response times on backend services by running downstream calls in parallel in Python and Go.',
  'Skills: AWS Kubernetes Terraform Python Go SQL Snowflake',
];

describe('the posting\'s keywords at work, not just listed', () => {
  it('puts an evidenced MUST tool into the bullet that tells that story', () => {
    const out = keywordsAtWork(CV, { must: ['Terraform', 'Snowflake', 'Stakeholder Management'], asked: ['Terraform'], profileBullets: BULLETS }).cv;
    expect(out).toContain('• Reduced environment provisioning from a multi-week request to a single automated pipeline run (Terraform).');
    expect(/•[^\n]*Snowflake/.test(out)).toBe(false);
    expect(/•[^\n]*Stakeholder/.test(out)).toBe(false);
    expect(keywordsAtWork(out, { must: ['Terraform'], asked: ['Terraform'], profileBullets: BULLETS }).cv).toBe(out);
  });

  it('never adds to a bracket that is not a tool list', () => {
    const cv = 'PROFESSIONAL EXPERIENCE\nAcme\nEngineer | Dublin\n2020 - 2022\n• Reduced environment provisioning from a multi-week request to a single automated pipeline run (40%).\nEDUCATION';
    const out = mustAtWork(cv.split('\n'), ['Terraform'], profileSentences(BULLETS)).lines.join('\n');
    expect(out).not.toContain('(40%, Terraform)');
  });

  it('caps a keyword at three mentions without touching sentences', () => {
    const out = noMoreThanThree(CV.split('\n'), ['Kubernetes', 'Python']).lines.join('\n');
    expect((out.match(/\bKubernetes\b/g) || []).length).toBeLessThanOrEqual(3);
    expect(out).toContain('Cloud & DevOps: AWS, Kubernetes, Terraform');
    expect(out).toContain('in parallel (Python, Go, Kubernetes)');
    expect(out).toContain('Domain: RAG');
    expect(out).toContain('with AWS and Python delivery');
    expect(out).not.toContain('()');
  });

  it('puts the projects that show what the posting asks for first', () => {
    const out = projectsForTheJob(CV.split('\n'), ['RAG', 'LLMs', 'LangChain']).lines.join('\n');
    expect(out.indexOf('\nSignalDesk\n')).toBeLessThan(out.indexOf('\nDriftGuard\n'));
    expect(out.indexOf('\nDriftGuard\n')).toBeLessThan(out.indexOf('\nLedgerLens\n'));
    expect(out).toMatch(/SignalDesk\nPython, LangChain, RAG, LLMs\n• Streams[^\n]*\nCode: https:\/\/github\.com\/x\/signaldesk\n\nDriftGuard/);
    expect(projectsForTheJob(CV.split('\n'), ['Salesforce']).moved).toBe(false);
  });

  it('never writes a ", using X." tail, and asks for the term in the first half of a bullet', () => {
    const out = keywordsAtWork(CV, { must: ['Terraform'], asked: ['Terraform'], profileBullets: BULLETS }).cv;
    expect(/, using [A-Z]/.test(out)).toBe(false);
    const src = readFileSync('supabase/functions/tailor-application/index.ts', 'utf8');
    expect(src).toContain("The posting's term sits in the FIRST HALF of the bullet");
  });

  it('runs at the final step, before monetary exclusion', () => {
    const src = readFileSync('supabase/functions/tailor-application/index.ts', 'utf8');
    // The two-page condensing runs between renaming and keyword placement.
    const at = src.indexOf('keywordsAtWork(condensed.cv');
    expect(src.indexOf('condenseEarlierRoles(renamed.cv')).toBeGreaterThan(src.indexOf('renameToPostingWords(polished.cv'));
    expect(at).toBeGreaterThan(src.indexOf('condenseEarlierRoles(renamed.cv'));
    expect(at).toBeGreaterThan(src.indexOf('polishTailoredDocuments('));
    expect(src.indexOf('renameToPostingWords(polished.cv')).toBeGreaterThan(src.indexOf('polishTailoredDocuments('));
    expect(src.indexOf('removeMonetaryClaims(finalCv.cv)')).toBeGreaterThan(at);
  });
});
