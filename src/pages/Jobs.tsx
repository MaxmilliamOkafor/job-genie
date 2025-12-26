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
  Radio,
  Database,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  
  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [isValidatingLinks, setIsValidatingLinks] = useState(false);
  
  // View mode toggle - 'live' for live API jobs, 'database' for saved jobs
  const [viewMode, setViewMode] = useState<'live' | 'database'>('live');
  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const [liveJobsCount, setLiveJobsCount] = useState(0);
  const [isLiveFetching, setIsLiveFetching] = useState(false);
  
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

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
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
  }, []);

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

  // Batch apply to selected jobs
  const handleBatchApply = useCallback(async () => {
    if (selectedJobs.size === 0) return;
    
    setIsBatchApplying(true);
    const jobsToApply = Array.from(selectedJobs);
    let successCount = 0;
    let failCount = 0;
    
    // Open tabs for each selected job (up to 10 at a time to avoid browser blocking)
    const batchSize = 10;
    for (let i = 0; i < jobsToApply.length; i += batchSize) {
      const batch = jobsToApply.slice(i, i + batchSize);
      
      for (const jobId of batch) {
        const job = jobs.find(j => j.id === jobId);
        if (job?.url) {
          window.open(job.url, '_blank');
          await updateJobStatus(jobId, 'applied');
          successCount++;
        } else {
          failCount++;
        }
      }
      
      // Small delay between batches
      if (i + batchSize < jobsToApply.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setSelectedJobs(new Set());
    setSelectionMode(false);
    setIsBatchApplying(false);
    
    toast.success(`Opened ${successCount} job${successCount !== 1 ? 's' : ''} for application`, {
      description: failCount > 0 ? `${failCount} job(s) had no URL` : undefined,
    });
  }, [selectedJobs, jobs, updateJobStatus]);

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
        <LiveJobsPanel 
          onJobsFetched={refetch} 
          onLiveJobsUpdate={(jobs, count) => {
            setLiveJobs(jobs as Job[]);
            setLiveJobsCount(count);
          }}
          onFetchingChange={setIsLiveFetching}
        />

        {/* Filters Bar */}
        {jobs.length > 0 && (
          <JobFiltersBar 
            jobs={jobs} 
            onFiltersChange={handleFiltersChange}
            onSearch={async (keywords, locations, filters) => {
              if (!user) return;
              setIsSearching(true);
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
                  toast.error('Search returned no results', {
                    description: 'Try different keywords or locations',
                  });
                }
              } catch (error) {
                console.error('Search error:', error);
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

        {/* Bulk Selection Bar - Simplified */}
        {jobs.length > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-xl bg-background/60 border shadow-sm">
            <div className="flex items-center gap-2">
              <Button
                variant={selectionMode ? "default" : "ghost"}
                size="sm"
                onClick={toggleSelectionMode}
                className="gap-2"
              >
                {selectionMode ? (
                  <>
                    <X className="h-4 w-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-4 w-4" />
                    Select
                  </>
                )}
              </Button>
              
              {selectionMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={pendingJobs.length === 0}
                  className="gap-2 text-muted-foreground"
                >
                  <Square className="h-4 w-4" />
                  All ({pendingJobs.length})
                </Button>
              )}
            </div>
            
            {selectedJobs.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedJobs.size} selected
                </span>
                <Button
                  size="sm"
                  onClick={handleBatchApply}
                  disabled={isBatchApplying}
                  className="gap-2"
                >
                  {isBatchApplying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Apply All
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Results Header with View Toggle - Redesigned */}
        {(jobs.length > 0 || liveJobs.length > 0) && (
          <Card className="border-0 bg-gradient-to-r from-muted/30 via-muted/20 to-muted/30 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Toggle Pills - More Visual */}
                <div className="flex items-center gap-3">
                  <div className="flex bg-background/80 rounded-xl p-1 shadow-inner border">
                    <button
                      onClick={() => setViewMode('live')}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                        viewMode === 'live'
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <div className={`relative ${viewMode === 'live' ? 'animate-pulse' : ''}`}>
                        <Radio className="h-4 w-4" />
                        {viewMode === 'live' && liveJobsCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full" />
                        )}
                      </div>
                      <span>Live Feed</span>
                      {liveJobsCount > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          viewMode === 'live' 
                            ? 'bg-primary-foreground/20' 
                            : 'bg-primary/10 text-primary'
                        }`}>
                          {liveJobsCount.toLocaleString()}
                        </span>
                      )}
                    </button>
                    
                    <button
                      onClick={() => setViewMode('database')}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                        viewMode === 'database'
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <Database className="h-4 w-4" />
                      <span>Saved Jobs</span>
                      {totalCount > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          viewMode === 'database' 
                            ? 'bg-primary-foreground/20' 
                            : 'bg-primary/10 text-primary'
                        }`}>
                          {totalCount.toLocaleString()}
                        </span>
                      )}
                    </button>
                  </div>
                  
                  {/* Result Count */}
                  <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground border-l pl-4">
                    {viewMode === 'live' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <span>{liveJobs.length.toLocaleString()} results</span>
                      </>
                    ) : (
                      <span>{sortedJobs.length.toLocaleString()} of {totalCount.toLocaleString()}</span>
                    )}
                  </div>
                </div>
                
                {/* Sort Button */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 bg-background/80">
                      <ArrowUpDown className="h-4 w-4" />
                      <span className="hidden sm:inline">Sort:</span>
                      {sortBy === 'uploaded' ? 'Recent' : 'Posted'}
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
            </CardContent>
          </Card>
        )}

        {/* Virtual Job Listings - shows live or database jobs based on toggle */}
        {viewMode === 'live' && liveJobs.length > 0 && (
          <VirtualJobList
            jobs={liveJobs}
            hasMore={false}
            isLoading={false}
            onLoadMore={() => {}}
            onApply={handleJobApplied}
            selectedJobs={selectedJobs}
            onSelectionChange={setSelectedJobs}
            selectionMode={selectionMode}
            scrollRef={scrollToJobListBottomRef}
          />
        )}
        
        {viewMode === 'database' && sortedJobs.length > 0 && (
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

        {/* Empty state for live view - Enhanced */}
        {viewMode === 'live' && liveJobs.length === 0 && !isLiveFetching && (
          <Card className="border-dashed border-2 bg-gradient-to-br from-primary/5 via-background to-primary/5">
            <CardContent className="py-16 text-center">
              <div className="relative inline-block mb-6">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                <div className="relative bg-gradient-to-br from-primary/20 to-primary/10 p-6 rounded-full">
                  <Radio className="h-12 w-12 text-primary" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-2">Ready to Go Live</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                Hit "Start Live" above to begin streaming fresh jobs from 60+ top tech companies in real-time.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span>Auto-refreshes every 2 minutes</span>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Empty state for database view - Enhanced */}
        {viewMode === 'database' && sortedJobs.length === 0 && !isLoading && !isScraping && (
          <Card className="border-dashed border-2 bg-gradient-to-br from-muted/30 via-background to-muted/30">
            <CardContent className="py-16 text-center">
              <div className="relative inline-block mb-6">
                <div className="relative bg-muted/50 p-6 rounded-full">
                  <Database className="h-12 w-12 text-muted-foreground" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-2">
                {jobs.length > 0 ? 'No matches found' : 'Your job vault is empty'}
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {jobs.length > 0 
                  ? 'Try adjusting your filters to see more results.'
                  : 'Jobs from live polling will be automatically saved here.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats footer - Only show in database view */}
        {viewMode === 'database' && totalCount > 0 && (
          <div className="text-center text-sm text-muted-foreground py-3">
            {jobs.length.toLocaleString()} of {totalCount.toLocaleString()} jobs loaded
            {hasMore && (
              <span className="ml-2 text-primary cursor-pointer hover:underline" onClick={loadMore}>
                • Load more
              </span>
            )}
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
    </AppLayout>
  );
};

export default Jobs;
