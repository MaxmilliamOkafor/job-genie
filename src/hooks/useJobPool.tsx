import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PoolJob {
  id: string;
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
  first_seen_at: string;
}

export type PoolSort = 'newest' | 'company';

export interface PoolFilters {
  search: string;
  location: string;
  workplace: string;
}

const PAGE_SIZE = 30;
const POLL_MS = 60_000;

function applyFilters<T>(query: any, filters: PoolFilters) {
  let q = query;
  const search = filters.search.trim();
  if (search) {
    const safe = search.replace(/[%,()]/g, ' ').trim();
    q = q.or(`title.ilike.%${safe}%,company.ilike.%${safe}%,department.ilike.%${safe}%`);
  }
  if (filters.location.trim()) {
    q = q.ilike('location', `%${filters.location.trim()}%`);
  }
  if (filters.workplace && filters.workplace !== 'all') {
    q = q.eq('workplace_type', filters.workplace);
  }
  return q as T;
}

export function useJobPool(filters: PoolFilters, sort: PoolSort = 'newest') {
  const [jobs, setJobs] = useState<PoolJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [freshCount, setFreshCount] = useState(0);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const newestSeen = useRef<string | null>(null);

  const filterKey = `${filters.search}|${filters.location}|${filters.workplace}|${sort}`;

  const buildQuery = useCallback(
    (from: number, to: number) => {
      let query = supabase.from('job_pool').select('*', { count: 'exact' });
      query = applyFilters(query, filters);
      query =
        sort === 'newest'
          ? query.order('posted_at', { ascending: false })
          : query.order('company', { ascending: true }).order('posted_at', { ascending: false });
      return query.range(from, to);
    },
    [filters, sort],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data, error: err, count } = await buildQuery(0, PAGE_SIZE - 1);
    if (!mounted.current) return;
    if (err) {
      setError(err.message);
      setIsLoading(false);
      return;
    }
    const rows = (data ?? []) as PoolJob[];
    setJobs(rows);
    setTotal(count ?? 0);
    setHasMore((count ?? 0) > rows.length);
    setError(null);
    setFreshCount(0);
    setLastChecked(new Date());
    newestSeen.current = rows[0]?.posted_at ?? new Date().toISOString();
    setIsLoading(false);
  }, [buildQuery]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || isFetchingMore) return;
    setIsFetchingMore(true);
    const from = jobs.length;
    const { data, error: err, count } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (!mounted.current) return;
    if (!err) {
      const rows = (data ?? []) as PoolJob[];
      setJobs((prev) => {
        const seen = new Set(prev.map((j) => j.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(from + rows.length < (count ?? 0));
    }
    setIsFetchingMore(false);
  }, [buildQuery, hasMore, isFetchingMore, isLoading, jobs.length]);

  // Lightweight poll: count only, so the UI can offer "N new jobs".
  useEffect(() => {
    const tick = async () => {
      if (!newestSeen.current) return;
      let query = supabase.from('job_pool').select('id', { count: 'exact', head: true });
      query = applyFilters(query, filters);
      const { count } = await query.gt('posted_at', newestSeen.current);
      if (!mounted.current) return;
      setFreshCount(count ?? 0);
      setLastChecked(new Date());
    };
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const newestPostedAt = useMemo(() => jobs[0]?.posted_at ?? null, [jobs]);

  return {
    jobs,
    isLoading,
    isFetchingMore,
    hasMore,
    total,
    freshCount,
    lastChecked,
    error,
    newestPostedAt,
    loadMore,
    refresh: load,
  };
}
