import { describe, expect, it } from 'bun:test';
import { BANNED_PHRASES, humanWordingBlock } from '../supabase/functions/tailor-application/guards.ts';

describe('human wording rules', () => {
  it('bans the new machine-sounding phrases', () => {
    for (const p of ['garnered', 'testament to', 'commitment to excellence']) expect(BANNED_PHRASES).toContain(p);
  });
  it('includes the contrast, -ing ending and list rules', () => {
    const block = humanWordingBlock(['Python']);
    expect(block).toContain('No "not X, but Y"');
    expect(block).toContain('vague "-ing" phrase');
    expect(block).toContain('at most two "X, Y and Z" lists');
  });
  it('never bans a job keyword', () => {
    const banList = humanWordingBlock(['holistic']).split('\n')[1];
    expect(banList).not.toContain('"holistic"');
    expect(humanWordingBlock(['Python']).split('\n')[1]).toContain('"holistic"');
  });
});
