import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Download, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { JobPreferences } from '@/lib/jobPreferences';
import {
  filterPostings,
  lastSeenKey,
  lastSyncKey,
  needsRefresh,
  postingsCsv,
  savedJobOf,
  type EttCard,
  type EttRow,
} from '@/lib/euroTopTech';

/**
 * Euro Top Tech, its own tab, for the signed-in member only. Up to 2,500 of
 * the newest postings from the past 3 or 7 days are kept in your account
 * (deleted after 7 days) and refreshed when the page opens and every 30
 * minutes while it is open: each refresh fetches only what is new. An apply
 * link is fetched when you press Apply, because each one counts against
 * your daily apply limit.
 */

interface Props {
  preferences: JobPreferences;
}

const PAGE = 50;
const REFRESH_MS = 30 * 60 * 1000;

const readNum = (key: string): number | null => {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};
const writeNum = (key: string, v: number) => {
  try { localStorage.setItem(key, String(v)); } catch { /* private window */ }
};

async function call(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('eurotoptech-jobs', { body: { action, ...payload } });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') message = (await ctx.json())?.message || message;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  return data;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '';
const ago = (t: number | null) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export function EuroTopTechFeed({ preferences }: Props) {
  const { user } = useAuth();
  const [days, setDays] = useState<3 | 7>(() => (readNum('ett_days') === 3 ? 3 : 7));
  const [rows, setRows] = useState<EttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [workplace, setWorkplace] = useState<string[]>([]);
  const [country, setCountry] = useState('');
  const [matchPrefs, setMatchPrefs] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [page, setPage] = useState(1);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const syncingRef = useRef(false);

  const loadRows = useCallback(async () => {
    if (!user) return;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    // The server returns at most 1000 rows per request, so read in chunks up to 2500.
    const all: EttRow[] = [];
    let err: { message: string } | null = null;
    for (let from = 0; from < 2500; from += 1000) {
      const { data, error: e } = await supabase
        .from('ett_postings')
        .select('job_id, title, company, location, country, workplace, seniority, posted_date, pay, relocation, visa, job_page, first_seen_at')
        .gte('posted_date', since)
        .order('posted_date', { ascending: false })
        .order('job_id', { ascending: true })
        .range(from, Math.min(from + 999, 2499));
      if (e) { err = e; break; }
      all.push(...((data ?? []) as EttRow[]));
      if (!data || data.length < 1000) break;
    }
    if (err) setError(err.message);
    else setRows(all);
    setLoading(false);
  }, [user, days]);

  const refresh = useCallback(async (quiet = false) => {
    if (!user || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const d = await call('sync', { days });
      const now = Date.now();
      writeNum(lastSyncKey(user.id, days), now);
      setLastSync(now);
      await loadRows();
      if (d?.stopped) toast.warning(d.stopped);
      else if (!quiet) toast.success(d?.fresh ? `${d.fresh} new posting${d.fresh === 1 ? '' : 's'}` : 'Up to date');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [user, days, loadRows]);

  // Open: what is kept shows at once; then a refresh when it is due.
  useEffect(() => {
    if (!user) return;
    setLastSeen(readNum(lastSeenKey(user.id)));
    const synced = readNum(lastSyncKey(user.id, days));
    setLastSync(synced);
    writeNum('ett_days', days);
    loadRows().then(() => { if (needsRefresh(synced, Date.now(), REFRESH_MS)) refresh(true); });
  }, [user, days, loadRows, refresh]);

  // Every 30 minutes while the page is open.
  useEffect(() => {
    const t = setInterval(() => refresh(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // This visit is the next one's "last visit", once you have seen the page.
  useEffect(() => {
    if (!user || loading) return;
    const t = setTimeout(() => writeNum(lastSeenKey(user.id), Date.now()), 5000);
    return () => clearTimeout(t);
  }, [user, loading]);

  const countries = useMemo(() => [...new Set(rows.map((r) => r.country).filter(Boolean) as string[])].sort(), [rows]);
  const shown = useMemo(
    () => filterPostings(rows, { query, workplace, country, preferences: matchPrefs ? preferences : null, newSince: onlyNew ? lastSeen : null }),
    [rows, query, workplace, country, matchPrefs, preferences, onlyNew, lastSeen],
  );
  const pageRows = shown.slice((page - 1) * PAGE, page * PAGE);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.job_id));
  const selectAllShown = (on: boolean) => setSelected((s) => { const n = new Set(s); shown.forEach((r) => (on ? n.add(r.job_id) : n.delete(r.job_id))); return n; });
  // Apply links fetched on request, kept on this device so they are fetched once.
  const linksKey = user ? `ett_links_${user.id}` : '';
  const [links, setLinks] = useState<Record<number, string>>({});
  useEffect(() => { if (linksKey) { try { setLinks(JSON.parse(localStorage.getItem(linksKey) || '{}')); } catch { setLinks({}); } } }, [linksKey]);
  const [fetchingLinks, setFetchingLinks] = useState<{ done: number; total: number } | null>(null);
  const linkOf = (r: EttRow) => links[r.job_id] || r.job_page || '';
  const fetchLinks = async (quiet = false): Promise<Record<number, string> | null> => {
    const todo = rows.filter((r) => selected.has(r.job_id) && !linkOf(r));
    if (!todo.length) { if (!quiet) toast.success('Every selected posting already has its link.'); return links; }
    if (!window.confirm(`Get the employer's job link for ${todo.length} posting${todo.length === 1 ? '' : 's'}? Each one counts against your Euro Top Tech daily apply limit.`)) return null;
    const next = { ...links };
    setFetchingLinks({ done: 0, total: todo.length });
    let got = 0;
    for (const r of todo) {
      try {
        const d = await call('apply', { jobId: r.job_id });
        if (d?.url) { next[r.job_id] = d.url; got++; }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Euro Top Tech stopped giving links');
        break;
      }
      setFetchingLinks({ done: got, total: todo.length });
    }
    setLinks(next);
    if (linksKey) localStorage.setItem(linksKey, JSON.stringify(next));
    setFetchingLinks(null);
    if (!quiet) toast.success(`${got} job link${got === 1 ? '' : 's'} added.`);
    return next;
  };
  const exportSelected = async () => {
    const map = await fetchLinks(true);
    if (!map) return;
    const list = rows.filter((r) => selected.has(r.job_id)).map((r) => ({ ...r, job_page: map[r.job_id] || r.job_page }));
    exportCsv(list, 'selected');
  };
  const exportCsv = (list: EttRow[], label: string) => {
    if (!list.length) return;
    const blob = new Blob([postingsCsv(list.map((r) => ({ ...r, job_page: linkOf(r) || null })))], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `euro-top-tech-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast.success(`Exported ${list.length} posting${list.length === 1 ? '' : 's'}`);
  };
  useEffect(() => { setPage(1); }, [query, workplace, country, matchPrefs, onlyNew, days]);

  const apply = async (r: EttRow) => {
    if (!user) return;
    setApplyingId(r.job_id);
    const tab = window.open('about:blank', '_blank');
    try {
      const d = await call('apply', { jobId: r.job_id });
      if (!d?.url) throw new Error('Euro Top Tech gave no apply link for this posting.');
      setLinks((m) => { const n = { ...m, [r.job_id]: d.url }; if (linksKey) localStorage.setItem(linksKey, JSON.stringify(n)); return n; });
      if (tab) tab.location.href = d.url; else window.open(d.url, '_blank', 'noopener');
      const card: EttCard = {
        jobId: r.job_id, title: r.title ?? '', company: r.company ?? '', location: r.location ?? '', workplace: r.workplace ?? '',
        seniority: r.seniority ?? '', postedDate: r.posted_date, pay: r.pay ?? '', relocation: r.relocation, visa: r.visa, otherPlaces: 0, jobPage: r.job_page,
      };
      const { error: saveError } = await supabase.from('jobs').insert(savedJobOf(card, d.url, user.id));
      if (saveError && (saveError as { code?: string }).code !== '23505') throw saveError;
      toast.success(`${r.title} opened and kept in Saved jobs.`);
    } catch (e) {
      if (tab) tab.close();
      toast.error(e instanceof Error ? e.message : 'Could not open this posting');
    } finally {
      setApplyingId(null);
    }
  };

  const WP: [string, string[]][] = [['Remote', ['remote_country', 'remote_anywhere']], ['Hybrid', ['hybrid']], ['Onsite', ['onsite']]];

  return (
    <Card className="mb-5">
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold">Jobs from Euro Top Tech</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {rows.length} posting{rows.length === 1 ? '' : 's'} from the past {days} days. Updated {ago(lastSync)}; it refreshes every 30 minutes while this page is open. Only you see these.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([3, 7] as const).map((d) => (
              <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)}>Past {d} days</Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => refresh(false)} disabled={syncing} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Updating' : 'Update now'}
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input className="max-w-xs" placeholder="Job title or company" value={query} onChange={(e) => setQuery(e.target.value)} />
          {WP.map(([label, modes]) => {
            const on = modes.every((m) => workplace.includes(m));
            return (
              <Button key={label} size="sm" variant={on ? 'default' : 'outline'}
                onClick={() => setWorkplace((cur) => (on ? cur.filter((m) => !modes.includes(m)) : [...new Set([...cur, ...modes])]))}>
                {label}
              </Button>
            );
          })}
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={country}
            onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="">Every country</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <Switch id="ett-prefs" checked={matchPrefs} onCheckedChange={setMatchPrefs} />
            <Label htmlFor="ett-prefs" className="text-sm">Match my saved preferences</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ett-new" checked={onlyNew} onCheckedChange={setOnlyNew} disabled={!lastSeen} />
            <Label htmlFor="ett-new" className="text-sm">New since my last visit</Label>
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : !shown.length ? (
          <p className="text-sm text-muted-foreground">
            {rows.length ? 'No posting matches these filters.' : syncing ? 'Fetching the newest postings...' : 'Nothing kept yet. Press Update now.'}
          </p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <label className="flex items-center gap-2">
                  <Checkbox checked={allShownSelected} onCheckedChange={(v) => selectAllShown(v === true)} aria-label="Select all matches" />
                  Select all {shown.length}
                </label>
                <span>{shown.length} match. Page {page} of {Math.ceil(shown.length / PAGE)}.{selected.size ? ` ${selected.size} selected.` : ''}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-2" disabled={!selected.size || !!fetchingLinks} onClick={() => fetchLinks()}>
                  {fetchingLinks ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  {fetchingLinks ? `Getting links ${fetchingLinks.done}/${fetchingLinks.total}` : `Get job links (${selected.size})`}
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => exportCsv(shown, 'all')}>
                  <Download className="h-4 w-4" /> Export all ({shown.length})
                </Button>
                <Button size="sm" variant="outline" className="gap-2" disabled={!selected.size || !!fetchingLinks}
                  onClick={exportSelected}>
                  <Download className="h-4 w-4" /> Export selected ({selected.size})
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {pageRows.map((j) => (
                <li key={j.job_id} data-job-id={j.job_id} data-job-title={j.title ?? ''} data-job-company={j.company ?? ''} data-job-url={linkOf(j) || undefined} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                  <Checkbox className="mt-1" checked={selected.has(j.job_id)} onCheckedChange={() => toggle(j.job_id)} aria-label={`Select ${j.title}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {linkOf(j)
                        ? <a href={linkOf(j)} target="_blank" rel="noopener noreferrer" className="job-url font-medium underline-offset-2 hover:underline">{j.title}</a>
                        : <span className="font-medium">{j.title}</span>}
                      {lastSeen && Date.parse(j.first_seen_at) > lastSeen && <Badge>New</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {[j.company, j.location, (j.workplace ?? '').replace('_', ' '), j.seniority, fmtDate(j.posted_date)].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {[j.pay, j.visa ? `Visa: ${j.visa}` : '', j.relocation ? `Relocation: ${j.relocation}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  </div>
                  <Button size="sm" onClick={() => apply(j)} disabled={applyingId === j.job_id} className="gap-2">
                    {applyingId === j.job_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    Apply
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page * PAGE >= shown.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default EuroTopTechFeed;
