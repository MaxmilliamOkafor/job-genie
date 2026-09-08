import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  ArrowLeft,
  BadgeCheck,
  BookmarkPlus,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Search,
  ShieldQuestion,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useIsMobile } from '@/hooks/use-mobile';
import { useJobSearch, type SearchedJob } from '@/hooks/useJobSearch';
import { useJobPreferences } from '@/hooks/useJobPreferences';
import {
  EMPTY_PREFERENCES,
  filtersFromPreferences,
  hasPreferences,
  type JobPreferences,
} from '@/lib/jobPreferences';
import {
  DEFAULT_FILTERS,
  EMPLOYMENT_OPTIONS,
  POSTED_OPTIONS,
  SENIORITY_OPTIONS,
  WORKPLACE_OPTIONS,
  activeFilterCount,
  eligibilityNotes,
  employerConcentration,
  hasNearbyAreas,
  isStrictWindow,
  loadFilters,
  providerLabel,
  relevanceReasons,
  riskLabel,
  saveFilters,
  skillOverlap,
  spreadByEmployer,
  synonymsUsed,
  tidyLocation,
  type JobSearchFilters,
} from '@/lib/jobSearch';

/**
 * Career boards hand us HTML. We show the employer's own words as readable
 * text, keeping paragraph and list breaks, and never inject their markup.
 */
function plainDescription(raw: string): string {
  return raw
    .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
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

function postingAge(job: SearchedJob): string {
  return job.posted_at_known ? `Posted ${relativeTime(job.posted_at)}` : 'Posting date not published';
}

/** The saved-jobs table records link state in its own vocabulary. */
const SAVED_URL_STATUS: Record<string, string> = {
  active: 'valid',
  unverified: 'unknown',
  redirected: 'unknown',
  closed: 'expired',
  removed: 'expired',
};

/** One status label per listing, stated plainly. Never "verified" or "scam-free". */
function StatusLabel({ job }: { job: SearchedJob }) {
  if (job.link_status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-success/60 bg-success/10 px-2 py-1 text-sm font-medium text-success">
        <BadgeCheck className="h-4 w-4" />
        Link checked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-warning/70 bg-warning/10 px-2 py-1 text-sm font-medium text-warning">
      <ShieldQuestion className="h-4 w-4" />
      Link not checked yet
    </span>
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
      aria-current={selected ? 'true' : undefined}
      className={`w-full rounded-xl border p-5 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/10'
          : job.link_status === 'active'
            ? 'border-border hover:border-primary/50'
            : 'border-dashed border-border hover:border-primary/50'
      }`}
    >
      <h3 className="text-lg font-semibold leading-snug text-foreground md:text-xl">{job.title}</h3>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Building2 className="h-4 w-4" />
          {job.company}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4" />
          {tidyLocation(job.location)}
        </span>
        {job.salary && <span>{job.salary}</span>}
      </p>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {job.workplace_type && <span className="text-foreground">{job.workplace_type === 'Onsite' ? 'On site' : job.workplace_type}</span>}
        <span>{postingAge(job)}</span>
        {/* On narrow screens the status keeps its own line so it is never clipped. */}
        <span className="basis-full sm:basis-auto">
          <StatusLabel job={job} />
        </span>
      </p>
    </button>
  );
}

function PreferencesDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: JobPreferences;
  onSave: (next: JobPreferences) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<JobPreferences>(initial);
  const [roleInput, setRoleInput] = useState('');
  const [locationInput, setLocationInput] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setRoleInput('');
      setLocationInput('');
    }
  }, [open, initial]);

  const addTo = (key: 'roles' | 'locations', value: string) => {
    const v = value.trim();
    if (!v) return;
    setDraft((d) => (d[key].includes(v) ? d : { ...d, [key]: [...d[key], v] }));
  };
  const removeFrom = (key: 'roles' | 'locations', value: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].filter((x) => x !== value) }));
  const toggle = (key: 'seniority' | 'workplace', value: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((x) => x !== value) : [...d[key], value],
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Your job search preferences</DialogTitle>
          <DialogDescription className="text-base">
            Searches open on these. Change them any time, or browse all jobs instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <Label className="text-base">Target roles</Label>
            <div className="mt-2 flex gap-2">
              <Input
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTo('roles', roleInput);
                    setRoleInput('');
                  }
                }}
                placeholder="e.g. data engineer"
                className="text-base"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  addTo('roles', roleInput);
                  setRoleInput('');
                }}
              >
                Add
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.roles.map((r) => (
                <Badge key={r} variant="secondary" className="gap-1.5 px-3 py-1 text-sm">
                  {r}
                  <button type="button" aria-label={`Remove ${r}`} onClick={() => removeFrom('roles', r)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-base">Locations</Label>
            <div className="mt-2 flex gap-2">
              <Input
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTo('locations', locationInput);
                    setLocationInput('');
                  }
                }}
                placeholder="e.g. Dublin"
                className="text-base"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  addTo('locations', locationInput);
                  setLocationInput('');
                }}
              >
                Add
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.locations.map((l) => (
                <Badge key={l} variant="secondary" className="gap-1.5 px-3 py-1 text-sm">
                  {l}
                  <button type="button" aria-label={`Remove ${l}`} onClick={() => removeFrom('locations', l)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <Label className="text-base">Seniority</Label>
              <div className="mt-2 space-y-2">
                {SENIORITY_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-2.5 text-base">
                    <Checkbox
                      checked={draft.seniority.includes(o.value)}
                      onCheckedChange={() => toggle('seniority', o.value)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-base">Where you work</Label>
              <div className="mt-2 space-y-2">
                {WORKPLACE_OPTIONS.map((w) => (
                  <label key={w} className="flex items-center gap-2.5 text-base">
                    <Checkbox
                      checked={draft.workplace.includes(w)}
                      onCheckedChange={() => toggle('workplace', w)}
                    />
                    {w === 'Onsite' ? 'On site' : w}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ExplorePage = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const isMobile = useIsMobile();
  const {
    preferences,
    isLoading: prefsLoading,
    isSaving: prefsSaving,
    save: savePreferences,
  } = useJobPreferences();

  const [filters, setFilters] = useState<JobSearchFilters>(() => loadFilters());
  const [queryDraft, setQueryDraft] = useState(filters.query);
  const [locationDraft, setLocationDraft] = useState(filters.location);
  const [companyDraft, setCompanyDraft] = useState(filters.company);
  const [skillDraft, setSkillDraft] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [outageOpen, setOutageOpen] = useState(false);
  const [sourceDetailOpen, setSourceDetailOpen] = useState(false);
  const [prefsDialogOpen, setPrefsDialogOpen] = useState(false);
  const [prefsApplied, setPrefsApplied] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [spread, setSpread] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

  // Open on the candidate's saved targets, once, unless they chose to browse all.
  useEffect(() => {
    if (prefsLoading || prefsApplied) return;
    setPrefsApplied(true);
    if (!hasPreferences(preferences)) return;
    setFilters((f) => filtersFromPreferences(preferences, f));
    setQueryDraft(preferences.roles[0] ?? '');
    setLocationDraft(preferences.locations[0] ?? '');
  }, [preferences, prefsLoading, prefsApplied]);

  const {
    jobs,
    total,
    page,
    pageSize,
    pageCount,
    goToPage,
    isLoading,
    error,
    reload,
    sources,
    failingSources,
    ingest,
    verify,
    refreshNow,
    isRefreshing,
  } = useJobSearch(filters);

  const orderedJobs = useMemo(
    () => (spread && filters.sort === 'newest' ? spreadByEmployer(jobs) : jobs),
    [jobs, spread, filters.sort],
  );

  useEffect(() => {
    if (orderedJobs.length && !orderedJobs.some((j) => j.id === selectedId)) {
      setSelectedId(orderedJobs[0].id);
    }
  }, [orderedJobs, selectedId]);

  const selected = useMemo(
    () => orderedJobs.find((j) => j.id === selectedId) ?? orderedJobs[0],
    [orderedJobs, selectedId],
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

  const runSearch = useCallback(() => {
    setFilters((f) => ({ ...f, query: queryDraft, location: locationDraft, company: companyDraft }));
  }, [queryDraft, locationDraft, companyDraft]);

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

  const applyPreferences = () => {
    setBrowseAll(false);
    setFilters((f) => filtersFromPreferences(preferences, f));
    setQueryDraft(preferences.roles[0] ?? '');
    setLocationDraft(preferences.locations[0] ?? '');
  };

  const browseEverything = () => {
    setBrowseAll(true);
    setFilters({ ...DEFAULT_FILTERS });
    setQueryDraft('');
    setLocationDraft('');
    setCompanyDraft('');
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
        toast.warning(`Refreshed, but ${failed} career ${failed === 1 ? 'board' : 'boards'} failed.`);
      } else {
        toast.success(
          `Refreshed ${result?.sources_polled ?? 0} career boards, ${result?.jobs_inserted ?? 0} new vacancies.`,
        );
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
        url: job.resolved_url ?? job.url,
        platform: job.provider,
        posted_date: job.posted_at_known ? job.posted_at : null,
        employment_type: job.employment_type ?? null,
        workplace_type: job.workplace_type ?? null,
        source_name: providerLabel(job.provider),
        // The saved-jobs table records link state in its own vocabulary.
        url_status: SAVED_URL_STATUS[job.link_status] ?? 'unknown',
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
  const reasons = selected ? relevanceReasons(selected, filters, confirmedSkills) : [];
  const concentration = employerConcentration(jobs);
  const prefsSet = hasPreferences(preferences);
  const usingPreferences = prefsSet && !browseAll;

  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, page * pageSize + orderedJobs.length);

  const detailPanel = selected ? (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-6">
          {isMobile && (
            <Button variant="ghost" className="gap-2 pl-0" onClick={() => setMobileDetail(false)}>
              <ArrowLeft className="h-4 w-4" />
              Back to results
            </Button>
          )}

          <div>
            <h2 className="text-xl font-semibold leading-snug">{selected.title}</h2>
            <p className="mt-1.5 text-base text-muted-foreground">
              {selected.company} - {tidyLocation(selected.location)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-base">
              <StatusLabel job={selected} />
              {selected.workplace_type && (
                <span className="text-muted-foreground">
                  {selected.workplace_type === 'Onsite' ? 'On site' : selected.workplace_type}
                </span>
              )}
              {selected.employment_type && <span className="text-muted-foreground">{selected.employment_type}</span>}
              <span className="text-muted-foreground">{postingAge(selected)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              className="gap-2 text-base"
              onClick={() => window.open(selected.resolved_url ?? selected.url, '_blank', 'noopener')}
            >
              <ExternalLink className="h-4 w-4" />
              Apply on the employer's site
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-base"
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

          <div>
            <p className="mb-1.5 text-base font-medium">Salary</p>
            <p className="text-base text-muted-foreground">
              {selected.salary ?? 'The employer did not publish a salary for this vacancy.'}
            </p>
          </div>

          {reasons.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <p className="mb-2 flex items-center gap-2 text-base font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Why this is relevant to you
              </p>
              <ul className="space-y-1.5 text-base text-muted-foreground">
                {reasons.map((r) => (
                  <li key={r.label}>
                    <span className="text-foreground">{r.label}:</span> {r.detail}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-muted-foreground">
                Based only on what you saved. It is not a match score or a chance of being hired.
              </p>
            </div>
          )}

          {realRisks.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Worth a closer look</AlertTitle>
              <AlertDescription className="text-base">
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {realRisks.map((f) => (
                    <li key={f}>{riskLabel(f)}</li>
                  ))}
                </ul>
                <p className="mt-2 text-sm">
                  These are things the listing itself says. It may still be genuine.
                </p>
              </AlertDescription>
            </Alert>
          )}

          <div>
            <p className="mb-2 text-base font-medium">Description, responsibilities and requirements</p>
            {selected.description ? (
              <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
                {plainDescription(selected.description)}
              </div>
            ) : (
              <div className="space-y-2 text-base text-muted-foreground">
                <p>The employer's board did not supply a description for this vacancy, so there is nothing to show here.</p>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.open(selected.resolved_url ?? selected.url, '_blank', 'noopener')}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open the original posting
                </Button>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-base font-medium">Eligibility the listing states</p>
            <ul className="space-y-1.5 text-base">
              {eligibility.map((note, i) => (
                <li key={i} className="flex gap-2">
                  {note.kind === 'requirement' ? (
                    <BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-info" />
                  ) : (
                    <HelpCircle className="mt-1 h-4 w-4 shrink-0 text-warning" />
                  )}
                  <span className={note.kind === 'unknown' ? 'text-muted-foreground' : ''}>{note.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-base font-medium">Against your saved skills</p>
            {!overlap.measurable ? (
              <p className="text-base text-muted-foreground">
                {confirmedSkills.length === 0
                  ? 'Add skills to your profile and we can show which ones this listing asks for.'
                  : 'This listing has no description text, so there is nothing to compare against.'}
              </p>
            ) : (
              <>
                <p className="text-base text-muted-foreground">
                  {overlap.matched.length} of {confirmedSkills.length} of your saved skills appear in this listing.
                  This is word overlap only.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {overlap.matched.slice(0, 14).map((s) => (
                    <Badge key={s} variant="secondary" className="text-sm">
                      {s}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Source IDs and ingestion timestamps stay collapsed */}
          <Collapsible open={sourceDetailOpen} onOpenChange={setSourceDetailOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                Source details
                <ChevronDown className={`h-4 w-4 transition-transform ${sourceDetailOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <dl className="mt-3 grid gap-2 rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
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
                {selected.duplicate_count > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt>Duplicate copies hidden</dt>
                    <dd className="text-right text-foreground">{selected.duplicate_count}</dd>
                  </div>
                )}
                <p className="pt-1">
                  {selected.link_status === 'active'
                    ? 'We opened this link and found this vacancy on the page. That is a link check, not an endorsement of the employer.'
                    : selected.link_note ?? 'We have not been able to confirm this link yet, so treat it as unchecked.'}
                </p>
              </dl>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  ) : null;

  if (isMobile && mobileDetail && detailPanel) {
    return (
      <AppLayout>
        <div className="container px-4 py-6 text-base">{detailPanel}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container px-4 py-6 text-base">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Find a job</h1>
            <p className="mt-1.5 text-base text-muted-foreground">
              Vacancies taken straight from employers' own career boards.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right text-sm text-muted-foreground">
              <div>Sources pulled {relativeTime(ingest.lastRunAt)}</div>
              <div>Links checked {relativeTime(verify.lastRunAt)}</div>
            </div>
            <Button onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing' : 'Refresh now'}
            </Button>
          </div>
        </div>

        {/* Saved targets, or a prompt to set them */}
        <Card className="mb-5">
          <CardContent className="p-5">
            {!prefsSet ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-base font-medium">You have not set your job search preferences yet</p>
                  <p className="mt-1 text-base text-muted-foreground">
                    Add your target roles, locations, seniority and work arrangement and every search will start there.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => setPrefsDialogOpen(true)}>Set preferences</Button>
                  <Button variant="outline" onClick={browseEverything}>
                    Browse all jobs
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-base font-medium">
                    {usingPreferences ? 'Searching your saved preferences' : 'Browsing all jobs'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {preferences.roles.map((r) => (
                      <Button
                        key={r}
                        size="sm"
                        variant={filters.query === r ? 'default' : 'outline'}
                        onClick={() => {
                          setBrowseAll(false);
                          setQueryDraft(r);
                          setFilters((f) => ({ ...f, query: r }));
                        }}
                      >
                        {r}
                      </Button>
                    ))}
                    {preferences.locations.map((l) => (
                      <Button
                        key={l}
                        size="sm"
                        variant={filters.location === l ? 'default' : 'outline'}
                        onClick={() => {
                          setBrowseAll(false);
                          setLocationDraft(l);
                          setFilters((f) => ({ ...f, location: l }));
                        }}
                      >
                        {l}
                      </Button>
                    ))}
                    {preferences.seniority.map((s) => (
                      <Badge key={s} variant="secondary" className="px-3 py-1.5 text-sm">
                        {SENIORITY_OPTIONS.find((o) => o.value === s)?.label ?? s}
                      </Badge>
                    ))}
                    {preferences.workplace.map((w) => (
                      <Badge key={w} variant="secondary" className="px-3 py-1.5 text-sm">
                        {w === 'Onsite' ? 'On site' : w}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" className="gap-2" onClick={() => setPrefsDialogOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit preferences
                  </Button>
                  {usingPreferences ? (
                    <Button variant="ghost" onClick={browseEverything}>
                      Browse all jobs
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={applyPreferences}>
                      Use my preferences
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Source outages: small, expandable */}
        {(failingSources.length > 0 || ingest.lastError) && (
          <Collapsible open={outageOpen} onOpenChange={setOutageOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="mb-4 flex w-full items-center justify-between gap-3 rounded-lg border border-warning/50 bg-warning/10 px-4 py-2.5 text-left text-base text-warning"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {failingSources.length > 0
                    ? `${failingSources.length} career ${failingSources.length === 1 ? 'board is' : 'boards are'} not responding`
                    : 'The last refresh reported a problem'}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${outageOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mb-4 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4 text-base">
                {failingSources.length > 0 && (
                  <p className="text-muted-foreground">
                    Results are missing vacancies from{' '}
                    {failingSources.slice(0, 6).map((s) => s.company_name).join(', ')}
                    {failingSources.length > 6 ? ` and ${failingSources.length - 6} more` : ''}. Everything else is up to date.
                  </p>
                )}
                {ingest.lastError && (
                  <p className="break-words text-sm text-muted-foreground">{ingest.lastError}</p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Prominent search */}
        <form
          className="mb-3 grid gap-3 md:grid-cols-[2fr_1.3fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              placeholder="Job title, e.g. data engineer"
              className="pl-11 text-base"
              aria-label="Job title or keyword"
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={locationDraft}
              onChange={(e) => setLocationDraft(e.target.value)}
              placeholder="Location, e.g. Dublin"
              className="pl-11 text-base"
              aria-label="Location"
            />
          </div>
          <Button type="submit" className="gap-2 px-8 text-base">
            <Search className="h-4 w-4" />
            Search
          </Button>
        </form>

        {/* Compact secondary controls */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                More filters
                {filterCount > 0 && <Badge variant="secondary">{filterCount}</Badge>}
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>

            <Select value={filters.posted} onValueChange={(v) => setFilters((f) => ({ ...f, posted: v }))}>
              <SelectTrigger className="w-[11rem] text-base" aria-label="Date posted">
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
              <SelectTrigger className="w-[12rem] text-base" aria-label="Sort order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Relevant to me</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
              </SelectContent>
            </Select>

            {filterCount > 0 && (
              <Button variant="ghost" onClick={clearAll}>
                Clear filters
              </Button>
            )}
          </div>

          <CollapsibleContent>
            <Card className="mb-5">
              <CardContent className="grid gap-6 p-5 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label className="text-base">Company</Label>
                  <Input
                    value={companyDraft}
                    onChange={(e) => setCompanyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        runSearch();
                      }
                    }}
                    placeholder="Any company"
                    className="mt-2 text-base"
                  />
                  <Label className="mt-4 block text-base">Must mention these skills</Label>
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
                      className="text-base"
                    />
                    <Button type="button" variant="outline" onClick={addSkill}>
                      Add
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {filters.skills.map((s) => (
                      <Badge key={s} variant="secondary" className="gap-1.5 text-sm">
                        {s}
                        <button
                          type="button"
                          aria-label={`Remove ${s}`}
                          onClick={() => setFilters((f) => ({ ...f, skills: f.skills.filter((x) => x !== s) }))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-base">Where you work</Label>
                  <div className="mt-2 space-y-2">
                    {WORKPLACE_OPTIONS.map((w) => (
                      <label key={w} className="flex items-center gap-2.5 text-base">
                        <Checkbox
                          checked={filters.workplace.includes(w)}
                          onCheckedChange={() => toggleIn('workplace', w)}
                        />
                        {w === 'Onsite' ? 'On site' : w}
                      </label>
                    ))}
                  </div>
                  {filters.location.trim() && hasNearbyAreas(filters.location) && (
                    <label className="mt-4 flex items-start gap-2.5 text-sm text-muted-foreground">
                      <Switch
                        checked={filters.includeNearby}
                        onCheckedChange={(v) => setFilters((f) => ({ ...f, includeNearby: v }))}
                      />
                      Include nearby commuting areas (approximate, not a measured distance)
                    </label>
                  )}
                </div>

                <div>
                  <Label className="text-base">Seniority</Label>
                  <div className="mt-2 space-y-2">
                    {SENIORITY_OPTIONS.map((o) => (
                      <label key={o.value} className="flex items-center gap-2.5 text-base">
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
                  <Label className="text-base">Contract</Label>
                  <div className="mt-2 space-y-2">
                    {EMPLOYMENT_OPTIONS.map((o) => (
                      <label key={o.value} className="flex items-center gap-2.5 text-base">
                        <Checkbox
                          checked={filters.employment.includes(o.value)}
                          onCheckedChange={() => toggleIn('employment', o.value)}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  <label className="mt-4 flex items-start gap-2.5 text-sm">
                    <Switch
                      checked={filters.includeUnverified}
                      onCheckedChange={(v) => setFilters((f) => ({ ...f, includeUnverified: v }))}
                    />
                    <span>
                      Include vacancies whose link we have not checked yet
                    </span>
                  </label>
                  <label className="mt-4 flex items-start gap-2.5 text-sm">
                    <Switch checked={spread} onCheckedChange={setSpread} />
                    <span>
                      Spread results across employers
                      <span className="mt-0.5 block text-muted-foreground">
                        Reorders this page so one employer does not fill the top. Nothing is removed.
                      </span>
                    </span>
                  </label>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Result summary */}
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-base text-muted-foreground">
          <span className="text-foreground">
            {isLoading
              ? 'Searching'
              : error
                ? 'Results unavailable'
                : total === 0
                  ? 'No vacancies'
                  : `${from}-${to} of ${total.toLocaleString()} vacancies`}
          </span>
          {!error && synonyms.length > 0 && <span>Also searched: {synonyms.slice(0, 5).join(', ')}</span>}
          {!error && isStrictWindow(filters.posted) && (
            <span>Vacancies without a genuine posting date are left out of this date range.</span>
          )}
        </div>

        {!error && concentration && concentration.share > 0.35 && (
          <p className="mb-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
            {concentration.company} accounts for {Math.round(concentration.share * 100)}% of this page.{' '}
            {spread
              ? 'Results are reordered so no single employer fills the top.'
              : 'Turn on "Spread results across employers" under More filters to mix employers.'}
          </p>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Couldn't load jobs</AlertTitle>
            <AlertDescription className="text-base">
              Something went wrong on our side, so no vacancies could be loaded. This is not an empty result.
              <Button variant="outline" size="sm" className="ml-3" onClick={reload}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* Results */}
          <div className="space-y-3">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}

            {!isLoading && !error && orderedJobs.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-base font-medium">No vacancies match this search</p>
                  <p className="mt-1.5 text-base text-muted-foreground">
                    Try a wider date range or clear a filter. There simply are no matches in the sources we cover.
                  </p>
                  <Button variant="outline" className="mt-4" onClick={clearAll}>
                    Clear filters
                  </Button>
                </CardContent>
              </Card>
            )}

            {!isLoading &&
              orderedJobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  selected={selected?.id === job.id}
                  onSelect={() => {
                    setSelectedId(job.id);
                    if (isMobile) setMobileDetail(true);
                  }}
                />
              ))}

            {!isLoading && !error && total > pageSize && (
              <div className="flex items-center justify-between gap-3 pt-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-base text-muted-foreground">
                  Page {page + 1} of {pageCount.toLocaleString()}
                </span>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => goToPage(page + 1)}
                  disabled={page + 1 >= pageCount}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Detail stays visible while the results scroll */}
          {!isMobile && (
            <div className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
              {detailPanel}

              <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left">
                      <span className="text-base font-medium">Where these jobs come from</span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        {sources.length} boards
                        {failingSources.length > 0 && <Badge variant="destructive">{failingSources.length} failing</Badge>}
                        <ChevronDown className={`h-4 w-4 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-3 border-t border-border/60 pt-4 text-base">
                      <p className="text-sm text-muted-foreground">
                        Every source is an employer's own career board. We do not aggregate reposted listings.
                      </p>
                      <div className="max-h-72 space-y-2 overflow-y-auto">
                        {[...sources]
                          .sort((a, b) => b.live_jobs - a.live_jobs)
                          .map((s) => (
                            <div
                              key={s.id}
                              className="flex items-start justify-between gap-3 border-b border-border/40 pb-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium">{s.company_name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {providerLabel(s.provider)} - {s.live_jobs} live
                                </p>
                                {s.last_error && (
                                  <p className="mt-0.5 break-words text-sm text-destructive">{s.last_error}</p>
                                )}
                              </div>
                              <div className="shrink-0 text-right text-sm text-muted-foreground">
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
          )}
        </div>
      </div>

      <PreferencesDialog
        open={prefsDialogOpen}
        onOpenChange={setPrefsDialogOpen}
        initial={preferences.roles.length || preferences.locations.length ? preferences : EMPTY_PREFERENCES}
        isSaving={prefsSaving}
        onSave={async (next) => {
          const ok = await savePreferences(next);
          if (!ok) {
            toast.error('Could not save your preferences. Nothing was changed.');
            return;
          }
          setPrefsDialogOpen(false);
          setBrowseAll(false);
          setFilters((f) => filtersFromPreferences(next, f));
          setQueryDraft(next.roles[0] ?? '');
          setLocationDraft(next.locations[0] ?? '');
          toast.success('Preferences saved');
        }}
      />
    </AppLayout>
  );
};

export default ExplorePage;
