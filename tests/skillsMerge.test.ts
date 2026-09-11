import { describe, expect, it } from 'bun:test';
import { mergeConcurrentSkills } from '../src/lib/skillsMerge.ts';

describe('concurrent profile skill saves', () => {
  it('keeps skills added remotely after the profile page loaded', () => {
    const baseline = ['Python', 'SQL'];
    const local = ['Python', 'SQL', 'Power BI'];
    const remote = ['Python', 'SQL', 'Kubernetes'];

    expect(mergeConcurrentSkills(baseline, local, remote)).toEqual([
      'Python',
      'SQL',
      'Power BI',
      'Kubernetes',
    ]);
  });

  it('does not restore a baseline skill deliberately removed on the page', () => {
    expect(mergeConcurrentSkills(['Python', 'SQL'], ['Python'], ['Python', 'SQL'])).toEqual(['Python']);
  });

  it('deduplicates concurrent additions by normalised skill name', () => {
    expect(mergeConcurrentSkills([], ['Power BI'], ['power-bi', 'Tableau'])).toEqual(['Power BI', 'Tableau']);
  });
});