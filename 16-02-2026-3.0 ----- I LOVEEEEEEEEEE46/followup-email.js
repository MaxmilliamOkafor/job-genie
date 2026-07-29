/**
 * Job Genie - Application Follow-up Email
 *
 * After the tailored CV + cover letter are submitted, sends a short,
 * professional note to a hiring contact the employer PUBLISHED in the job
 * posting, so they can locate the application quickly (job title, job ID,
 * date, candidate name).
 *
 * WHY GMAIL API AND NOT SMTP
 *   A Chrome extension has no raw TCP sockets, so SMTP is impossible from
 *   the browser. It also matters that the note arrives FROM the candidate's
 *   own address -- a relay would send from a third-party domain, which
 *   looks like bulk mail and lands in spam. The Gmail API sends from the
 *   user's real mailbox and the message appears in their own Sent folder,
 *   exactly as if they had typed it.
 *
 * SCOPE, DELIBERATELY
 *   Recipients come from the posting itself (or an address the user types
 *   in). This module has no contact-lookup or email-enrichment path: it
 *   will not guess, pattern-build, or fetch an address for someone who
 *   didn't publish one. It also sends ONE message per application and
 *   never runs on a list.
 *
 * window.FollowupEmail
 */
(function (global) {
  'use strict';

  const TAG = '[JG-Followup]';
  const KEY_TEMPLATE = 'followup_template';
  const KEY_ENABLED = 'followup_enabled';
  const KEY_SENT_LOG = 'followup_sent_log';
  const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

  // Deliberately plain and short. Recruiters skim; a two-paragraph note
  // that makes the application easy to find is the whole job.
  const DEFAULT_TEMPLATE = {
    subject: 'Application submitted — {{job_title}}{{job_id_suffix}}',
    // (add {{job_location}} to the subject if you apply to multi-office roles)
    body: [
      'Dear {{greeting_name}},',
      '',
      'I submitted my application for the {{job_title}} role at {{company}} today{{job_id_sentence}}.',
      '',
      'Details to help you locate it:',
      '{{reference_block}}',
      '',
      'It was submitted through your application portal under {{my_name}} ({{my_email}}). In short, I am {{headline}}.',
      '',
      'I would welcome the chance to discuss how my background fits what your team needs. Happy to share anything further that would be useful.',
      '',
      'Kind regards,',
      '{{my_name}}',
      '{{my_phone}}',
      '{{my_linkedin}}',
    ].join('\n'),
  };

  function loadTemplate() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_TEMPLATE], (r) => {
          const t = r && r[KEY_TEMPLATE];
          resolve((t && t.subject && t.body) ? t : Object.assign({}, DEFAULT_TEMPLATE));
        });
      } catch (e) {
        resolve(Object.assign({}, DEFAULT_TEMPLATE));
      }
    });
  }

  function saveTemplate(tpl) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [KEY_TEMPLATE]: { subject: tpl.subject || '', body: tpl.body || '' } }, () => resolve(true));
      } catch (e) {
        resolve(false);
      }
    });
  }

  function resetTemplate() {
    return saveTemplate(DEFAULT_TEMPLATE).then(() => Object.assign({}, DEFAULT_TEMPLATE));
  }

  // ---- token expansion -------------------------------------------------
  function buildTokens(ctx) {
    const c = ctx || {};
    const jobId = (c.jobId || '').trim();
    const first = (c.contactName || '').trim().split(/\s+/)[0] || '';
    return {
      job_title: c.title || 'the advertised role',
      company: c.company || 'your team',
      job_id: jobId,
      job_id_suffix: jobId ? ' (Job ID ' + jobId + ')' : '',
      job_id_sentence: jobId ? ', reference ' + jobId : '',
      greeting_name: first || 'Hiring Team',
      job_location: c.location || '',
      job_department: c.department || '',
      job_url: c.url || '',
      // Every locator we found, as ready-to-paste lines. This is what
      // actually lets a recruiter pull up the application in seconds.
      reference_block: (c.referenceBlock || '').trim(),
      my_name: c.myName || '',
      my_email: c.myEmail || '',
      my_phone: c.myPhone || '',
      my_linkedin: c.myLinkedin || '',
      headline: c.headline || 'a candidate whose background maps closely to this role',
      today: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
    };
  }

  function render(str, tokens) {
    return String(str || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => {
      const v = tokens[k.toLowerCase()];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  async function compose(ctx) {
    const tpl = await loadTemplate();
    const tokens = buildTokens(ctx);
    let body = render(tpl.body, tokens);
    // Collapse blank lines left by empty tokens (e.g. no phone on file).
    body = body.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim();
    return {
      to: (ctx && ctx.email) || '',
      subject: render(tpl.subject, tokens).replace(/\s{2,}/g, ' ').trim(),
      body,
    };
  }

  // ---- Gmail auth + send ----------------------------------------------
  function getAuthToken(interactive) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.identity || !chrome.identity.getAuthToken) {
          reject(new Error('chrome.identity unavailable — add the "identity" permission and an oauth2 client_id to manifest.json'));
          return;
        }
        chrome.identity.getAuthToken({ interactive: !!interactive, scopes: [GMAIL_SCOPE] }, (token) => {
          const err = chrome.runtime.lastError;
          if (err || !token) {
            reject(new Error((err && err.message) || 'Gmail authorisation was not granted'));
            return;
          }
          resolve(token);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function isConnected() {
    return getAuthToken(false).then(() => true).catch(() => false);
  }

  // ---- diagnostics -----------------------------------------------------
  // Gmail OAuth fails for a handful of specific, fixable reasons, and
  // Chrome reports most of them as the same opaque message. This maps the
  // real cause to the exact fix so setup isn't trial and error.
  async function diagnose() {
    const checks = [];
    const add = (ok, name, fix) => checks.push({ ok, name, fix: ok ? '' : fix });

    // 1. manifest wiring
    let manifest = {};
    try { manifest = chrome.runtime.getManifest() || {}; } catch (e) {}
    const hasIdentity = Array.isArray(manifest.permissions) && manifest.permissions.indexOf('identity') !== -1;
    add(hasIdentity, 'manifest has "identity" permission',
      'Add "identity" to the permissions array in manifest.json, then reload the extension.');

    const clientId = manifest.oauth2 && manifest.oauth2.client_id;
    const hasClient = !!clientId && !/YOUR_|REPLACE|xxxx/i.test(clientId);
    add(hasClient, 'manifest has a real oauth2 client_id',
      'In Google Cloud Console create an OAuth client of type "Chrome Extension" (NOT "Web application") and paste its ID into manifest.json -> oauth2.client_id.');

    const scopes = (manifest.oauth2 && manifest.oauth2.scopes) || [];
    add(scopes.indexOf(GMAIL_SCOPE) !== -1, 'gmail.send scope declared',
      'Add "' + GMAIL_SCOPE + '" to manifest.json -> oauth2.scopes.');

    // 2. Extension ID stability -- the single most common cause of
    // "bad client id" on an unpacked extension: the ID changes on every
    // load unless a "key" pins it, so it stops matching the OAuth client.
    let extId = '';
    try { extId = chrome.runtime.id || ''; } catch (e) {}
    add(!!manifest.key, 'extension ID is pinned (manifest "key")',
      'Unpacked extensions get a NEW ID unless pinned, which breaks the OAuth client registration. ' +
      'Your current ID is ' + extId + '. Either register THIS id in the Cloud Console client and avoid ' +
      'reloading from a different folder, or add a "key" to manifest.json to pin it permanently.');

    // 3. Live token acquisition -- the real test.
    let tokenOk = false;
    let tokenErr = '';
    try {
      await getAuthToken(false);
      tokenOk = true;
    } catch (e) {
      tokenErr = (e && e.message) || String(e);
    }
    add(tokenOk, 'Gmail authorisation present',
      tokenErr.indexOf('not granted') !== -1 || tokenErr.indexOf('interactive') !== -1
        ? 'Not authorised yet — click Connect Gmail and complete the Google consent screen.'
        : 'Token request failed: ' + tokenErr + '. If it mentions "bad client id", the manifest client_id ' +
          'does not match a Chrome-Extension OAuth client for extension ID ' + extId + '. ' +
          'If it mentions access_denied, add your Google account under OAuth consent screen -> Test users, ' +
          'and make sure the Gmail API is ENABLED for the project.');

    const failed = checks.filter((c) => !c.ok);
    return {
      ok: failed.length === 0,
      extensionId: extId,
      clientId: clientId || '',
      checks,
      summary: failed.length === 0
        ? 'Gmail is connected and ready to send.'
        : failed.length + ' issue(s) to fix: ' + failed.map((c) => c.name).join('; '),
    };
  }

  function connect() {
    return getAuthToken(true).then(() => true);
  }

  function disconnect() {
    return getAuthToken(false)
      .then((token) => new Promise((resolve) => {
        try {
          chrome.identity.removeCachedAuthToken({ token }, () => resolve(true));
        } catch (e) { resolve(true); }
      }))
      .catch(() => true);
  }

  // RFC 2822 message, base64url encoded as the Gmail API requires. UTF-8
  // safe: btoa() alone corrupts non-ASCII names/accents.
  function buildRaw({ to, subject, body, fromName }) {
    const headers = [
      'To: ' + to,
      'Subject: ' + subject,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
    ];
    if (fromName) headers.unshift('From: ' + fromName);
    const mime = headers.join('\r\n') + '\r\n\r\n' + body;
    const bytes = new TextEncoder().encode(mime);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function _validEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
  }

  /**
   * Send one message from the user's own Gmail account.
   * Requires an explicit recipient -- never derives one.
   */
  async function send({ to, subject, body, fromName }) {
    if (!_validEmail(to)) throw new Error('A valid recipient address is required');
    if (!String(subject || '').trim()) throw new Error('Subject is required');
    if (!String(body || '').trim()) throw new Error('Body is required');

    const token = await getAuthToken(true);
    const raw = buildRaw({ to: to.trim(), subject, body, fromName });
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      // A stale cached token is the common failure; clear it so the next
      // attempt re-prompts cleanly instead of failing silently forever.
      if (res.status === 401) {
        try { chrome.identity.removeCachedAuthToken({ token }, () => {}); } catch (e) {}
      }
      throw new Error('Gmail send failed (' + res.status + '): ' + txt.slice(0, 300));
    }
    const json = await res.json().catch(() => ({}));
    console.log(TAG, 'sent', json && json.id);
    return { ok: true, id: json && json.id };
  }

  // Send the rendered template to the user's own address, so they can see
  // exactly what a recruiter receives before any real send.
  async function sendTest(ctx) {
    const own = (ctx && ctx.myEmail) || '';
    if (!_validEmail(own)) throw new Error('No valid address on your profile to send the test to');
    const msg = await compose(Object.assign({}, ctx, { email: own }));
    return send({
      to: own,
      subject: '[TEST] ' + msg.subject,
      body: 'This is a test of your Job Genie follow-up template.\nThe recruiter would receive everything below this line.\n\n' +
        '----------------------------------------\n\n' + msg.body,
      fromName: ctx && ctx.myName,
    });
  }

  // Guard against sending twice for the same posting.
  function alreadySent(jobKey) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_SENT_LOG], (r) => {
          const log = (r && r[KEY_SENT_LOG]) || {};
          resolve(!!log[jobKey]);
        });
      } catch (e) { resolve(false); }
    });
  }

  function markSent(jobKey, meta) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_SENT_LOG], (r) => {
          const log = (r && r[KEY_SENT_LOG]) || {};
          log[jobKey] = Object.assign({ at: new Date().toISOString() }, meta || {});
          chrome.storage.local.set({ [KEY_SENT_LOG]: log }, () => resolve(true));
        });
      } catch (e) { resolve(false); }
    });
  }

  global.FollowupEmail = {
    DEFAULT_TEMPLATE,
    KEY_ENABLED,
    loadTemplate, saveTemplate, resetTemplate,
    buildTokens, render, compose,
    isConnected, connect, disconnect, diagnose,
    send, sendTest, buildRaw,
    alreadySent, markSent,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.FollowupEmail;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
