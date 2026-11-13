import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  CONCURRENCY,
  FAILURE_BREAKER,
  LEASE_MINUTES,
  POSTINGS_BUDGET,
  PROVIDERS,
  RUN_BUDGET_MS,
  SOURCES_PER_RUN,
  leaseDecision,
  leaseFreeFilter,
  runPool,
  type PoolJob,
  type SourceRow,
} from './feed.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JOB_NAME = 'ingest-jobs';
const UPSERT_CHUNK = 250;

async function getJson(url: string, timeoutMs = 20_000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'JobGenie/1.0 (+job feed)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

  const startedAt = Date.now();
  const now = new Date(startedAt);
  let force = false;
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch {
      // no body is fine
    }
  }

  // 1. Paused guard + single-flight lease. Runs never overlap: taking the
  // lease is one conditional update, so two runs cannot both win it, and a
  // forced "Refresh now" waits for a run in progress rather than racing it.
  const { data: state } = await supabase
    .from('ingest_state')
    .select('status, lease_until, last_error')
    .eq('job_name', JOB_NAME)
    .maybeSingle();

  const decision = leaseDecision(state, now, force);
  if (decision === 'paused') return json({ skipped: true, reason: 'paused', last_error: state?.last_error ?? null });
  if (decision === 'busy') return json({ skipped: true, reason: 'running', message: 'A refresh is already running.' });

  const leaseUntil = new Date(startedAt + LEASE_MINUTES * 60_000).toISOString();
  const { data: took, error: leaseError } = await supabase
    .from('ingest_state')
    .update({ status: 'running', lease_until: leaseUntil, updated_at: now.toISOString() })
    .eq('job_name', JOB_NAME)
    .or(leaseFreeFilter(now))
    .select('job_name');
  if (leaseError) return json({ error: 'Could not acquire lease', details: leaseError.message }, 500);
  if (!took?.length) return json({ skipped: true, reason: 'running', message: 'A refresh is already running.' });

  try {
    // 2. The least recently fetched enabled sources.
    // A manual refresh ignores the failure breaker so the user can see the real error.
    let sourceQuery = supabase
      .from('job_sources')
      .select('id, provider, company_name, board_token')
      .eq('enabled', true)
      .order('last_fetched_at', { ascending: true, nullsFirst: true })
      .limit(SOURCES_PER_RUN);
    if (!force) sourceQuery = sourceQuery.lt('consecutive_failures', FAILURE_BREAKER);

    const { data: sources, error: sourcesError } = await sourceQuery;
    if (sourcesError) throw new Error(sourcesError.message);

    let inserted = 0;
    let seen = 0;
    let failed = 0;
    let delisted = 0;
    const errors: string[] = [];

    const canStart = () => Date.now() - startedAt < RUN_BUDGET_MS && seen < POSTINGS_BUDGET;

    const pollSource = async (source: SourceRow) => {
      const handler = PROVIDERS[source.provider];
      const stamp = new Date().toISOString();
      if (!handler) {
        await supabase
          .from('job_sources')
          .update({ last_fetched_at: stamp, last_error: 'unknown provider' })
          .eq('id', source.id);
        return;
      }

      try {
        const { jobs, truncated } = await handler(source, getJson);
        seen += jobs.length;

        // Upsert keeps a vacancy's discovery time while refreshing what the feed says.
        for (let i = 0; i < jobs.length; i += UPSERT_CHUNK) {
          const chunk: PoolJob[] = jobs.slice(i, i + UPSERT_CHUNK);
          const { data: upserted, error: upsertError } = await supabase
            .from('job_pool')
            .upsert(chunk, { onConflict: 'provider,external_id' })
            .select('first_seen_at');
          if (upsertError) throw new Error(upsertError.message);
          inserted += (upserted ?? []).filter(
            (r: { first_seen_at: string }) => new Date(r.first_seen_at).getTime() >= startedAt - 1_000,
          ).length;
        }

        // 2b. Delisting: a vacancy the employer's own feed no longer lists is closed.
        // Only when we saw the whole board: anything this fetch did not touch is gone.
        if (!truncated) {
          const { data: gone } = await supabase
            .from('job_pool')
            .update({
              link_status: 'closed',
              link_note: 'No longer listed on the employer career feed',
              link_checked_at: new Date().toISOString(),
            })
            .eq('source_id', source.id)
            .in('link_status', ['active', 'unverified', 'redirected'])
            .or(`last_seen_in_feed_at.is.null,last_seen_in_feed_at.lt.${stamp}`)
            .select('id');
          delisted += gone?.length ?? 0;
        }

        await supabase
          .from('job_sources')
          .update({
            last_fetched_at: stamp,
            last_success_at: stamp,
            consecutive_failures: 0,
            last_error: null,
          })
          .eq('id', source.id);
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : 'unknown error';
        errors.push(`${source.provider}/${source.board_token}: ${message}`);
        console.error(`ingest-jobs: ${source.provider}/${source.board_token} failed`, message);
        const { data: current } = await supabase
          .from('job_sources')
          .select('consecutive_failures')
          .eq('id', source.id)
          .maybeSingle();
        await supabase
          .from('job_sources')
          .update({
            last_fetched_at: stamp,
            last_error: message.slice(0, 300),
            consecutive_failures: (current?.consecutive_failures ?? 0) + 1,
          })
          .eq('id', source.id);
      }
    };

    // Six sources at a time; no new source starts once the run's budget is spent.
    const { started } = await runPool((sources ?? []) as SourceRow[], CONCURRENCY, pollSource, canStart);

    // 3. Re-pick the preferred copy of each duplicate group.
    await supabase.rpc('job_pool_mark_canonical');

    // 4. Circuit breaker: every source in the batch failed, park the job.
    const everythingFailed = started > 0 && failed === started;
    const stats = {
      sources_polled: started,
      sources_due: sources?.length ?? 0,
      jobs_seen: seen,
      jobs_inserted: inserted,
      jobs_delisted: delisted,
      sources_failed: failed,
      run_ms: Date.now() - startedAt,
    };

    await supabase
      .from('ingest_state')
      .update({
        status: everythingFailed ? 'paused' : 'idle',
        lease_until: null,
        last_run_at: new Date().toISOString(),
        last_error: errors.length ? errors.slice(0, 5).join(' | ').slice(0, 1000) : null,
        stats,
        updated_at: new Date().toISOString(),
      })
      .eq('job_name', JOB_NAME);

    console.log('ingest-jobs run complete', JSON.stringify(stats));
    return json({ success: true, ...stats, paused: everythingFailed, errors: errors.slice(0, 5) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('ingest-jobs fatal', message);
    await supabase
      .from('ingest_state')
      .update({
        status: 'idle',
        lease_until: null,
        last_error: message.slice(0, 1000),
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('job_name', JOB_NAME);
    return json({ error: 'Ingest failed', details: message }, 500);
  }
});
