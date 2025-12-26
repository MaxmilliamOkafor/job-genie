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
          <div className="flex items-center gap-2">
            {jobs.length > 0 && (
              <>
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
            onSearch={async (keywords) => {
              if (!user) return;
              setIsSearching(true);
              try {
                const { data, error } = await supabase.functions.invoke('live-jobs', {
                  body: {
                    keywords,
                    locations: 'Remote, Dublin, Ireland, United Kingdom, United States, Germany, Netherlands, France',
                    hours: 24,
                    user_id: user.id,
                    limit: 100,
                    sortBy: 'recent',
                  },
                });
                
                if (error) throw error;
                
                if (data?.success) {
                  await refetch();
                  toast.success(`Found ${data.jobs?.length || 0} new jobs for: ${keywords.split(',').slice(0, 3).join(', ')}...`);
                }
              } catch (error) {
                console.error('Search error:', error);
                toast.error('Failed to search jobs');
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
          <div className="flex items-center justify-between flex-wrap gap-3 bg-muted/50 p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Button
                variant={selectionMode ? "default" : "outline"}
                size="sm"
                onClick={toggleSelectionMode}
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
              
              {selectionMode && (
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
            
            <div className="flex items-center gap-3">
              {selectedJobs.size > 0 && (
                <>
                  <Badge variant="secondary" className="text-sm">
                    {selectedJobs.size} selected
                  </Badge>
                  <Button
                    size="sm"
                    onClick={handleBatchApply}
                    disabled={isBatchApplying}
                    className="gap-2"
                  >
                    {isBatchApplying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Batch Apply ({selectedJobs.size})
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Results Header */}
        {jobs.length > 0 && (
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Job Results
              <span className="text-muted-foreground font-normal ml-2">
                ({sortedJobs.length.toLocaleString()} shown
                {totalCount > sortedJobs.length && ` of ${totalCount.toLocaleString()} total`})
              </span>
            </h2>
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
    </AppLayout>
  );
};

export default Jobs;
