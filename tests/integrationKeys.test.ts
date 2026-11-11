import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { connectionLine, keyEnding, keyEndings, NOT_CONNECTED } from '../src/lib/integrationKeys';

const sql = readFileSync(new URL('../drizzle/migrations/0002_user_integration_keys.sql', import.meta.url), 'utf8');
const policies = [...sql.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);

describe('user_integration_keys: each user sees only their own keys', () => {
  it('row level security is on and forced', () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/force row level security/i);
  });

  it('has four policies, all for signed-in users and all limited to their own rows', () => {
    expect(policies.length).toBe(4);
    for (const p of policies) {
      expect(p).toMatch(/to authenticated/i);
      expect(p).toMatch(/auth\.uid\(\) = user_id/);
      expect(p).not.toMatch(/\banon\b/i);
      expect(p).not.toMatch(/using \(true\)/i);
    }
  });

  it('signed-out requests get no access to the table', () => {
    expect(sql).toMatch(/revoke all on public\.user_integration_keys from anon/i);
    expect(sql).not.toMatch(/grant[^;]*to anon/i);
  });

  it('only accepts LeadOcean and Flow keys', () => {
    expect(sql).toMatch(/provider in \('leadocean', 'flow'\)/);
  });
});

describe('Settings never shows a full key', () => {
  const key = 'lo_live_0123456789abcdefab12';

  it('shows only the last four characters', () => {
    expect(keyEnding(key)).toBe('ab12');
    expect(connectionLine(keyEnding(key))).toBe('Connected (ends in ab12)');
    expect(connectionLine(keyEnding(key))).not.toContain('lo_live_');
  });

  it('a missing or too-short key reads as not connected', () => {
    expect(connectionLine(keyEnding(''))).toBe(NOT_CONNECTED);
    expect(connectionLine(keyEnding('short'))).toBe(NOT_CONNECTED);
    expect(NOT_CONNECTED).toBe("Not connected: add the key in the extension's Settings");
  });

  it('reduces table rows to endings and ignores unknown providers', () => {
    const out = keyEndings([
      { provider: 'leadocean', api_key: key },
      { provider: 'flow', api_key: 'flow_live_zzzzzzzzzzzzzzzzcd34' },
      { provider: 'other', api_key: 'x'.repeat(30) },
    ]);
    expect(out).toEqual({ leadocean: 'ab12', flow: 'cd34' });
    expect(JSON.stringify(out)).not.toContain('lo_live_');
  });
});
