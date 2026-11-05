/**
 * eurotoptech-jobs
 *
 * The signed-in member's Euro Top Tech job board, through the member API.
 * The key is the EUROTOPTECH_API_KEY secret: it never reaches the browser,
 * a log or a response. Only a signed-in user may call this, and the
 * listings come back to that user alone; nothing is stored here.
 *
 * Actions (request body): sync, list, job, apply, facets, me. "sync" keeps
 * up to 2,500 of the newest postings from the past 3 or 7 days in the
 * member's own ett_postings rows (deleted after 7 days). "apply" is called
 * only when the member presses Apply on one posting, because every call
 * counts against the account's daily apply limit.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { ETT_BASE, ETT_SYNC_CAP, cardOf, ettError, jobIdOf, jobsQuery, rowOf, safeApplyUrl, syncQuery } from '../_shared/euroTopTech.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const TIMEOUT_MS = 15000;

async function ett(path: string, key: string, accept = 'application/json') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ETT_BASE + path, {
      headers: { Authorization: 'Bearer ' + key, Accept: accept },
      redirect: 'manual',
      signal: controller.signal,
    });
    let body: any = null;
    try { body = await res.json(); } catch { body = null; }
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method', message: 'Use POST.' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'unauthorized', message: 'Not signed in' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) return json({ error: 'unauthorized', message: 'Not signed in' }, 401);

  const key = Deno.env.get('EUROTOPTECH_API_KEY') ?? '';
  if (!key) {
    return json({ error: 'no_key', message: 'Add your Euro Top Tech API key as the EUROTOPTECH_API_KEY secret to see these jobs.' }, 503);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body.action || 'list');

  try {
    if (action === 'sync') {
      // Pages of 24, newest first, until the window ends, 2,500 are kept,
      // or the account's limit says stop: what came back is kept either way.
      const days = Number(body.days) === 3 ? 3 : 7;
      const userId = auth.user.id;
      let page = 1, kept = 0, stopped = '';
      // What is already kept: a refresh stops at the first page with
      // nothing new, so keeping up costs a request or two, not a refill.
      const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
      const { data: have } = await supabase.from('ett_postings').select('job_id').eq('user_id', userId)
        .gte('posted_date', sinceIso.slice(0, 10)).limit(ETT_SYNC_CAP);
      const known = new Set<number>((have ?? []).map((r: { job_id: number }) => Number(r.job_id)));
      const seen = new Set<number>();
      let fresh = 0;
      while (kept < ETT_SYNC_CAP && page <= 120) {
        const { res, body: data } = await ett('/jobs?' + syncQuery(days, page), key);
        if (!res.ok) { stopped = ettError(res.status, data?.error, res.headers.get('Retry-After')).message; break; }
        const all = (Array.isArray(data?.jobs) ? data.jobs : []).map(cardOf)
          .filter((c: { jobId: number | null }) => c.jobId && !seen.has(c.jobId as number));
        const news = all.filter((c: { jobId: number | null }) => !known.has(c.jobId as number));
        fresh += news.length;
        // Every posting already kept: the rest of the window is too.
        if (known.size && !news.length) break;
        const rows = all.slice(0, ETT_SYNC_CAP - kept);
        rows.forEach((c: { jobId: number | null }) => seen.add(c.jobId as number));
        if (rows.length) {
          const { error: upErr } = await supabase.from('ett_postings').upsert(rows.map((c: ReturnType<typeof cardOf>) => rowOf(c, userId)), { onConflict: 'user_id,job_id' });
          if (upErr) return json({ error: 'store', message: 'Could not keep the postings: ' + upErr.message, kept }, 500);
          kept += rows.length;
        }
        if (!data?.hasMore || !rows.length) break;
        page++;
      }
      return json({ kept, fresh, pages: page, days, stopped: stopped || null, capped: kept >= ETT_SYNC_CAP });
    }
    if (action === 'list') {
      const { res, body: data } = await ett('/jobs?' + jobsQuery((body.params ?? {}) as Record<string, unknown>), key);
      if (!res.ok) { const e = ettError(res.status, data?.error, res.headers.get('Retry-After')); return json(e, e.status); }
      return json({
        jobs: (Array.isArray(data?.jobs) ? data.jobs : []).map(cardOf).filter((c: { jobId: number | null }) => c.jobId),
        page: data?.page ?? 1, total: data?.total ?? 0, totalPostings: data?.totalPostings ?? 0, hasMore: !!data?.hasMore,
      });
    }
    if (action === 'job') {
      const id = jobIdOf(body.jobId);
      if (!id) return json({ error: 'invalid_param', message: 'No such posting.' }, 400);
      const { res, body: data } = await ett('/jobs/' + id, key);
      if (!res.ok) { const e = ettError(res.status, data?.error, res.headers.get('Retry-After')); return json(e, e.status); }
      return json({ job: cardOf(data || {}), description: typeof data?.description === 'string' ? data.description.slice(0, 60000) : '' });
    }
    if (action === 'apply') {
      const id = jobIdOf(body.jobId);
      if (!id) return json({ error: 'invalid_param', message: 'No such posting.' }, 400);
      const { res, body: data } = await ett('/jobs/' + id + '/apply', key);
      if (!res.ok) { const e = ettError(res.status, data?.error, res.headers.get('Retry-After')); return json(e, e.status); }
      const url = safeApplyUrl(data?.url);
      return url ? json({ url }) : json({ error: 'unavailable', message: 'Euro Top Tech gave no apply link for this posting.' }, 502);
    }
    if (action === 'facets') {
      const { res, body: data } = await ett('/facets', key);
      if (!res.ok) { const e = ettError(res.status, data?.error, res.headers.get('Retry-After')); return json(e, e.status); }
      return json({ facets: data ?? {} });
    }
    if (action === 'me') {
      const { res, body: data } = await ett('/me', key);
      if (!res.ok) { const e = ettError(res.status, data?.error, res.headers.get('Retry-After')); return json(e, e.status); }
      // The plan and today's usage only: the key's own record stays out.
      return json({ plan: data?.plan ?? data?.tier ?? null, limits: data?.limits ?? null, usage: data?.usage ?? null });
    }
    return json({ error: 'invalid_param', message: 'Unknown action.' }, 400);
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return json({ error: 'unavailable', message: aborted ? 'Euro Top Tech took too long to answer.' : 'Euro Top Tech is not available right now.' }, 503);
  }
});
