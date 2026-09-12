/**
 * find-job-contacts
 *
 * Free, public-source recruiter-contact lookup. No paid provider and no user
 * API key is required or used by default.
 *
 * It reads:
 *   1. the job posting page the user is applying through (mailto links,
 *      JSON-LD applicationContact, visible text),
 *   2. employer URLs the posting itself published (JSON-LD hiringOrganization
 *      url/sameAs, links inside the description),
 *   3. careers / recruiting / contact pages linked from those employer URLs.
 *
 * It never constructs an address, never turns a company name or ATS slug into
 * a domain, and never claims a mailbox is live. Every stored row keeps its
 * source URL, source context and "source checked" timestamp.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  candidateStartUrls,
  careersLinkCandidates,
  classifyContact,
  DiscoveredContact,
  employerUrlsFromPostingHtml,
  emailHitsFromHtml,
  isAtsHost,
  isSafeFetchUrl,
  isSafeRedirect,
  jsonLdBlocks,
  mergeContacts,
  posterContact,
  registrableDomain,
  stripTags,
} from '../_shared/contactDiscovery.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PAGES = 8;
const MAX_BYTES = 1_500_000;
const PAGE_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

interface FetchedPage {
  url: string;
  html: string;
}

/** Fetch one page with redirects followed by hand, so every hop is re-checked
 *  against the SSRF rules instead of trusting the server. */
async function safeFetch(startUrl: string): Promise<FetchedPage | null> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafeFetchUrl(url)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JobGenie/1.0; +contact-discovery)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        await res.body?.cancel();
        if (!loc || !isSafeRedirect(url, loc)) return null;
        url = new URL(loc, url).toString();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        return null;
      }
      const type = res.headers.get('content-type') || '';
      if (type && !/text\/html|application\/xhtml|text\/plain|application\/json/i.test(type)) {
        await res.body?.cancel();
        return null;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      const html = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_BYTES));
      return { url, html };
    } catch (_e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function posterFromJsonLd(html: string): { name?: string; title?: string } | null {
  for (const block of jsonLdBlocks(html)) {
    const contact = block.applicationContact as Record<string, unknown> | undefined;
    if (contact && typeof contact.name === 'string' && !String(contact.name).includes('@')) {
      return { name: String(contact.name) };
    }
  }
  return null;
}

function emailsFromJsonLd(html: string): { email: string; context: string }[] {
  const out: { email: string; context: string }[] = [];
  for (const block of jsonLdBlocks(html)) {
    const contact = block.applicationContact as Record<string, unknown> | undefined;
    const email = contact && typeof contact.email === 'string' ? contact.email : null;
    if (email) out.push({ email, context: 'Structured application contact on the job posting' });
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('authorization') || '';
    const { data: auth, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !auth?.user) return json({ error: 'Unauthorized' }, 401);
    const userId = auth.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      jobId = null,
      jobKey,
      jobUrl = null,
      company = null,
      employerUrls = [],
      jobDescription = null,
      jobDescriptionHtml = null,
      jobPoster = null,
      requestId = null,
    } = body as Record<string, any>;

    const key = String(jobKey || jobId || jobUrl || '').trim();
    if (!key) return json({ error: 'jobKey, jobId or jobUrl is required' }, 400);

    // Provider enrichment is optional and off unless the user explicitly
    // enabled it. No credential or session from any other extension is used.
    const { data: profile } = await supabase
      .from('profiles')
      .select('provider_enrichment_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    const providerEnrichmentEnabled = profile?.provider_enrichment_enabled === true;

    const checkedAt = new Date().toISOString();
    const starts = candidateStartUrls({ jobUrl, employerUrls, jobDescription, jobDescriptionHtml });
    const visited = new Set<string>();
    const queue = [...starts];
    const allowedHosts: string[] = [];
    for (const u of [...(employerUrls || []), jobUrl].filter(Boolean)) {
      const dom = registrableDomain(String(u));
      if (dom && !isAtsHost(dom)) allowedHosts.push(dom);
    }

    const found: DiscoveredContact[] = [];
    const sourcesChecked: string[] = [];
    let pages = 0;

    while (queue.length && pages < MAX_PAGES) {
      const url = queue.shift()!;
      const dedupeKey = url.replace(/\/+$/, '');
      if (visited.has(dedupeKey)) continue;
      visited.add(dedupeKey);

      const page = await safeFetch(url);
      pages++;
      if (!page) continue;
      sourcesChecked.push(page.url);

      const isPosting = starts[0] && dedupeKey === String(starts[0]).replace(/\/+$/, '');

      // Employer URLs published by the posting expand the allow-list and the
      // crawl frontier. A name is never turned into a domain here.
      if (isPosting) {
        for (const eu of employerUrlsFromPostingHtml(page.html, page.url)) {
          const dom = registrableDomain(eu);
          if (dom && !isAtsHost(dom) && !allowedHosts.includes(dom)) allowedHosts.push(dom);
          queue.push(eu);
        }
        const poster = jobPoster?.name ? jobPoster : posterFromJsonLd(page.html);
        const pc = poster ? posterContact(poster, page.url, checkedAt) : null;
        if (pc) found.push(pc);
        for (const s of emailsFromJsonLd(page.html)) {
          const c = classifyContact(
            { ...s, sourceUrl: page.url, allowedHosts: [...allowedHosts, registrableDomain(s.email.split('@')[1] || '')], method: 'json_ld' },
            checkedAt,
          );
          if (c) found.push(c);
        }
      } else {
        for (const link of careersLinkCandidates(page.html, page.url, 4)) queue.push(link);
      }

      for (const hit of emailHitsFromHtml(page.html)) {
        const c = classifyContact(
          {
            email: hit.email,
            context: hit.context,
            sourceUrl: page.url,
            allowedHosts: isPosting ? [...allowedHosts, registrableDomain(hit.email.split('@')[1] || '')] : allowedHosts,
            method: hit.method,
          },
          checkedAt,
        );
        if (c) found.push(c);
      }

      // A posting with no published address still gives the user somewhere to
      // go: the employer's own careers or contact page.
      if (!isPosting && /career|job|recruit|talent|contact/i.test(page.url) && stripTags(page.html).length > 200) {
        found.push({
          email: null,
          name: null,
          title: null,
          profileUrl: null,
          contactPageUrl: page.url,
          contactType: 'possible_connection',
          sourceUrl: page.url,
          sourceContext: 'Employer careers or contact page linked from the posting',
          checkedAt,
          verificationStatus: 'source_checked',
          mailboxVerified: false,
          requiresReview: true,
          discoveryMethod: 'careers_page',
        });
      }
    }

    const contacts = mergeContacts(found);

    // Persist: refresh what is still published, and date-stamp what is gone
    // instead of erasing it, so history stays visible.
    const { data: existing } = await supabase
      .from('job_contacts')
      .select('id, email, profile_url, contact_page_url, contact_type')
      .eq('user_id', userId)
      .eq('job_key', key);

    const liveKeys = new Set(
      contacts.map((c) => (c.email || c.profileUrl || c.contactPageUrl || c.name || '').toLowerCase()),
    );
    const goneIds = (existing || [])
      .filter((r: any) => !liveKeys.has(String(r.email || r.profile_url || r.contact_page_url || '').toLowerCase()))
      .map((r: any) => r.id);
    if (goneIds.length) {
      await supabase
        .from('job_contacts')
        .update({ removed_at: checkedAt, updated_at: checkedAt })
        .in('id', goneIds);
    }

    if (contacts.length) {
      await supabase.from('job_contacts').upsert(
        contacts.map((c) => ({
          user_id: userId,
          job_id: jobId && /^[0-9a-f-]{36}$/i.test(String(jobId)) ? jobId : null,
          job_key: key,
          company: company ? String(company) : null,
          email: c.email,
          name: c.name,
          title: c.title,
          profile_url: c.profileUrl,
          contact_page_url: c.contactPageUrl,
          contact_type: c.contactType,
          source_url: c.sourceUrl,
          source_context: c.sourceContext,
          checked_at: c.checkedAt,
          last_seen_at: c.checkedAt,
          removed_at: null,
          verification_status: c.verificationStatus,
          mailbox_verified: false,
          requires_review: c.requiresReview,
          discovery_method: c.discoveryMethod,
          updated_at: checkedAt,
        })),
        { onConflict: 'user_id,job_key,contact_identity' },
      );
    }

    return json({
      requestId,
      jobKey: key,
      checkedAt,
      providerEnrichmentEnabled,
      providerEnrichmentUsed: false,
      sourcesChecked,
      contacts,
      note: 'Public sources only. Timestamps record when a source was checked, not that a mailbox is active.',
    });
  } catch (e) {
    console.error('find-job-contacts failed:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
