/**
 * Job Genie - JD Contact & Reference Extractor
 *
 * Pulls the details a follow-up email needs out of the job posting itself:
 *   * a contact email the employer PUBLISHED in the posting
 *   * the job/requisition ID (from the text or the ATS URL)
 *   * job title, company, location, and a named contact if given
 *
 * SCOPE, DELIBERATELY: this reads only what the employer chose to publish
 * on the page the user is already viewing. It does not look up, infer, or
 * enrich anybody's private contact details -- if the posting has no email,
 * it says so and the caller falls back to a channel the recipient has
 * opted into.
 *
 * Pure text/DOM parsing, no network.  window.JDContactExtractor
 */
(function (global) {
  'use strict';

  const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g;

  // Mailboxes that are never a hiring contact. Writing to these annoys
  // people and can get the sender's domain blocked.
  const BLOCKED_LOCAL = /^(noreply|no-reply|donotreply|do-not-reply|postmaster|abuse|privacy|legal|compliance|dpo|gdpr|security|support|help|billing|sales|marketing|press|media|info|webmaster|admin|unsubscribe|bounce|mailer-daemon)$/i;
  const BLOCKED_DOMAIN = /(sentry|datadog|example|test|localhost|resend\.dev|schema\.org|w3\.org|googleapis|gstatic|cloudfront|linkedin\.com|indeed\.com|greenhouse\.io|lever\.co|workday|myworkdayjobs|ashbyhq|smartrecruiters)/i;

  // Local parts that are explicitly recruiting mailboxes -> best target.
  const RECRUITING_LOCAL = /^(careers?|jobs?|recruit(ing|ment)?|talent|talentacquisition|ta|hiring|hr|people|apply|applications?|resumes?|cv)$/i;

  function _scoreEmail(email) {
    const [local, domain] = email.toLowerCase().split('@');
    if (!local || !domain) return -1;
    if (BLOCKED_LOCAL.test(local)) return -1;
    if (BLOCKED_DOMAIN.test(domain)) return -1;
    // A named human on the hiring side gets read; a shared inbox gets
    // triaged. Both are legitimate published targets, so prefer the person.
    if (/(recruit|talent|hiring)/.test(local) && /[._]/.test(local)) return 100;
    if (/^[a-z]+\.[a-z]+$/.test(local)) return 95;
    if (/(recruit|talent|hiring|hr|people)/.test(local)) return 90;
    // A dedicated recruiting mailbox is published precisely for applicants.
    if (RECRUITING_LOCAL.test(local)) return 88;
    if (/^[a-z]{3,20}$/.test(local)) return 50;
    return 30;
  }

  /**
   * Job / requisition ID. Checked in order of reliability: explicit
   * labelled IDs in the text, then the ATS URL (Greenhouse, Lever,
   * Workday, Ashby all encode it), then a bare "#12345".
   */
  function extractJobId(text, url) {
    const t = String(text || '');
    const labelled = [
      /\b(?:job|requisition|req|posting|vacancy|reference|ref)\s*(?:id|number|no\.?|#)?\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9_\-]{2,24})\b/i,
      /\b(?:job|req)\s*(?:id|code)\s*([A-Za-z0-9][A-Za-z0-9_\-]{2,24})\b/i,
      /\bR-?\d{4,10}\b/,
      /\bJR-?\d{4,10}\b/,
    ];
    for (const re of labelled) {
      const m = t.match(re);
      if (m) return (m[1] || m[0]).trim();
    }
    const u = String(url || '');
    const urlPatterns = [
      /greenhouse\.io\/[^/]+\/jobs\/(\d{5,})/i,
      /lever\.co\/[^/]+\/([0-9a-f-]{8,})/i,
      /ashbyhq\.com\/[^/]+\/([0-9a-f-]{8,})/i,
      /myworkdayjobs?\.com\/.*?[_-](R-?\d{4,})/i,
      /\/jobs?\/(\d{5,})/i,
      /[?&](?:jobId|job_id|requisitionId|gh_jid)=([A-Za-z0-9_-]{3,})/i,
    ];
    for (const re of urlPatterns) {
      const m = u.match(re);
      if (m) return m[1];
    }
    return '';
  }

  // A named hiring contact, only when the posting states one.
  function extractContactName(text) {
    const t = String(text || '');
    const patterns = [
      /\b(?:contact|reach out to|email|send (?:your )?(?:cv|resume|application) to|questions to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/,
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}),?\s+(?:Talent Acquisition|Technical Recruiter|Recruiter|Hiring Manager|People Partner)\b/,
      /\b(?:Recruiter|Hiring Manager|Talent Acquisition(?: Partner| Specialist)?)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/,
    ];
    const LEAD_VERB = /^(contact|email|reach|reach out to|send|questions?|apply|attention|attn)\s+/i;
    for (const re of patterns) {
      const m = t.match(re);
      if (m && m[1]) {
        // A capture can swallow the instruction verb ("Contact Jane Okafor").
        let name = m[1].trim().replace(LEAD_VERB, '').trim();
        // Keep it to a plausible personal name, not a sentence fragment.
        if (name && name.split(/\s+/).length <= 3) return name;
      }
    }
    return '';
  }

  /**
   * @param {object} o
   * @param {string} o.jdText   job description text
   * @param {string} o.url      posting URL
   * @param {string} o.title    job title (if already known)
   * @param {string} o.company  company (if already known)
   * @param {string} o.ownEmail the user's own address, always excluded
   * @returns {{email,emailSource,allEmails,jobId,contactName,title,company,hasPublishedEmail}}
   */
  function extract(o) {
    const opts = o || {};
    const jdText = String(opts.jdText || '');
    const url = String(opts.url || '');
    const own = String(opts.ownEmail || '').toLowerCase();

    const found = [];
    const seen = new Set();
    let m;
    const re = new RegExp(EMAIL_RE.source, 'g');
    while ((m = re.exec(jdText)) !== null) {
      const e = m[0];
      const key = e.toLowerCase();
      if (seen.has(key) || key === own) continue;
      seen.add(key);
      const score = _scoreEmail(e);
      if (score > 0) found.push({ email: e, score });
    }
    found.sort((a, b) => b.score - a.score);

    const best = found.length ? found[0] : null;
    return {
      email: best ? best.email : '',
      emailSource: best ? 'job-description' : '',
      allEmails: found.map((f) => f.email).slice(0, 5),
      jobId: extractJobId(jdText, url),
      contactName: extractContactName(jdText),
      title: opts.title || '',
      company: opts.company || '',
      url,
      hasPublishedEmail: !!best,
    };
  }

  const JDContactExtractor = { extract, extractJobId, extractContactName };
  global.JDContactExtractor = JDContactExtractor;
  if (typeof module !== 'undefined' && module.exports) module.exports = JDContactExtractor;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
