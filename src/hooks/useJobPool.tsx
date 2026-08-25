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
// Safety net behind realtime: catches anything the socket missed.
const POLL_MS = 45_000;

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

// Mirrors applyFilters so realtime rows are judged the same way as queried rows.
function matchesFilters(job: PoolJob, filters: PoolFilters): boolean {
  const search = filters.search.trim().toLowerCase();
  if (search) {
    const haystack = `${job.title} ${job.company} ${job.department ?? ''}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  const loc = filters.location.trim().toLowerCase();
  if (loc && !(job.location ?? '').toLowerCase().includes(loc)) return false;
  if (filters.workplace && filters.workplace !== 'all' && job.workplace_type !== filters.workplace) {
    return false;
  }
  return true;
}

export function useJobPool(filters: PoolFilters, sort: PoolSort = 'newest') {
  const [jobs, setJobs] = useState<PoolJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [liveIds, setLiveIds] = useState<string[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const newestSeen = useRef<string | null>(null);
  const filtersRef = useRef(filters);
  const sortRef = useRef(sort);
  filtersRef.current = filters;
  sortRef.current = sort;

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

  // Inserts a row into the list in the position the current sort demands.
  const insertLive = useCallback((job: PoolJob) => {
    setJobs((prev) => {
      if (prev.some((j) => j.id === job.id)) return prev;
      if (sortRef.current === 'newest') {
        return [job, ...prev];
      }
      const next = [...prev, job];
      next.sort(
        (a, b) =>
          a.company.localeCompare(b.company) ||
          new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
      );
      return next;
    });
    setLiveIds((prev) => [job.id, ...prev].slice(0, 100));
    setLiveCount((c) => c + 1);
    setTotal((t) => t + 1);
    setLastEventAt(new Date());
    if (!newestSeen.current || job.posted_at > newestSeen.current) {
      newestSeen.current = job.posted_at;
    }
  }, []);

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
    setLiveCount(0);
    setLiveIds([]);
    newestSeen.current = rows[0]?.posted_at ?? new Date(0).toISOString();
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

  // Realtime: new rows land in the list the moment the ingest job writes them.
  useEffect(() => {
    const channel = supabase
      .channel('job-pool-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_pool' },
        (payload) => {
          if (!mounted.current) return;
          const job = payload.new as PoolJob;
          if (!matchesFilters(job, filtersRef.current)) return;
          insertLive(job);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'job_pool' },
        (payload) => {
          if (!mounted.current) return;
          const job = payload.new as PoolJob;
          setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, ...job } : j)));
        },
      )
      .subscribe((status) => {
        if (mounted.current) setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [insertLive]);

  // Backstop poll: pulls anything newer than what we hold, in case the socket dropped.
  useEffect(() => {
    const tick = async () => {
      if (!mounted.current || !newestSeen.current) return;
      let query = supabase.from('job_pool').select('*');
      query = applyFilters(query, filtersRef.current);
      const { data } = await query
        .gt('posted_at', newestSeen.current)
        .order('posted_at', { ascending: false })
        .limit(50);
      if (!mounted.current || !data?.length) return;
      // Oldest first so the newest ends up on top after each prepend.
      [...(data as PoolJob[])].reverse().forEach((job) => {
        setJobs((prev) => {
          if (prev.some((j) => j.id === job.id)) return prev;
          return sortRef.current === 'newest' ? [job, ...prev] : prev;
        });
      });
      const unseen = (data as PoolJob[]).filter((j) => j.posted_at > (newestSeen.current ?? ''));
      if (unseen.length) {
        setLiveIds((prev) => [...unseen.map((j) => j.id), ...prev].slice(0, 100));
        setLiveCount((c) => c + unseen.length);
        setTotal((t) => t + unseen.length);
        setLastEventAt(new Date());
        newestSeen.current = unseen[0].posted_at;
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const liveIdSet = useMemo(() => new Set(liveIds), [liveIds]);

  const acknowledgeLive = useCallback(() => {
    setLiveCount(0);
  }, []);

  return {
    jobs,
    isLoading,
    isFetchingMore,
    hasMore,
    total,
    liveCount,
    liveIdSet,
    isLive,
    lastEventAt,
    error,
    loadMore,
    refresh: load,
    acknowledgeLive,
  };
}
