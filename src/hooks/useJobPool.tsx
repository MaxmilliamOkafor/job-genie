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
  ageDays: number | null;
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
  if (filters.ageDays !== null) {
    const cutoff = new Date(Date.now() - filters.ageDays * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte('posted_at', cutoff);
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
  if (
    filters.ageDays !== null &&
    new Date(job.posted_at).getTime() < Date.now() - filters.ageDays * 24 * 60 * 60 * 1000
  ) {
    return false;
  }
  return true;
}

export function useJobPool(filters: PoolFilters, sort: PoolSort = 'newest') {
  const [jobs, setJobs] = useState<PoolJob[]>([]);
  const [pending, setPending] = useState<PoolJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [liveIds, setLiveIds] = useState<string[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const newestSeen = useRef<string | null>(null);
  const visibleIds = useRef<Set<string>>(new Set());
  const filtersRef = useRef(filters);
  const sortRef = useRef(sort);
  filtersRef.current = filters;
  sortRef.current = sort;
  visibleIds.current = useMemo(() => new Set(jobs.map((j) => j.id)), [jobs]);

  const filterKey = `${filters.search}|${filters.location}|${filters.workplace}|${filters.ageDays ?? 'all'}|${sort}`;

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

  // New rows are held back rather than injected, so the list never moves while reading.
  const queueLive = useCallback((incoming: PoolJob[]) => {
    if (!incoming.length) return;
    let added = 0;
    setPending((prev) => {
      const seen = new Set(prev.map((j) => j.id));
      const fresh = incoming.filter((j) => !seen.has(j.id) && !visibleIds.current.has(j.id));
      added = fresh.length;
      if (!fresh.length) return prev;
      const next = [...fresh, ...prev];
      next.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
      return next.slice(0, 200);
    });
    if (added) setLastEventAt(new Date());
    for (const job of incoming) {
      if (!newestSeen.current || job.posted_at > newestSeen.current) {
        newestSeen.current = job.posted_at;
      }
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
    setPending([]);
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

  // Realtime: new rows are queued, not injected, so nothing shifts under the cursor.
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
          queueLive([job]);
        },
      )
      .subscribe((status) => {
        if (mounted.current) setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queueLive]);

  // Backstop poll: catches anything the socket missed. Also queued, never injected.
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
      queueLive(data as PoolJob[]);
    };
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const liveIdSet = useMemo(() => new Set(liveIds), [liveIds]);

  // The only thing that moves the list: an explicit click on "N new jobs".
  const acknowledgeLive = useCallback(() => {
    setPending((queued) => {
      if (!queued.length) return queued;
      setJobs((prev) => {
        const seen = new Set(prev.map((j) => j.id));
        const fresh = queued.filter((j) => !seen.has(j.id));
        if (!fresh.length) return prev;
        if (sortRef.current === 'newest') return [...fresh, ...prev];
        const next = [...prev, ...fresh];
        next.sort(
          (a, b) =>
            a.company.localeCompare(b.company) ||
            new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
        );
        return next;
      });
      setLiveIds((prev) => [...queued.map((j) => j.id), ...prev].slice(0, 100));
      setTotal((t) => t + queued.length);
      return [];
    });
  }, []);

  return {
    jobs,
    isLoading,
    isFetchingMore,
    hasMore,
    total,
    liveCount: pending.length,
    liveIdSet,
    isLive,
    lastEventAt,
    error,
    loadMore,
    refresh: load,
    acknowledgeLive,
  };
}
