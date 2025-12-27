import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AutomationPanel } from '@/components/automation/AutomationPanel';
import { JobFiltersBar } from '@/components/jobs/JobFiltersBar';
import { VirtualJobList } from '@/components/jobs/VirtualJobList';
import { LiveJobsPanel } from '@/components/jobs/LiveJobsPanel';
import { LiveJobFeed } from '@/components/jobs/LiveJobFeed';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useJobScraper } from '@/hooks/useJobScraper';
import { useProfile } from '@/hooks/useProfile';
import { Job } from '@/hooks/useJobs';
import { toast } from 'sonner';
import { 
  Briefcase, 
  ArrowUp,
  ArrowDown,
  Trash2,
  RefreshCw,
  ArrowUpDown,
  Calendar,
  Upload,
  CheckCircle,
  CheckSquare,
  Square,
  Zap,
  X,
  Loader2,
  LinkIcon,
  Pause,
  Play,
  StopCircle,
  AlertTriangle,
  MessageSquare,
  ExternalLink,
  SkipForward,
  MousePointer,
  Timer,
  Wifi,
  WifiOff,
  Settings2,
  FastForward,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const Jobs = () => {
  const { 
    jobs, 
    isLoading, 
    isScraping,
    hasMore,
    totalCount,
    loadMore, 
    updateJobStatus,
    clearAndRefresh,
    refetch,
    searchJobs,
  } = useJobScraper();
  const { profile } = useProfile();
  const { user } = useAuth();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'uploaded' | 'posted'>('uploaded');
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>('');
  const [lastSearchResultCount, setLastSearchResultCount] = useState<number | null>(null);
  
  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [isValidatingLinks, setIsValidatingLinks] = useState(false);
  
  // Batch apply automation state
  const [isPaused, setIsPaused] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, successful: 0, failed: 0 });
  const [failedJobs, setFailedJobs] = useState<{ id: string; title: string; company: string; error: string }[]>([]);
  const pauseRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  
  // Sequential apply mode (no popups needed)
  const [sequentialMode, setSequentialMode] = useState(false);
  const [sequentialQueue, setSequentialQueue] = useState<string[]>([]);
  const [currentSequentialIndex, setCurrentSequentialIndex] = useState(0);
  
  // Automated sequential apply mode (auto-advance with extension)
  const [autoSequentialMode, setAutoSequentialMode] = useState(false);
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [currentAutoJob, setCurrentAutoJob] = useState<Job | null>(null);
  const [autoProgress, setAutoProgress] = useState({ current: 0, total: 0, successful: 0, failed: 0, skipped: 0 });
  const [jobTimeout, setJobTimeout] = useState(15); // seconds per job (default 15s for fast skipping)
  const [extensionConnected, setExtensionConnected] = useState(false);
  const autoAbortRef = useRef<AbortController | null>(null);
  const autoPauseRef = useRef(false);
  const currentJobWindowRef = useRef<Window | null>(null);
  const jobStartTimeRef = useRef<number>(0);
  
  // Feedback dialog state
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  
  // Live Feed view toggle
  const [showLiveFeed, setShowLiveFeed] = useState(false);
  
  // Ref to scroll job list to bottom
  const scrollToJobListBottomRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setShowScrollTop(scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'instant' });
  const scrollToJobListBottom = () => {
    if (scrollToJobListBottomRef.current) {
      scrollToJobListBottomRef.current();
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleJobApplied = (jobId: string) => updateJobStatus(jobId, 'applied');

  const handleFiltersChange = useCallback((filtered: Job[]) => {
    setFilteredJobs(filtered);
    // Update result count when filters change
    if (activeSearchQuery) {
      setLastSearchResultCount(filtered.length);
    }
  }, [activeSearchQuery]);

  // Sort jobs based on selected sort option (default: most recently added first)
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      if (sortBy === 'posted') {
        // Sort by job posted date
        const aDate = new Date(a.posted_date).getTime();
        const bDate = new Date(b.posted_date).getTime();
        return bDate - aDate;
      } else {
        // Sort by when job was added to system (created_at)
        const aCreated = new Date((a as any).created_at || a.posted_date).getTime();
        const bCreated = new Date((b as any).created_at || b.posted_date).getTime();
        return bCreated - aCreated;
      }
    });
  }, [filteredJobs, sortBy]);

  // Get pending jobs for selection
  const pendingJobs = useMemo(() => 
    sortedJobs.filter(job => job.status === 'pending'),
    [sortedJobs]
  );

  // Select all pending jobs
  const handleSelectAll = useCallback(() => {
    const pendingIds = pendingJobs.map(job => job.id);
    setSelectedJobs(new Set(pendingIds));
  }, [pendingJobs]);

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedJobs(new Set());
  }, []);

  // Toggle selection mode
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) {
        setSelectedJobs(new Set());
      }
      return !prev;
    });
  }, []);

  // Pause batch apply
  const pauseBatchApply = useCallback(() => {
    pauseRef.current = true;
    setIsPaused(true);
    toast.info('Batch apply paused');
  }, []);

  // Resume batch apply
  const resumeBatchApply = useCallback(() => {
    pauseRef.current = false;
    setIsPaused(false);
    toast.info('Batch apply resumed');
  }, []);

  // Stop batch apply
  const stopBatchApply = useCallback(() => {
    abortRef.current?.abort();
    pauseRef.current = false;
    setIsPaused(false);
    setIsBatchApplying(false);
    setBatchProgress({ current: 0, total: 0, successful: 0, failed: 0 });
    toast.info('Batch apply stopped');
  }, []);

  // Batch apply to selected jobs with pause/resume/stop
  const handleBatchApply = useCallback(async () => {
    if (selectedJobs.size === 0) return;
    
    setIsBatchApplying(true);
    setIsPaused(false);
    pauseRef.current = false;
    abortRef.current = new AbortController();
    setFailedJobs([]);
    
    const jobsToApply = Array.from(selectedJobs);
    const total = jobsToApply.length;
    let successful = 0;
    let failed = 0;
    const newFailedJobs: { id: string; title: string; company: string; error: string }[] = [];
    
    setBatchProgress({ current: 0, total, successful: 0, failed: 0 });
    
    for (let i = 0; i < jobsToApply.length; i++) {
      // Check if stopped
      if (abortRef.current?.signal.aborted) {
        break;
      }
      
      // Check if paused
      while (pauseRef.current && !abortRef.current?.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (abortRef.current?.signal.aborted) {
        break;
      }
      
      const jobId = jobsToApply[i];
      const job = jobs.find(j => j.id === jobId);
      
      if (job?.url) {
        try {
          // Check if URL might be blocked or broken
          const isBroken = job.url_status === 'broken' || (job.report_count && job.report_count >= 3);
          
          if (isBroken) {
            failed++;
            newFailedJobs.push({
              id: job.id,
              title: job.title,
              company: job.company,
              error: 'Link reported as broken or expired',
            });
          } else {
            // Open the job URL
            const newWindow = window.open(job.url, '_blank');
            
            if (!newWindow) {
              failed++;
              newFailedJobs.push({
                id: job.id,
                title: job.title,
                company: job.company,
                error: 'Popup blocked by browser - please allow popups',
              });
            } else {
              await updateJobStatus(jobId, 'applied');
              successful++;
            }
          }
        } catch (error) {
          failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          // Check for common blocked errors
          if (errorMessage.includes('ERR_BLOCKED_BY_RESPONSE') || errorMessage.includes('blocked')) {
            newFailedJobs.push({
              id: job.id,
              title: job.title,
              company: job.company,
              error: 'Site blocked access - may require direct browser visit',
            });
          } else {
            newFailedJobs.push({
              id: job.id,
              title: job.title,
              company: job.company,
              error: errorMessage,
            });
          }
        }
      } else {
        failed++;
        if (job) {
          newFailedJobs.push({
            id: job.id,
            title: job.title,
            company: job.company,
            error: 'No URL available for this job',
          });
        }
      }
      
      setBatchProgress({ current: i + 1, total, successful, failed });
      setFailedJobs([...newFailedJobs]);
      
      // Small delay between jobs to avoid overwhelming
      if (i < jobsToApply.length - 1 && !abortRef.current?.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
    
    setSelectedJobs(new Set());
    setSelectionMode(false);
    setIsBatchApplying(false);
    
    // Show verification summary
    if (successful > 0 || failed > 0) {
      if (failed > 0) {
        toast.warning(`Batch apply completed with issues`, {
          description: `${successful} successful, ${failed} failed. Check failed jobs for details.`,
          duration: 8000,
        });
      } else {
        toast.success(`Successfully opened ${successful} job${successful !== 1 ? 's' : ''} for application`, {
          description: 'Jobs have been marked as applied.',
          duration: 5000,
        });
      }
    }
  }, [selectedJobs, jobs, updateJobStatus]);

  // Start sequential mode (no popups - user clicks to open each job)
  const startSequentialApply = useCallback(() => {
    if (selectedJobs.size === 0) return;
    
    const jobIds = Array.from(selectedJobs);
    setSequentialQueue(jobIds);
    setCurrentSequentialIndex(0);
    setSequentialMode(true);
    setBatchProgress({ current: 0, total: jobIds.length, successful: 0, failed: 0 });
    setFailedJobs([]);
    
    toast.info('Sequential mode started', {
      description: 'Click "Open & Apply" for each job. No popups needed!',
    });
  }, [selectedJobs]);

  // Get current job in sequential mode
  const currentSequentialJob = useMemo(() => {
    if (!sequentialMode || currentSequentialIndex >= sequentialQueue.length) return null;
    return jobs.find(j => j.id === sequentialQueue[currentSequentialIndex]);
  }, [sequentialMode, currentSequentialIndex, sequentialQueue, jobs]);

  // Open current job and move to next
  const handleOpenAndNext = useCallback(async () => {
    if (!currentSequentialJob) return;
    
    // Open in current tab or new tab - this is user-initiated so it won't be blocked
    window.open(currentSequentialJob.url, '_blank');
    
    // Mark as applied
    await updateJobStatus(currentSequentialJob.id, 'applied');
    
    const newSuccessful = batchProgress.successful + 1;
    const newCurrent = currentSequentialIndex + 1;
    
    setBatchProgress(prev => ({
      ...prev,
      current: newCurrent,
      successful: newSuccessful,
    }));
    
    if (newCurrent >= sequentialQueue.length) {
      // All done
      setSequentialMode(false);
      setSequentialQueue([]);
      setSelectedJobs(new Set());
      setSelectionMode(false);
      
      toast.success(`Applied to ${newSuccessful} job${newSuccessful !== 1 ? 's' : ''}!`, {
        description: 'All jobs have been marked as applied.',
      });
    } else {
      setCurrentSequentialIndex(newCurrent);
    }
  }, [currentSequentialJob, currentSequentialIndex, sequentialQueue, batchProgress.successful, updateJobStatus]);

  // Skip current job in sequential mode
  const handleSkipJob = useCallback(() => {
    if (!currentSequentialJob) return;
    
    const newCurrent = currentSequentialIndex + 1;
    
    setFailedJobs(prev => [...prev, {
      id: currentSequentialJob.id,
      title: currentSequentialJob.title,
      company: currentSequentialJob.company,
      error: 'Skipped by user',
    }]);
    
    setBatchProgress(prev => ({
      ...prev,
      current: newCurrent,
      failed: prev.failed + 1,
    }));
    
    if (newCurrent >= sequentialQueue.length) {
      setSequentialMode(false);
      setSequentialQueue([]);
      setSelectedJobs(new Set());
      setSelectionMode(false);
      
      toast.info('Sequential apply completed', {
        description: `${batchProgress.successful} applied, ${batchProgress.failed + 1} skipped`,
      });
    } else {
      setCurrentSequentialIndex(newCurrent);
    }
  }, [currentSequentialJob, currentSequentialIndex, sequentialQueue, batchProgress]);

  // Exit sequential mode
  const exitSequentialMode = useCallback(() => {
    setSequentialMode(false);
    setSequentialQueue([]);
    setCurrentSequentialIndex(0);
    setBatchProgress({ current: 0, total: 0, successful: 0, failed: 0 });
    
    toast.info('Sequential apply cancelled');
  }, []);

  // ============= AUTOMATED SEQUENTIAL APPLY MODE =============
  // Automatically opens jobs one by one, triggers extension autofill, and handles timeouts/errors

  // Check if Chrome extension is available
  const checkExtensionConnection = useCallback(() => {
    try {
      // Check for extension by looking for specific message in page
      const extensionCheck = document.querySelector('[data-quantumhire-extension]');
      // Also check if running in a context where extension might be available
      const hasChromeRuntime = typeof window !== 'undefined' && 
        'chrome' in window && 
        (window as any).chrome?.runtime;
      setExtensionConnected(!!extensionCheck || !!hasChromeRuntime);
    } catch {
      setExtensionConnected(false);
    }
  }, []);

  // Start automated sequential apply
  const startAutoSequentialApply = useCallback(async () => {
    if (selectedJobs.size === 0) return;
    
    const jobIds = Array.from(selectedJobs);
    const jobsToProcess = jobIds.map(id => jobs.find(j => j.id === id)).filter(Boolean) as Job[];
    
    if (jobsToProcess.length === 0) {
      toast.error('No valid jobs selected');
      return;
    }

    setAutoSequentialMode(true);
    setAutoProcessing(true);
    setSequentialQueue(jobIds);
    setCurrentSequentialIndex(0);
    setAutoProgress({ current: 0, total: jobsToProcess.length, successful: 0, failed: 0, skipped: 0 });
    setFailedJobs([]);
    autoAbortRef.current = new AbortController();
    autoPauseRef.current = false;
    setIsPaused(false);

    toast.info('Automated Sequential Apply started', {
      description: `Processing ${jobsToProcess.length} jobs with ${jobTimeout}s timeout per job`,
    });

    let successful = 0;
    let failed = 0;
    let skipped = 0;
    const newFailedJobs: { id: string; title: string; company: string; error: string }[] = [];

    for (let i = 0; i < jobsToProcess.length; i++) {
      // Check if stopped
      if (autoAbortRef.current?.signal.aborted) {
        break;
      }

      // Handle pause
      while (autoPauseRef.current && !autoAbortRef.current?.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      if (autoAbortRef.current?.signal.aborted) break;

      const job = jobsToProcess[i];
      setCurrentAutoJob(job);
      setCurrentSequentialIndex(i);
      setAutoProgress(prev => ({ ...prev, current: i + 1 }));

      // Process this job
      const result = await processAutoJob(job);

      if (result.success) {
        successful++;
        await updateJobStatus(job.id, 'applied');
      } else if (result.skipped) {
        skipped++;
        newFailedJobs.push({
          id: job.id,
          title: job.title,
          company: job.company,
          error: result.error || 'Skipped',
        });
      } else {
        failed++;
        newFailedJobs.push({
          id: job.id,
          title: job.title,
          company: job.company,
          error: result.error || 'Failed to apply',
        });
      }

      setAutoProgress(prev => ({ ...prev, successful, failed, skipped }));
      setFailedJobs([...newFailedJobs]);

      // Small delay between jobs
      if (i < jobsToProcess.length - 1 && !autoAbortRef.current?.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // Cleanup
    setAutoSequentialMode(false);
    setAutoProcessing(false);
    setCurrentAutoJob(null);
    setSelectedJobs(new Set());
    setSelectionMode(false);

    // Show summary
    const total = successful + failed + skipped;
    if (total > 0) {
      if (failed > 0 || skipped > 0) {
        toast.warning(`Automated apply completed with issues`, {
          description: `${successful} applied, ${failed} failed, ${skipped} skipped`,
          duration: 8000,
        });
      } else {
        toast.success(`Successfully applied to ${successful} job${successful !== 1 ? 's' : ''}!`, {
          description: 'All jobs have been processed.',
          duration: 5000,
        });
      }
    }
  }, [selectedJobs, jobs, jobTimeout, updateJobStatus]);

  // Process a single job in auto mode
  const processAutoJob = useCallback(async (job: Job): Promise<{ success: boolean; skipped?: boolean; error?: string }> => {
    if (!job.url) {
      return { success: false, error: 'No URL available' };
    }

    // Check for broken links - skip immediately (2s check)
    const isBroken = job.url_status === 'broken' || (job.report_count && job.report_count >= 3);
    if (isBroken) {
      await new Promise(r => setTimeout(r, 500)); // Brief pause before skipping
      return { success: false, skipped: true, error: 'Link reported as broken' };
    }

    jobStartTimeRef.current = Date.now();

    try {
      // Open the job in a new window
      const newWindow = window.open(job.url, '_blank');
      
      if (!newWindow) {
        return { success: false, error: 'Popup blocked - click to open manually' };
      }

      currentJobWindowRef.current = newWindow;

      // Send message to extension to trigger autofill
      try {
        newWindow.postMessage({
          type: 'QUANTUMHIRE_WEBAPP',
          action: 'AUTO_APPLY_START',
          data: {
            jobUrl: job.url,
            jobTitle: job.title,
            company: job.company,
            description: job.description,
          }
        }, '*');
      } catch (e) {
        console.log('Could not send message to new window:', e);
      }

      // Wait for the job to be processed (with timeout)
      const timeoutMs = jobTimeout * 1000;
      const quickSkipMs = 2000; // 2 seconds for quick error detection
      const checkInterval = 500; // Check more frequently
      let elapsed = 0;
      let windowLoadError = false;

      // Create a promise that resolves when the window is closed or timeout occurs
      return new Promise((resolve) => {
        const checkProgress = setInterval(() => {
          // Check if aborted
          if (autoAbortRef.current?.signal.aborted) {
            clearInterval(checkProgress);
            try { newWindow.close(); } catch {}
            resolve({ success: false, error: 'Stopped by user' });
            return;
          }

          // Check if paused - just wait but don't increment elapsed
          if (autoPauseRef.current) {
            return;
          }

          elapsed += checkInterval;

          // Quick check for window errors (closed very quickly = error)
          try {
            if (newWindow.closed) {
              clearInterval(checkProgress);
              // If closed within 2 seconds, likely an error page or redirect issue
              if (elapsed <= quickSkipMs) {
                resolve({ success: false, skipped: true, error: 'Page closed quickly - invalid link' });
              } else if (elapsed < 8000) {
                // Closed somewhat quickly - probably an issue
                resolve({ success: false, skipped: true, error: 'Page closed - may have redirected' });
              } else {
                // User spent reasonable time, assume success
                resolve({ success: true });
              }
              return;
            }
            
            // Try to detect error pages by checking if we can access the location
            // This will throw for cross-origin but work for same-origin error pages
            try {
              const loc = newWindow.location.href;
              // If we can read it and it's about:blank or chrome-error, skip quickly
              if (loc.includes('about:blank') || loc.includes('chrome-error') || loc.includes('err_')) {
                clearInterval(checkProgress);
                try { newWindow.close(); } catch {}
                resolve({ success: false, skipped: true, error: 'Error loading page' });
                return;
              }
            } catch {
              // Cross-origin - normal, page loaded
            }
          } catch {
            // Can't check window state
          }

          // Check for timeout
          if (elapsed >= timeoutMs) {
            clearInterval(checkProgress);
            try { newWindow.close(); } catch {}
            resolve({ success: false, skipped: true, error: `Timeout after ${jobTimeout}s` });
            return;
          }
        }, checkInterval);

        // Hard timeout backup
        setTimeout(() => {
          clearInterval(checkProgress);
          try { 
            if (currentJobWindowRef.current && !currentJobWindowRef.current.closed) {
              currentJobWindowRef.current.close();
            }
          } catch {}
          resolve({ success: false, skipped: true, error: `Timeout after ${jobTimeout}s` });
        }, timeoutMs + 1000);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Handle specific error types
      if (errorMessage.includes('ERR_BLOCKED_BY_RESPONSE') || errorMessage.includes('blocked')) {
        return { success: false, skipped: true, error: 'Site blocked access' };
      }
      
      return { success: false, error: errorMessage };
    }
  }, [jobTimeout]);

  // Pause auto sequential
  const pauseAutoSequential = useCallback(() => {
    autoPauseRef.current = true;
    setIsPaused(true);
    toast.info('Automation paused');
  }, []);

  // Resume auto sequential
  const resumeAutoSequential = useCallback(() => {
    autoPauseRef.current = false;
    setIsPaused(false);
    toast.info('Automation resumed');
  }, []);

  // Stop auto sequential
  const stopAutoSequential = useCallback(() => {
    autoAbortRef.current?.abort();
    autoPauseRef.current = false;
    setIsPaused(false);
    setAutoSequentialMode(false);
    setAutoProcessing(false);
    setCurrentAutoJob(null);
    
    // Close any open window
    try {
      if (currentJobWindowRef.current && !currentJobWindowRef.current.closed) {
        currentJobWindowRef.current.close();
      }
    } catch {}
    
    toast.info('Automation stopped');
  }, []);

  // Skip current job in auto mode
  const skipAutoCurrentJob = useCallback(() => {
    try {
      if (currentJobWindowRef.current && !currentJobWindowRef.current.closed) {
        currentJobWindowRef.current.close();
      }
    } catch {}
    toast.info('Skipping current job...');
  }, []);

  // Check extension on mount
  useEffect(() => {
    checkExtensionConnection();
    
    // Listen for skip signals from the extension
    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'QUANTUMHIRE_EXTENSION') return;
      
      const { action, reason, url } = event.data;
      
      if (action === 'SKIP_JOB') {
        console.log('Extension requested skip for:', url, 'reason:', reason);
        
        // If in auto mode, trigger a skip
        if (autoSequentialMode && autoProcessing) {
          toast.info(`Skipping: ${reason || 'Invalid job page'}`, {
            description: 'Moving to next job...',
            duration: 2000,
          });
          
          // Close the window and move on
          skipAutoCurrentJob();
        }
      }
    };
    
    window.addEventListener('message', handleExtensionMessage);
    return () => window.removeEventListener('message', handleExtensionMessage);
  }, [checkExtensionConnection, autoSequentialMode, autoProcessing, skipAutoCurrentJob]);

  // Submit feedback
  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackText.trim()) return;
    
    setIsSubmittingFeedback(true);
    try {
      // Log feedback to console and show success (could be enhanced with backend storage)
      console.log('User feedback submitted:', {
        feedback: feedbackText,
        timestamp: new Date().toISOString(),
        userId: user?.id,
        failedJobsCount: failedJobs.length,
      });
      
      toast.success('Thank you for your feedback!', {
        description: 'We will use this to improve the batch apply experience.',
      });
      
      setFeedbackDialogOpen(false);
      setFeedbackText('');
    } catch (error) {
      toast.error('Failed to submit feedback');
    } finally {
      setIsSubmittingFeedback(false);
    }
  }, [feedbackText, user?.id, failedJobs.length]);

  // Server-side search with debounce
  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) {
      await refetch();
      return;
    }
    setIsSearching(true);
    await searchJobs(searchInput);
    setIsSearching(false);
  }, [searchInput, searchJobs, refetch]);

  // Validate job URLs
  const handleValidateLinks = useCallback(async () => {
    setIsValidatingLinks(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-job-urls', {
        body: { validateAll: true, batchSize: 20 },
      });
      
      if (error) throw error;
      
      if (data?.success) {
        await refetch();
        toast.success(`Validated ${data.validated} job links`, {
          description: `${data.validCount} valid, ${data.brokenCount} broken`,
        });
      }
    } catch (error) {
      console.error('Error validating links:', error);
      toast.error('Failed to validate links');
    } finally {
      setIsValidatingLinks(false);
    }
  }, [refetch]);

  // Debounced search on input change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.length >= 2 || searchInput.length === 0) {
        handleSearch();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);


  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Briefcase className="h-8 w-8 text-primary" />
              Job Search
            </h1>
            <p className="text-muted-foreground mt-1">
              Find and apply to jobs from top tech companies
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {jobs.length > 0 && (
              <>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleValidateLinks}
                  disabled={isValidatingLinks}
                >
                  {isValidatingLinks ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <LinkIcon className="h-4 w-4 mr-2" />
                  )}
                  Check Links
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={clearAndRefresh}
                  disabled={isScraping}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Live Jobs Panel Toggle */}
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant={!showLiveFeed ? "default" : "outline"}
            size="sm"
            onClick={() => setShowLiveFeed(false)}
          >
            Search Jobs
          </Button>
          <Button
            variant={showLiveFeed ? "default" : "outline"}
            size="sm"
            onClick={() => setShowLiveFeed(true)}
          >
            <Wifi className="h-4 w-4 mr-2" />
            Live Feed
          </Button>
        </div>

        {/* Live Jobs Panel - Conditional */}
        {showLiveFeed ? (
          <Card className="p-4 h-[600px]">
            <LiveJobFeed 
              onApply={(job) => updateJobStatus(job.id, 'applied')}
              onJobSelect={(job) => {
                if (job.url) window.open(job.url, '_blank');
              }}
            />
          </Card>
        ) : (
          <LiveJobsPanel onJobsFetched={refetch} />
        )}

        {/* Filters Bar */}
        {jobs.length > 0 && (
          <JobFiltersBar 
            jobs={jobs} 
            onFiltersChange={handleFiltersChange}
            onSearch={async (keywords, locations, filters) => {
              if (!user) return;
              setIsSearching(true);
              setActiveSearchQuery(keywords);
              try {
                const { data, error } = await supabase.functions.invoke('search-jobs-google', {
                  body: {
                    keywords,
                    location: locations || '',
                    timeFilter: filters?.timeFilter || 'all',
                    jobType: filters?.jobType || 'all',
                    workType: filters?.workType || 'all',
                    experienceLevel: filters?.experienceLevel || 'all',
                  },
                });
                
                if (error) throw error;
                
                if (data?.success) {
                  await refetch();
                  setLastSearchResultCount(data.totalFound || 0);
                  const keywordPreview = keywords.split(',').slice(0, 3).map((k: string) => k.trim()).join(', ');
                  
                  let platformInfo = '';
                  if (data.platforms && Object.keys(data.platforms).length > 0) {
                    const topPlatforms = Object.entries(data.platforms)
                      .sort((a, b) => (b[1] as number) - (a[1] as number))
                      .slice(0, 4)
                      .map(([name, count]) => `${name}: ${count}`)
                      .join(', ');
                    platformInfo = topPlatforms;
                  }
                  
                  toast.success(`Found ${data.totalFound || 0} jobs across ${Object.keys(data.platforms || {}).length} platforms`, {
                    description: platformInfo || `Searched: ${keywordPreview}`,
                    duration: 5000,
                  });
                } else {
                  setLastSearchResultCount(0);
                  toast.error('Search returned no results', {
                    description: 'Try different keywords or locations',
                  });
                }
              } catch (error) {
                console.error('Search error:', error);
                setActiveSearchQuery('');
                toast.error('Failed to search jobs', {
                  description: error instanceof Error ? error.message : 'Unknown error',
                });
              } finally {
                setIsSearching(false);
              }
            }}
            isSearching={isSearching}
          />
        )}

        {/* Automation Panel */}
        {filteredJobs.length > 0 && (
          <AutomationPanel 
            jobs={filteredJobs} 
            profile={profile} 
            onJobApplied={handleJobApplied}
          />
        )}

        {/* Bulk Selection Bar */}
        {jobs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3 bg-muted/50 p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <Button
                  variant={selectionMode ? "default" : "outline"}
                  size="sm"
                  onClick={toggleSelectionMode}
                  disabled={isBatchApplying}
                >
                  {selectionMode ? (
                    <>
                      <X className="h-4 w-4 mr-2" />
                      Exit Selection
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Bulk Select
                    </>
                  )}
                </Button>
                
                {selectionMode && !isBatchApplying && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                      disabled={pendingJobs.length === 0}
                    >
                      <Square className="h-4 w-4 mr-2" />
                      Select All ({pendingJobs.length})
                    </Button>
                    
                    {selectedJobs.size > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearSelection}
                      >
                        Clear Selection
                      </Button>
                    )}
                  </>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {/* Automation Controls during batch apply */}
                {isBatchApplying && (
                  <>
                    {isPaused ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={resumeBatchApply}
                        className="gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={pauseBatchApply}
                        className="gap-2"
                      >
                        <Pause className="h-4 w-4" />
                        Pause
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={stopBatchApply}
                      className="gap-2"
                    >
                      <StopCircle className="h-4 w-4" />
                      Stop
                    </Button>
                  </>
                )}
                
                {/* Start Batch Apply buttons */}
                {selectedJobs.size > 0 && !isBatchApplying && !sequentialMode && !autoSequentialMode && (
                  <>
                    <Badge variant="secondary" className="text-sm">
                      {selectedJobs.size} selected
                    </Badge>
                    
                    {/* Timeout Setting */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1">
                          <Settings2 className="h-4 w-4" />
                          <Timer className="h-3 w-3" />
                          {jobTimeout}s
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover border border-border z-50">
                        <DropdownMenuItem onClick={() => setJobTimeout(10)}>
                          10s - Ultra Fast
                          {jobTimeout === 10 && <CheckCircle className="h-4 w-4 ml-auto text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setJobTimeout(15)}>
                          15s - Very Fast
                          {jobTimeout === 15 && <CheckCircle className="h-4 w-4 ml-auto text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setJobTimeout(20)}>
                          20s - Fast
                          {jobTimeout === 20 && <CheckCircle className="h-4 w-4 ml-auto text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setJobTimeout(30)}>
                          30s - Standard
                          {jobTimeout === 30 && <CheckCircle className="h-4 w-4 ml-auto text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setJobTimeout(60)}>
                          60s - Patient
                          {jobTimeout === 60 && <CheckCircle className="h-4 w-4 ml-auto text-primary" />}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {/* Auto Sequential Apply - Main CTA */}
                    <Button
                      size="sm"
                      onClick={startAutoSequentialApply}
                      className="gap-2"
                      title="Automatically opens and applies to each job with timeout protection"
                    >
                      <FastForward className="h-4 w-4" />
                      Auto Apply ({selectedJobs.size})
                    </Button>
                    
                    {/* Manual Sequential Apply */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={startSequentialApply}
                      className="gap-2"
                      title="Opens one job at a time - you click to proceed"
                    >
                      <MousePointer className="h-4 w-4" />
                      Manual
                    </Button>
                    
                    {/* Batch Apply - Opens all at once */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleBatchApply}
                      className="gap-2"
                      title="Opens all jobs at once - may be blocked by browser"
                    >
                      <Zap className="h-4 w-4" />
                      Batch
                    </Button>
                  </>
                )}
                
                {/* Auto Sequential Mode Controls */}
                {autoSequentialMode && (
                  <>
                    {isPaused ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={resumeAutoSequential}
                        className="gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={pauseAutoSequential}
                        className="gap-2"
                      >
                        <Pause className="h-4 w-4" />
                        Pause
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={skipAutoCurrentJob}
                      className="gap-2"
                    >
                      <SkipForward className="h-4 w-4" />
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={stopAutoSequential}
                      className="gap-2"
                    >
                      <StopCircle className="h-4 w-4" />
                      Stop
                    </Button>
                  </>
                )}
                
                {/* Feedback button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFeedbackDialogOpen(true)}
                  className="gap-2 text-muted-foreground"
                >
                  <MessageSquare className="h-4 w-4" />
                  Report Issue
                </Button>
              </div>
            </div>
            
            {/* Batch Apply Progress */}
            {isBatchApplying && batchProgress.total > 0 && (
              <div className="bg-muted/50 p-4 rounded-lg border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isPaused ? (
                      <Pause className="h-5 w-5 text-yellow-500" />
                    ) : (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                    <span className="font-medium">
                      {isPaused ? 'Paused' : 'Applying to jobs...'}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {batchProgress.current} / {batchProgress.total}
                  </span>
                </div>
                
                <Progress 
                  value={(batchProgress.current / batchProgress.total) * 100} 
                  className={`h-2 ${isPaused ? '[&>div]:bg-yellow-500' : ''}`}
                />
                
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    {batchProgress.successful} successful
                  </span>
                  {batchProgress.failed > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      {batchProgress.failed} failed
                    </span>
                  )}
                </div>
              </div>
            )}
            
            {/* Auto Sequential Mode Panel */}
            {autoSequentialMode && currentAutoJob && (
              <div className="bg-gradient-to-r from-green-500/10 via-green-500/5 to-primary/5 p-4 rounded-lg border border-green-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FastForward className={`h-5 w-5 text-green-600 ${!isPaused ? 'animate-pulse' : ''}`} />
                    <span className="font-medium text-green-600">
                      Auto Apply Mode
                    </span>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-700">
                      {isPaused ? 'Paused' : 'Running'}
                    </Badge>
                    <Badge variant="outline">
                      Job {autoProgress.current} / {autoProgress.total}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Timer className="h-3 w-3" />
                      {jobTimeout}s timeout
                    </Badge>
                  </div>
                </div>
                
                {/* Current Job Card */}
                <div className="bg-background p-4 rounded-lg border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{currentAutoJob.title}</h3>
                      <p className="text-muted-foreground">{currentAutoJob.company}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span>{currentAutoJob.location}</span>
                        {currentAutoJob.salary && (
                          <span className="text-green-600">{currentAutoJob.salary}</span>
                        )}
                        {currentAutoJob.platform && (
                          <Badge variant="outline" className="text-xs">
                            {currentAutoJob.platform}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {!isPaused && (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-green-600" />
                        <span className="text-sm text-green-600">Processing...</span>
                      </div>
                    )}
                  </div>
                  {currentAutoJob.url && (
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      {currentAutoJob.url}
                    </p>
                  )}
                </div>
                
                {/* Progress */}
                <Progress 
                  value={(autoProgress.current / autoProgress.total) * 100} 
                  className={`h-2 ${isPaused ? '[&>div]:bg-yellow-500' : '[&>div]:bg-green-500'}`}
                />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      {autoProgress.successful} applied
                    </span>
                    {autoProgress.failed > 0 && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        {autoProgress.failed} failed
                      </span>
                    )}
                    {autoProgress.skipped > 0 && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <SkipForward className="h-4 w-4" />
                        {autoProgress.skipped} skipped
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {isPaused ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={resumeAutoSequential}
                        className="gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={pauseAutoSequential}
                        className="gap-2"
                      >
                        <Pause className="h-4 w-4" />
                        Pause
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={skipAutoCurrentJob}
                      className="gap-2"
                    >
                      <SkipForward className="h-4 w-4" />
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={stopAutoSequential}
                      className="gap-2"
                    >
                      <StopCircle className="h-4 w-4" />
                      Stop
                    </Button>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground text-center">
                  Jobs open automatically. Extension will autofill forms. Close the tab when done or wait for timeout.
                </p>
              </div>
            )}
            
            {/* Sequential Mode Panel */}
            {sequentialMode && currentSequentialJob && (
              <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 rounded-lg border border-primary/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MousePointer className="h-5 w-5 text-primary" />
                    <span className="font-medium text-primary">
                      Sequential Apply Mode
                    </span>
                    <Badge variant="secondary">
                      Job {currentSequentialIndex + 1} of {sequentialQueue.length}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={exitSequentialMode}
                    className="text-muted-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Exit
                  </Button>
                </div>
                
                {/* Current Job Card */}
                <div className="bg-background p-4 rounded-lg border">
                  <h3 className="font-semibold text-lg">{currentSequentialJob.title}</h3>
                  <p className="text-muted-foreground">{currentSequentialJob.company}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span>{currentSequentialJob.location}</span>
                    {currentSequentialJob.salary && (
                      <span className="text-green-600">{currentSequentialJob.salary}</span>
                    )}
                  </div>
                  {currentSequentialJob.url && (
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      {currentSequentialJob.url}
                    </p>
                  )}
                </div>
                
                {/* Progress */}
                <Progress 
                  value={(batchProgress.current / batchProgress.total) * 100} 
                  className="h-2"
                />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      {batchProgress.successful} applied
                    </span>
                    {batchProgress.failed > 0 && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <SkipForward className="h-4 w-4" />
                        {batchProgress.failed} skipped
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSkipJob}
                      className="gap-2"
                    >
                      <SkipForward className="h-4 w-4" />
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleOpenAndNext}
                      className="gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open & Apply
                    </Button>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground text-center">
                  Click "Open & Apply" to open the job page. Since you click the button, popups won't be blocked.
                </p>
              </div>
            )}
            
            {/* Failed Jobs Summary */}
            {failedJobs.length > 0 && !isBatchApplying && (
              <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <span className="font-medium text-destructive">
                      {failedJobs.length} job(s) failed to open
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFailedJobs([])}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {failedJobs.map((job) => (
                    <div key={job.id} className="flex items-start justify-between gap-2 text-sm bg-background/50 p-2 rounded">
                      <div>
                        <span className="font-medium">{job.title}</span>
                        <span className="text-muted-foreground"> at {job.company}</span>
                        <p className="text-destructive text-xs mt-1">{job.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFeedbackDialogOpen(true)}
                    className="gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Report These Issues
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Results Header */}
        {jobs.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-4 rounded-xl border border-primary/20">
            <div className="flex items-center gap-3">
              {isSearching ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">Searching...</h2>
                    <p className="text-sm text-muted-foreground">Finding matching jobs</p>
                  </div>
                </div>
              ) : sortedJobs.length === 0 ? (
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Briefcase className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">No Jobs Found</h2>
                    <p className="text-sm text-muted-foreground">
                      {activeSearchQuery ? `No results for "${activeSearchQuery}"` : 'Try adjusting your filters'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">
                      {activeSearchQuery ? (
                        <>Jobs Found: <span className="text-primary">{sortedJobs.length.toLocaleString()}</span></>
                      ) : (
                        <>All Jobs: <span className="text-primary">{sortedJobs.length.toLocaleString()}</span></>
                      )}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {activeSearchQuery ? (
                        <>Matching "{activeSearchQuery.split(',').slice(0, 2).join(', ').trim()}"
                          {totalCount > sortedJobs.length && ` • ${totalCount.toLocaleString()} total in database`}
                        </>
                      ) : (
                        totalCount > sortedJobs.length 
                          ? `Showing ${sortedJobs.length.toLocaleString()} of ${totalCount.toLocaleString()} total`
                          : `${sortedJobs.length.toLocaleString()} jobs ready to apply`
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {activeSearchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveSearchQuery('');
                    setLastSearchResultCount(null);
                    refetch();
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear Search
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    Sort: {sortBy === 'uploaded' ? 'Recently Added' : 'Posted Date'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border border-border z-50">
                  <DropdownMenuItem onClick={() => setSortBy('uploaded')}>
                    <Upload className="h-4 w-4 mr-2" />
                    Recently Added
                    {sortBy === 'uploaded' && <CheckCircle className="h-4 w-4 ml-auto text-primary" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy('posted')}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Posted Date
                    {sortBy === 'posted' && <CheckCircle className="h-4 w-4 ml-auto text-primary" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {/* Virtual Job Listings - only renders visible items */}
        {sortedJobs.length > 0 && (
          <VirtualJobList
            jobs={sortedJobs}
            hasMore={hasMore}
            isLoading={isLoading}
            onLoadMore={loadMore}
            onApply={handleJobApplied}
            selectedJobs={selectedJobs}
            onSelectionChange={setSelectedJobs}
            selectionMode={selectionMode}
            scrollRef={scrollToJobListBottomRef}
          />
        )}

        {/* Loading state for initial load */}
        {(isLoading || isScraping) && jobs.length === 0 && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/3" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <div className="flex gap-4 mb-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty state */}
        {sortedJobs.length === 0 && !isLoading && !isScraping && (
          <div className="text-center py-16">
            <Briefcase className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {jobs.length > 0 ? 'No jobs match your filters' : 'No jobs yet'}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {jobs.length > 0 
                ? 'Try adjusting your filters or search query.'
                : 'Use the search above to find jobs from top tech companies.'}
            </p>
          </div>
        )}

        {/* Stats footer */}
        {totalCount > 0 && (
          <div className="text-center text-sm text-muted-foreground py-4 border-t">
            Loaded {jobs.length.toLocaleString()} of {totalCount.toLocaleString()} jobs
            {hasMore && ' • Scroll down to load more'}
          </div>
        )}
      </div>

      {/* Scroll Navigation Buttons */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {hasMore && (
          <Button
            onClick={scrollToJobListBottom}
            className="rounded-full h-12 w-12 p-0 shadow-lg"
            size="icon"
            variant="outline"
            title="Scroll to load more jobs"
          >
            <ArrowDown className="h-5 w-5" />
          </Button>
        )}
        {showScrollTop && (
          <Button
            onClick={scrollToTop}
            className="rounded-full h-12 w-12 p-0 shadow-lg"
            size="icon"
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Feedback Dialog */}
      <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Report Batch Apply Issue
            </DialogTitle>
            <DialogDescription>
              Help us improve the batch apply feature by reporting any issues you've encountered.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {failedJobs.length > 0 && (
              <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <p className="text-sm font-medium text-destructive mb-1">
                  Recent failures: {failedJobs.length} job(s)
                </p>
                <p className="text-xs text-muted-foreground">
                  Common issues: {[...new Set(failedJobs.map(j => j.error))].slice(0, 2).join(', ')}
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Describe the issue
              </label>
              <Textarea
                placeholder="e.g., Jobs from Indeed are always blocked, popups are being blocked by the browser, links redirect to login pages..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitFeedback}
              disabled={!feedbackText.trim() || isSubmittingFeedback}
            >
              {isSubmittingFeedback ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Feedback'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Jobs;
