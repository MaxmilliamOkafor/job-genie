import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { JobCard } from '@/components/jobs/JobCard';
import { JobFilters } from '@/components/jobs/JobFilters';
import { CSVUpload } from '@/components/jobs/CSVUpload';
import { mockJobs } from '@/data/mockJobs';
import { Job } from '@/types';
import { toast } from 'sonner';

const Jobs = () => {
  const [jobs, setJobs] = useState<Job[]>(mockJobs);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const searchMatch = !search || 
        job.title.toLowerCase().includes(search.toLowerCase()) ||
        job.company.toLowerCase().includes(search.toLowerCase()) ||
        job.requirements.some(r => r.toLowerCase().includes(search.toLowerCase()));

      const locationMatch = location === 'all' || 
        job.location.toLowerCase().includes(location.toLowerCase());

      const now = Date.now();
      const posted = new Date(job.postedDate).getTime();
      const hoursDiff = (now - posted) / (1000 * 60 * 60);
      
      const dateMatch = dateFilter === 'all' ||
        (dateFilter === '24h' && hoursDiff <= 24) ||
        (dateFilter === '3d' && hoursDiff <= 72) ||
        (dateFilter === 'week' && hoursDiff <= 168) ||
        (dateFilter === 'month' && hoursDiff <= 720);

      return searchMatch && locationMatch && dateMatch;
    });
  }, [jobs, search, location, dateFilter]);

  const handleApply = (job: Job) => {
    setJobs(prev => prev.map(j => 
      j.id === job.id ? { ...j, status: 'applied' as const, appliedAt: new Date().toISOString() } : j
    ));
    toast.success(`Applied to ${job.title} at ${job.company}`);
  };

  const handleCSVUpload = (urls: string[]) => {
    toast.success(`Processing ${urls.length} job URLs...`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Jobs</h1>
          <p className="text-muted-foreground mt-1">Browse and apply to {jobs.length} jobs</p>
        </div>

        <JobFilters
          search={search}
          onSearchChange={setSearch}
          location={location}
          onLocationChange={setLocation}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
        />

        <CSVUpload onUpload={handleCSVUpload} />

        <div className="grid gap-4 md:grid-cols-2">
          {filteredJobs.map(job => (
            <JobCard key={job.id} job={job} onApply={handleApply} />
          ))}
        </div>

        {filteredJobs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No jobs match your filters
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Jobs;
