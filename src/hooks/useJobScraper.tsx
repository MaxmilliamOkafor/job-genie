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

  // Fetch existing jobs from database
  const fetchExistingJobs = useCallback(async (append = false) => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error, count } = await supabase
        .from('jobs')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('posted_date', { ascending: false })
        .range(append ? jobs.length : 0, append ? jobs.length + 49 : 49);

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

      if (append) {
        setJobs(prev => dedupe([...prev, ...formattedJobs]));
      } else {
        setJobs(dedupe(formattedJobs));
      }
      
      const newTotal = append ? jobs.length + formattedJobs.length : formattedJobs.length;
      setHasMore((count || 0) > newTotal);
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
    
    // Initial scrape
    scrapeJobs(keywordString, false);
    
    // Set up interval for continuous updates every 10 minutes
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

      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, ...updates } : job
      ));
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
    refetch: fetchExistingJobs,
  };
}
