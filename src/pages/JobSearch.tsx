import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Download, ExternalLink, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { useBoardJobs, type BoardPosting } from '@/hooks/useBoardJobs';

const POSTED_OPTIONS = [
  { value: '24h', label: 'Past 24 hours', hours: 24 },
  { value: '48h', label: 'Past 48 hours', hours: 48 },
  { value: '72h', label: 'Past 72 hours', hours: 72 },
  { value: 'week', label: 'Past week', hours: 24 * 7 },
  { value: 'month', label: 'Past month', hours: 24 * 30 },
  { value: 'all', label: 'All time', hours: null as number | null },
];

const BOARD_LABEL: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
};

const CSV_COLUMNS = ['url', 'board', 'company', 'title', 'location', 'posted_at'] as const;

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function postingsToCsv(rows: Record<string, unknown>[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(','));
  return lines.join('\r\n');
}

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function JobSearch() {
  const {
    companies,
    postings,
    isLoading,
    isFetching,
    isAdding,
    addCompanies,
    removeCompany,
    fetchPostings,
    markExported,
  } = useBoardJobs();

  const [urls, setUrls] = useState('');
  const [posted, setPosted] = useState('24h');
  const [search, setSearch] = useState('');
  const [hideExported, setHideExported] = useState(true);

  const withinWindow = useMemo(() => {
    const hours = POSTED_OPTIONS.find((o) => o.value === posted)?.hours ?? null;
    const cutoff = hours === null ? null : Date.now() - hours * 3600_000;
    return (p: BoardPosting) => {
      if (cutoff === null) return true;
      if (!p.posted_at) return false;
      return new Date(p.posted_at).getTime() >= cutoff;
    };
  }, [posted]);

  const matchesText = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (p: BoardPosting) =>
      !q || `${p.title ?? ''} ${p.company ?? ''}`.toLowerCase().includes(q);
  }, [search]);

  const inScope = useMemo(
    () => postings.filter((p) => withinWindow(p) && matchesText(p)),
    [postings, withinWindow, matchesText],
  );
  const hiddenCount = useMemo(
    () => (hideExported ? inScope.filter((p) => p.exported_at).length : 0),
    [inScope, hideExported],
  );
  const visible = useMemo(
    () => (hideExported ? inScope.filter((p) => !p.exported_at) : inScope),
    [inScope, hideExported],
  );

  const handleAdd = async () => {
    if (!urls.trim()) return;
    try {
      const result = await addCompanies(urls);
      setUrls('');
      const parts = [`${result.added} new`];
      if (result.alreadyKnown) parts.push(`${result.alreadyKnown} already followed`);
      if (result.unrecognised?.length) parts.push(`${result.unrecognised.length} not recognised`);
      toast.success(`Companies: ${parts.join(', ')}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add those companies');
    }
  };

  const handleFetch = async () => {
    try {
      const s = await fetchPostings();
      const failedNote = s.failed?.length
        ? ` ${s.failed.length} board${s.failed.length === 1 ? '' : 's'} did not answer: ${s.failed
            .map((f) => `${f.token} (${f.status})`)
            .join(', ')}`
        : '';
      toast.success(`${s.stored} postings stored from ${s.fetched} returned, ${s.skipped} unreadable.${failedNote}`, {
        duration: failedNote ? 12000 : 5000,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not fetch postings');
    }
  };

  const handleExport = async () => {
    if (!visible.length) return;
    const csv = postingsToCsv(visible as unknown as Record<string, unknown>[]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `job-postings-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    await markExported(visible.map((p) => p.id));
    toast.success(`${visible.length} postings exported and marked, so they will not appear again.`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Companies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste any Greenhouse, Lever or Ashby job link. One link per company is enough — that company is then
            checked on every run.
          </p>
          <Textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            rows={3}
            placeholder={'https://boards.greenhouse.io/acme/jobs/4001\nhttps://jobs.lever.co/mercury/abc-123'}
            aria-label="Job links to add"
            className="font-mono text-xs"
          />
          <Button onClick={handleAdd} disabled={isAdding || !urls.trim()} size="sm">
            {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add companies
          </Button>

          <div className="flex flex-wrap gap-2 pt-1">
            {isLoading && !companies.length ? (
              <Skeleton className="h-6 w-40" />
            ) : companies.length ? (
              companies.map((c) => (
                <Badge key={c.id} variant="secondary" className="gap-1 pr-1 text-xs">
                  <span className="opacity-70">{BOARD_LABEL[c.board] ?? c.board}</span>
                  <span className="font-medium">{c.token}</span>
                  <button
                    type="button"
                    onClick={() => removeCompany(c.id)}
                    aria-label={`Remove ${c.token}`}
                    className="ml-1 rounded p-0.5 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No companies yet.</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base">Jobs</CardTitle>
          <Button onClick={handleFetch} disabled={isFetching || !companies.length} size="sm">
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Fetch today's postings
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={posted} onValueChange={setPosted}>
              <SelectTrigger className="h-9 w-[170px] text-sm" aria-label="Posted within">
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

            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter title or company"
              aria-label="Filter title or company"
              className="h-9 w-56 text-sm"
            />

            <div className="flex items-center gap-2">
              <Checkbox
                id="hide-exported"
                checked={hideExported}
                onCheckedChange={(v) => setHideExported(v === true)}
              />
              <Label htmlFor="hide-exported" className="text-sm font-normal">
                Hide the ones I have already exported
              </Label>
              <span className="text-xs text-muted-foreground">
                {hideExported ? `${hiddenCount} hidden` : 'nothing hidden'}
              </span>
            </div>

            <Button
              onClick={handleExport}
              disabled={!visible.length}
              variant="secondary"
              size="sm"
              className="ml-auto"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV ({visible.length})
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : visible.length ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Board</th>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Posted</th>
                    <th className="px-3 py-2 font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {BOARD_LABEL[p.board ?? ''] ?? p.board ?? '—'}
                      </td>
                      <td className="px-3 py-2">{p.company ?? '—'}</td>
                      <td className="px-3 py-2 font-medium">{p.title ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {p.location ?? '—'}
                        {p.remote ? <Badge variant="outline" className="ml-2 text-[10px]">Remote</Badge> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(p.posted_at)}</td>
                      <td className="px-3 py-2">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-md border border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
              {hideExported && hiddenCount > 0
                ? 'Every job here has already been exported'
                : postings.length
                  ? 'No jobs match these filters'
                  : 'No jobs yet. Add a company, then fetch today\u2019s postings.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
