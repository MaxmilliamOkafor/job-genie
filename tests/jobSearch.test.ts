import { describe, expect, it } from 'bun:test';
import {
  expandQuery,
  synonymsUsed,
  locationTerms,
  tidyLocation,
  postedHours,
  isStrictWindow,
  activeFilterCount,
  eligibilityNotes,
  skillOverlap,
  providerLabel,
  DEFAULT_FILTERS,
} from '../src/lib/jobSearch';

describe('query expansion', () => {
  it('keeps the typed phrase and adds known synonyms', () => {
    const terms = expandQuery('data engineer');
    expect(terms[0]).toBe('data engineer');
    expect(terms.length).toBeGreaterThan(1);
  });

  it('returns nothing for an empty query', () => {
    expect(expandQuery('   ')).toEqual([]);
    expect(synonymsUsed('')).toEqual([]);
  });

  it('never reports the typed phrase as a synonym', () => {
    expect(synonymsUsed('data engineer')).not.toContain('data engineer');
  });
});

describe('location handling', () => {
  it('drops nearby areas unless asked for', () => {
    const narrow = locationTerms('Dublin', false);
    const wide = locationTerms('Dublin', true);
    expect(narrow).toEqual(['dublin']);
    expect(wide.length).toBeGreaterThan(narrow.length);
  });


  it('collapses repeated location components', () => {
    expect(tidyLocation('Dublin, Dublin, Ireland')).toBe('Dublin, Ireland');
    expect(tidyLocation('Dublin, IE, Dublin')).toBe('Dublin, IE');
  });

  it('says so plainly when there is no location', () => {
    expect(tidyLocation(null)).toBe('Location not stated');
    expect(tidyLocation('  ')).toBe('Location not stated');
  });
});

describe('freshness windows', () => {
  it('maps ranges to hours and any time to no limit', () => {
    expect(postedHours('24h')).toBe(24);
    expect(postedHours('7d')).toBe(168);
    expect(postedHours('any')).toBeNull();
  });

  it('treats short windows as strict about real posting dates', () => {
    expect(isStrictWindow('24h')).toBe(true);
    expect(isStrictWindow('any')).toBe(false);
  });
});

describe('filter counting', () => {
  it('counts nothing on a fresh search', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  it('counts each narrowing choice once', () => {
    expect(
      activeFilterCount({
        ...DEFAULT_FILTERS,
        company: 'Stripe',
        skills: ['Python', 'SQL'],
        workplace: ['Remote'],
      }),
    ).toBe(4);
  });
});

describe('eligibility notes', () => {
  it('reports stated requirements and leaves the rest unknown', () => {
    const notes = eligibilityNotes('Applicants must have the right to work in Ireland. Security clearance required.');
    expect(notes.some((n) => n.kind === 'requirement')).toBe(true);
  });

  it('never infers authorisation from silence', () => {
    const notes = eligibilityNotes('We are hiring a data engineer in Dublin.');
    expect(notes.every((n) => n.kind === 'unknown')).toBe(true);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('has nothing to say without a description', () => {
    const notes = eligibilityNotes(null);
    expect(notes.every((n) => n.kind === 'unknown')).toBe(true);
  });
});

describe('skill overlap', () => {
  it('matches whole terms only', () => {
    const result = skillOverlap('We use Java and Spring Boot daily.', 'Backend Engineer', ['Java', 'JavaScript']);
    expect(result.matched).toContain('Java');
    expect(result.matched).not.toContain('JavaScript');
  });

  it('preserves punctuated technology names', () => {
    const result = skillOverlap('Stack is C++, C# and .NET 8.', 'Engineer', ['C++', 'C#', '.NET', 'Net']);
    expect(result.matched).toContain('C++');
    expect(result.matched).toContain('C#');
    expect(result.matched).toContain('.NET');
  });

  it('is unmeasurable with no description or no saved skills', () => {
    expect(skillOverlap(null, 'Engineer', ['Java']).measurable).toBe(false);
    expect(skillOverlap('Java role', 'Engineer', []).measurable).toBe(false);
  });

  it('reports zero matches as zero, not as unmeasured', () => {
    const result = skillOverlap('A marketing role writing copy.', 'Copywriter', ['Kubernetes']);
    expect(result.measurable).toBe(true);
    expect(result.matched.length).toBe(0);
    expect(result.missing).toContain('Kubernetes');
  });
});

describe('provider labels', () => {
  it('never shows a raw provider key', () => {
    expect(providerLabel('greenhouse')).not.toBe('greenhouse');
    expect(providerLabel('unknown_provider')).toBeTruthy();
  });
});
