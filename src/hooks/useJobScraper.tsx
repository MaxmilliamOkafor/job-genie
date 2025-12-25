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
  const offsetRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch existing jobs from database - no artificial limits
  const fetchExistingJobs = useCallback(async (append = false) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const PAGE_SIZE = 1000; // backend max per query

      if (append) {
        const from = jobs.length;
        const to = from + 999; // append in larger chunks

        const { data, error, count } = await supabase
          .from('jobs')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
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
        return;
      }

      // Initial load: fetch ALL jobs for user (no limit)
      const collected: Job[] = [];
      let fetched = 0;
      let totalCount: number | null = null;

      while (true) {
        const from = fetched;
        const to = fetched + PAGE_SIZE - 1;

        const { data, error, count } = await supabase
          .from('jobs')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
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

      // Dedupe just in case
      const map = new Map<string, Job>();
      for (const j of collected) map.set(j.id, j);
      const final = Array.from(map.values());

      setJobs(final);
      setHasMore((totalCount || 0) > final.length);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, jobs.length]);

  // Scrape new jobs from edge function (larger batches)
  const scrapeJobs = useCallback(async (keywordString: string, append = false) => {
    if (!user) return;
    
    setIsScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-jobs', {
        body: {
          keywords: keywordString,
          offset: append ? offsetRef.current : 0,
          limit: 200, // Fetch larger batches
          user_id: user.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        offsetRef.current = data.nextOffset;
        setHasMore(data.hasMore);
        
        // Refresh from database
        await fetchExistingJobs(append);
        
        if (!append) {
          toast.success(`Found ${data.jobs?.length || 0} new jobs`);
        }
      }
    } catch (error) {
      console.error('Error scraping jobs:', error);
      toast.error('Failed to scrape jobs');
    } finally {
      setIsScraping(false);
    }
  }, [user, fetchExistingJobs]);

  // Start continuous scraping
  const startContinuousScraping = useCallback((keywordString: string) => {
    setKeywords(keywordString);

    (async () => {
      // Initial scrape
      await scrapeJobs(keywordString, false);

      // Continue fetching while there are more jobs available - no artificial limit
      let hasMoreJobs = true;
      
      while (hasMoreJobs) {
        const { data } = await supabase.functions.invoke('scrape-jobs', {
          body: {
            keywords: keywordString,
            offset: offsetRef.current,
            limit: 500, // Larger batches for faster loading
            user_id: user?.id,
          },
        });
        
        if (data?.success && data.jobs?.length > 0) {
          offsetRef.current = data.nextOffset;
          hasMoreJobs = data.hasMore;
          await fetchExistingJobs(true);
          
          // Update toast with progress
          toast.info(`Loaded ${offsetRef.current} jobs...`, { id: 'scrape-progress' });
        } else {
          hasMoreJobs = false;
        }
        
        // Small pause between batches
        await new Promise((r) => setTimeout(r, 100));
      }
      
      toast.success(`Finished loading ${offsetRef.current} valid jobs`, { id: 'scrape-progress' });
      setIsScraping(false);
    })();

    // Set up interval for continuous updates every 10 minutes
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      scrapeJobs(keywordString, true);
    }, 600000); // Every 10 minutes
  }, [scrapeJobs, user, fetchExistingJobs]);

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

      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, ...updates } : job
      ));
    } catch (error) {
      console.error('Error updating job status:', error);
      toast.error('Failed to update job');
    }
  }, [user]);

  // Polling for live updates (cost-free alternative to realtime) - fetches ALL jobs
  useEffect(() => {
    if (!user) return;

    const pollJobs = async () => {
      const PAGE_SIZE = 1000;
      const allJobs: Job[] = [];
      let fetched = 0;
      
      while (true) {
        const { data, error } = await supabase
          .from('jobs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(fetched, fetched + PAGE_SIZE - 1);

        if (error || !data || data.length === 0) break;
        
        const formattedJobs: Job[] = data.map((job: any) => ({
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
        
        allJobs.push(...formattedJobs);
        fetched += data.length;
        
        if (data.length < PAGE_SIZE) break;
      }
      
      if (allJobs.length > 0) {
        setJobs(allJobs);
      }
    };

    // Poll every 30 seconds
    const interval = setInterval(pollJobs, 30000);

    return () => clearInterval(interval);
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
      // Delete all existing jobs for this user
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      setJobs([]);
      offsetRef.current = 0;
      setHasMore(true);
      
      toast.success('Cleared old jobs. Starting fresh scrape...');
      
      // Start fresh scrape
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
    loadMore,
    scrapeJobs,
    startContinuousScraping,
    stopScraping,
    updateJobStatus,
    clearAndRefresh,
    refetch: fetchExistingJobs,
  };
}
