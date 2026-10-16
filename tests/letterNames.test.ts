import { describe, expect, it } from 'bun:test';
import { factFromPosting, composeOpening, rankLines, dedupeSentences } from '../supabase/functions/tailor-application/letterSlots';

describe('cover letter names, openings and sales ranking', () => {
  it('drops the legal suffix from the company fact', () => {
    const f = factFromPosting('NextRoll Inc. sells the AdRoll platform to advertisers and agencies across CTV and display.', 'NextRoll');
    expect(f.startsWith('NextRoll sells the AdRoll platform')).toBe(true);
    expect(f).not.toContain('Inc.');
  });

  it('states the problem once in the opening', () => {
    const problem = 'The internal campaign diagnostics tool had been slow enough that sales engineers raised tickets rather than use it.';
    const line = 'Rewrote the internal campaign diagnostics tool in React, TypeScript and GraphQL. It had been slow enough that sales engineers raised tickets rather than use it and the rewrite cleared most of that queue.';
    const p1 = dedupeSentences(`${composeOpening({ problem, line }, 'Meta')} That is what drew me to the role at NextRoll.`);
    expect(p1.split('slow enough that sales engineers raised tickets').length - 1).toBe(1);
  });

  it('ranks pre-sales work first for an account executive role', () => {
    const bullets = [
      { n: 1, company: 'Meta', text: 'Rewrote the internal campaign diagnostics tool in React and TypeScript' },
      { n: 2, company: 'Accenture', text: 'Acted as technical lead on five pre-sales bids, presenting proposed solutions to client CTOs, contributing to engagements worth £3.2m' },
    ];
    const r = rankLines(bullets, [], '', '', 'Sr. Strategic Account Executive');
    expect(r[0].n).toBe(2);
  });
});
