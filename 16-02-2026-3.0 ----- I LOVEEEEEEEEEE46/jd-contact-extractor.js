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

  // Role LOCATION. Matters because the same title is often open in several
  // offices -- "Client Value Partner" alone is ambiguous at a global
  // company, "Client Value Partner, Stockholm" is not.
  function extractLocation(text) {
    const t = String(text || '');
    const labelled = [
      /\b(?:location|office|work location|based in|city)\s*[:\-]\s*([A-Z][A-Za-z .'\-]{2,40}(?:,\s*[A-Z][A-Za-z .'\-]{2,40}){0,2})/,
      /\b(?:based in|located in|role is based in)\s+([A-Z][A-Za-z .'\-]{2,40}(?:,\s*[A-Z][A-Za-z .'\-]{2,40}){0,1})/,
    ];
    for (const re of labelled) {
      const m = t.match(re);
      if (m && m[1]) return m[1].replace(/\s+/g, ' ').trim();
    }
    // Postings usually print "City, Country" in the header block.
    const head = t.slice(0, 600);
    const m2 = head.match(/^\s*([A-Z][A-Za-z .'\-]{2,30},\s*[A-Z][A-Za-z .'\-]{2,30})\s*$/m);
    if (m2 && m2[1] && !/^(the|we|our|about|apply|job|role)\b/i.test(m2[1])) {
      return m2[1].replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  // Department / team, when the posting names one.
  function extractDepartment(text) {
    const t = String(text || '');
    const patterns = [
      /\b(?:department|team|function|business unit|org)\s*[:\-]\s*([A-Z][A-Za-z &/'\-]{2,40})/,
      /\bpart of (?:the|our)\s+([A-Z][A-Za-z &/'\-]{2,40})\s+(?:team|department|organisation|organization)/,
      /\bjoin (?:the|our)\s+([A-Z][A-Za-z &/'\-]{2,40})\s+team\b/,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m && m[1]) return m[1].replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  /**
   * Everything that helps a recruiter find THIS application, as ordered
   * "Label: value" lines. Only includes what was actually found, so the
   * email never carries an empty field.
   */
  function buildReferenceLines(d) {
    const lines = [];
    if (d.title) lines.push('Role: ' + d.title);
    if (d.jobId) lines.push('Job ID: ' + d.jobId);
    if (d.location) lines.push('Location: ' + d.location);
    if (d.department) lines.push('Team: ' + d.department);
    if (d.url) lines.push('Posting: ' + d.url);
    return lines;
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
    // PAGE-PUBLISHED SOURCES.
    // The text scan only sees visible prose. An employer who puts their
    // address behind a mailto: link, or declares it in schema.org
    // JobPosting data for Google Jobs, has published it MORE deliberately
    // than one who mentions it mid-paragraph -- so those outrank a prose
    // match of equal quality. Still only addresses the page itself
    // contains: nothing is guessed, constructed, or looked up.
    // Deliberately SMALL. The base score already encodes the thing that
    // matters most -- a named human (95) outranks a shared recruiting
    // inbox (90) -- and a source bonus big enough to overturn that would
    // send the note to careers@ instead of the recruiter. So the bonus
    // only separates equals: a mailto talent@ beats a prose talent@, but
    // never beats aoife.byrne@.
    const SOURCE_BONUS = { mailto: 3, 'json-ld': 2, meta: 1 };
    let harvested = opts.pageSources || null;
    if (!harvested && typeof global !== 'undefined' && global.JDContactSources) {
      try { harvested = global.JDContactSources.harvest(); } catch (e) {}
    }
    if (harvested && Array.isArray(harvested.emails)) {
      for (const h of harvested.emails) {
        const key = String(h.email || '').toLowerCase();
        if (!key || key === own) continue;
        const base = _scoreEmail(h.email);
        if (base <= 0) continue;                 // noreply/legal rejected as ever
        const score = base + (SOURCE_BONUS[h.source] || 0);
        const existing = found.find((f) => f.email.toLowerCase() === key);
        if (existing) { existing.score = Math.max(existing.score, score); existing.source = h.source; }
        else { seen.add(key); found.push({ email: h.email, score, source: h.source }); }
      }
    }

    found.sort((a, b) => b.score - a.score);

    const best = found.length ? found[0] : null;
    // A name from the LinkedIn hiring-team card or JSON-LD, when the prose
    // did not name anyone. Name only -- no address is derived from it.
    const harvestedName = (harvested && harvested.names && harvested.names.length)
      ? harvested.names[0].name : '';

    const result = {
      email: best ? best.email : '',
      emailSource: best ? (best.source || 'job-description') : '',
      allEmails: found.map((f) => f.email).slice(0, 5),
      jobId: extractJobId(jdText, url) || (harvested && harvested.jobId) || '',
      contactName: extractContactName(jdText) || harvestedName,
      location: opts.location || extractLocation(jdText),
      department: extractDepartment(jdText),
      title: opts.title || '',
      company: opts.company || (harvested && harvested.org) || '',
      url,
      hasPublishedEmail: !!best,
    };
    // Whatever we found that helps them locate the application.
    result.referenceLines = buildReferenceLines(result);
    result.referenceBlock = result.referenceLines.join('\n');
    return result;
  }

  const JDContactExtractor = {
    extract, extractJobId, extractContactName,
    extractLocation, extractDepartment, buildReferenceLines,
  };
  global.JDContactExtractor = JDContactExtractor;
  if (typeof module !== 'undefined' && module.exports) module.exports = JDContactExtractor;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
