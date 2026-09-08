import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JOB_NAME = 'verify-job-links';
const BATCH = 25;
const BODY_LIMIT = 220_000;
const FETCH_TIMEOUT_MS = 9_000;
const RECHECK_ACTIVE_HOURS = 24;
const LEASE_MINUTES = 4;

// Phrases employers and ATS platforms use when a requisition is no longer open.
const CLOSED_PHRASES = [
  'no longer accepting applications',
  'no longer available',
  'no longer accepting',
  'this job is closed',
  'job is closed',
  'position is closed',
  'position has been closed',
  'position has been filled',
  'this position has been filled',
  'requisition is closed',
  'requisition closed',
  'job posting has expired',
  'this posting has expired',
  'job has expired',
  'applications are closed',
  'we are no longer hiring for this role',
  'this role has been filled',
  'vacancy is closed',
  'job not found',
  'posting not found',
  'we could not find that job',
  'this job posting is no longer active',
];

// Pages that exist but are a board index / search page rather than the vacancy.
const BOARD_INDEX_HINTS = [
  'all jobs',
  'open positions',
  'current openings',
  'search jobs',
  'view all openings',
];

interface PoolRow {
  id: string;
  title: string;
  company: string;
  url: string;
  description: string | null;
  requisition_id: string | null;
  link_status: string;
}

interface Verdict {
  link_status: 'active' | 'closed' | 'removed' | 'redirected' | 'unverified';
  link_http_status: number | null;
  resolved_url: string | null;
  link_note: string | null;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

function titleTokens(title: string): string[] {
  return normalise(title)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3);
}

/** Does the fetched page actually describe this vacancy? */
function pageMatchesVacancy(body: string, row: PoolRow): boolean {
  const hay = normalise(body);
  if (row.requisition_id && row.requisition_id.length >= 4 && hay.includes(row.requisition_id)) {
    return true;
  }
  const tokens = titleTokens(row.title);
  if (!tokens.length) return false;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits / tokens.length >= 0.6;
}

function samePage(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.host.replace(/^www\./, '') === ub.host.replace(/^www\./, '') &&
      ua.pathname.replace(/\/+$/, '') === ub.pathname.replace(/\/+$/, '');
  } catch {
    return a === b;
  }
}

/** A redirect that lands on a board root or a generic search page is not the vacancy. */
function looksLikeIndex(finalUrl: string, body: string): boolean {
  let path = '';
  try {
    path = new URL(finalUrl).pathname.replace(/\/+$/, '');
  } catch {
    return false;
  }
  const shallow = path.split('/').filter(Boolean).length <= 2;
  if (!shallow) return false;
  const hay = normalise(body);
  return BOARD_INDEX_HINTS.some((h) => hay.includes(h));
}

async function checkOne(row: PoolRow): Promise<Verdict> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(row.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });

    const status = res.status;
    const finalUrl = res.url || row.url;

    if (status === 404 || status === 410) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return {
        link_status: 'removed',
        link_http_status: status,
        resolved_url: samePage(finalUrl, row.url) ? null : finalUrl,
        link_note: `Employer page returned ${status}`,
      };
    }

    // Blocked, throttled or provider trouble tells us nothing about the vacancy.
    if (status === 401 || status === 403 || status === 429 || status >= 500) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return {
        link_status: 'unverified',
        link_http_status: status,
        resolved_url: null,
        link_note:
          status === 429
            ? 'Career site rate-limited our check'
            : `Career site returned ${status}; could not confirm`,
      };
    }

    const raw = await res.text();
    const body = raw.length > BODY_LIMIT ? raw.slice(0, BODY_LIMIT) : raw;
    const hay = normalise(body);

    const closedPhrase = CLOSED_PHRASES.find((p) => hay.includes(p));
    if (closedPhrase) {
      return {
        link_status: 'closed',
        link_http_status: status,
        resolved_url: samePage(finalUrl, row.url) ? null : finalUrl,
        link_note: `Page says: "${closedPhrase}"`,
      };
    }

    const redirected = !samePage(finalUrl, row.url);

    if (redirected && looksLikeIndex(finalUrl, body)) {
      return {
        link_status: 'redirected',
        link_http_status: status,
        resolved_url: finalUrl,
        link_note: 'Link now lands on a jobs index, not this vacancy',
      };
    }

    if (pageMatchesVacancy(body, row)) {
      return {
        link_status: 'active',
        link_http_status: status,
        resolved_url: redirected ? finalUrl : null,
        link_note: redirected ? 'Employer moved the link; vacancy still open' : null,
      };
    }

    // The page loaded but we cannot prove it is this vacancy: say so, do not guess.
    return {
      link_status: 'unverified',
      link_http_status: status,
      resolved_url: redirected ? finalUrl : null,
      link_note: 'Page loaded but the vacancy could not be confirmed on it',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network error';
    return {
      link_status: 'unverified',
      link_http_status: null,
      resolved_url: null,
      link_note: message.includes('abort')
        ? 'Career site did not respond in time'
        : `Could not reach career site: ${message.slice(0, 120)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const now = new Date();

    // Single-flight lease so overlapping cron ticks do not double-check the same rows.
    const { data: state } = await supabase
      .from('ingest_state')
      .select('*')
      .eq('job_name', JOB_NAME)
      .maybeSingle();

    if (!state) {
      await supabase.from('ingest_state').insert({ job_name: JOB_NAME, status: 'idle' });
    } else if (state.status === 'paused') {
      return json({ skipped: true, reason: 'paused' });
    } else if (state.lease_until && new Date(state.lease_until) > now) {
      return json({ skipped: true, reason: 'another run holds the lease' });
    }

    const leaseUntil = new Date(now.getTime() + LEASE_MINUTES * 60_000).toISOString();
    await supabase
      .from('ingest_state')
      .update({ status: 'running', lease_until: leaseUntil, updated_at: now.toISOString() })
      .eq('job_name', JOB_NAME);

    const recheckBefore = new Date(now.getTime() - RECHECK_ACTIVE_HOURS * 3_600_000).toISOString();

    // Never checked first, then the stalest checks.
    const { data: rows, error } = await supabase
      .from('job_pool')
      .select('id, title, company, url, description, requisition_id, link_status')
      .eq('is_canonical', true)
      .neq('link_status', 'removed')
      .or(`link_checked_at.is.null,link_checked_at.lt.${recheckBefore}`)
      .order('link_checked_at', { ascending: true, nullsFirst: true })
      .limit(BATCH);

    if (error) throw new Error(error.message);

    const tally = { active: 0, closed: 0, removed: 0, redirected: 0, unverified: 0 };

    const verdicts = await Promise.all(
      ((rows ?? []) as PoolRow[]).map(async (row) => ({ row, verdict: await checkOne(row) })),
    );

    for (const { row, verdict } of verdicts) {
      tally[verdict.link_status]++;
      await supabase
        .from('job_pool')
        .update({
          link_status: verdict.link_status,
          link_http_status: verdict.link_http_status,
          resolved_url: verdict.resolved_url,
          link_note: verdict.link_note,
          link_checked_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }

    // Closing or removing a row can promote a duplicate that is still live.
    await supabase.rpc('job_pool_mark_canonical');

    const stats = { checked: verdicts.length, ...tally };

    await supabase
      .from('ingest_state')
      .update({
        status: 'idle',
        lease_until: null,
        last_run_at: new Date().toISOString(),
        last_error: null,
        stats,
        updated_at: new Date().toISOString(),
      })
      .eq('job_name', JOB_NAME);

    return json({ ok: true, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('verify-job-links failed:', message);
    await supabase
      .from('ingest_state')
      .update({
        status: 'idle',
        lease_until: null,
        last_error: message.slice(0, 400),
        updated_at: new Date().toISOString(),
      })
      .eq('job_name', JOB_NAME);
    return json({ error: 'Link verification failed', details: message }, 500);
  }
});
