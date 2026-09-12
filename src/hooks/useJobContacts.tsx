import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type ContactType =
  | 'job_poster'
  | 'published_recruiting'
  | 'recruiting_inbox'
  | 'possible_connection';

export interface JobContact {
  id?: string;
  email: string | null;
  name: string | null;
  title: string | null;
  profileUrl: string | null;
  contactPageUrl: string | null;
  contactType: ContactType;
  sourceUrl: string | null;
  sourceContext: string | null;
  checkedAt: string | null;
  verificationStatus: 'unverified' | 'source_checked';
  mailboxVerified: boolean;
  requiresReview: boolean;
  removedAt?: string | null;
}

export interface JobContactsTarget {
  jobKey: string;
  jobId?: string | null;
  company?: string | null;
  jobUrl?: string | null;
  employerUrls?: string[];
  jobDescription?: string | null;
  jobPoster?: { name?: string | null; title?: string | null; profileUrl?: string | null } | null;
}

function fromRow(row: Record<string, unknown>): JobContact {
  return {
    id: row.id as string,
    email: (row.email as string) ?? null,
    name: (row.name as string) ?? null,
    title: (row.title as string) ?? null,
    profileUrl: (row.profile_url as string) ?? null,
    contactPageUrl: (row.contact_page_url as string) ?? null,
    contactType: (row.contact_type as ContactType) ?? 'possible_connection',
    sourceUrl: (row.source_url as string) ?? null,
    sourceContext: (row.source_context as string) ?? null,
    checkedAt: (row.checked_at as string) ?? null,
    verificationStatus: (row.verification_status as JobContact['verificationStatus']) ?? 'unverified',
    // The extension's mailboxVerified: false is preserved as-is; a page read is
    // never promoted to mailbox verification.
    mailboxVerified: row.mailbox_verified === true,
    requiresReview: row.requires_review !== false,
    removedAt: (row.removed_at as string) ?? null,
  };
}

/**
 * Contacts for one job. A response is only applied when it belongs to the job
 * currently in view and to the newest request, so a slow lookup for an older
 * job can never overwrite fresher results.
 */
export function useJobContacts(target: JobContactsTarget | null) {
  const { user } = useAuth();
  const jobKey = target?.jobKey ?? '';
  const [contacts, setContacts] = useState<JobContact[]>([]);
  const [history, setHistory] = useState<JobContact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [sourcesChecked, setSourcesChecked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const requestSeq = useRef(0);
  const activeKey = useRef(jobKey);
  activeKey.current = jobKey;

  const loadSaved = useCallback(async () => {
    if (!user || !jobKey) {
      setContacts([]);
      setHistory([]);
      return;
    }
    setIsLoading(true);
    const { data, error: dbError } = await supabase
      .from('job_contacts')
      .select('*')
      .eq('user_id', user.id)
      .eq('job_key', jobKey)
      .order('checked_at', { ascending: false });
    if (activeKey.current !== jobKey) return;
    if (dbError) setError(dbError.message);
    const rows = (data ?? []).map((r) => fromRow(r as Record<string, unknown>));
    setContacts(rows.filter((r) => !r.removedAt));
    setHistory(rows.filter((r) => !!r.removedAt));
    setLastCheckedAt(rows[0]?.checkedAt ?? null);
    setIsLoading(false);
  }, [user, jobKey]);

  useEffect(() => {
    setError(null);
    setSourcesChecked([]);
    loadSaved();
  }, [loadSaved]);

  const findContacts = useCallback(async () => {
    if (!target?.jobKey) return;
    const seq = ++requestSeq.current;
    const requestedKey = target.jobKey;
    setIsSearching(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('find-job-contacts', {
        body: {
          jobKey: target.jobKey,
          jobId: target.jobId ?? null,
          jobUrl: target.jobUrl ?? null,
          company: target.company ?? null,
          employerUrls: target.employerUrls ?? [],
          jobDescription: target.jobDescription ?? null,
          jobPoster: target.jobPoster ?? null,
          requestId: `${requestedKey}:${seq}`,
        },
      });
      // Stale guard: a newer request, or a different job, wins.
      if (seq !== requestSeq.current || activeKey.current !== requestedKey) return;
      if (fnError) throw fnError;
      setSourcesChecked((data?.sourcesChecked as string[]) ?? []);
      setLastCheckedAt((data?.checkedAt as string) ?? null);
      await loadSaved();
    } catch (e) {
      if (seq === requestSeq.current && activeKey.current === requestedKey) {
        setError(e instanceof Error ? e.message : 'Could not check the published sources');
      }
    } finally {
      if (seq === requestSeq.current) setIsSearching(false);
    }
  }, [target, loadSaved]);

  return {
    contacts,
    history,
    isLoading,
    isSearching,
    lastCheckedAt,
    sourcesChecked,
    error,
    findContacts,
    reload: loadSaved,
  };
}
