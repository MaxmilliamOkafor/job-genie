/**
 * fetch-board-jobs
 *
 * Calls the caller's Greenhouse / Lever / Ashby public boards, stores what came
 * back and returns a summary. No AI, no key, no secret.
 *
 * The three board APIs send no CORS headers, so the browser cannot call them
 * directly; this function is the proxy. The caller's JWT decides whose
 * companies are read — a user_id in the request body is ignored.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  Board,
  BOARD_ENDPOINT,
  normalisePosting,
  NormalisedPosting,
  pooled,
  rowsFromPayload,
} from '../_shared/boardJobs.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const REQUEST_TIMEOUT_MS = 15000;
const CONCURRENCY = 4;

interface Failure {
  token: string;
  board: Board;
  status: number | string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Not signed in' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) return json({ error: 'Not signed in' }, 401);
  const userId = auth.user.id;

  const { data: companies, error: companiesError } = await supabase
    .from('job_companies')
    .select('board, token')
    .eq('user_id', userId);

  if (companiesError) return json({ error: companiesError.message }, 500);
  if (!companies?.length) {
    return json({ fetched: 0, stored: 0, skipped: 0, failed: [], companies: 0 });
  }

  let fetched = 0;
  let skipped = 0;
  const failed: Failure[] = [];
  const postings: NormalisedPosting[] = [];

  await pooled(companies as { board: Board; token: string }[], CONCURRENCY, async ({ board, token }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(BOARD_ENDPOINT[board](token), {
        headers: { Accept: 'application/json', 'User-Agent': 'job-genie/1.0 (+board-poll)' },
        signal: controller.signal,
      });
      if (!res.ok) {
        failed.push({ token, board, status: res.status });
        return;
      }
      const payload = await res.json();
      const rows = rowsFromPayload(payload);
      fetched += rows.length;
      for (const row of rows) {
        const posting = normalisePosting(row, board, token);
        if (!posting) {
          skipped++;
          continue;
        }
        postings.push(posting);
      }
    } catch (e) {
      failed.push({ token, board, status: e instanceof Error ? e.name : 'error' });
    } finally {
      clearTimeout(timer);
    }
  });

  // One row per canonical URL, even when two boards answer with the same job.
  const byUrl = new Map<string, NormalisedPosting>();
  for (const p of postings) if (!byUrl.has(p.url)) byUrl.set(p.url, p);

  let stored = 0;
  const rows = [...byUrl.values()].map((p) => ({ ...p, user_id: userId }));
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    // first_seen_at and exported_at are absent from the payload, so an upsert
    // cannot overwrite them.
    const { error } = await supabase
      .from('job_postings')
      .upsert(chunk, { onConflict: 'user_id,url', ignoreDuplicates: false })
      .select('id');
    if (error) return json({ error: error.message, fetched, stored, skipped, failed }, 500);
    stored += chunk.length;
  }

  return json({ fetched, stored, skipped, failed, companies: companies.length });
});
