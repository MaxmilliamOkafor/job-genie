import { describe, expect, it } from 'bun:test';
import {
  buildEvidenceSources,
  buildRequirementList,
  classifyTerm,
  reportCoverage,
} from '../supabase/functions/_shared/evidence.ts';

/**
 * These import the same module the tailoring function imports, so generation,
 * revision and final validation are all tested through the rule they share.
 */

const PROFILE = {
  skills: { Programming: ['Python', 'SQL', 'Go'], Platform: ['Docker', 'Kubernetes'] },
  certifications: [{ name: 'AWS Certified Solutions Architect' }],
  education: [{ degree: 'MSc Artificial Intelligence', institution: 'Imperial College London' }],
  professionalExperience: [
    {
      title: 'Software Engineer',
      company: 'Meta',
      bullets: [
        'Owned the full ingestion layer in Python and SQL, halving p95 query latency',
        'Presented findings to business partners across three regulated portfolios',
        'No exposure to Kafka on this team',
      ],
    },
  ],
  relevantProjects: [
    {
      name: 'SignalDesk',
      techStack: ['Python', 'FastAPI'],
      bullets: ['Streams live financial news through an LLM with inline citations'],
    },
  ],
};

const SOURCES = buildEvidenceSources(PROFILE);

describe('one evidence rule for every stage', () => {
  it('treats a listed skill as explicitly recorded', () => {
    const v = classifyTerm('Python', SOURCES);
    expect(v.tier).toBe('explicit');
    expect(v.evidence).toContain('Python');
  });

  it('treats a qualification as explicitly recorded', () => {
    expect(classifyTerm('AWS Certified Solutions Architect', SOURCES).tier).toBe('explicit');
  });

  it('accepts a capability demonstrated by an achievement but absent from the skills field', () => {
    // This is the exact contradiction the pipeline used to have: the revision
    // pass added the wording, the validator deleted it.
    const ownership = classifyTerm('Ownership', SOURCES);
    expect(ownership.tier).toBe('demonstrated');
    expect(ownership.evidence).toContain('Owned the full ingestion layer');

    const stakeholders = classifyTerm('Stakeholder management', SOURCES);
    expect(stakeholders.tier).toBe('demonstrated');
    expect(stakeholders.evidence).toContain('business partners');
  });

  it('never infers a named tool from related work', () => {
    // Scheduling and orchestration do not make Airflow true.
    expect(classifyTerm('Airflow', SOURCES).tier).toBe('unsupported');
    expect(classifyTerm('dbt', SOURCES).tier).toBe('unsupported');
    expect(classifyTerm('BigQuery', SOURCES).tier).toBe('unsupported');
  });

  it('respects negation, so a disclaimed tool is not evidence', () => {
    expect(classifyTerm('Kafka', SOURCES).tier).toBe('unsupported');
  });

  it('never lets the job description count as evidence about the candidate', () => {
    // Sources are built from the profile only; a posting term with no profile
    // basis stays unsupported no matter how often the posting repeats it.
    expect(classifyTerm('Snowflake', SOURCES).tier).toBe('unsupported');
  });

  it('keeps whole-term matching, so Java is not satisfied by JavaScript', () => {
    const js = buildEvidenceSources({ skills: { Programming: ['JavaScript'] } });
    expect(classifyTerm('Java', js).tier).toBe('unsupported');
    expect(classifyTerm('JavaScript', js).tier).toBe('explicit');
  });
});

describe('one fixed requirement list per job', () => {
  it('deduplicates case variants and preserves technical punctuation', () => {
    const { terms } = buildRequirementList(['dbt', 'Dbt', 'C++', 'C#', '.NET', 'CI/CD', 'Node.js']);
    expect(terms).toEqual(['dbt', 'C++', 'C#', '.NET', 'CI/CD', 'Node.js']);
  });

  it('drops incidental employer names and boilerplate', () => {
    const { terms, removed } = buildRequirementList(
      ['Python', 'Vercel', 'benefits', 'competitive salary', 'hybrid'],
      ['Vercel'],
    );
    expect(terms).toEqual(['Python']);
    expect(removed).toContain('Vercel');
    expect(removed).toContain('benefits');
  });

  it('does not count the job title itself as a requirement', () => {
    // "Covering" a job title would only mean pasting the employer's wording
    // over the real history, and it sat in every report as a permanent gap.
    const { terms, removed } = buildRequirementList(
      ['Data Engineer', 'Senior Data Engineer', 'Senior', 'Analytics Engineer', 'Python'],
      [],
      'Data Engineer',
    );
    expect(terms).toEqual(['Python']);
    expect(removed).toContain('Data Engineer');
    expect(removed).toContain('Analytics Engineer');
  });

  it('drops bare vendor prefixes but keeps the product', () => {
    const { terms } = buildRequirementList(['Apache', 'Apache Spark', 'Airflow']);
    expect(terms).toEqual(['Apache Spark', 'Airflow']);
  });

  it('restores the spelling a human would write', () => {
    const { terms } = buildRequirementList(['Etl', 'Dbt', 'Fastapi', 'Typescript', 'Cicd']);
    expect(terms).toEqual(['ETL', 'dbt', 'FastAPI', 'TypeScript', 'CI/CD']);
  });

  it('does not credit a phrase already contained in a longer retained phrase', () => {
    const { terms } = buildRequirementList(['data quality', 'data quality checks']);
    expect(terms).toEqual(['data quality checks']);
  });

  it('counts an acronym and its expansion once', () => {
    // Both spellings in the list meant both were pushed onto the skills line,
    // which reads as stuffing, and the denominator was inflated by a repeat.
    const { terms, removed } = buildRequirementList(['NLP', 'Natural Language Processing', 'Python']);
    expect(terms).toEqual(['NLP', 'Python']);
    expect(removed).toContain('Natural Language Processing');
  });

  it('counts a qualified capability once', () => {
    const { terms } = buildRequirementList(['Leadership', 'Technical Leadership']);
    expect(terms).toEqual(['Technical Leadership']);
  });

  it('keeps a genuinely different product with a shared first word', () => {
    const { terms } = buildRequirementList(['SQL', 'SQL Server']);
    expect(terms).toEqual(['SQL', 'SQL Server']);
  });
});

describe('literal coverage and evidence alignment stay separate', () => {
  const terms = ['Python', 'Ownership', 'Airflow', 'SQL'];

  it('reports the two figures independently against the same denominator', () => {
    const doc = 'Built pipelines in Python and SQL.';
    const report = reportCoverage(doc, terms, SOURCES);

    // Literal: Python and SQL appear in the document, Ownership and Airflow do not.
    expect(report.literal.matched.sort()).toEqual(['Python', 'SQL']);
    expect(report.literal.missing.sort()).toEqual(['Airflow', 'Ownership']);
    expect(report.literal.matched.length + report.literal.missing.length).toBe(report.literal.total);
    expect(report.literal.percent).toBe(50);

    // Alignment: only Airflow is genuinely unsupported by the profile.
    expect(report.alignment.unsupported).toEqual(['Airflow']);
    expect(report.alignment.percent).toBe(75);
    expect(report.alignment.supported.length + report.alignment.unsupported.length).toBe(report.alignment.total);
  });

  it('never blends the two into one score', () => {
    const report = reportCoverage('Python. SQL. Ownership of delivery.', terms, SOURCES);
    expect(report.literal.percent).toBe(75);
    expect(report.alignment.percent).toBe(75);
    expect(report.literal).not.toBe(report.alignment);
  });
});
