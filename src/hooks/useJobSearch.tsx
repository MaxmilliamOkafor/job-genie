import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  expandQuery,
  locationTerms,
  postedHours,
  isStrictWindow,
  type JobSearchFilters,
} from '@/lib/jobSearch';

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

export function useJobSearch(filters: JobSearchFilters) {
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

  const argsKey = JSON.stringify(args);

  const runQuery = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) setIsFetchingMore(true);
      else setIsLoading(true);

      const { data, error: err } = await supabase.rpc('search_job_pool', {
        ...args,
        p_limit: PAGE_SIZE,
        p_offset: targetPage * PAGE_SIZE,
      });

      if (!mounted.current) return;

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
    [args],
  );

  useEffect(() => {
    setPage(0);
    runQuery(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argsKey]);

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
    error,
    loadMore,
    reload: () => runQuery(0, false),
    sources,
    failingSources,
    ingest,
    verify,
    refreshNow,
    isRefreshing,
  };
}
