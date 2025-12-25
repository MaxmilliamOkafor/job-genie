import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string | null;
  description: string | null;
  requirements: string[];
  platform: string | null;
  url: string | null;
  posted_date: string;
  match_score: number;
  status: 'pending' | 'applied' | 'interviewing' | 'offered' | 'rejected';
  applied_at: string | null;
}

const JOBS_PER_PAGE = 20;

export function useJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchJobs = useCallback(async (pageNum: number, append = false) => {
    if (!user) return;

    try {
      const from = pageNum * JOBS_PER_PAGE;
      const to = from + JOBS_PER_PAGE - 1;

      const { data, error, count } = await supabase
        .from('jobs')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('posted_date', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const typedData = (data || []).map(job => ({
        ...job,
        requirements: job.requirements || [],
        status: job.status as Job['status']
      }));

      if (append) {
        setJobs(prev => [...prev, ...typedData]);
      } else {
        setJobs(typedData);
      }

      setHasMore((count || 0) > from + typedData.length);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setPage(0);
      setJobs([]);
      setHasMore(true);
      setIsLoading(true);
      fetchJobs(0);
    }
  }, [user, fetchJobs]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchJobs(nextPage, true);
    }
  }, [isLoading, hasMore, page, fetchJobs]);

  const addJob = async (job: Omit<Job, 'id'>) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('jobs')
        .insert({ ...job, user_id: user.id })
        .select()
        .single();

      if (error) throw error;

      const typedJob = {
        ...data,
        requirements: data.requirements || [],
        status: data.status as Job['status']
      };

      setJobs(prev => [typedJob, ...prev]);
      return typedJob;
    } catch (error) {
      console.error('Error adding job:', error);
      toast.error('Failed to add job');
      return null;
    }
  };

  const updateJobStatus = async (jobId: string, status: Job['status']) => {
    try {
      const updates: any = { status };
      if (status === 'applied') {
        updates.applied_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('jobs')
        .update(updates)
        .eq('id', jobId);

      if (error) throw error;

      setJobs(prev => prev.map(j => 
        j.id === jobId ? { ...j, ...updates } : j
      ));
    } catch (error) {
      console.error('Error updating job:', error);
      toast.error('Failed to update job');
    }
  };

  const addBulkJobs = async (jobsToAdd: Omit<Job, 'id'>[]) => {
    if (!user) return [];

    try {
      const jobsWithUser = jobsToAdd.map(job => ({ ...job, user_id: user.id }));
      
      const { data, error } = await supabase
        .from('jobs')
        .insert(jobsWithUser)
        .select();

      if (error) throw error;

      const typedJobs = (data || []).map(job => ({
        ...job,
        requirements: job.requirements || [],
        status: job.status as Job['status']
      }));

      setJobs(prev => [...typedJobs, ...prev]);
      return typedJobs;
    } catch (error) {
      console.error('Error adding bulk jobs:', error);
      toast.error('Failed to add jobs');
      return [];
    }
  };

  return {
    jobs,
    isLoading,
    hasMore,
    loadMore,
    addJob,
    updateJobStatus,
    addBulkJobs,
    refetch: () => fetchJobs(0),
  };
}
