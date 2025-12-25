import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { LiveJobsPanel } from '@/components/jobs/LiveJobsPanel';
import { JobSearchPanel } from '@/components/jobs/JobSearchPanel';
import { JobFiltersAdvanced } from '@/components/jobs/JobFiltersAdvanced';
import { AutomationPanel } from '@/components/automation/AutomationPanel';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useJobScraper } from '@/hooks/useJobScraper';
import { useProfile } from '@/hooks/useProfile';
import { 
  Briefcase, 
  MapPin, 
  DollarSign, 
  Clock, 
  ExternalLink, 
  Zap,
  CheckCircle,
  ArrowUp,
  Trash2,
  Star,
  Filter,
  Radio,
  Search
} from 'lucide-react';

// Tier-1 companies for visual highlighting
const TIER1_COMPANIES = [
  'google', 'meta', 'apple', 'amazon', 'microsoft', 'netflix', 'stripe', 'airbnb',
  'uber', 'lyft', 'dropbox', 'salesforce', 'adobe', 'linkedin', 'twitter', 'snap',
  'shopify', 'square', 'paypal', 'coinbase', 'robinhood', 'plaid', 'figma', 'notion',
  'slack', 'zoom', 'datadog', 'snowflake', 'databricks', 'mongodb', 'openai', 'anthropic',
];

const isTier1Company = (company: string): boolean => {
  const normalized = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  return TIER1_COMPANIES.some(t1 => normalized.includes(t1) || t1.includes(normalized));
};

// Parse salary string to number for filtering
const parseSalaryToNumber = (salary: string | null): number => {
  if (!salary) return 0;
  const match = salary.match(/\$?(\d{2,3})/);
  if (match) {
    const num = parseInt(match[1]);
    return num < 1000 ? num * 1000 : num; // Handle both "150" and "150000" formats
  }
  return 0;
};

const Jobs = () => {
  const { 
    jobs, 
    isLoading, 
    hasMore,
    loadMore, 
    updateJobStatus,
    clearAndRefresh,
    refetch
  } = useJobScraper();
  const { profile } = useProfile();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [salaryFilter, setSalaryFilter] = useState('all');
  
  const observerRef = useRef<IntersectionObserver>();

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const lastJobRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoading || isSearching) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) loadMore();
    });
    
    if (node) observerRef.current.observe(node);
  }, [isLoading, isSearching, hasMore, loadMore]);

  // Only show valid job listings (with proper direct-apply URLs)
  const validJobs = useMemo(() => {
    return jobs.filter(job => {
      if (!job.url) return false;
      return (
        (job.url.includes('greenhouse.io') && job.url.includes('/jobs/')) ||
        (job.url.includes('workable.com') && job.url.includes('/j/')) ||
        (job.url.includes('lever.co') && job.url.match(/\/[a-f0-9-]{36}/)) ||
        (job.url.includes('ashbyhq.com') && job.url.match(/\/[a-f0-9-]{36}/)) ||
        (job.url.includes('smartrecruiters.com') && job.url.match(/\/\d+/)) ||
        (job.url.includes('myworkdayjobs.com') && job.url.includes('/job/'))
      );
    });
  }, [jobs]);

  // Apply filters
  const filteredJobs = useMemo(() => {
    return validJobs.filter(job => {
      // Search term filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          job.title.toLowerCase().includes(searchLower) ||
          job.company.toLowerCase().includes(searchLower) ||
          (job.requirements || []).some(r => r.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }
      
      // Company filter
      if (companyFilter !== 'all' && job.company !== companyFilter) return false;
      
      // Platform filter
      if (platformFilter !== 'all' && job.platform !== platformFilter) return false;
      
      // Salary filter
      if (salaryFilter !== 'all') {
        const salaryNum = parseSalaryToNumber(job.salary);
        const minSalary = parseInt(salaryFilter.replace(/[^0-9]/g, '')) * 1000;
        if (salaryNum < minSalary) return false;
      }
      
      return true;
    });
  }, [validJobs, searchTerm, companyFilter, platformFilter, salaryFilter]);

  const clearFilters = () => {
    setSearchTerm('');
    setCompanyFilter('all');
    setPlatformFilter('all');
    setSalaryFilter('all');
  };

  const handleJobApplied = (jobId: string) => updateJobStatus(jobId, 'applied');

  const getTimeAgo = (date: string) => {
    const hours = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500 bg-green-500/10 border-green-500/30';
    if (score >= 65) return 'text-primary bg-primary/10 border-primary/30';
    return 'text-muted-foreground bg-muted border-border';
  };

  const hasActiveFilters = searchTerm || companyFilter !== 'all' || platformFilter !== 'all' || salaryFilter !== 'all';

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Job Search</h1>
            <p className="text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{filteredJobs.length.toLocaleString()}</span> jobs
              {hasActiveFilters && (
                <span className="ml-1 text-xs">
                  (of {validJobs.length.toLocaleString()} total)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <Badge variant="default" className="ml-2 h-5 w-5 p-0 justify-center">
                  !
                </Badge>
              )}
            </Button>
            {jobs.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={clearAndRefresh}
                disabled={isSearching}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Search Tabs */}
        <Tabs defaultValue="live" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="live" className="gap-2">
              <Radio className="h-4 w-4" />
              Live Jobs
            </TabsTrigger>
            <TabsTrigger value="search" className="gap-2">
              <Search className="h-4 w-4" />
              Google Search
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="live" className="mt-4">
            <LiveJobsPanel onJobsFetched={refetch} />
          </TabsContent>
          
          <TabsContent value="search" className="mt-4">
            <JobSearchPanel 
              onSearchComplete={refetch}
              isSearching={isSearching}
              setIsSearching={setIsSearching}
            />
          </TabsContent>
        </Tabs>

        {/* Advanced Filters */}
        {showFilters && validJobs.length > 0 && (
          <JobFiltersAdvanced
            jobs={validJobs}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            companyFilter={companyFilter}
            onCompanyFilterChange={setCompanyFilter}
            platformFilter={platformFilter}
            onPlatformFilterChange={setPlatformFilter}
            salaryFilter={salaryFilter}
            onSalaryFilterChange={setSalaryFilter}
            onClearFilters={clearFilters}
          />
        )}

        {/* Automation Panel */}
        <AutomationPanel 
          jobs={filteredJobs} 
          profile={profile} 
          onJobApplied={handleJobApplied}
        />

        {/* Job Listings */}
        <div className="space-y-3">
          {filteredJobs.map((job, index) => {
            const isLast = index === filteredJobs.length - 1;
            const isTier1 = isTier1Company(job.company);
            
            return (
              <Card 
                key={job.id} 
                ref={isLast ? lastJobRef : null}
                className={`overflow-hidden transition-all hover:shadow-lg ${
                  job.status === 'applied' 
                    ? 'border-green-500/40 bg-green-500/5' 
                    : isTier1 
                      ? 'border-primary/40 bg-gradient-to-r from-primary/5 to-transparent' 
                      : 'hover:border-primary/30'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg truncate">{job.title}</h3>
                        {job.status === 'applied' && (
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        )}
                        {isTier1 && (
                          <Star className="h-4 w-4 text-primary fill-primary flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-muted-foreground">{job.company}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {job.match_score > 0 && (
                        <Badge className={`text-xs ${getMatchScoreColor(job.match_score)}`}>
                          {job.match_score}% match
                        </Badge>
                      )}
                      {job.platform && (
                        <Badge variant="outline" className="text-xs">
                          <Briefcase className="h-3 w-3 mr-1" />
                          {job.platform}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {job.location}
                    </span>
                    {job.salary && (
                      <span className="flex items-center gap-1 text-green-600">
                        <DollarSign className="h-3.5 w-3.5" />
                        {job.salary}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {getTimeAgo(job.posted_date)}
                    </span>
                  </div>

                  {job.requirements && job.requirements.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {job.requirements.slice(0, 6).map((req, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {req}
                        </Badge>
                      ))}
                      {job.requirements.length > 6 && (
                        <Badge variant="outline" className="text-xs">
                          +{job.requirements.length - 6}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-4">
                    {job.status === 'pending' ? (
                      <Button size="sm" onClick={() => handleJobApplied(job.id)}>
                        <Zap className="h-4 w-4 mr-1" />
                        Quick Apply
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" disabled>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Applied
                      </Button>
                    )}
                    {job.url && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => window.open(job.url!, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View Job
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Loading */}
        {(isLoading || isSearching) && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
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
                  <div className="flex gap-1.5">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty state */}
        {filteredJobs.length === 0 && !isLoading && !isSearching && (
          <div className="text-center py-16">
            <Briefcase className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {hasActiveFilters ? 'No jobs match your filters' : 'No jobs yet'}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {hasActiveFilters 
                ? 'Try adjusting your filters or clear them to see all jobs.'
                : 'Enter keywords and click search to find jobs from top ATS platforms.'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="mt-4">
                Clear Filters
              </Button>
            )}
          </div>
        )}

        {/* End of list */}
        {!hasMore && filteredJobs.length > 0 && (
          <p className="text-center text-muted-foreground py-4">
            All {filteredJobs.length} jobs loaded
          </p>
        )}
      </div>

      {/* Scroll to Top */}
      {showScrollTop && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 rounded-full h-12 w-12 p-0 shadow-lg"
          size="icon"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </AppLayout>
  );
};

export default Jobs;
