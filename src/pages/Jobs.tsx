import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { JobFilters } from '@/components/jobs/JobFilters';
import { CSVUpload } from '@/components/jobs/CSVUpload';
import { AutomationPanel } from '@/components/automation/AutomationPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useJobs, Job } from '@/hooks/useJobs';
import { useProfile } from '@/hooks/useProfile';
import { toast } from 'sonner';
import { 
  Briefcase, 
  MapPin, 
  DollarSign, 
  Clock, 
  ExternalLink, 
  Zap,
  CheckCircle,
  Loader2,
  Sparkles,
  Plus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Sample job data generator
const generateSampleJobs = (count: number): Omit<Job, 'id'>[] => {
  const titles = [
    'Senior Software Engineer', 'Staff Engineer', 'Principal Engineer',
    'Engineering Manager', 'Tech Lead', 'Full Stack Developer',
    'Backend Engineer', 'Frontend Engineer', 'Platform Engineer',
    'ML Engineer', 'Data Engineer', 'DevOps Engineer', 'SRE',
    'Solutions Architect', 'Cloud Architect', 'AI/ML Specialist'
  ];
  
  const companies = [
    'Google', 'Microsoft', 'Amazon', 'Apple', 'Netflix', 'Spotify',
    'Stripe', 'Airbnb', 'Uber', 'Lyft', 'DoorDash', 'Coinbase',
    'Databricks', 'Snowflake', 'MongoDB', 'Elastic', 'HashiCorp',
    'Cloudflare', 'Twilio', 'Slack', 'Zoom', 'Figma', 'Notion',
    'Linear', 'Vercel', 'Supabase', 'PlanetScale', 'Railway'
  ];
  
  const locations = [
    'San Francisco, CA', 'New York, NY', 'Seattle, WA', 'Austin, TX',
    'London, UK', 'Dublin, Ireland', 'Berlin, Germany', 'Amsterdam, NL',
    'Toronto, Canada', 'Singapore', 'Remote', 'Hybrid - NYC',
    'Hybrid - SF', 'Hybrid - London'
  ];
  
  const platforms = ['Workday', 'Greenhouse', 'Lever', 'Ashby', 'iCIMS'];
  
  const requirements = [
    'Python', 'Java', 'TypeScript', 'React', 'Node.js', 'AWS', 'GCP',
    'Kubernetes', 'Docker', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka',
    'Machine Learning', 'Deep Learning', 'NLP', 'System Design',
    'Distributed Systems', 'Microservices', 'CI/CD', 'Terraform'
  ];

  return Array.from({ length: count }, (_, i) => {
    const title = titles[Math.floor(Math.random() * titles.length)];
    const company = companies[Math.floor(Math.random() * companies.length)];
    const location = locations[Math.floor(Math.random() * locations.length)];
    const salary = `$${150 + Math.floor(Math.random() * 150)}k - $${200 + Math.floor(Math.random() * 200)}k`;
    const matchScore = 60 + Math.floor(Math.random() * 40);
    const hoursAgo = Math.floor(Math.random() * 168);
    const postedDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    
    const jobRequirements = Array.from(
      { length: 4 + Math.floor(Math.random() * 4) },
      () => requirements[Math.floor(Math.random() * requirements.length)]
    ).filter((v, i, a) => a.indexOf(v) === i);

    return {
      title,
      company,
      location,
      salary,
      description: `We're looking for a ${title} to join our team at ${company}. You'll work on cutting-edge technology and help us scale our platform to millions of users.`,
      requirements: jobRequirements,
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      url: `https://careers.${company.toLowerCase().replace(/\s/g, '')}.com/jobs/${i}`,
      posted_date: postedDate,
      match_score: matchScore,
      status: 'pending' as const,
      applied_at: null,
    };
  });
};

const Jobs = () => {
  const { jobs, isLoading, hasMore, loadMore, addBulkJobs, updateJobStatus } = useJobs();
  const { profile } = useProfile();
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const observerRef = useRef<IntersectionObserver>();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  const lastJobRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoading) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    });
    
    if (node) observerRef.current.observe(node);
  }, [isLoading, hasMore, loadMore]);

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const searchMatch = !search || 
        job.title.toLowerCase().includes(search.toLowerCase()) ||
        job.company.toLowerCase().includes(search.toLowerCase()) ||
        job.requirements?.some(r => r.toLowerCase().includes(search.toLowerCase()));

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

  const handleCSVUpload = (urls: string[]) => {
    toast.success(`Processing ${urls.length} job URLs...`);
  };

  const handleGenerateSampleJobs = async () => {
    setIsGenerating(true);
    try {
      const sampleJobs = generateSampleJobs(100);
      await addBulkJobs(sampleJobs);
      toast.success('Generated 100 sample jobs!');
    } catch (error) {
      toast.error('Failed to generate jobs');
    } finally {
      setIsGenerating(false);
    }
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Jobs</h1>
            <p className="text-muted-foreground mt-1">
              {jobs.length} jobs loaded • {filteredJobs.filter(j => j.status === 'pending').length} ready to apply
            </p>
          </div>
          <Button onClick={handleGenerateSampleJobs} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Generate 100 Jobs
          </Button>
        </div>

        {/* Automation Panel */}
        <AutomationPanel 
          jobs={filteredJobs} 
          profile={profile} 
          onJobApplied={handleJobApplied}
        />

        <JobFilters
          search={search}
          onSearchChange={setSearch}
          location={location}
          onLocationChange={setLocation}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
        />

        <CSVUpload onUpload={handleCSVUpload} />

        {/* Job Listings with Infinite Scroll */}
        <div className="grid gap-4 md:grid-cols-2">
          {filteredJobs.map((job, index) => {
            const isLast = index === filteredJobs.length - 1;
            return (
              <Card 
                key={job.id} 
                ref={isLast ? lastJobRef : null}
                className={`overflow-hidden transition-all hover:shadow-lg hover:border-primary/30 ${
                  job.status === 'applied' ? 'border-green-500/30 bg-green-500/5' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{job.title}</h3>
                        {job.status === 'applied' && (
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{job.company}</p>
                    </div>
                    <Badge className={`${getMatchScoreColor(job.match_score)} flex-shrink-0`}>
                      <Sparkles className="h-3 w-3 mr-1" />
                      {job.match_score}%
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
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
                      {job.requirements.slice(0, 4).map((req, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {req}
                        </Badge>
                      ))}
                      {job.requirements.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{job.requirements.length - 4}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-4">
                    {job.status === 'pending' ? (
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleJobApplied(job.id)}
                      >
                        <Zap className="h-4 w-4 mr-1" />
                        Quick Apply
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" className="flex-1" disabled>
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
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {job.platform && (
                    <div className="mt-3 pt-3 border-t">
                      <Badge variant="outline" className="text-xs">
                        <Briefcase className="h-3 w-3 mr-1" />
                        {job.platform}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="flex gap-1.5 mt-3">
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
        <div ref={loadMoreRef} className="h-10" />

        {filteredJobs.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No jobs match your filters. Try adjusting your search or generate sample jobs.
            </p>
          </div>
        )}

        {!hasMore && jobs.length > 0 && (
          <p className="text-center text-muted-foreground py-4">
            All jobs loaded
          </p>
        )}
      </div>
    </AppLayout>
  );
};

export default Jobs;
