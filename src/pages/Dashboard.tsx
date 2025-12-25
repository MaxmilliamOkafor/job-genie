import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { JobCard } from '@/components/jobs/JobCard';
import { KeywordMonitorPanel } from '@/components/jobs/KeywordMonitorPanel';
import { mockJobs } from '@/data/mockJobs';
import { KeywordMonitor, Job } from '@/types';
import { Briefcase, CheckCircle2, MessageCircle, Gift, Zap, Infinity } from 'lucide-react';
import { toast } from 'sonner';

const Dashboard = () => {
  const [jobs, setJobs] = useState<Job[]>(mockJobs);
  const [monitors, setMonitors] = useState<KeywordMonitor[]>([
    {
      id: '1',
      keywords: ['Python', 'Machine Learning', 'AI'],
      roles: ['Senior Engineer', 'Staff Engineer'],
      locations: ['London', 'Remote'],
      enabled: true,
      autoApply: true,
      minMatchScore: 85
    }
  ]);

  const stats = {
    applied: jobs.filter(j => j.status === 'applied').length,
    interviewing: jobs.filter(j => j.status === 'interviewing').length,
    offered: jobs.filter(j => j.status === 'offered').length,
    newJobs: jobs.filter(j => j.status === 'new').length,
  };

  const handleApply = (job: Job) => {
    setJobs(prev => prev.map(j => 
      j.id === job.id ? { ...j, status: 'applied' as const, appliedAt: new Date().toISOString() } : j
    ));
    toast.success(`Applied to ${job.title} at ${job.company}`);
  };

  const recentJobs = jobs.filter(j => j.status === 'new').slice(0, 3);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Your AI-powered job application agent</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard
            title="Daily Limit"
            value="∞"
            subtitle="Unlimited applications"
            icon={<Infinity className="h-5 w-5" />}
            valueClassName="text-primary"
          />
          <StatsCard
            title="New Jobs"
            value={stats.newJobs}
            subtitle="Ready to apply"
            icon={<Zap className="h-5 w-5" />}
          />
          <StatsCard
            title="Applied"
            value={stats.applied}
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
          <StatsCard
            title="Interviewing"
            value={stats.interviewing}
            icon={<MessageCircle className="h-5 w-5" />}
          />
          <StatsCard
            title="Offers"
            value={stats.offered}
            icon={<Gift className="h-5 w-5" />}
            valueClassName="text-success"
          />
        </div>

        {/* Keyword Monitors */}
        <KeywordMonitorPanel monitors={monitors} onUpdate={setMonitors} />

        {/* Recent High-Match Jobs */}
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Top Matches Ready to Apply
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recentJobs.map(job => (
              <JobCard key={job.id} job={job} onApply={handleApply} />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
