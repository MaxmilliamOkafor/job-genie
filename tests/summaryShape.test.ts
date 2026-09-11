import { describe, expect, it } from 'bun:test';
import {
  buildSummary,
  enforceSummaryShape,
  evidencedRequirements,
  findViolations,
  pickHeldTitle,
  pickOutcomes,
  rankOutcome,
  shortenClause,
  isGrammaticalOutcome,
  type SummaryContext,
} from '../supabase/functions/_shared/summaryShape.ts';

const BULLETS = [
  '- Rebuilt a credit risk reporting suite for a GBP 2.6bn portfolio, covering regulatory reporting for three desks',
  '- Cut month-end close from nine working days to three through process improvement with the finance team',
  '- Ran stakeholder management across four business units, presenting to the risk committee monthly',
  '- Maintained documentation for the reporting platform',
];

const CTX: SummaryContext = {
  heldTitles: ['Solutions Architect', 'Software Engineer', 'Data Analyst', 'AI Product Manager'],
  targetTitle: 'Solutions Architect, Risk',
  requirements: ['regulatory reporting', 'process improvement', 'stakeholder management', 'Kubernetes'],
  experienceBullets: BULLETS,
  employers: ['Meta', 'Accenture', 'Citigroup'],
  places: ['Dublin', 'Ireland', 'London'],
};

describe('held title selection', () => {
  it('picks the held title closest to the posting and never the posting title', () => {
    expect(pickHeldTitle(CTX.heldTitles, CTX.targetTitle)).toBe('Solutions Architect');
    expect(pickHeldTitle(['Software Engineer', 'Data Analyst'], 'Manager, Payroll Operations')).toBe(
      'Software Engineer',
    );
  });

  it('ignores generic rank words and falls back to the current role without distinctive overlap', () => {
    expect(pickHeldTitle(['AI Product Manager', 'Solutions Architect'], 'Manager, Payroll Operations', 'AI Product Manager')).toBe('AI Product Manager');
    expect(pickHeldTitle(['Senior Analyst', 'Data Engineer'], 'Senior Data Platform Lead', 'Senior Analyst')).toBe('Data Engineer');
  });
});

describe('scope clause', () => {
  it('only counts requirements the experience bullets evidence', () => {
    const terms = evidencedRequirements(CTX.requirements, BULLETS);
    expect(terms).toEqual(['regulatory reporting', 'process improvement', 'stakeholder management']);
    expect(terms).not.toContain('Kubernetes');
  });

  it('omits the clause entirely when fewer than two requirements qualify', () => {
    const summary = buildSummary({ ...CTX, requirements: ['regulatory reporting', 'Kubernetes'] });
    expect(summary).not.toContain('working across');
    expect(summary.startsWith('Solutions Architect.')).toBe(true);
  });
});

describe('outcomes', () => {
  it('ranks a before-and-after above a magnitude, a percentage and a count', () => {
    expect(rankOutcome('cut close from nine working days to three')).toBe(4);
    expect(rankOutcome('portfolio of GBP 2.6bn')).toBe(3);
    expect(rankOutcome('improved accuracy by 30%')).toBe(2);
    expect(rankOutcome('owned 47 services')).toBe(1);
    expect(rankOutcome('maintained the documentation')).toBe(0);
  });

  it('takes two outcomes and keeps their figures verbatim', () => {
    const outcomes = pickOutcomes(BULLETS);
    expect(outcomes.length).toBe(2);
    expect(outcomes[0]).toContain('nine working days to three');
    expect(outcomes.join(' ')).toContain('GBP 2.6bn');
  });
});

describe('the required shape', () => {
  const built = buildSummary(CTX);

  it('is two sentences within 150 to 220 characters with a semicolon between the outcomes', () => {
    expect(built.length).toBeGreaterThanOrEqual(150);
    expect(built.length).toBeLessThanOrEqual(220);
    expect(built.split(/(?<!\d)\.(?!\d)/).filter((s) => s.trim()).length).toBe(2);
    expect(built.split('.')[1]).toContain(';');
  });

  it('names no employer, no place, no total years and no self-describing adjective', () => {
    for (const banned of ['Meta', 'Accenture', 'Citigroup', 'Dublin', 'London', 'years', 'strong background']) {
      expect(built.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });

  it('passes its own validator', () => {
    expect(findViolations(built, CTX)).toEqual([]);
  });
});

describe('enforcement of a bad live summary', () => {
  const BAD =
    'Manager of Payroll Operations with a strong background in team leadership and operational excellence, ensuring compliance and accuracy in payroll delivery across multi-country environments.';

  it('flags the unheld title and the unverifiable phrasing', () => {
    const violations = findViolations(BAD, CTX);
    expect(violations.some((v) => v.includes('not a held job title'))).toBe(true);
    expect(violations.some((v) => v.includes('strong background'))).toBe(true);
    expect(violations.some((v) => v.includes('operational excellence'))).toBe(true);
    expect(violations.some((v) => v.includes('fewer than two figures'))).toBe(true);
  });

  it('replaces it with the required shape', () => {
    const decision = enforceSummaryShape(BAD, CTX);
    expect(decision.rebuilt).toBe(true);
    expect(decision.summary.startsWith('Solutions Architect')).toBe(true);
    expect(findViolations(decision.summary, CTX)).toEqual([]);
  });

  it('leaves a compliant summary untouched', () => {
    const good = buildSummary(CTX);
    const decision = enforceSummaryShape(good, CTX);
    expect(decision.rebuilt).toBe(false);
    expect(decision.summary).toBe(good);
  });

  it('rejects first person, total years and a place name', () => {
    expect(findViolations('My work as a Solutions Architect with nine years in Dublin.', CTX)).toEqual(
      expect.arrayContaining(['first person', 'total years of experience']),
    );
  });

  it('requires the held title to begin the opener and rejects noun-participle fragments', () => {
    const valid = buildSummary(CTX);
    expect(findViolations(`Evidence-led ${valid}`, CTX)).toContain('opener is not a held job title');
    expect(isGrammaticalOutcome('Impression reporting, cutting the overnight run from six hours to under one')).toBe(false);
    expect(isGrammaticalOutcome('Cut the overnight run from six hours to under one')).toBe(true);
  });
});

describe('long lead-in clauses', () => {
  const LONG_BULLETS = [
    '- Rebuilt the PySpark and Presto pipeline behind impression reporting, reducing the overnight run from six hours to under one, ensuring data readiness before the reporting team\'s deadline',
    '- Replaced a 40-tab Excel reporting pack with a Power BI and Tableau suite',
    '- Maintained documentation for the reporting platform',
  ];
  const LONG_CTX: SummaryContext = {
    heldTitles: ['AI Product Manager', 'Solutions Architect', 'Data Analyst'],
    targetTitle: 'Engineering Manager, International',
    requirements: ['Communication'],
    experienceBullets: LONG_BULLETS,
    employers: ['Meta'],
    places: ['Dublin'],
  };

  it('still lands within 150 to 220 characters when no comma prefix fits', () => {
    const built = buildSummary(LONG_CTX);
    expect(built.length).toBeGreaterThanOrEqual(150);
    expect(built.length).toBeLessThanOrEqual(220);
    expect(built).toContain('six hours to under one');
    expect(built).toContain('40-tab');
    expect(findViolations(built, LONG_CTX)).toEqual([]);
  });

  it('shortenClause falls back to a comma window that keeps the figure', () => {
    const clause =
      "Rebuilt the PySpark and Presto pipeline behind impression reporting, reducing the overnight run from six hours to under one, ensuring data readiness before the reporting team's deadline";
    const shortened = shortenClause(clause, 85);
    expect(shortened.length).toBeLessThanOrEqual(85);
    expect(shortened).toContain('six hours to under one');
  });
});

describe('a clause with no comma at all', () => {
  const CLAUSE =
    "Rebuilt the PySpark and Presto pipeline behind impression reporting reducing the overnight run from six hours to under one so the data is ready before the reporting team's deadline rather than after it";

  it('keeps the figure verbatim inside the budget', () => {
    const shortened = shortenClause(CLAUSE, 110);
    expect(shortened.length).toBeLessThanOrEqual(110);
    expect(shortened).toContain('six hours to under one');
  });

  it('opens on the verb, never on a noun fragment or a dangling word', () => {
    const shortened = shortenClause(CLAUSE, 110);
    expect(shortened.startsWith('reporting')).toBe(false);
    expect(/\s(and|with|to|the|of|so)$/i.test(shortened)).toBe(false);
  });
});
