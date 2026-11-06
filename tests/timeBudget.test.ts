import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { HARD_LIMIT_MS, keepAliveBody, overBudget, remainingMs, wantsKeepAlive } from '../supabase/functions/_shared/timeBudget';

// "Request idle timeout limit (150s) reached" (Grafana Labs, 6 Nov).
describe('the tailoring run keeps to its time', () => {
  it('an optional pass is skipped once the run is late', () => {
    expect(overBudget(0, 80_000, 95_000)).toBe(false);
    expect(overBudget(0, 96_000, 95_000)).toBe(true);
  });
  it('an optional call is cut before the hard limit, never below the floor', () => {
    expect(remainingMs(0, 100_000)).toBe(HARD_LIMIT_MS - 100_000);
    expect(remainingMs(0, 139_000)).toBe(5_000);
  });
  it('keep-alive is only for callers that ask', () => {
    expect(wantsKeepAlive('https://x.supabase.co/functions/v1/tailor-application?keepalive=1')).toBe(true);
    expect(wantsKeepAlive('https://x.supabase.co/functions/v1/tailor-application')).toBe(false);
  });
  it('a keep-alive error arrives in the body with its status', () => {
    expect(JSON.parse(keepAliveBody(false, 401, '{"error":"Please log in to continue"}'))).toEqual({ error: 'Please log in to continue', status: 401 });
    expect(keepAliveBody(true, 200, '{"tailoredResume":"x"}')).toBe('{"tailoredResume":"x"}');
    expect(JSON.parse('   \n ' + keepAliveBody(true, 200, '{"a":1}'))).toEqual({ a: 1 });
  });
  it('every optional AI pass goes through the budget; the main call does not', () => {
    const src = readFileSync(new URL('../supabase/functions/tailor-application/index.ts', import.meta.url), 'utf8');
    expect((src.match(/await budgetFetch\(/g) || []).length).toBe(7);
    expect(src).toContain('response = await fetch(apiConfig.endpoint, {');
    expect(src).toContain('if (req.method === "OPTIONS" || !wantsKeepAlive(req.url)) return handleTailor(req);');
  });
});
