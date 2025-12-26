import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AutomationPanel } from '@/components/automation/AutomationPanel';
import { JobFiltersBar } from '@/components/jobs/JobFiltersBar';
import { VirtualJobList } from '@/components/jobs/VirtualJobList';
import { LiveJobsPanel } from '@/components/jobs/LiveJobsPanel';
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
  
  // Feedback dialog state
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  
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

  // Sort jobs based on selected sort option
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      const aDate = new Date(a.posted_date).getTime();
      const bDate = new Date(b.posted_date).getTime();
      return bDate - aDate;
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

        {/* Live Jobs Panel - Single unified search interface */}
        <LiveJobsPanel onJobsFetched={refetch} />

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
                
                {/* Start Batch Apply button */}
                {selectedJobs.size > 0 && !isBatchApplying && (
                  <>
                    <Badge variant="secondary" className="text-sm">
                      {selectedJobs.size} selected
                    </Badge>
                    <Button
                      size="sm"
                      onClick={handleBatchApply}
                      className="gap-2"
                    >
                      <Zap className="h-4 w-4" />
                      Batch Apply ({selectedJobs.size})
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
