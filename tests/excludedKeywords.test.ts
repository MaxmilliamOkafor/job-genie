import { describe, expect, it } from 'bun:test';
import {
  applyExclusions,
  canonicalKey,
  isExcluded,
  newExclusion,
  parseExcludedKeywords,
  removeExclusion,
} from '../src/lib/excludedKeywords';
import { measureCoverage } from '../src/lib/keywordCoverage';

describe('excluded keywords', () => {
  it('keeps stored entries exactly as written, order included', () => {
    const stored = [
      { id: 'kubernetes', term: 'Kubernetes', covers: ['K8s'], at: '2026-01-01T00:00:00.000Z' },
      { id: 'kubernetes', term: 'kubernetes', covers: [], at: '2026-02-01T00:00:00.000Z' },
      { id: 'made-up-key-from-extension', term: 'Terraform', covers: [], at: '2026-03-01T00:00:00.000Z' },
    ];
    const parsed = parseExcludedKeywords(stored);
    expect(parsed.length).toBe(3);
    expect(parsed.map((e) => e.term)).toEqual(['Kubernetes', 'kubernetes', 'Terraform']);
    expect(parsed[2].id).toBe('made-up-key-from-extension');
  });

  it('excludes the term and everything in its synonym group', () => {
    const list = [newExclusion('Kubernetes', ['K8s', 'container orchestration'])];
    expect(isExcluded('k8s', list)).toBe(true);
    expect(isExcluded('Container Orchestration', list)).toBe(true);
    expect(isExcluded('Docker', list)).toBe(false);
  });

  it('removes excluded requirements before coverage is measured', () => {
    const terms = ['Python', 'Kubernetes', 'SQL'];
    const list = [newExclusion('Kubernetes', ['K8s'])];
    const inPlay = applyExclusions(terms, list);
    expect(inPlay).toEqual(['Python', 'SQL']);
    expect(measureCoverage('Python and SQL', inPlay).percent).toBe(100);
  });

  it('removes a single entry without touching its duplicates or the order', () => {
    const a = { id: 'sql', term: 'SQL', covers: [], at: '2026-01-01T00:00:00.000Z' };
    const b = { id: 'sql', term: 'SQL', covers: [], at: '2026-02-01T00:00:00.000Z' };
    const c = { id: 'go', term: 'Go', covers: [], at: '2026-03-01T00:00:00.000Z' };
    expect(removeExclusion([a, b, c], b)).toEqual([a, c]);
  });

  it('builds a canonical key without rewriting the term', () => {
    expect(canonicalKey('Machine Learning')).toBe('machine-learning');
    expect(newExclusion('  Machine Learning  ').term).toBe('Machine Learning');
  });
});
