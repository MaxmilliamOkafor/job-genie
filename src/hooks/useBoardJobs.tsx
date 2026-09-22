import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type Board = 'greenhouse' | 'lever' | 'ashby';

export interface BoardCompany {
  id: string;
  board: Board;
  token: string;
}

export interface BoardPosting {
  id: string;
  url: string;
  board: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  department: string | null;
  remote: boolean | null;
  posted_at: string | null;
  first_seen_at: string;
  exported_at: string | null;
}

export interface FetchSummary {
  fetched: number;
  stored: number;
  skipped: number;
  failed: { token: string; board?: string; status: number | string }[];
  companies?: number;
}

const POSTING_COLUMNS =
  'id, url, board, company, title, location, department, remote, posted_at, first_seen_at, exported_at';

export function useBoardJobs() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<BoardCompany[]>([]);
  const [postings, setPostings] = useState<BoardPosting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setCompanies([]);
      setPostings([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [c, p] = await Promise.all([
      supabase.from('job_companies').select('id, board, token').order('token'),
      supabase.from('job_postings').select(POSTING_COLUMNS).order('posted_at', { ascending: false, nullsFirst: false }).limit(2000),
    ]);
    if (c.error) setError(c.error.message);
    if (p.error) setError(p.error.message);
    setCompanies((c.data as BoardCompany[]) ?? []);
    setPostings((p.data as BoardPosting[]) ?? []);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addCompanies = useCallback(
    async (text: string) => {
      setIsAdding(true);
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke('add-board-company', { body: { text } });
        if (fnError) throw new Error(fnError.message);
        if (data?.error) throw new Error(data.error);
        await reload();
        return data as { added: number; alreadyKnown: number; unrecognised: string[] };
      } finally {
        setIsAdding(false);
      }
    },
    [reload],
  );

  const removeCompany = useCallback(async (id: string) => {
    const { error: delError } = await supabase.from('job_companies').delete().eq('id', id);
    if (delError) {
      setError(delError.message);
      return;
    }
    setCompanies((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const fetchPostings = useCallback(async (): Promise<FetchSummary> => {
    setIsFetching(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('fetch-board-jobs', { body: {} });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      await reload();
      return data as FetchSummary;
    } finally {
      setIsFetching(false);
    }
  }, [reload]);

  /** Marks exactly the rows that were exported, so they drop out of tomorrow's list. */
  const markExported = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const at = new Date().toISOString();
    const { error: upError } = await supabase.from('job_postings').update({ exported_at: at }).in('id', ids);
    if (upError) {
      setError(upError.message);
      return;
    }
    setPostings((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, exported_at: at } : p)));
  }, []);

  return {
    companies,
    postings,
    isLoading,
    isFetching,
    isAdding,
    error,
    reload,
    addCompanies,
    removeCompany,
    fetchPostings,
    markExported,
  };
}
