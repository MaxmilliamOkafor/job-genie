import { describe, expect, it } from 'bun:test';
import {
  applyProjectsSection,
  buildProjectsSection,
  checkRevisionFidelity,
  diffBullets,
  evaluateRevision,
  measureCoverage,
} from '../supabase/functions/_shared/coverage';

/**
 * These import the same module the tailoring function imports, so the rules
 * tested here are the rules that run in the backend.
 */

const DRAFT = `MAXMILLIAM OKAFOR
Data Engineer

PROFESSIONAL SUMMARY
Data engineer with six years building batch and streaming pipelines across regulated financial portfolios.

PROFESSIONAL EXPERIENCE

Meta
Software Engineer
January 2023 - Present
• Re-architected the Business Suite ingestion layer in Python and SQL, halving p95 query latency
• Built MLOps release automation on Docker and Kubernetes, cutting release cycles to three days

Citigroup
Data Analyst
August 2017 - March 2021
• Re-engineered ETL in SQL, cutting processing from a full day to under two hours
• Developed fraud scoring models over the daily transaction feed

TECHNICAL SKILLS
Programming: Python, SQL, Go

EDUCATION
Master of Science in Artificial Intelligence
Imperial College London
2017`;

const TERMS = ['Python', 'SQL', 'Airflow', 'Kafka', 'dbt', 'Java', 'Terraform', 'Docker', 'Kubernetes', 'Spark'];

describe('revision acceptance', () => {
  it('accepts a pass that raises coverage by rewriting an existing bullet', () => {
    const revised = DRAFT.replace(
      '• Re-engineered ETL in SQL, cutting processing from a full day to under two hours',
      '• Re-engineered ETL in SQL orchestrated with Airflow, cutting processing from a full day to under two hours',
    ).replace('Programming: Python, SQL, Go', 'Programming: Python, SQL, Go\nData Platform: Kafka, dbt');

    const verdict = evaluateRevision({ draft: DRAFT, revised, terms: TERMS });
    expect(verdict.accept).toBe(true);
    expect(verdict.coverageBefore).toBe(40);
    expect(verdict.coverageAfter).toBe(70);
    expect(verdict.changedBullets[0].after).toContain('Airflow');
    expect(verdict.changedBullets[0].before).toContain('Re-engineered ETL in SQL');
  });

  it('rejects a revision that changes an employment date', () => {
    const revised = DRAFT.replace('August 2017 - March 2021', 'August 2016 - March 2021').replace(
      'Programming: Python, SQL, Go',
      'Programming: Python, SQL, Go, Airflow, Kafka',
    );
    const verdict = evaluateRevision({ draft: DRAFT, revised, terms: TERMS });
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toContain('dates changed');
    expect(verdict.coverageAfter).toBe(verdict.coverageBefore);
  });

  it('rejects a revision that invents a figure', () => {
    const revised = DRAFT.replace(
      '• Developed fraud scoring models over the daily transaction feed',
      '• Developed fraud scoring models in Spark over 4.2 million daily transactions',
    );
    const verdict = evaluateRevision({ draft: DRAFT, revised, terms: TERMS });
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toContain('figures invented');
  });

  it('rejects a revision that drops a section', () => {
    const revised = DRAFT.replace(/EDUCATION[\s\S]*$/, 'Programming extras: Airflow, Kafka, dbt, Spark, Terraform, Java');
    const verdict = evaluateRevision({ draft: DRAFT, revised, terms: TERMS });
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toMatch(/section dropped|content removed/);
  });

  it('rejects a revision that does not raise coverage', () => {
    const revised = DRAFT.replace('six years', 'over six years');
    const verdict = evaluateRevision({ draft: DRAFT, revised, terms: TERMS });
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toBe('coverage did not improve');
  });

  it('rejects empty output instead of publishing a blank CV', () => {
    const verdict = evaluateRevision({ draft: DRAFT, revised: '   ', terms: TERMS });
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toBe('no usable text returned');
  });

  it('keeps titles, employers and grades untouched in a faithful revision', () => {
    const revised = DRAFT.replace('in Python and SQL', 'in Python, SQL and Spark');
    expect(checkRevisionFidelity(DRAFT, revised)).toBeNull();
  });
});

describe('two-pass loop behaviour', () => {
  /** Mirrors the backend loop: stop at target, stop when nothing is evidenced, never exceed two passes. */
  function runLoop(
    draft: string,
    terms: string[],
    target: number,
    model: (draft: string, pass: number) => string,
    evidenced: (term: string) => boolean,
  ) {
    let current = draft;
    const log: Array<{ pass: number; before: number; after: number; accepted: boolean; reason?: string }> = [];
    for (let pass = 1; pass <= 2; pass++) {
      const before = measureCoverage(current, terms);
      if (before.percent >= target) break;
      const gaps = before.missing.filter(evidenced);
      if (gaps.length === 0) break;
      const verdict = evaluateRevision({ draft: current, revised: model(current, pass), terms });
      log.push({ pass, before: verdict.coverageBefore, after: verdict.coverageAfter, accepted: verdict.accept, reason: verdict.reason });
      if (!verdict.accept) break;
      current = model(current, pass);
      if (verdict.coverageAfter >= target) break;
    }
    return { text: current, log, finalCoverage: measureCoverage(current, terms).percent };
  }

  const alwaysEvidenced = () => true;

  it('runs at most two passes and stops once the target is reached', () => {
    const model = (text: string, pass: number) =>
      pass === 1
        ? text.replace('Programming: Python, SQL, Go', 'Programming: Python, SQL, Go\nData Platform: Airflow, Kafka, dbt')
        : text.replace('Data Platform: Airflow, Kafka, dbt', 'Data Platform: Airflow, Kafka, dbt, Spark, Terraform, Docker, Kubernetes, Java');

    const out = runLoop(DRAFT, TERMS, 90, model, alwaysEvidenced);
    expect(out.log.map((l) => l.pass)).toEqual([1, 2]);
    expect(out.log.every((l) => l.accepted)).toBe(true);
    expect(out.log[0].before).toBe(40);
    expect(out.finalCoverage).toBe(100);
  });

  it('never starts a third pass even when coverage is still short', () => {
    const model = (text: string, pass: number) =>
      text.replace('Programming: Python, SQL, Go', `Programming: Python, SQL, Go, ${pass === 1 ? 'Airflow' : 'Kafka'}`);
    const out = runLoop(DRAFT, TERMS, 90, model, alwaysEvidenced);
    expect(out.log.length).toBeLessThanOrEqual(2);
    expect(out.finalCoverage).toBeLessThan(90);
  });

  it('does not revise at all when no missing term has profile evidence', () => {
    const out = runLoop(DRAFT, TERMS, 90, (t) => t, () => false);
    expect(out.log).toEqual([]);
    expect(out.text).toBe(DRAFT);
  });

  it('skips revision entirely when the first draft already meets the target', () => {
    const out = runLoop(DRAFT, ['Python', 'SQL'], 90, (t) => t, alwaysEvidenced);
    expect(out.log).toEqual([]);
    expect(out.finalCoverage).toBe(100);
  });
});

describe('projects stay verbatim across revisions', () => {
  const projects = [
    {
      name: 'SignalDesk',
      techStack: ['Python', 'Kafka', 'FastAPI'],
      bullets: ['Streams live financial news through an LLM with inline citations'],
      liveUrl: 'https://example.com/signaldesk',
      codeUrl: 'https://github.com/example/signaldesk',
    },
  ];

  it('rebuilds the block from the profile and places it before EDUCATION', () => {
    const block = buildProjectsSection(projects);
    const applied = applyProjectsSection(DRAFT, block);
    expect(applied.indexOf('PROJECTS')).toBeLessThan(applied.indexOf('EDUCATION'));
    expect(applied).toContain('https://github.com/example/signaldesk');
    expect(applied).toContain('Python, Kafka, FastAPI');
  });

  it('replaces a model-reworded projects section rather than keeping both', () => {
    const block = buildProjectsSection(projects);
    const withProjects = applyProjectsSection(DRAFT, block);
    const modelReworded = withProjects.replace('SignalDesk', 'Signal Desk Sentiment Platform');
    const restored = applyProjectsSection(modelReworded, block);
    expect(restored.match(/^PROJECTS$/gm)?.length).toBe(1);
    expect(restored).toContain('SignalDesk');
    expect(restored).not.toContain('Signal Desk Sentiment Platform');
  });

  it('returns an empty block when the profile has no projects, so no empty heading appears', () => {
    expect(buildProjectsSection([])).toBe('');
    expect(applyProjectsSection(DRAFT, '')).toBe(DRAFT);
  });
});

describe('changed-bullet reporting', () => {
  it('pairs the original bullet with its revision', () => {
    const revised = DRAFT.replace('in Python and SQL', 'in Python, SQL and Spark');
    const changed = diffBullets(DRAFT, revised);
    expect(changed).toHaveLength(1);
    expect(changed[0].before).toContain('in Python and SQL');
    expect(changed[0].after).toContain('Python, SQL and Spark');
  });
});
