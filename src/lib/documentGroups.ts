/**
 * One entry per job in Documents and Generation History.
 *
 * Tailoring the same job twice used to show two identical cards. Versions are
 * grouped by the job's link, or by company plus unwrapped title when there is
 * no link; the newest version leads and the rest stay reachable as earlier
 * versions. Nothing is deleted.
 */
import { companyKey, unwrapJobTitle } from './jobRecords';

export interface VersionLike {
  id: string;
  updated_at?: string | null;
  created_at?: string | null;
  applied_at?: string | null;
  tailored_resume?: string | null;
  tailored_cover_letter?: string | null;
  job?: { title?: string | null; company?: string | null; url?: string | null } | null;
}

export interface DocumentGroup<T extends VersionLike> {
  key: string;
  latest: T;
  /** Newest CV and newest cover letter across every version of this job. */
  latestCv: T | null;
  latestLetter: T | null;
  earlier: T[];
  /** True when any version of this job was reported as submitted. */
  submitted: boolean;
}

const when = (v: VersionLike) => Date.parse(v.updated_at || v.created_at || '') || 0;

/** The link without tracking parameters, so the same posting groups together. */
export function jobLinkKey(url: string | null | undefined): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const keep = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (/^(utm_|jr_id$|gh_src$|source$|ref$|lever-source|validityToken$)/i.test(k)) continue;
      keep.append(k, v);
    }
    const q = keep.toString();
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '').replace(/\/application$/, '')}${q ? `?${q}` : ''}`;
  } catch {
    return raw.toLowerCase();
  }
}

export function documentJobKey(v: VersionLike): string {
  const link = jobLinkKey(v.job?.url);
  if (link) return `url:${link}`;
  const { title, company } = unwrapJobTitle(v.job?.title ?? '', v.job?.company ?? '');
  return `job:${companyKey(company)}|${title.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

/** Group versions by job, newest job first, each group's versions newest first. */
export function groupDocumentsByJob<T extends VersionLike>(versions: T[]): DocumentGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const v of versions) {
    if (!v.tailored_resume && !v.tailored_cover_letter) continue;
    const key = documentJobKey(v);
    const list = byKey.get(key) ?? [];
    list.push(v);
    byKey.set(key, list);
  }
  const groups: DocumentGroup<T>[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => when(b) - when(a));
    groups.push({
      key,
      latest: sorted[0],
      latestCv: sorted.find((v) => v.tailored_resume) ?? null,
      latestLetter: sorted.find((v) => v.tailored_cover_letter) ?? null,
      earlier: sorted.slice(1),
      submitted: sorted.some((v) => Boolean(v.applied_at)),
    });
  }
  return groups.sort((a, b) => when(b.latest) - when(a.latest));
}

/** "Applied" only when a submission was reported; otherwise the documents are "prepared". */
export function documentStatusLabel(v: { applied_at?: string | null }): 'Applied' | 'Prepared' {
  return v.applied_at ? 'Applied' : 'Prepared';
}

/** Submitted applications, one per job. */
export function countSubmitted<T extends VersionLike>(versions: T[]): number {
  const keys = new Set<string>();
  for (const v of versions) if (v.applied_at) keys.add(documentJobKey(v));
  return keys.size;
}
