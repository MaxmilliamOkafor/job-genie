import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Job } from './useJobs';
import { toast } from 'sonner';

export function useJobScraper() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [keywords, setKeywords] = useState('');
  const [liveJobCount, setLiveJobCount] = useState(0);
  const offsetRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to real-time job updates
  useEffect(() => {
    if (!user) return;

    // Get initial count
    const fetchCount = async () => {
      const { count } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setLiveJobCount(count || 0);
    };
    fetchCount();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('jobs-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'jobs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('New job inserted:', payload.new);
          setLiveJobCount(prev => prev + 1);
          
          // Add the new job to the list
          const newJob: Job = {
            id: payload.new.id,
            title: payload.new.title,
            company: payload.new.company,
            location: payload.new.location,
            salary: payload.new.salary || '',
            description: payload.new.description || '',
            requirements: payload.new.requirements || [],
            platform: payload.new.platform || '',
            url: payload.new.url || '',
            posted_date: payload.new.posted_date || payload.new.created_at || new Date().toISOString(),
            match_score: payload.new.match_score || 0,
            status: payload.new.status || 'pending',
            applied_at: payload.new.applied_at,
          };
          
          setJobs(prev => {
            // Avoid duplicates
            if (prev.some(j => j.id === newJob.id)) return prev;
            return [newJob, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setJobs(prev => prev.map(job => 
            job.id === payload.new.id 
              ? { ...job, ...payload.new, status: payload.new.status }
              : job
          ));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'jobs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setLiveJobCount(prev => Math.max(0, prev - 1));
          setJobs(prev => prev.filter(job => job.id !== payload.old.id));
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Fetch existing jobs from database
  const fetchExistingJobs = useCallback(async (append = false) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const PAGE_SIZE = 1000;
      const MAX_INITIAL = 2000;

      if (append) {
        const from = jobs.length;
        const to = from + 199;

        const { data, error, count } = await supabase
          .from('jobs')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
          .order('posted_date', { ascending: false })
          .range(from, to);

        if (error) throw error;

        const formattedJobs: Job[] = (data || []).map(job => ({
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          salary: job.salary || '',
          description: job.description || '',
          requirements: job.requirements || [],
          platform: job.platform || '',
          url: job.url || '',
          posted_date: job.posted_date || job.created_at || new Date().toISOString(),
          match_score: job.match_score || 0,
          status: job.status || 'pending',
          applied_at: job.applied_at,
        }));

        const dedupe = (list: Job[]) => {
          const map = new Map<string, Job>();
          for (const j of list) map.set(j.id, j);
          return Array.from(map.values());
        };

        setJobs(prev => dedupe([...prev, ...formattedJobs]));
        const newTotal = jobs.length + formattedJobs.length;
        setHasMore((count || 0) > newTotal);
        setLiveJobCount(count || 0);
        return;
      }

      const collected: Job[] = [];
      let fetched = 0;
      let totalCount: number | null = null;

      while (fetched < MAX_INITIAL) {
        const from = fetched;
        const to = Math.min(fetched + PAGE_SIZE - 1, MAX_INITIAL - 1);

        const { data, error, count } = await supabase
          .from('jobs')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
          .order('posted_date', { ascending: false })
          .range(from, to);

        if (error) throw error;
        totalCount = count ?? totalCount;

        const pageJobs: Job[] = (data || []).map(job => ({
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          salary: job.salary || '',
          description: job.description || '',
          requirements: job.requirements || [],
          platform: job.platform || '',
          url: job.url || '',
          posted_date: job.posted_date || job.created_at || new Date().toISOString(),
          match_score: job.match_score || 0,
          status: job.status || 'pending',
          applied_at: job.applied_at,
        }));

        collected.push(...pageJobs);
        fetched += pageJobs.length;

        if (pageJobs.length === 0) break;
        if (totalCount !== null && fetched >= totalCount) break;
        if (pageJobs.length < (to - from + 1)) break;
      }

      const map = new Map<string, Job>();
      for (const j of collected) map.set(j.id, j);
      const final = Array.from(map.values());

      setJobs(final);
      setHasMore((totalCount || 0) > final.length);
      setLiveJobCount(totalCount || 0);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, jobs.length]);

  // Scrape new jobs from edge function
  const scrapeJobs = useCallback(async (keywordString: string, append = false) => {
    if (!user) return;
    
    setIsScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-jobs', {
        body: {
          keywords: keywordString,
          offset: append ? offsetRef.current : 0,
          limit: 500,
          user_id: user.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        offsetRef.current = data.nextOffset || 0;
        setHasMore(data.hasMore || false);
        
        // Jobs will be added via real-time subscription
        if (!append) {
          toast.success(`Found ${data.totalFound || 0} jobs (${data.newJobsInserted || 0} new)`);
        }
      }
    } catch (error) {
      console.error('Error scraping jobs:', error);
      toast.error('Failed to scrape jobs');
    } finally {
      setIsScraping(false);
    }
  }, [user]);

  // Start continuous scraping
  const startContinuousScraping = useCallback((keywordString: string) => {
    setKeywords(keywordString);
    scrapeJobs(keywordString, false);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      scrapeJobs(keywordString, true);
    }, 600000); // Every 10 minutes
  }, [scrapeJobs]);

  // Stop continuous scraping
  const stopScraping = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Load more jobs
  const loadMore = useCallback(async () => {
    if (isLoading || isScraping) return;
    
    if (keywords) {
      await scrapeJobs(keywords, true);
    } else {
      await fetchExistingJobs(true);
    }
  }, [isLoading, isScraping, keywords, scrapeJobs, fetchExistingJobs]);

  // Update job status
  const updateJobStatus = useCallback(async (jobId: string, status: Job['status']) => {
    if (!user) return;

    try {
      const updates: any = { status };
      if (status === 'applied') {
        updates.applied_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('jobs')
        .update(updates)
        .eq('id', jobId)
        .eq('user_id', user.id);

      if (error) throw error;

      // State will be updated via real-time subscription
    } catch (error) {
      console.error('Error updating job status:', error);
      toast.error('Failed to update job');
    }
  }, [user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Initial load
  useEffect(() => {
    if (user) {
      fetchExistingJobs();
    }
  }, [user]);

  // Clear all jobs and re-scrape fresh
  const clearAndRefresh = useCallback(async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      setJobs([]);
      setLiveJobCount(0);
      offsetRef.current = 0;
      setHasMore(true);
      
      toast.success('Cleared old jobs. Starting fresh scrape...');
      
      if (keywords) {
        startContinuousScraping(keywords);
      }
    } catch (error) {
      console.error('Error clearing jobs:', error);
      toast.error('Failed to clear jobs');
    }
  }, [user, keywords, startContinuousScraping]);

  return {
    jobs,
    isLoading,
    isScraping,
    hasMore,
    keywords,
    liveJobCount,
    loadMore,
    scrapeJobs,
    startContinuousScraping,
    stopScraping,
    updateJobStatus,
    clearAndRefresh,
    refetch: fetchExistingJobs,
  };
}
