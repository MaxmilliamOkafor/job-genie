import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  BookmarkPlus,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useJobPool, type PoolJob, type PoolSort } from '@/hooks/useJobPool';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function isFresh(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}

const ExplorePage = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [location, setLocation] = useState('');
  const [debouncedLocation, setDebouncedLocation] = useState('');
  const [workplace, setWorkplace] = useState('all');
  const [sort, setSort] = useState<PoolSort>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedLocation(location), 350);
    return () => clearTimeout(t);
  }, [location]);

  const filters = useMemo(
    () => ({ search: debouncedSearch, location: debouncedLocation, workplace }),
    [debouncedSearch, debouncedLocation, workplace],
  );

  const {
    jobs,
    isLoading,
    isFetchingMore,
    hasMore,
    total,
    freshCount,
    lastChecked,
    loadMore,
    refresh,
  } = useJobPool(filters, sort);

  useEffect(() => {
    if (!selectedId && jobs.length) setSelectedId(jobs[0].id);
  }, [jobs, selectedId]);

  const selected: PoolJob | undefined = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? jobs[0],
    [jobs, selectedId],
  );

  const saveJob = async (job: PoolJob) => {
    if (!user) return;
    setSavingId(job.id);
    try {
      const { error } = await supabase.from('jobs').insert({
        user_id: user.id,
        title: job.title,
        company: job.company,
        location: job.location ?? 'Not specified',
        description: job.description,
        url: job.url,
        platform: job.provider,
        posted_date: job.posted_at,
        employment_type: job.employment_type ?? 'Full Time',
        workplace_type: job.workplace_type ?? 'Onsite',
        source_name: job.provider,
      });
      if (error) throw error;
      setSavedIds((prev) => new Set(prev).add(job.id));
      toast.success(`Saved ${job.title} to your jobs`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save this job');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="container px-4 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Sparkles className="h-6 w-6 text-primary" />
              Explore live jobs
            </h1>
            <p className="text-sm text-muted-foreground">
              Freshly posted roles pulled straight from company career boards, refreshed every 15 minutes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {freshCount > 0 && (
              <Button size="sm" onClick={refresh} className="gap-2">
                <Sparkles className="h-4 w-4" />
                {freshCount} new {freshCount === 1 ? 'job' : 'jobs'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={refresh} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Role, company or team"
              className="pl-9"
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
              className="pl-9"
            />
          </div>
          <Select value={workplace} onValueChange={setWorkplace}>
            <SelectTrigger>
              <SelectValue placeholder="Workplace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workplaces</SelectItem>
              <SelectItem value="Remote">Remote</SelectItem>
              <SelectItem value="Hybrid">Hybrid</SelectItem>
              <SelectItem value="Onsite">Onsite</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as PoolSort)}>
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="company">By company</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{total.toLocaleString()} roles in the live feed</span>
          {lastChecked && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              checked {relativeTime(lastChecked.toISOString())}
            </span>
          )}
        </div>

        {/* Two-column explorer */}
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card className="overflow-hidden">
            <ScrollArea className="h-[calc(100vh-20rem)]">
              <div className="divide-y divide-border">
                {isLoading && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}

                {!isLoading && jobs.length === 0 && (
                  <p className="p-6 text-sm text-muted-foreground">
                    No roles match those filters yet.
                  </p>
                )}

                {jobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedId(job.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 ${
                      selected?.id === job.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold leading-snug">{job.title}</span>
                      {isFresh(job.posted_at) && (
                        <Badge className="shrink-0" variant="default">
                          New
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {job.company}
                      </span>
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {job.location}
                        </span>
                      )}
                      <span>{relativeTime(job.posted_at)}</span>
                    </div>
                  </button>
                ))}

                {hasMore && !isLoading && (
                  <div className="p-3">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={loadMore}
                      disabled={isFetchingMore}
                    >
                      {isFetchingMore ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Load more roles'
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>

          <Card>
            <CardContent className="p-0">
              {!selected ? (
                <p className="p-6 text-sm text-muted-foreground">
                  Select a role to read the full description.
                </p>
              ) : (
                <ScrollArea className="h-[calc(100vh-20rem)]">
                  <div className="space-y-4 p-6">
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-bold">{selected.title}</h2>
                          <p className="text-sm text-muted-foreground">
                            {selected.company}
                            {selected.department ? ` · ${selected.department}` : ''}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={savingId === selected.id || savedIds.has(selected.id)}
                            onClick={() => saveJob(selected)}
                          >
                            {savingId === selected.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <BookmarkPlus className="h-4 w-4" />
                            )}
                            {savedIds.has(selected.id) ? 'Saved' : 'Save to my jobs'}
                          </Button>
                          <Button size="sm" className="gap-2" asChild>
                            <a href={selected.url} target="_blank" rel="noopener noreferrer">
                              Apply <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {selected.location && <Badge variant="secondary">{selected.location}</Badge>}
                        {selected.workplace_type && (
                          <Badge variant="secondary">{selected.workplace_type}</Badge>
                        )}
                        {selected.employment_type && (
                          <Badge variant="secondary">{selected.employment_type}</Badge>
                        )}
                        {selected.salary && <Badge variant="secondary">{selected.salary}</Badge>}
                        <Badge variant="outline">
                          Posted {relativeTime(selected.posted_at)}
                        </Badge>
                        <Badge variant="outline">via {selected.provider}</Badge>
                      </div>
                    </div>

                    <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground/90">
                      {selected.description ? (
                        selected.description
                          .split(/(?<=\.)\s+(?=[A-Z])/)
                          .reduce<string[]>((acc, sentence, i) => {
                            const idx = Math.floor(i / 4);
                            acc[idx] = `${acc[idx] ?? ''} ${sentence}`.trim();
                            return acc;
                          }, [])
                          .map((para, i) => (
                            <p key={i} className="mb-3">
                              {para}
                            </p>
                          ))
                      ) : (
                        <p className="text-muted-foreground">
                          This board does not publish the description through its feed. Open the
                          role to read it in full.
                        </p>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default ExplorePage;
