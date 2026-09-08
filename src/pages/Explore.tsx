import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  BadgeCheck,
  BookmarkPlus,
  Building2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  HelpCircle,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldQuestion,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useJobSearch, type SearchedJob } from '@/hooks/useJobSearch';
import {
  DEFAULT_FILTERS,
  EMPLOYMENT_OPTIONS,
  POSTED_OPTIONS,
  SENIORITY_OPTIONS,
  WORKPLACE_OPTIONS,
  activeFilterCount,
  eligibilityNotes,
  hasNearbyAreas,
  isStrictWindow,
  loadFilters,
  providerLabel,
  riskLabel,
  saveFilters,
  skillOverlap,
  synonymsUsed,
  tidyLocation,
  type JobSearchFilters,
} from '@/lib/jobSearch';

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function exactTime(iso: string | null): string {
  if (!iso) return 'not recorded';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Link trust, stated plainly - never "verified" or "scam-free". */
function LinkStatusBadge({ job }: { job: SearchedJob }) {
  if (job.link_status === 'active') {
    return (
      <Badge variant="outline" className="gap-1 border-success/60 text-success">
        <BadgeCheck className="h-3 w-3" />
        Link reached this vacancy
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-warning/60 text-warning">
      <ShieldQuestion className="h-3 w-3" />
      Unverified
    </Badge>
  );
}

function JobRow({
  job,
  selected,
  onSelect,
}: {
  job: SearchedJob;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-4 text-left transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{job.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {job.company}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {tidyLocation(job.location)}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          {job.posted_at_known ? (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Posted {relativeTime(job.posted_at)}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-warning">
              <HelpCircle className="h-3 w-3" />
              Posting date unknown
            </span>
          )}
          <div className="mt-1">Found {relativeTime(job.first_seen_at)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LinkStatusBadge job={job} />
        {job.workplace_type && (
          <Badge variant="secondary" className="text-xs">
            {job.workplace_type}
          </Badge>
        )}
        {job.employment_type && (
          <Badge variant="secondary" className="text-xs">
            {job.employment_type}
          </Badge>
        )}
        {job.salary && (
          <Badge variant="secondary" className="text-xs">
            {job.salary}
          </Badge>
        )}
        {job.duplicate_count > 0 && (
          <Badge variant="outline" className="text-xs">
            <Copy className="mr-1 h-3 w-3" />
            {job.duplicate_count} duplicate {job.duplicate_count === 1 ? 'copy' : 'copies'} hidden
          </Badge>
        )}
        {job.risk_flags.filter((f) => f !== 'very_short_description').length > 0 && (
          <Badge variant="outline" className="gap-1 border-destructive/60 text-destructive text-xs">
            <AlertTriangle className="h-3 w-3" />
            Check this listing
          </Badge>
        )}
      </div>
    </button>
  );
}

const ExplorePage = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [filters, setFilters] = useState<JobSearchFilters>(() => loadFilters());
  const [queryDraft, setQueryDraft] = useState(filters.query);
  const [locationDraft, setLocationDraft] = useState(filters.location);
  const [companyDraft, setCompanyDraft] = useState(filters.company);
  const [skillDraft, setSkillDraft] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Filters survive a reload.
  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, query: queryDraft })), 350);
    return () => clearTimeout(t);
  }, [queryDraft]);
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, location: locationDraft })), 350);
    return () => clearTimeout(t);
  }, [locationDraft]);
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, company: companyDraft })), 350);
    return () => clearTimeout(t);
  }, [companyDraft]);

  const {
    jobs,
    total,
    isLoading,
    isFetchingMore,
    hasMore,
    error,
    loadMore,
    reload,
    sources,
    failingSources,
    ingest,
    verify,
    refreshNow,
    isRefreshing,
  } = useJobSearch(filters);

  useEffect(() => {
    if (jobs.length && !jobs.some((j) => j.id === selectedId)) setSelectedId(jobs[0].id);
  }, [jobs, selectedId]);

  const selected = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? jobs[0],
    [jobs, selectedId],
  );

  const confirmedSkills = useMemo(() => {
    const raw = profile?.skills as unknown;
    if (Array.isArray(raw)) {
      return raw
        .flatMap((group: any) =>
          typeof group === 'string' ? [group] : Array.isArray(group?.items) ? group.items : [],
        )
        .filter((s: unknown): s is string => typeof s === 'string');
    }
    return [];
  }, [profile]);

  const toggleIn = (key: 'workplace' | 'seniority' | 'employment', value: string) => {
    setFilters((f) => {
      const current = f[key];
      return {
        ...f,
        [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
      };
    });
  };

  const addSkill = () => {
    const value = skillDraft.trim();
    if (!value) return;
    setFilters((f) => (f.skills.includes(value) ? f : { ...f, skills: [...f.skills, value] }));
    setSkillDraft('');
  };

  const clearAll = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setQueryDraft('');
    setLocationDraft('');
    setCompanyDraft('');
  };

  const handleRefresh = async () => {
    try {
      const result = await refreshNow();
      const failed = result?.sources_failed ?? 0;
      if (failed > 0) {
        toast.warning(
          `Refreshed, but ${failed} career ${failed === 1 ? 'board' : 'boards'} failed. See "Where these jobs come from".`,
        );
      } else {
        toast.success(`Refreshed ${result?.sources_polled ?? 0} career boards, ${result?.jobs_inserted ?? 0} new vacancies.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Refresh failed. Nothing was changed.');
    }
  };

  const saveJob = async (job: SearchedJob) => {
    if (!user) return;
    setSavingId(job.id);
    try {
      const { error: saveError } = await supabase.from('jobs').insert({
        user_id: user.id,
        title: job.title,
        company: job.company,
        location: tidyLocation(job.location),
        description: job.description,
        // Always the direct employer application link.
        url: job.resolved_url ?? job.url,
        platform: job.provider,
        posted_date: job.posted_at_known ? job.posted_at : null,
        employment_type: job.employment_type ?? null,
        workplace_type: job.workplace_type ?? null,
        source_name: providerLabel(job.provider),
        url_status: job.link_status,
        url_last_checked: job.link_checked_at,
      });
      if (saveError) throw saveError;
      setSavedIds((prev) => new Set(prev).add(job.id));
      toast.success(`Saved ${job.title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save this vacancy');
    } finally {
      setSavingId(null);
    }
  };

  const synonyms = synonymsUsed(filters.query);
  const filterCount = activeFilterCount(filters);
  const overlap = selected
    ? skillOverlap(selected.description, selected.title, confirmedSkills)
    : { matched: [], missing: [], measurable: false };
  const eligibility = selected ? eligibilityNotes(selected.description) : [];
  const realRisks = selected?.risk_flags.filter((f) => f !== 'very_short_description') ?? [];

  return (
    <AppLayout>
      <div className="container px-4 py-6">
        {/* Header: what is happening, when, and the next action */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Find a job</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Vacancies taken straight from employers' own career boards.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-right text-xs text-muted-foreground">
              <div>Sources last pulled {relativeTime(ingest.lastRunAt)}</div>
              <div>Links last checked {relativeTime(verify.lastRunAt)}</div>
            </div>
            <Button onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing' : 'Refresh now'}
            </Button>
          </div>
        </div>

        {failingSources.length > 0 && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {failingSources.length} career {failingSources.length === 1 ? 'board is' : 'boards are'} not responding
            </AlertTitle>
            <AlertDescription className="text-sm">
              Results are missing vacancies from {failingSources.slice(0, 4).map((s) => s.company_name).join(', ')}
              {failingSources.length > 4 ? ` and ${failingSources.length - 4} more` : ''}. Everything else is up to date.
            </AlertDescription>
          </Alert>
        )}

        {ingest.lastError && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Last refresh reported a problem</AlertTitle>
            <AlertDescription className="break-words text-sm">{ingest.lastError}</AlertDescription>
          </Alert>
        )}

        {/* Search bar */}
        <div className="mb-3 grid gap-3 lg:grid-cols-[2fr_1.2fr_1fr_1fr]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              placeholder="Job title, e.g. data engineer"
              className="pl-9"
              aria-label="Job title or keyword"
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={locationDraft}
              onChange={(e) => setLocationDraft(e.target.value)}
              placeholder="Location, e.g. Dublin"
              className="pl-9"
              aria-label="Location"
            />
          </div>
          <Select value={filters.posted} onValueChange={(v) => setFilters((f) => ({ ...f, posted: v }))}>
            <SelectTrigger aria-label="Date posted">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSTED_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.sort}
            onValueChange={(v) => setFilters((f) => ({ ...f, sort: v as JobSearchFilters['sort'] }))}
          >
            <SelectTrigger aria-label="Sort order">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="relevance">Most relevant</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Advanced options stay collapsed */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                More filters
                {filterCount > 0 && <Badge variant="secondary">{filterCount}</Badge>}
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            {filterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            )}
            {filters.location.trim() && hasNearbyAreas(filters.location) && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={filters.includeNearby}
                  onCheckedChange={(v) => setFilters((f) => ({ ...f, includeNearby: v }))}
                />
                Include nearby commuting areas (approximate, not a measured distance)
              </label>
            )}
          </div>

          <CollapsibleContent>
            <Card className="mb-4">
              <CardContent className="grid gap-6 p-5 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Company</Label>
                  <Input
                    value={companyDraft}
                    onChange={(e) => setCompanyDraft(e.target.value)}
                    placeholder="Any company"
                    className="mt-2"
                  />
                  <Label className="mt-4 block text-xs uppercase tracking-wide text-muted-foreground">
                    Must mention these skills
                  </Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={skillDraft}
                      onChange={(e) => setSkillDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSkill();
                        }
                      }}
                      placeholder="e.g. Python"
                    />
                    <Button type="button" variant="outline" onClick={addSkill}>
                      Add
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {filters.skills.map((s) => (
                      <Badge key={s} variant="secondary" className="gap-1">
                        {s}
                        <button
                          type="button"
                          aria-label={`Remove ${s}`}
                          onClick={() => setFilters((f) => ({ ...f, skills: f.skills.filter((x) => x !== s) }))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Where you work</Label>
                  <div className="mt-2 space-y-2">
                    {WORKPLACE_OPTIONS.map((w) => (
                      <label key={w} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={filters.workplace.includes(w)}
                          onCheckedChange={() => toggleIn('workplace', w)}
                        />
                        {w === 'Onsite' ? 'On site' : w}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Seniority</Label>
                  <div className="mt-2 space-y-2">
                    {SENIORITY_OPTIONS.map((o) => (
                      <label key={o.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={filters.seniority.includes(o.value)}
                          onCheckedChange={() => toggleIn('seniority', o.value)}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Contract</Label>
                  <div className="mt-2 space-y-2">
                    {EMPLOYMENT_OPTIONS.map((o) => (
                      <label key={o.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={filters.employment.includes(o.value)}
                          onCheckedChange={() => toggleIn('employment', o.value)}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  <label className="mt-4 flex items-start gap-2 text-sm">
                    <Switch
                      checked={filters.includeUnverified}
                      onCheckedChange={(v) => setFilters((f) => ({ ...f, includeUnverified: v }))}
                    />
                    <span>
                      Include vacancies whose link we have not confirmed yet
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Turn off to see only vacancies whose application link we reached successfully.
                      </span>
                    </span>
                  </label>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Result summary and honest caveats */}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            {isLoading
              ? 'Searching'
              : error
                ? 'Results unavailable'
                : `${total.toLocaleString()} ${total === 1 ? 'vacancy' : 'vacancies'}`}
          </span>
          {!error && synonyms.length > 0 && <span>Also searched: {synonyms.slice(0, 5).join(', ')}</span>}
          {!error && isStrictWindow(filters.posted) && (
            <span>Vacancies without a genuine posting date are left out of this date range.</span>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Couldn't load jobs</AlertTitle>
            <AlertDescription className="text-sm">
              Something went wrong on our side, so no vacancies could be loaded. This is not an empty result.
              <Button variant="outline" size="sm" className="ml-3" onClick={reload}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}


        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* Results */}
          <div className="space-y-3">
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}

            {!isLoading && !error && jobs.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="font-medium">No vacancies match these filters</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try a wider date range, or clear a filter. Nothing is hidden from you here - there simply are no
                    matches in the sources we cover.
                  </p>
                  <Button variant="outline" className="mt-4" onClick={clearAll}>
                    Clear filters
                  </Button>
                </CardContent>
              </Card>
            )}

            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                selected={selected?.id === job.id}
                onSelect={() => setSelectedId(job.id)}
              />
            ))}

            {hasMore && (
              <Button variant="outline" className="w-full" onClick={loadMore} disabled={isFetchingMore}>
                {isFetchingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Show more ({jobs.length} of {total.toLocaleString()})
              </Button>
            )}
          </div>

          {/* Detail */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {selected && (
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <h2 className="text-lg font-semibold">{selected.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {selected.company} - {tidyLocation(selected.location)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="gap-2"
                      onClick={() => window.open(selected.resolved_url ?? selected.url, '_blank', 'noopener')}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Apply on the employer's site
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => saveJob(selected)}
                      disabled={savingId === selected.id || savedIds.has(selected.id)}
                    >
                      {savingId === selected.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <BookmarkPlus className="h-4 w-4" />
                      )}
                      {savedIds.has(selected.id) ? 'Saved' : 'Save'}
                    </Button>
                  </div>

                  {/* Provenance: where it came from and when we touched it */}
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                    <p className="mb-2 font-medium">Where this came from</p>
                    <dl className="grid gap-1.5 text-muted-foreground">
                      <div className="flex justify-between gap-3">
                        <dt>Source</dt>
                        <dd className="text-right text-foreground">{providerLabel(selected.provider)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Employer's posting date</dt>
                        <dd className="text-right text-foreground">
                          {selected.posted_at_known ? exactTime(selected.posted_at) : 'Not published by the employer'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>First found by us</dt>
                        <dd className="text-right text-foreground">{exactTime(selected.first_seen_at)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Link last checked</dt>
                        <dd className="text-right text-foreground">
                          {selected.link_checked_at ? exactTime(selected.link_checked_at) : 'not checked yet'}
                        </dd>
                      </div>
                      {selected.requisition_id && (
                        <div className="flex justify-between gap-3">
                          <dt>Employer reference</dt>
                          <dd className="text-right text-foreground">{selected.requisition_id}</dd>
                        </div>
                      )}
                    </dl>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {selected.link_status === 'active'
                        ? 'We opened this link and found this vacancy on the page. That is a link check, not an endorsement of the employer.'
                        : selected.link_note ??
                          'We have not been able to confirm this link yet, so treat it as unchecked.'}
                    </p>
                  </div>

                  {/* Concrete suspicion indicators only */}
                  {realRisks.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Worth a closer look</AlertTitle>
                      <AlertDescription className="text-sm">
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {realRisks.map((f) => (
                            <li key={f}>{riskLabel(f)}</li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs">
                          These are things the listing itself says. It may still be genuine - we are not calling it a scam.
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Eligibility: stated requirements and honest unknowns */}
                  <div>
                    <p className="mb-2 text-sm font-medium">Eligibility</p>
                    <ul className="space-y-1.5 text-sm">
                      {eligibility.map((note, i) => (
                        <li key={i} className="flex gap-2">
                          {note.kind === 'requirement' ? (
                            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                          ) : (
                            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                          )}
                          <span className={note.kind === 'unknown' ? 'text-muted-foreground' : ''}>{note.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Skill overlap against confirmed profile skills */}
                  <div>
                    <p className="mb-2 text-sm font-medium">Against your saved skills</p>
                    {!overlap.measurable ? (
                      <p className="text-sm text-muted-foreground">
                        {confirmedSkills.length === 0
                          ? 'Add skills to your profile and we can show which ones this listing asks for.'
                          : 'This listing has no description text, so there is nothing to compare against.'}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          {overlap.matched.length} of {confirmedSkills.length} of your saved skills appear in this
                          listing. This is word overlap only, not a chance of being hired.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {overlap.matched.slice(0, 14).map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {selected.description && (
                    <div>
                      <p className="mb-2 text-sm font-medium">Description</p>
                      <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
                        {selected.description}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Source health */}
            <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex w-full items-center justify-between p-4 text-left">
                    <span className="text-sm font-medium">Where these jobs come from</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {sources.length} boards
                      {failingSources.length > 0 && (
                        <Badge variant="destructive">{failingSources.length} failing</Badge>
                      )}
                      <ChevronDown className={`h-4 w-4 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-2 border-t border-border/60 pt-4 text-sm">
                    <p className="text-xs text-muted-foreground">
                      Every source is an employer's own career board. We do not aggregate reposted listings.
                    </p>
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      {sources.map((s) => (
                        <div key={s.id} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{s.company_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {providerLabel(s.provider)} - {s.live_jobs} live
                            </p>
                            {s.last_error && (
                              <p className="mt-0.5 break-words text-xs text-destructive">{s.last_error}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right text-xs text-muted-foreground">
                            <div>checked {relativeTime(s.last_fetched_at)}</div>
                            <div>
                              {s.consecutive_failures > 0
                                ? `${s.consecutive_failures} failures in a row`
                                : `worked ${relativeTime(s.last_success_at)}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ExplorePage;
