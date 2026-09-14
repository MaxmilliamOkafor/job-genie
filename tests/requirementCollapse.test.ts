import { describe, expect, it } from 'bun:test';
import {
  buildRequirementList,
  collapseRequirements,
  isFurniture,
  isLiftedProse,
  salvageRequirement,
} from '../supabase/functions/_shared/evidence.ts';

describe('benefits, logistics and boilerplate are not requirements', () => {
  it('drops what a candidate cannot evidence', () => {
    for (const term of ['competitive salary', '401k', 'dental', 'vision', 'paid time off', 'PTO', 'health insurance', 'stock options', 'bonus', 'full-time', 'hybrid', 'equal opportunity', 'fast-paced', 'apply now', 'submit resume']) {
      expect(isFurniture(term)).toBe(true);
    }
  });

  it('keeps real technical and management requirements', () => {
    for (const term of ['reliability', 'availability', 'automation', 'scalability', 'observability', 'collaboration', 'stakeholder management']) {
      expect(isFurniture(term)).toBe(false);
    }
  });

  it('drops experience-duration and generic degree screening criteria', () => {
    for (const term of ['7+ years', '5 years experience', '3-5 years', 'minimum 8 years', "Bachelor's degree", '10+ years of relevant experience']) {
      expect(isFurniture(term)).toBe(true);
    }
  });

  it('keeps ownership, decision making, operational efficiency and customer success', () => {
    for (const term of ['ownership', 'decision making', 'operational efficiency', 'customer success']) {
      expect(isFurniture(term)).toBe(false);
    }
  });
});

describe('word forms and compound modifiers are one requirement', () => {
  it('collapses adjective and noun forms', () => {
    expect(collapseRequirements(['scrappy', 'scrappiness']).terms).toEqual(['scrappy']);
    expect(collapseRequirements(['ownership', 'owner']).terms.length).toBe(1);
  });

  it('collapses a compound modifier onto its head noun', () => {
    expect(collapseRequirements(['AI', 'AI-driven']).terms).toEqual(['AI']);
    expect(collapseRequirements(['data-driven', 'data']).terms.length).toBe(1);
    expect(collapseRequirements(['SQL', 'SQL-heavy']).terms).toEqual(['SQL']);
  });

  it('leaves terms that name their own thing separate', () => {
    expect(collapseRequirements(['Remote-first', 'cloud-native']).terms.length).toBe(2);
    expect(collapseRequirements(['reliability', 'availability', 'observability']).terms.length).toBe(3);
  });
});

describe('one entry per requirement, not one per phrasing', () => {
  it('collapses qualifier and phrasing variants onto the canonical form', () => {
    const { terms } = collapseRequirements(['payroll', 'global payroll', 'payroll management']);
    expect(terms).toEqual(['payroll']);
    expect(collapseRequirements(['Linux systems', 'Linux']).terms).toEqual(['Linux']);
    expect(collapseRequirements(['AI', 'AI building']).terms).toEqual(['AI']);
    expect(collapseRequirements(['performance management', 'feedback', 'team performance']).terms.length).toBe(1);
  });

  it('never merges requirements that mean different things', () => {
    const { terms } = collapseRequirements(['reliability', 'availability', 'observability', 'project management', 'performance management']);
    expect(terms.length).toBe(5);
  });

  it('returns a denominator in the honest range for a typical posting', () => {
    const raw = ['payroll', 'global payroll', 'payroll management', 'Linux systems', 'Linux', 'AI', 'AI building', 'performance management', 'feedback', 'team performance', 'competitive salary', '401k', 'dental', 'PTO', 'reliability', 'availability', 'automation', 'scalability', 'observability', 'collaboration', 'stakeholder management', 'stakeholder engagement', 'SQL', 'Power BI', 'fast-paced', 'apply now'];
    const { terms } = buildRequirementList(raw, ['Meta'], 'Manager, Payroll Operations');
    expect(terms.length).toBeGreaterThanOrEqual(10);
    expect(terms.length).toBeLessThanOrEqual(20);
    expect(terms).toContain('payroll');
    expect(terms).not.toContain('dental');
  });
});

describe('lifted prose is not a keyword', () => {
  it('rejects experience wording with an article, and preference wording', () => {
    for (const term of [
      'experience at a competitor',
      'worked at a startup',
      'experience in a fast-paced environment',
      'preferably a degree',
      'Kubernetes is a plus',
      'SaaS experience preferred',
    ]) {
      expect(isLiftedProse(term)).toBe(true);
    }
  });

  it('never filters a gerund skill, a long certification or plain experience wording', () => {
    for (const term of [
      'Machine Learning', 'Deep Learning', 'Data Engineering', 'Data Modelling',
      'Software Engineering', 'Natural Language Processing', 'Automated Testing',
      'Unit Testing', 'Shell Scripting', 'Monitoring', 'Forecasting', 'Spring Boot',
      'AWS Certified Solutions Architect Associate', 'Managing a Team',
      'experience with Python', 'working knowledge of SQL',
    ]) {
      expect(isLiftedProse(term)).toBe(false);
    }
  });

  it('returns the skill inside the sentence, or nothing', () => {
    expect(salvageRequirement('Kubernetes is a plus')).toBe('Kubernetes');
    expect(salvageRequirement('SaaS experience preferred')).toBe('SaaS');
    expect(salvageRequirement('building for internal users')).toBe('Internal Tools');
    expect(salvageRequirement('experience with Terraform')).toBe('Terraform');
    expect(salvageRequirement('experience at a competitor')).toBe(null);
    expect(salvageRequirement('experience in a fast-paced environment')).toBe(null);
    expect(salvageRequirement('worked at a startup')).toBe(null);
  });

  it('keeps real requirements, including the as-a-service family', () => {
    for (const term of ['reliability', 'observability', 'stakeholder management', 'decision making', 'operational efficiency', 'customer success', 'Internal Tools', 'Infrastructure as a Service', 'Platform as a Service', 'software as a service']) {
      expect(isLiftedProse(term)).toBe(false);
    }
  });

  it('drops lifted prose from the requirement list and salvages the skill', () => {
    const { terms } = buildRequirementList(
      ['Kubernetes is a plus', 'experience at a competitor', 'building for internal users', 'Terraform', 'observability'],
      ['Meta'],
      'Platform Engineer',
    );
    expect(terms).toContain('Kubernetes');
    expect(terms).toContain('Internal Tools');
    expect(terms).toContain('observability');
    expect(terms.some((t) => t.toLowerCase().includes('competitor'))).toBe(false);
  });
});

describe("the posting's own shorthand is returned, not a long form", () => {
  it('keeps Postgres and K8s exactly as the posting wrote them', () => {
    const { terms } = buildRequirementList(['Postgres', 'K8s'], [], '');
    expect(terms).toEqual(['Postgres', 'K8s']);
  });

  it('still keeps the long forms when the posting uses those instead', () => {
    const { terms } = buildRequirementList(['PostgreSQL', 'Kubernetes'], [], '');
    expect(terms).toEqual(['PostgreSQL', 'Kubernetes']);
  });

  it('keeps short compliance acronyms on a fintech posting', () => {
    const { terms } = buildRequirementList(
      ['KYC', 'AML', 'sanctions screening', 'transaction monitoring', 'Python'],
      ['Mercury'],
      'Compliance Analyst',
    );
    expect(terms).toContain('KYC');
    expect(terms).toContain('AML');
  });
});

describe('recognised names survive, lifted fragments do not', () => {
  it('keeps the five names that collide with an article/pronoun rule', () => {
    const names = [
      'Infrastructure as Code',
      'Software as a Service',
      'Know Your Customer',
      'A/B Testing',
      'Managing a Team',
    ];
    for (const name of names) {
      expect(isLiftedProse(name)).toBe(false);
      const { terms } = buildRequirementList([name], [], '');
      expect(terms.length).toBe(1);
    }
  });

  it('still drops fragments lifted out of a paragraph', () => {
    for (const frag of ['experience with a modern stack', 'you will be working with']) {
      const { terms } = buildRequirementList([frag], [], '');
      expect(terms.some((t) => t.toLowerCase() === frag)).toBe(false);
    }
  });
});

describe('acronym case is never altered', () => {
  it('returns each case-locked acronym exactly', () => {
    const locked = ['AI','ML','NLP','LLM','SQL','HTML','CSS','JSON','XML','YAML','AWS','GCP','EKS','ECS','RDS','SRE','SLO','SLA','ETL','ELT','KPI','QA','UX','CI/CD','REST','SAP','HRIS','AML','KYC','GTM','OKR','P&L','STR','SOP','ADP','PHP','C','C#','C++','R','JS','TS','IT'];
    const { terms } = buildRequirementList(locked, [], '');
    for (const acronym of locked) expect(terms).toContain(acronym);
  });

  it('never lowercases IT and never strips punctuation from P&L, C# or C++', () => {
    const { terms } = buildRequirementList(['it', 'p&l', 'c#', 'c++'], [], '');
    expect(terms).toEqual(['IT', 'P&L', 'C#', 'C++']);
  });
});
