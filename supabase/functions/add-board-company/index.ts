/**
 * add-board-company
 *
 * Takes pasted job URLs, works out the board and company token for each, and
 * stores one row per company. That company is then polled on every run.
 * No AI, no key, no secret.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { Board, companyFromUrl } from '../_shared/boardJobs.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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

  let body: { urls?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a JSON body with urls or text' }, 400);
  }

  const raw: string[] = Array.isArray(body.urls)
    ? body.urls.map((u) => String(u ?? ''))
    : String(body.text ?? '').split(/[\s,]+/);

  const lines = raw.map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return json({ error: 'No URLs supplied' }, 400);

  const recognised = new Map<string, { board: Board; token: string }>();
  const unrecognised: string[] = [];
  for (const line of lines) {
    const hit = companyFromUrl(line);
    if (!hit) {
      unrecognised.push(line);
      continue;
    }
    recognised.set(`${hit.board}:${hit.token.toLowerCase()}`, hit);
  }

  if (!recognised.size) {
    return json({ error: 'No Greenhouse, Lever or Ashby job URL recognised', unrecognised }, 422);
  }

  const { data: existing } = await supabase
    .from('job_companies')
    .select('board, token')
    .eq('user_id', userId);

  const known = new Set((existing ?? []).map((r) => `${r.board}:${String(r.token).toLowerCase()}`));
  const toInsert = [...recognised.entries()].filter(([key]) => !known.has(key)).map(([, v]) => ({
    user_id: userId,
    board: v.board,
    token: v.token,
  }));

  if (toInsert.length) {
    const { error } = await supabase
      .from('job_companies')
      .upsert(toInsert, { onConflict: 'user_id,board,token', ignoreDuplicates: true });
    if (error) return json({ error: error.message }, 500);
  }

  return json({
    added: toInsert.length,
    alreadyKnown: recognised.size - toInsert.length,
    companies: [...recognised.values()],
    unrecognised,
  });
});
