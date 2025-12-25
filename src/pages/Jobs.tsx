import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { LiveJobsPanel } from '@/components/jobs/LiveJobsPanel';
import { AutomationPanel } from '@/components/automation/AutomationPanel';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Search,
  TrendingUp,
  Calendar,
  Building2,
  Sparkles
} from 'lucide-react';

// Tier-1 companies for visual highlighting
const TIER1_COMPANIES = [
  'google', 'meta', 'apple', 'amazon', 'microsoft', 'netflix', 'stripe', 'airbnb',
  'uber', 'lyft', 'dropbox', 'salesforce', 'adobe', 'linkedin', 'twitter', 'snap',
  'shopify', 'square', 'paypal', 'coinbase', 'robinhood', 'plaid', 'figma', 'notion',
  'slack', 'zoom', 'datadog', 'snowflake', 'databricks', 'mongodb', 'openai', 'anthropic',
  'revolut', 'stripe', 'canva', 'linear', 'vercel', 'mercury', 'deel',
];

const isTier1Company = (company: string): boolean => {
  const normalized = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  return TIER1_COMPANIES.some(t1 => normalized.includes(t1) || t1.includes(normalized));
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
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week'>('today');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'applied'>('all');
  
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

  // Calculate time-based job counts
  const jobStats = useMemo(() => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    const todayJobs = jobs.filter(j => new Date(j.posted_date).getTime() > oneDayAgo);
    const weekJobs = jobs.filter(j => new Date(j.posted_date).getTime() > oneWeekAgo);
    const appliedJobs = jobs.filter(j => j.status === 'applied');
    const pendingJobs = jobs.filter(j => j.status === 'pending');
    
    // Platform breakdown
    const platforms: Record<string, number> = {};
    jobs.forEach(j => {
      if (j.platform) {
        platforms[j.platform] = (platforms[j.platform] || 0) + 1;
      }
    });
    
    return {
      total: jobs.length,
      today: todayJobs.length,
      week: weekJobs.length,
      applied: appliedJobs.length,
      pending: pendingJobs.length,
      platforms,
    };
  }, [jobs]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    return jobs.filter(job => {
      // Time filter
      if (timeFilter === 'today') {
        const jobTime = new Date(job.posted_date).getTime();
        if (jobTime < oneDayAgo) return false;
      } else if (timeFilter === 'week') {
        const jobTime = new Date(job.posted_date).getTime();
        if (jobTime < oneWeekAgo) return false;
      }
      
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          job.title.toLowerCase().includes(searchLower) ||
          job.company.toLowerCase().includes(searchLower) ||
          job.location.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      // Platform filter
      if (platformFilter !== 'all' && job.platform !== platformFilter) return false;
      
      // Status filter
      if (statusFilter !== 'all' && job.status !== statusFilter) return false;
      
      return true;
    }).sort((a, b) => b.match_score - a.match_score);
  }, [jobs, timeFilter, searchTerm, platformFilter, statusFilter]);

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

  const uniquePlatforms = useMemo(() => 
    [...new Set(jobs.map(j => j.platform).filter(Boolean))] as string[],
  [jobs]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header with Stats */}
        <div className="space-y-4">
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
            {jobs.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={clearAndRefresh}
                disabled={isSearching}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Jobs
              </Button>
            )}
          </div>

          {/* Stats Cards */}
          {jobs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card 
                className={`cursor-pointer transition-all ${timeFilter === 'today' ? 'ring-2 ring-primary' : 'hover:border-primary/50'}`}
                onClick={() => setTimeFilter('today')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Sparkles className="h-3.5 w-3.5 text-green-500" />
                    Today
                  </div>
                  <div className="text-2xl font-bold text-green-500">{jobStats.today.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">new jobs</div>
                </CardContent>
              </Card>
              
              <Card 
                className={`cursor-pointer transition-all ${timeFilter === 'week' ? 'ring-2 ring-primary' : 'hover:border-primary/50'}`}
                onClick={() => setTimeFilter('week')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Calendar className="h-3.5 w-3.5" />
                    This Week
                  </div>
                  <div className="text-2xl font-bold">{jobStats.week.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">jobs</div>
                </CardContent>
              </Card>
              
              <Card 
                className={`cursor-pointer transition-all ${timeFilter === 'all' ? 'ring-2 ring-primary' : 'hover:border-primary/50'}`}
                onClick={() => setTimeFilter('all')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    All Time
                  </div>
                  <div className="text-2xl font-bold">{jobStats.total.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">total jobs</div>
                </CardContent>
              </Card>
              
              <Card 
                className={`cursor-pointer transition-all ${statusFilter === 'applied' ? 'ring-2 ring-green-500' : 'hover:border-green-500/50'}`}
                onClick={() => setStatusFilter(statusFilter === 'applied' ? 'all' : 'applied')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    Applied
                  </div>
                  <div className="text-2xl font-bold text-green-500">{jobStats.applied}</div>
                  <div className="text-xs text-muted-foreground">applications</div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Live Jobs Panel */}
        <LiveJobsPanel onJobsFetched={refetch} />

        {/* Filters Bar */}
        {jobs.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search jobs, companies, locations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <Building2 className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {uniquePlatforms.map(platform => (
                      <SelectItem key={platform} value={platform}>
                        {platform} ({jobStats.platforms[platform] || 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'pending' | 'applied')}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending ({jobStats.pending})</SelectItem>
                    <SelectItem value="applied">Applied ({jobStats.applied})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Active Filters */}
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant={timeFilter === 'today' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setTimeFilter('today')}>
                  Today ({jobStats.today})
                </Badge>
                <Badge variant={timeFilter === 'week' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setTimeFilter('week')}>
                  This Week ({jobStats.week})
                </Badge>
                <Badge variant={timeFilter === 'all' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setTimeFilter('all')}>
                  All Time ({jobStats.total})
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Automation Panel */}
        {filteredJobs.length > 0 && (
          <AutomationPanel 
            jobs={filteredJobs} 
            profile={profile} 
            onJobApplied={handleJobApplied}
          />
        )}

        {/* Results Header */}
        {jobs.length > 0 && (
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {timeFilter === 'today' ? "Today's Jobs" : timeFilter === 'week' ? "This Week's Jobs" : "All Jobs"}
              <span className="text-muted-foreground font-normal ml-2">
                ({filteredJobs.length.toLocaleString()} results)
              </span>
            </h2>
          </div>
        )}

        {/* Job Listings */}
        <div className="space-y-3">
          {filteredJobs.map((job, index) => {
            const isLast = index === filteredJobs.length - 1;
            const isTier1 = isTier1Company(job.company);
            const isNew = Date.now() - new Date(job.posted_date).getTime() < 2 * 60 * 60 * 1000;
            
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
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-lg truncate">{job.title}</h3>
                        {isNew && (
                          <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0">NEW</Badge>
                        )}
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
              {jobs.length > 0 ? 'No jobs match your filters' : 'No jobs yet'}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {jobs.length > 0 
                ? 'Try adjusting your filters or selecting a different time range.'
                : 'Click "Start Live" above to fetch fresh jobs from top tech companies.'}
            </p>
            {jobs.length > 0 && (
              <Button variant="outline" onClick={() => { setTimeFilter('all'); setSearchTerm(''); setPlatformFilter('all'); setStatusFilter('all'); }} className="mt-4">
                Reset Filters
              </Button>
            )}
          </div>
        )}

        {/* End of list */}
        {!hasMore && filteredJobs.length > 0 && (
          <p className="text-center text-muted-foreground py-4">
            Showing {filteredJobs.length} of {jobs.length} jobs
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
