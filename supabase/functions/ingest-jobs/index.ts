import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JOB_NAME = 'ingest-jobs';
// Bounded work per run - keeps the function inside its CPU/wall budget.
const SOURCES_PER_RUN = 12;
const JOBS_PER_SOURCE = 60;
const LEASE_MINUTES = 5;
const FAILURE_BREAKER = 6;

interface PoolJob {
  provider: string;
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  workplace_type: string | null;
  employment_type: string | null;
  department: string | null;
  url: string;
  description: string | null;
  salary: string | null;
  posted_at: string;
  updated_at: string;
  source_id: string;
}

interface SourceRow {
  id: string;
  provider: string;
  company_name: string;
  board_token: string;
}

function clean(html: unknown, max = 4000): string | null {
  if (typeof html !== 'string' || !html) return null;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, max) : null;
}

function workplaceFrom(location: string | null, extra?: string | null): string | null {
  const blob = `${location ?? ''} ${extra ?? ''}`.toLowerCase();
  if (blob.includes('remote')) return 'Remote';
  if (blob.includes('hybrid')) return 'Hybrid';
  return location ? 'Onsite' : null;
}

async function getJson(url: string, timeoutMs = 8000): Promise<any> {
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

// ---------------------------------------------------------------- providers

async function fetchGreenhouse(s: SourceRow): Promise<PoolJob[]> {
  const data = await getJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s.board_token)}/jobs?content=true`,
  );
  const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.slice(0, JOBS_PER_SOURCE).map((j) => {
    const location = j?.location?.name ?? null;
    const posted = j?.first_published ?? j?.updated_at ?? new Date().toISOString();
    return {
      provider: 'greenhouse',
      external_id: `greenhouse:${s.board_token}:${j.id}`,
      title: String(j.title ?? 'Untitled role').slice(0, 300),
      company: s.company_name,
      location,
      workplace_type: workplaceFrom(location),
      employment_type: null,
      department: j?.departments?.[0]?.name ?? null,
      url: j.absolute_url ?? `https://boards.greenhouse.io/${s.board_token}/jobs/${j.id}`,
      description: clean(j.content),
      salary: null,
      posted_at: new Date(posted).toISOString(),
      updated_at: new Date(j?.updated_at ?? posted).toISOString(),
      source_id: s.id,
    };
  });
}

async function fetchLever(s: SourceRow): Promise<PoolJob[]> {
  const data = await getJson(
    `https://api.lever.co/v0/postings/${encodeURIComponent(s.board_token)}?mode=json`,
  );
  const jobs: any[] = Array.isArray(data) ? data : [];
  return jobs.slice(0, JOBS_PER_SOURCE).map((j) => {
    const location = j?.categories?.location ?? null;
    const posted = j?.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString();
    return {
      provider: 'lever',
      external_id: `lever:${s.board_token}:${j.id}`,
      title: String(j.text ?? 'Untitled role').slice(0, 300),
      company: s.company_name,
      location,
      workplace_type: workplaceFrom(location, j?.workplaceType),
      employment_type: j?.categories?.commitment ?? null,
      department: j?.categories?.team ?? null,
      url: j.hostedUrl ?? j.applyUrl ?? `https://jobs.lever.co/${s.board_token}/${j.id}`,
      description: clean(j.descriptionPlain ?? j.description),
      salary: j?.salaryRange
        ? `${j.salaryRange.currency ?? ''} ${j.salaryRange.min ?? ''}-${j.salaryRange.max ?? ''}`.trim()
        : null,
      posted_at: posted,
      updated_at: posted,
      source_id: s.id,
    };
  });
}

async function fetchAshby(s: SourceRow): Promise<PoolJob[]> {
  const data = await getJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s.board_token)}?includeCompensation=true`,
  );
  const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.slice(0, JOBS_PER_SOURCE).map((j) => {
    const location = j?.location ?? null;
    const posted = j?.publishedAt ?? j?.updatedAt ?? new Date().toISOString();
    return {
      provider: 'ashby',
      external_id: `ashby:${s.board_token}:${j.id}`,
      title: String(j.title ?? 'Untitled role').slice(0, 300),
      company: data?.name ?? s.company_name,
      location,
      workplace_type: j?.isRemote ? 'Remote' : workplaceFrom(location),
      employment_type: j?.employmentType ?? null,
      department: j?.department ?? j?.team ?? null,
      url: j.jobUrl ?? j.applyUrl ?? `https://jobs.ashbyhq.com/${s.board_token}/${j.id}`,
      description: clean(j.descriptionPlain ?? j.descriptionHtml),
      salary: j?.compensation?.compensationTierSummary ?? null,
      posted_at: new Date(posted).toISOString(),
      updated_at: new Date(j?.updatedAt ?? posted).toISOString(),
      source_id: s.id,
    };
  });
}

async function fetchSmartRecruiters(s: SourceRow): Promise<PoolJob[]> {
  const data = await getJson(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(s.board_token)}/postings?limit=${JOBS_PER_SOURCE}`,
  );
  const jobs: any[] = Array.isArray(data?.content) ? data.content : [];
  return jobs.slice(0, JOBS_PER_SOURCE).map((j) => {
    const city = j?.location?.city ?? '';
    const country = j?.location?.country ? String(j.location.country).toUpperCase() : '';
    const location = [city, country].filter(Boolean).join(', ') || null;
    const posted = j?.releasedDate ?? new Date().toISOString();
    return {
      provider: 'smartrecruiters',
      external_id: `smartrecruiters:${s.board_token}:${j.id}`,
      title: String(j.name ?? 'Untitled role').slice(0, 300),
      company: j?.company?.name ?? s.company_name,
      location,
      workplace_type: j?.location?.remote ? 'Remote' : workplaceFrom(location),
      employment_type: j?.typeOfEmployment?.label ?? null,
      department: j?.department?.label ?? j?.function?.label ?? null,
      url: j.ref
        ? `https://jobs.smartrecruiters.com/${s.board_token}/${j.id}`
        : `https://jobs.smartrecruiters.com/${s.board_token}`,
      description: null,
      salary: null,
      posted_at: new Date(posted).toISOString(),
      updated_at: new Date(posted).toISOString(),
      source_id: s.id,
    };
  });
}

async function fetchWorkable(s: SourceRow): Promise<PoolJob[]> {
  const data = await getJson(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(s.board_token)}?details=true`,
  );
  const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.slice(0, JOBS_PER_SOURCE).map((j) => {
    const location = [j?.city, j?.country].filter(Boolean).join(', ') || j?.location || null;
    const posted = j?.published_on ?? j?.created_at ?? new Date().toISOString();
    return {
      provider: 'workable',
      external_id: `workable:${s.board_token}:${j.shortcode ?? j.id}`,
      title: String(j.title ?? 'Untitled role').slice(0, 300),
      company: data?.name ?? s.company_name,
      location,
      workplace_type: j?.telecommuting ? 'Remote' : workplaceFrom(location),
      employment_type: j?.employment_type ?? null,
      department: j?.department ?? null,
      url: j.url ?? j.application_url ?? `https://apply.workable.com/${s.board_token}/`,
      description: clean(j.description),
      salary: null,
      posted_at: new Date(posted).toISOString(),
      updated_at: new Date(posted).toISOString(),
      source_id: s.id,
    };
  });
}

async function fetchRecruitee(s: SourceRow): Promise<PoolJob[]> {
  const data = await getJson(
    `https://${encodeURIComponent(s.board_token)}.recruitee.com/api/offers/`,
  );
  const jobs: any[] = Array.isArray(data?.offers) ? data.offers : [];
  return jobs.slice(0, JOBS_PER_SOURCE).map((j) => {
    const location = j?.location || [j?.city, j?.country].filter(Boolean).join(', ') || null;
    const posted = j?.published_at ?? j?.created_at ?? new Date().toISOString();
    return {
      provider: 'recruitee',
      external_id: `recruitee:${s.board_token}:${j.id}`,
      title: String(j.title ?? 'Untitled role').slice(0, 300),
      company: s.company_name,
      location,
      workplace_type: j?.remote ? 'Remote' : workplaceFrom(location),
      employment_type: j?.employment_type_code ?? null,
      department: j?.department ?? null,
      url: j.careers_url ?? j.url ?? `https://${s.board_token}.recruitee.com/`,
      description: clean(j.description),
      salary: null,
      posted_at: new Date(posted).toISOString(),
      updated_at: new Date(posted).toISOString(),
      source_id: s.id,
    };
  });
}

const PROVIDERS: Record<string, (s: SourceRow) => Promise<PoolJob[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  smartrecruiters: fetchSmartRecruiters,
  workable: fetchWorkable,
  recruitee: fetchRecruitee,
};

// ------------------------------------------------------------------- runner

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

  try {
    const now = new Date();

    // 1. Paused guard + single-flight lease.
    const { data: state } = await supabase
      .from('ingest_state')
      .select('*')
      .eq('job_name', JOB_NAME)
      .maybeSingle();

    if (state?.status === 'paused') {
      return json({ skipped: true, reason: 'paused', last_error: state.last_error });
    }

    if (state?.lease_until && new Date(state.lease_until) > now) {
      return json({ skipped: true, reason: 'another run holds the lease' });
    }

    const leaseUntil = new Date(now.getTime() + LEASE_MINUTES * 60_000).toISOString();
    const { error: leaseError } = await supabase
      .from('ingest_state')
      .update({ status: 'running', lease_until: leaseUntil, updated_at: now.toISOString() })
      .eq('job_name', JOB_NAME)
      .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`);

    if (leaseError) return json({ error: 'Could not acquire lease', details: leaseError.message }, 500);

    // 2. Bounded batch: the least recently fetched enabled sources.
    const { data: sources, error: sourcesError } = await supabase
      .from('job_sources')
      .select('id, provider, company_name, board_token')
      .eq('enabled', true)
      .lt('consecutive_failures', FAILURE_BREAKER)
      .order('last_fetched_at', { ascending: true, nullsFirst: true })
      .limit(SOURCES_PER_RUN);

    if (sourcesError) throw new Error(sourcesError.message);

    let inserted = 0;
    let seen = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const source of (sources ?? []) as SourceRow[]) {
      const handler = PROVIDERS[source.provider];
      const stamp = new Date().toISOString();

      if (!handler) {
        await supabase
          .from('job_sources')
          .update({ last_fetched_at: stamp, last_error: 'unknown provider' })
          .eq('id', source.id);
        continue;
      }

      try {
        const jobs = await handler(source);
        seen += jobs.length;

        if (jobs.length) {
          // Idempotent progress: unique (provider, external_id) makes re-runs no-ops.
          const { data: upserted, error: upsertError } = await supabase
            .from('job_pool')
            .upsert(jobs, { onConflict: 'provider,external_id', ignoreDuplicates: true })
            .select('id');
          if (upsertError) throw new Error(upsertError.message);
          inserted += upserted?.length ?? 0;
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
    }

    // 3. Circuit breaker: every source in the batch failed, park the job.
    const everythingFailed = (sources?.length ?? 0) > 0 && failed === sources!.length;
    const stats = {
      sources_polled: sources?.length ?? 0,
      jobs_seen: seen,
      jobs_inserted: inserted,
      sources_failed: failed,
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
