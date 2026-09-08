import { describe, expect, it } from 'bun:test';
import { coverageLabel, measureCoverage, termAppearsIn } from '../src/lib/keywordCoverage';
import { documentVersion } from '../src/lib/documentExport';

describe('keyword coverage', () => {
  it('reports 8 of 19 as 42%', () => {
    const terms = 'a b c d e f g h i j k l m n o p q r s'.split(' ');
    const result = measureCoverage('a b c d e f g h', terms);
    expect(result.matched.length).toBe(8);
    expect(result.percent).toBe(42);
    expect(coverageLabel(result, terms.length)).toBe('8 of 19 keywords (42%)');
  });

  it('is unmeasured when the posting yields no keywords', () => {
    const result = measureCoverage('any document text', []);
    expect(result.percent).toBeNull();
    expect(coverageLabel(result, 0)).toBe('Keyword coverage not measured for this posting');
  });

  it('never lets an unrelated partial word count', () => {
    expect(termAppearsIn('Built a JavaScript front end', 'Java')).toBe(false);
    expect(termAppearsIn('Reactive streams with Kafka', 'React')).toBe(false);
    expect(termAppearsIn('Managed the scala matrix', 'Scala')).toBe(true);
  });

  it('preserves C++, C#, .NET, CI/CD and Node.js', () => {
    const cv = 'Wrote C++ and C# services, deployed .NET APIs through CI/CD, plus Node.js tooling.';
    for (const term of ['C++', 'C#', '.NET', 'CI/CD', 'Node.js']) {
      expect(termAppearsIn(cv, term)).toBe(true);
    }
    expect(termAppearsIn('Only C code here', 'C++')).toBe(false);
  });

  it('treats spaces, hyphens and slashes as the same separator', () => {
    expect(termAppearsIn('experience with machine-learning models', 'machine learning')).toBe(true);
    expect(termAppearsIn('CI-CD pipelines', 'CI/CD')).toBe(true);
  });

  it('counts each term once however often it appears', () => {
    const result = measureCoverage('Python Python Python SQL', ['Python', 'SQL', 'Go']);
    expect(result.matched).toEqual(['Python', 'SQL']);
    expect(result.percent).toBe(67);
  });
});

describe('document versions', () => {
  it('changes when the reviewed text changes', () => {
    const a = documentVersion('CV text', 'Data Engineer', 'Stripe');
    expect(documentVersion('CV text', 'Data Engineer', 'Stripe')).toBe(a);
    expect(documentVersion('CV text edited', 'Data Engineer', 'Stripe')).not.toBe(a);
  });

  it('changes when the job changes', () => {
    const a = documentVersion('CV text', 'Data Engineer', 'Stripe');
    expect(documentVersion('CV text', 'Data Engineer', 'Revolut')).not.toBe(a);
    expect(documentVersion('CV text', 'Analytics Engineer', 'Stripe')).not.toBe(a);
  });
});
