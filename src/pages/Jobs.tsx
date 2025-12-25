import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { JobFilters } from '@/components/jobs/JobFilters';
import { BulkKeywordSearch } from '@/components/jobs/BulkKeywordSearch';
import { AutomationPanel } from '@/components/automation/AutomationPanel';
import { VerificationCodeDetector } from '@/components/email/VerificationCodeDetector';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  Loader2,
  RefreshCw,
  ArrowUp
} from 'lucide-react';

const DEFAULT_KEYWORDS = 'Technology, Data Scientist, Data Engineer, Technical, Product Analyst, Data Analyst, Business Analyst, Machine Learning Engineer, UX/UI Designer, Full Stack Developer, Customer Service, Customer Success Architect, Solution Engineer, Project Manager, Support, Software Development, Data Science, Data Analysis, Cloud Computing, Cybersecurity, Programming Languages, Agile Methodologies, User Experience (UX), User Interface (UI), DevOps, Continuous Integration (CI), Continuous Deployment (CD), Machine Learning, Project Management, Database Management, Web Development, Cloud Technologies, Data Science & Analytics, Continuous Integration, User Experience (UX) & User Interface (UI)';

const Jobs = () => {
  const { 
    jobs, 
    isLoading, 
    isScraping, 
    hasMore,
    keywords,
    loadMore, 
    startContinuousScraping,
    updateJobStatus 
  } = useJobScraper();
  const { profile } = useProfile();
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const observerRef = useRef<IntersectionObserver>();

  // Scroll-to-top visibility
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Infinite scroll observer
  const lastJobRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoading || isScraping) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    });
    
    if (node) observerRef.current.observe(node);
  }, [isLoading, isScraping, hasMore, loadMore]);

  // Auto-start scraping so the page fills without manual searching
  useEffect(() => {
    if (!keywords && jobs.length < 2000) {
      startContinuousScraping(DEFAULT_KEYWORDS);
    }
  }, [keywords, jobs.length, startContinuousScraping]);

  const filteredJobs = useMemo(() => {
    const terms = search
      .replace(/[“”"]/g, '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    return jobs.filter(job => {
      const haystack = `${job.title} ${job.company} ${(job.requirements || []).join(' ')}`.toLowerCase();
      const searchMatch = terms.length === 0
        ? true
        : terms.some((t) => haystack.includes(t.toLowerCase()));

      const locationMatch = location === 'all' || 
        job.location.toLowerCase().includes(location.toLowerCase());

      const now = Date.now();
      const posted = new Date(job.posted_date).getTime();
      const hoursDiff = (now - posted) / (1000 * 60 * 60);
      
      const dateMatch = dateFilter === 'all' ||
        (dateFilter === '24h' && hoursDiff <= 24) ||
        (dateFilter === '3d' && hoursDiff <= 72) ||
        (dateFilter === 'week' && hoursDiff <= 168) ||
        (dateFilter === 'month' && hoursDiff <= 720);

      return searchMatch && locationMatch && dateMatch;
    });
  }, [jobs, search, location, dateFilter]);

  const handleKeywordSearch = (keywords: string) => {
    setSearch(keywords);
    startContinuousScraping(keywords);
  };

  const handleJobApplied = (jobId: string) => {
    updateJobStatus(jobId, 'applied');
  };

  const getTimeAgo = (date: string) => {
    const hours = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-500 bg-green-500/10';
    if (score >= 70) return 'text-primary bg-primary/10';
    return 'text-muted-foreground bg-muted';
  };

  const getPlatformColor = (platform: string) => {
    const tier1 = ['Workday', 'Greenhouse', 'Workable', 'SAP SuccessFactors', 'iCIMS', 'LinkedIn (Direct)'];
    const tier2 = ['Oracle Taleo', 'BambooHR', 'Bullhorn'];
    
    if (tier1.includes(platform)) return 'border-green-500/30 bg-green-500/5';
    if (tier2.includes(platform)) return 'border-primary/30 bg-primary/5';
    return '';
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Jobs</h1>
            <p className="text-muted-foreground mt-1">
              {jobs.length} jobs loaded
              {isScraping && <span className="ml-2 text-primary animate-pulse">• Scraping...</span>}
            </p>
          </div>
          {isScraping && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Auto-refreshing every 10 mins
            </div>
          )}
        </div>

        {/* Bulk Keyword Search (also filters the list) */}
        <BulkKeywordSearch 
          onSearch={handleKeywordSearch}
          onFilterChange={setSearch}
          isSearching={isScraping} 
        />

        <JobFilters
          showSearch={false}
          search={search}
          onSearchChange={setSearch}
          location={location}
          onLocationChange={setLocation}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
        />

        {/* Automation Panel & Verification Codes */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AutomationPanel 
              jobs={filteredJobs} 
              profile={profile} 
              onJobApplied={handleJobApplied}
            />
          </div>
          <div className="lg:col-span-1">
            <VerificationCodeDetector />
          </div>
        </div>

        {/* Job Listings - Single Column */}
        <div className="space-y-3">
          {filteredJobs.map((job, index) => {
            const isLast = index === filteredJobs.length - 1;
            return (
              <Card 
                key={job.id} 
                ref={isLast ? lastJobRef : null}
                className={`overflow-hidden transition-all hover:shadow-lg hover:border-primary/30 ${
                  job.status === 'applied' ? 'border-green-500/30 bg-green-500/5' : ''
                } ${getPlatformColor(job.platform || '')}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{job.title}</h3>
                        {job.status === 'applied' && (
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-muted-foreground">{job.company}</p>
                    </div>
                    {job.platform && (
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        <Briefcase className="h-3 w-3 mr-1" />
                        {job.platform}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {job.location}
                    </span>
                    {job.salary && (
                      <span className="flex items-center gap-1">
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
                      <Button 
                        size="sm"
                        onClick={() => handleJobApplied(job.id)}
                      >
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

        {/* Loading indicator */}
        {(isLoading || isScraping) && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/3" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </div>
                  <div className="flex gap-4 mb-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="flex gap-1.5">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-14" />
                    <Skeleton className="h-5 w-18" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Load more trigger */}
        <div className="h-20 flex items-center justify-center">
          {hasMore && !isLoading && !isScraping && (
            <Button variant="outline" onClick={loadMore}>
              <Loader2 className="h-4 w-4 mr-2" />
              Load More Jobs
            </Button>
          )}
        </div>

        {filteredJobs.length === 0 && !isLoading && !isScraping && (
          <div className="text-center py-12">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No jobs found. Enter keywords above to start scraping jobs from ATS platforms.
            </p>
          </div>
        )}

        {!hasMore && jobs.length > 0 && (
          <p className="text-center text-muted-foreground py-4">
            All {jobs.length} jobs loaded
          </p>
        )}
      </div>

      {/* Scroll to Top Button */}
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
