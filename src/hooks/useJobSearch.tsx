import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  expandQuery,
  locationTerms,
  postedHours,
  isStrictWindow,
  type JobSearchFilters,
} from '@/lib/jobSearch';
import { matchesLiveFeedSearch, titleMatchesSearch, type LiveFeedCheck } from '@/lib/liveFeedFilter';

export interface SearchedJob {
  id: string;
  provider: string;
  title: string;
  company: string;
  location: string | null;
  workplace_type: string | null;
  employment_type: string | null;
  department: string | null;
  seniority: string | null;
  url: string;
  resolved_url: string | null;
  description: string | null;
  salary: string | null;
  requisition_id: string | null;
  posted_at: string;
  posted_at_known: boolean;
  first_seen_at: string;
  link_status: string;
  link_checked_at: string | null;
  link_http_status: number | null;
  link_note: string | null;
  employer_direct: boolean;
  risk_flags: string[];
  duplicate_count: number;
  relevance: number;
  total_count: number;
}

export interface SourceHealth {
  id: string;
  provider: string;
  company_name: string;
  enabled: boolean;
  last_fetched_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  live_jobs: number;
}

export interface RefreshState {
  lastRunAt: string | null;
  status: string | null;
  lastError: string | null;
  stats: Record<string, unknown> | null;
}

export const PAGE_SIZE = 20;
/** Most vacancies read per search when results are checked here before paging. */
export const CANDIDATE_CAP = 500;
const BATCH = 100;

function byNewest(a: SearchedJob, b: SearchedJob): number {
  return (
    Number(b.posted_at_known) - Number(a.posted_at_known) ||
    (Date.parse(b.posted_at) || 0) - (Date.parse(a.posted_at) || 0) ||
    (Date.parse(b.first_seen_at) || 0) - (Date.parse(a.first_seen_at) || 0) ||
    a.id.localeCompare(b.id)
  );
}

export interface JobSearchOptions {
  /** Hold the first search until saved preferences are applied, so an unfiltered page never shows. */
  enabled?: boolean;
  /** The user's country, for remote vacancies that state a region. */
  country?: string;
}

export function useJobSearch(filters: JobSearchFilters, options: JobSearchOptions = {}) {
  const enabled = options.enabled !== false;
  const country = options.country ?? '';
  const [jobs, setJobs] = useState<SearchedJob[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [ingest, setIngest] = useState<RefreshState>({
    lastRunAt: null,
    status: null,
    lastError: null,
    stats: null,
  });
  const [verify, setVerify] = useState<RefreshState>({
    lastRunAt: null,
    status: null,
    lastError: null,
    stats: null,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const args = useMemo(() => {
    const hours = postedHours(filters.posted);
    return {
      p_terms: expandQuery(filters.query),
      p_skills: filters.skills,
      p_location_terms: locationTerms(filters.location, filters.includeNearby),
      p_company: filters.company.trim(),
      p_workplace: filters.workplace,
      p_seniority: filters.seniority,
      p_employment: filters.employment,
      p_max_age_hours: hours,
      // Undated listings are excluded only from the strict freshness windows.
      p_require_known_date: isStrictWindow(filters.posted),
      p_include_unverified: filters.includeUnverified,
      p_sort: filters.sort,
    };
  }, [filters]);

  // A keyword or a place means the results are checked here (phrase in the
  // title or description, place in the vacancy's location, remote only when its
  // region includes the user's country) and the count is taken after that check.
  const check = useMemo<LiveFeedCheck | null>(() => {
    if (!filters.query.trim() && !filters.location.trim()) return null;
    return {
      terms: args.p_terms,
      locationTerms: args.p_location_terms,
      workplace: filters.workplace,
      country,
    };
  }, [args, filters.query, filters.location, filters.workplace, country]);

  const argsKey = JSON.stringify({ args, check });
  const [capped, setCapped] = useState(false);
  const checkedRef = useRef<{ key: string; list: SearchedJob[] } | null>(null);
  // Only the newest search may write results: a slower, older response (such as
  // the unfiltered first load) is dropped instead of replacing the filtered page.
  const seqRef = useRef(0);

  const fetchCandidates = useCallback(async (rpcArgs: typeof args) => {
    const first = await supabase.rpc('search_job_pool', { ...rpcArgs, p_limit: BATCH, p_offset: 0 });
    if (first.error) throw first.error;
    const rows = (first.data ?? []) as SearchedJob[];
    const total = Number(rows[0]?.total_count ?? 0);
    const offsets: number[] = [];
    for (let o = BATCH; o < Math.min(total, CANDIDATE_CAP); o += BATCH) offsets.push(o);
    const rest = await Promise.all(
      offsets.map((o) => supabase.rpc('search_job_pool', { ...rpcArgs, p_limit: BATCH, p_offset: o })),
    );
    for (const r of rest) {
      if (r.error) throw r.error;
      rows.push(...((r.data ?? []) as SearchedJob[]));
    }
    return { rows, capped: total > CANDIDATE_CAP };
  }, []);

  const runChecked = useCallback(
    async (targetPage: number, seq: number, append = false) => {
      if (!check) return;
      let list = checkedRef.current?.key === argsKey ? checkedRef.current.list : null;
      if (!list) {
        const remoteAllowed = filters.workplace.length === 0 || filters.workplace.includes('Remote');
        const lookups = [fetchCandidates(args)];
        if (args.p_location_terms.length && remoteAllowed && country) {
          lookups.push(fetchCandidates({ ...args, p_location_terms: [], p_workplace: ['Remote'] }));
        }
        const results = await Promise.all(lookups);
        const seen = new Set<string>();
        const merged: SearchedJob[] = [];
        for (const r of results) for (const row of r.rows) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          merged.push(row);
        }
        list = merged.filter((j) => matchesLiveFeedSearch(j, check));
        // Vacancies whose title names the role come before ones that only mention it.
        const inTitle = new Map(list.map((j) => [j.id, titleMatchesSearch(j.title, check.terms)]));
        const titleFirst = (a: SearchedJob, b: SearchedJob) =>
          check.terms.length ? Number(inTitle.get(b.id)) - Number(inTitle.get(a.id)) : 0;
        list.sort(
          args.p_sort === 'relevance'
            ? (a, b) => titleFirst(a, b) || b.relevance - a.relevance || byNewest(a, b)
            : (a, b) => titleFirst(a, b) || byNewest(a, b),
        );
        if (seq !== seqRef.current || !mounted.current) return;
        checkedRef.current = { key: argsKey, list };
        setCapped(results.some((r) => r.capped));
      }
      const max = Math.max(0, Math.ceil(list.length / PAGE_SIZE) - 1);
      const pageNo = Math.min(Math.max(0, targetPage), max);
      setError(null);
      setTotal(list.length);
      const slice = list.slice(pageNo * PAGE_SIZE, pageNo * PAGE_SIZE + PAGE_SIZE);
      setJobs((prev) => (append ? [...prev, ...slice.filter((r) => !prev.some((p) => p.id === r.id))] : slice));
      setPage(pageNo);
      setIsLoading(false);
      setIsFetchingMore(false);
    },
    [args, argsKey, check, country, fetchCandidates, filters.workplace],
  );

  const runQuery = useCallback(
    async (targetPage: number, append: boolean) => {
      const seq = ++seqRef.current;
      if (append) setIsFetchingMore(true);
      else setIsLoading(true);

      if (check) {
        try {
          await runChecked(targetPage, seq, append);
        } catch (err) {
          if (seq !== seqRef.current || !mounted.current) return;
          console.error('[job search] search_job_pool failed', err);
          setError(err instanceof Error ? err.message : 'Search failed');
          setJobs([]);
          setTotal(0);
          setIsLoading(false);
          setIsFetchingMore(false);
        }
        return;
      }
      setCapped(false);

      const { data, error: err } = await supabase.rpc('search_job_pool', {
        ...args,
        p_limit: PAGE_SIZE,
        p_offset: targetPage * PAGE_SIZE,
      });

      if (!mounted.current || seq !== seqRef.current) return;

      if (err) {
        // A failed search must say so, never quietly show stale or sample results.
        // Technical detail stays in the developer console; the UI shows a plain message.
        console.error('[job search] search_job_pool failed', err);
        setError(err.message);
        if (!append) {
          setJobs([]);
          setTotal(0);
        }
        setIsLoading(false);
        setIsFetchingMore(false);
        return;
      }

      const rows = (data ?? []) as SearchedJob[];
      setError(null);
      setTotal(rows[0]?.total_count ?? (append ? total : 0));
      setJobs((prev) => {
        if (!append) return rows;
        const seen = new Set(prev.map((j) => j.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      setPage(targetPage);
      setIsLoading(false);
      setIsFetchingMore(false);
    },
    // total is read only as an append-time fallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [args, check, runChecked],
  );

  useEffect(() => {
    if (!enabled) return;
    setPage(0);
    runQuery(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argsKey, enabled]);

  const loadMore = useCallback(() => {
    if (isLoading || isFetchingMore) return;
    if (jobs.length >= total) return;
    runQuery(page + 1, true);
  }, [isFetchingMore, isLoading, jobs.length, page, runQuery, total]);

  /** Jump to a page of results (0-indexed). Replaces the list, never appends. */
  const goToPage = useCallback(
    (target: number) => {
      if (isLoading || isFetchingMore) return;
      const max = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
      const next = Math.min(Math.max(0, target), max);
      if (next === page) return;
      runQuery(next, false);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [isFetchingMore, isLoading, page, runQuery, total],
  );

  const loadHealth = useCallback(async () => {
    const [healthRes, stateRes] = await Promise.all([
      supabase
        .from('job_source_health')
        .select('*')
        .order('consecutive_failures', { ascending: false })
        .limit(200),
      supabase.from('ingest_state').select('*'),
    ]);
    if (!mounted.current) return;
    if (healthRes.data) setSources(healthRes.data as SourceHealth[]);
    const pick = (name: string) => (stateRes.data ?? []).find((r: any) => r.job_name === name);
    const ing = pick('ingest-jobs');
    const ver = pick('verify-job-links');
    if (ing) {
      setIngest({
        lastRunAt: ing.last_run_at,
        status: ing.status,
        lastError: ing.last_error,
        stats: (ing.stats ?? null) as Record<string, unknown> | null,
      });
    }
    if (ver) {
      setVerify({
        lastRunAt: ver.last_run_at,
        status: ver.status,
        lastError: ver.last_error,
        stats: (ver.stats ?? null) as Record<string, unknown> | null,
      });
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const timer = setInterval(loadHealth, 60_000);
    return () => clearInterval(timer);
  }, [loadHealth]);

  /** Refresh now: pull the career boards, then re-run the current search. */
  const refreshNow = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const { data, error: err } = await supabase.functions.invoke('ingest-jobs', {
        body: { force: true },
      });
      if (err) throw err;
      await loadHealth();
      checkedRef.current = null;
      await runQuery(0, false);
      return data as { sources_polled?: number; jobs_inserted?: number; sources_failed?: number; errors?: string[] };
    } finally {
      if (mounted.current) setIsRefreshing(false);
    }
  }, [loadHealth, runQuery]);

  const failingSources = useMemo(
    () => sources.filter((s) => s.consecutive_failures > 0 && s.enabled),
    [sources],
  );

  return {
    jobs,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    goToPage,
    isLoading,
    isFetchingMore,
    hasMore: jobs.length < total,
    /** True when more vacancies matched in the database than were checked here. */
    capped,
    error,
    loadMore,
    reload: () => {
      checkedRef.current = null;
      return runQuery(0, false);
    },
    sources,
    failingSources,
    ingest,
    verify,
    refreshNow,
    isRefreshing,
  };
}
