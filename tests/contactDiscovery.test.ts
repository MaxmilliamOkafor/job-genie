import { describe, expect, test } from 'bun:test';
import {
  candidateStartUrls,
  careersLinkCandidates,
  classifyContact,
  emailHitsFromHtml,
  emailMatchesAllowedHosts,
  employerUrlsFromPostingHtml,
  isAtsHost,
  isSafeFetchUrl,
  isSafeRedirect,
  mergeContacts,
  posterContact,
  registrableDomain,
} from '../supabase/functions/_shared/contactDiscovery';

const NOW = '2026-09-12T00:00:00.000Z';

describe('domain boundaries', () => {
  test('reads registrable domains including .co.uk', () => {
    expect(registrableDomain('careers.barclays.co.uk')).toBe('barclays.co.uk');
    expect(registrableDomain('https://jobs.monzo.com/roles/1')).toBe('monzo.com');
    expect(registrableDomain('www.university.ac.uk')).toBe('university.ac.uk');
  });

  test('a lookalike domain is not the employer', () => {
    expect(emailMatchesAllowedHosts('ta@barclays.co.uk', ['careers.barclays.co.uk'])).toBe(true);
    expect(emailMatchesAllowedHosts('ta@notbarclays.co.uk', ['barclays.co.uk'])).toBe(false);
    expect(emailMatchesAllowedHosts('ta@barclays.co.uk.evil.com', ['barclays.co.uk'])).toBe(false);
    expect(emailMatchesAllowedHosts('ta@barclays.com', ['barclays.co.uk'])).toBe(false);
  });

  test('ATS hosts are not employer sites', () => {
    expect(isAtsHost('https://boards.greenhouse.io/acme/jobs/1')).toBe(true);
    expect(isAtsHost('https://acme.com/careers')).toBe(false);
  });
});

describe('fetch safety', () => {
  test('rejects private and non-http destinations', () => {
    for (const bad of [
      'http://localhost/x',
      'http://127.0.0.1/x',
      'http://10.1.2.3/x',
      'http://192.168.0.5/x',
      'http://172.16.4.4/x',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/x',
      'http://intranet.local/x',
      'file:///etc/passwd',
      'gopher://acme.com/',
      'https://user:pass@acme.com/',
      'https://acme.com:22/',
    ]) {
      expect(isSafeFetchUrl(bad)).toBe(false);
    }
    expect(isSafeFetchUrl('https://acme.com/careers')).toBe(true);
  });

  test('rejects redirects into private space', () => {
    expect(isSafeRedirect('https://acme.com/a', 'http://169.254.169.254/')).toBe(false);
    expect(isSafeRedirect('https://acme.com/a', '/careers/contact')).toBe(true);
    expect(isSafeRedirect('https://acme.com/a', 'https://careers.acme.com/contact')).toBe(true);
  });
});

describe('candidate URLs', () => {
  test('uses only URLs the posting supplied, never name + .com', () => {
    const urls = candidateStartUrls({
      jobUrl: 'https://boards.greenhouse.io/acme/jobs/5',
      employerUrls: ['https://www.acme-industrial.co.uk/'],
      jobDescription: 'Apply via https://www.acme-industrial.co.uk/careers and see https://linkedin.com/company/acme',
    });
    expect(urls[0]).toContain('greenhouse.io');
    expect(urls.some((u) => u.includes('acme-industrial.co.uk/careers'))).toBe(true);
    expect(urls.some((u) => u.includes('linkedin.com'))).toBe(false);
    expect(urls.some((u) => u === 'https://acme.com')).toBe(false);
  });

  test('reads employer URLs out of JSON-LD only', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      hiringOrganization: { name: 'Acme', url: 'https://acme-industrial.co.uk' },
    })}</script>`;
    expect(employerUrlsFromPostingHtml(html, 'https://boards.greenhouse.io/acme/jobs/5')).toEqual([
      'https://acme-industrial.co.uk/',
    ]);
  });

  test('follows only same-domain careers style links', () => {
    const html = `
      <a href="/careers/contact-us">Contact our talent team</a>
      <a href="https://facebook.com/acme">Facebook</a>
      <a href="/investors">Investors</a>`;
    const links = careersLinkCandidates(html, 'https://acme.co.uk/');
    expect(links).toEqual(['https://acme.co.uk/careers/contact-us']);
  });
});

describe('email harvesting and classification', () => {
  const allowed = ['acme.co.uk'];

  test('accepts a recruiting inbox published on a careers page', () => {
    const c = classifyContact(
      {
        email: 'recruitment@acme.co.uk',
        context: 'For questions about this vacancy email recruitment@acme.co.uk',
        sourceUrl: 'https://acme.co.uk/careers',
        allowedHosts: allowed,
        method: 'mailto',
      },
      NOW,
    );
    expect(c?.contactType).toBe('recruiting_inbox');
    expect(c?.mailboxVerified).toBe(false);
    expect(c?.verificationStatus).toBe('source_checked');
  });

  test('accepts a named recruiter with recruiting context', () => {
    const c = classifyContact(
      {
        email: 'aoife.byrne@acme.co.uk',
        context: 'Aoife Byrne, Talent Acquisition Partner - aoife.byrne@acme.co.uk',
        sourceUrl: 'https://acme.co.uk/careers/team',
        allowedHosts: allowed,
        method: 'page_text',
      },
      NOW,
    );
    expect(c?.contactType).toBe('published_recruiting');
    expect(c?.name).toBe('Aoife Byrne');
    expect(c?.title?.toLowerCase()).toContain('talent acquisition');
    expect(c?.requiresReview).toBe(false);
  });

  test('excludes support, accommodation, privacy and unrelated addresses', () => {
    const cases: [string, string][] = [
      ['support@acme.co.uk', 'For product support contact support@acme.co.uk'],
      ['accessibility@acme.co.uk', 'Need a reasonable adjustment? accessibility@acme.co.uk'],
      ['privacy@acme.co.uk', 'Our privacy notice: privacy@acme.co.uk'],
      ['press@acme.co.uk', 'Media enquiries press@acme.co.uk'],
      ['invoices@acme.co.uk', 'Send invoices to invoices@acme.co.uk'],
      ['info@acme.co.uk', 'Head office switchboard info@acme.co.uk'],
    ];
    for (const [email, context] of cases) {
      expect(
        classifyContact({ email, context, sourceUrl: 'https://acme.co.uk/contact', allowedHosts: allowed, method: 'mailto' }, NOW),
      ).toBeNull();
    }
  });

  test('a personal address with no recruiting context is not shown', () => {
    expect(
      classifyContact(
        {
          email: 'dave.smith@acme.co.uk',
          context: 'Dave Smith, Warehouse Operative, dave.smith@acme.co.uk',
          sourceUrl: 'https://acme.co.uk/about/people',
          allowedHosts: allowed,
          method: 'page_text',
        },
        NOW,
      ),
    ).toBeNull();
  });

  test('an off-domain recruiting address is flagged for review', () => {
    const c = classifyContact(
      {
        email: 'jo@thirdpartyrecruiters.com',
        context: 'Recruitment partner handling this vacancy: jo@thirdpartyrecruiters.com',
        sourceUrl: 'https://acme.co.uk/careers',
        allowedHosts: allowed,
        method: 'page_text',
      },
      NOW,
    );
    expect(c?.contactType).toBe('possible_connection');
    expect(c?.requiresReview).toBe(true);
  });

  test('harvests mailto and text addresses with their context', () => {
    const hits = emailHitsFromHtml(
      '<p>Questions about this role? <a href="mailto:talent@acme.co.uk?subject=Job">Email the talent team</a></p>'
      + '<p>Or write to careers@acme.co.uk for vacancies.</p>',
    );
    const emails = hits.map((h) => h.email);
    expect(emails).toContain('talent@acme.co.uk');
    expect(emails).toContain('careers@acme.co.uk');
    expect(hits[0].context.toLowerCase()).toContain('questions about this role');
  });

  test('no address is invented when the page has none', () => {
    expect(emailHitsFromHtml('<p>Apply through the portal.</p>')).toEqual([]);
  });
});

describe('people and merging', () => {
  test('a named poster carries no email and a profile URL is not proof', () => {
    const p = posterContact(
      { name: 'Priya Raman', title: 'Recruiter', profileUrl: 'https://www.linkedin.com/in/priya' },
      'https://www.linkedin.com/jobs/view/1',
      NOW,
    );
    expect(p?.contactType).toBe('job_poster');
    expect(p?.email).toBeNull();
    expect(p?.mailboxVerified).toBe(false);
  });

  test('duplicates collapse and the best-evidenced type wins', () => {
    const inbox = classifyContact(
      { email: 'talent@acme.co.uk', context: 'talent team vacancy', sourceUrl: 'https://acme.co.uk/careers', allowedHosts: ['acme.co.uk'], method: 'mailto' },
      NOW,
    )!;
    const merged = mergeContacts([
      inbox,
      { ...inbox, discoveryMethod: 'page_text', sourceContext: '' },
      posterContact({ name: 'Priya Raman' }, 'https://acme.co.uk/careers', NOW)!,
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].contactType).toBe('job_poster');
    expect(merged[1].sourceContext).toContain('talent team');
  });
});
