import { describe, expect, it } from 'bun:test';
import {
  isEquipment,
  removeYearsClaims,
  sanitiseDocument,
  sanitiseLanguageProficiency,
  stripEquipmentFromSkillsLine,
} from '../supabase/functions/_shared/truthfulness.ts';

describe('language proficiency', () => {
  it('states fluency instead of nativeness', () => {
    expect(sanitiseLanguageProficiency('English (native speaker), French (fluent)')).toBe(
      'English (fluent), French (fluent)',
    );
    expect(sanitiseLanguageProficiency('Igbo: mother tongue')).toBe('Igbo: fluent');
    expect(sanitiseLanguageProficiency('Native proficiency in Spanish')).toBe('fluent in Spanish');
  });

  it('leaves a right-to-work statement alone', () => {
    expect(sanitiseLanguageProficiency('EU Citizen, eligible to work in Ireland')).toBe(
      'EU Citizen, eligible to work in Ireland',
    );
  });
});

describe('years of experience', () => {
  it('drops a sentence offering years as a qualification', () => {
    const { text, removed } = removeYearsClaims(
      'Eight years of software engineering meets your 1+ years of hospitality operations requirement. Delivered the rota tool.',
    );
    expect(text).toBe('Delivered the rota tool.');
    expect(removed.length).toBe(1);
  });

  it('keeps a dated achievement that is not a years claim', () => {
    const line = 'Cut month-end close from nine working days to three in 2023.';
    expect(removeYearsClaims(line).text).toBe(line);
  });
});

describe('equipment is not a capability', () => {
  it('recognises conditions in a room', () => {
    for (const term of ['internet', 'wifi', 'Laptop', 'webcam', 'headset', 'workspace', 'transportation']) {
      expect(isEquipment(term)).toBe(true);
    }
    for (const term of ['Python', 'stakeholder management', 'Kubernetes']) {
      expect(isEquipment(term)).toBe(false);
    }
  });

  it('removes equipment from a labelled skills line and keeps the rest', () => {
    expect(stripEquipmentFromSkillsLine('Programming: Python, laptop, SQL, wifi')).toBe(
      'Programming: Python, SQL',
    );
  });

  it('applies every rule across a document', () => {
    const doc = [
      'TECHNICAL SKILLS',
      'Programming: Python, SQL, webcam',
      'Languages: English (native speaker)',
      '',
      'Seven years of data engineering covers your 2 years of nursing requirement.',
    ].join('\n');
    const out = sanitiseDocument(doc);
    expect(out.text).toContain('Programming: Python, SQL');
    expect(out.text).not.toContain('webcam');
    expect(out.text).toContain('English (fluent)');
    expect(out.removedYearsClaims.length).toBe(1);
  });
});
