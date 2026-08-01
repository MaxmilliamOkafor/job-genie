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
  const KEY_TEMPLATE = 'followup_template';        // legacy single template (migrated)
  const KEY_TEMPLATES = 'followup_templates';      // template library
  const KEY_ACTIVE = 'followup_active_template';   // selected template id
  const KEY_ENABLED = 'followup_enabled';
  const KEY_SENT_LOG = 'followup_sent_log';
  const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

  // ===================================================================
  // TEMPLATE LIBRARY
  // -------------------------------------------------------------------
  // Three presets, all built on the same principle: a follow-up's job is
  // to make the application EASY TO FIND, not to re-pitch the CV. Short
  // wins -- recruiters skim, and a wall of text reads as a second
  // application rather than a helpful note. Users can edit these, add
  // their own, and switch per application.
  // ===================================================================
  const SIGN_OFF = [
    'Kind regards,',
    '{{my_name}}',
    '{{my_phone}}',
    '{{my_email}}',
    '{{my_linkedin}}',
  ].join('\n');

  const BUILT_IN_TEMPLATES = [
    {
      id: 'standard',
      name: 'Standard follow-up (recommended)',
      builtIn: true,
      subject: 'Application submitted — {{job_title}}{{job_id_suffix}}',
      body: [
        'Dear {{recipient_first_name}},',
        '',
        'I applied for the {{job_title}} role at {{company_name}} today and wanted to flag it in case it helps to have it on your radar.',
        '',
        'Details to locate my application:',
        '{{reference_block}}',
        '',
        'It came through your application portal under {{my_name}} ({{my_email}}).',
        '',
        'I am {{headline}}, and I would be glad to walk through how that maps to what the team needs. Happy to send anything further that would be useful.',
        '',
        SIGN_OFF,
      ].join('\n'),
    },
    {
      id: 'concise',
      name: 'Concise (3 lines)',
      builtIn: true,
      subject: '{{job_title}}{{job_id_suffix}} — application from {{my_name}}',
      body: [
        'Dear {{recipient_first_name}},',
        '',
        'I submitted an application for {{job_title}} at {{company_name}} today{{job_id_sentence}} — filed under {{my_name}} ({{my_email}}).',
        '',
        '{{reference_block}}',
        '',
        'Happy to answer anything or share more detail if useful.',
        '',
        SIGN_OFF,
      ].join('\n'),
    },
    {
      id: 'with-hook',
      name: 'With relevance hook (strong-fit roles)',
      builtIn: true,
      subject: 'Application submitted — {{job_title}}{{job_id_suffix}}',
      body: [
        'Dear {{recipient_first_name}},',
        '',
        'I applied for the {{job_title}} role at {{company_name}} today{{job_id_sentence}}.',
        '',
        'Details to locate my application:',
        '{{reference_block}}',
        '',
        'The most relevant part of my background: {{highlight}}',
        '',
        'If it would help to discuss how that applies to your roadmap, I am glad to make time. Either way, thank you for considering the application.',
        '',
        SIGN_OFF,
      ].join('\n'),
    },
  ];

  function _cloneBuiltIns() {
    return BUILT_IN_TEMPLATES.map((t) => Object.assign({}, t));
  }

  // Kept for callers that only want the primary template.
  const DEFAULT_TEMPLATE = Object.assign({}, BUILT_IN_TEMPLATES[0]);

  function _newId() {
    return 'tpl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /**
   * All templates plus the active id. Migrates transparently from the
   * earlier single-template storage so nothing the user wrote is lost.
   */
  function listTemplates() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_TEMPLATES, KEY_ACTIVE, KEY_TEMPLATE], (r) => {
          let templates = (r && Array.isArray(r[KEY_TEMPLATES])) ? r[KEY_TEMPLATES] : null;
          if (!templates || !templates.length) {
            templates = _cloneBuiltIns();
            // Migration: preserve a customised single template as "My template".
            const legacy = r && r[KEY_TEMPLATE];
            if (legacy && legacy.subject && legacy.body) {
              templates.push({ id: _newId(), name: 'My template (imported)', subject: legacy.subject, body: legacy.body });
            }
          }
          const activeId = (r && r[KEY_ACTIVE]) || templates[0].id;
          const active = templates.find((t) => t.id === activeId) || templates[0];
          resolve({ templates, activeId: active.id, active });
        });
      } catch (e) {
        const templates = _cloneBuiltIns();
        resolve({ templates, activeId: templates[0].id, active: templates[0] });
      }
    });
  }

  function _persist(templates, activeId) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [KEY_TEMPLATES]: templates, [KEY_ACTIVE]: activeId }, () => resolve(true));
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function setActiveTemplate(id) {
    const { templates } = await listTemplates();
    const found = templates.find((t) => t.id === id);
    await _persist(templates, found ? id : templates[0].id);
    return found || templates[0];
  }

  // The active template, resolved. Used by compose().
  async function loadTemplate() {
    const { active } = await listTemplates();
    return active;
  }

  /**
   * Save edits to the active (or given) template. Editing a built-in
   * preset forks it into a user copy, so the pristine presets stay
   * available to reset back to.
   */
  async function saveTemplate(tpl) {
    const { templates, activeId } = await listTemplates();
    const id = (tpl && tpl.id) || activeId;
    const idx = templates.findIndex((t) => t.id === id);
    const next = {
      id,
      name: (tpl && tpl.name) || (idx >= 0 ? templates[idx].name : 'My template'),
      subject: (tpl && tpl.subject) || '',
      body: (tpl && tpl.body) || '',
    };

    if (idx >= 0 && templates[idx].builtIn) {
      next.id = _newId();
      next.name = (tpl && tpl.name && tpl.name !== templates[idx].name)
        ? tpl.name
        : templates[idx].name.replace(/\s*\(recommended\)$/, '') + ' (edited)';
      templates.push(next);
    } else if (idx >= 0) {
      templates[idx] = next;
    } else {
      templates.push(next);
    }
    await _persist(templates, next.id);
    return next;
  }

  async function createTemplate(name, copyFromId) {
    const { templates, activeId } = await listTemplates();
    const src = templates.find((t) => t.id === (copyFromId || activeId)) || templates[0];
    const next = {
      id: _newId(),
      name: name || 'New template',
      subject: src.subject,
      body: src.body,
    };
    templates.push(next);
    await _persist(templates, next.id);
    return next;
  }

  async function deleteTemplate(id) {
    const { templates } = await listTemplates();
    const idx = templates.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    if (templates[idx].builtIn) throw new Error('Built-in presets cannot be deleted — edit one to make your own copy');
    templates.splice(idx, 1);
    const nextActive = templates[0].id;
    await _persist(templates, nextActive);
    return templates.find((t) => t.id === nextActive);
  }

  // Restore the presets, keeping the user's own templates intact.
  async function resetTemplate() {
    const { templates } = await listTemplates();
    const userOwn = templates.filter((t) => !t.builtIn);
    const next = _cloneBuiltIns().concat(userOwn);
    await _persist(next, next[0].id);
    return next[0];
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
      // Recipient. recipient_first_name degrades to "Hiring Team" so a
      // greeting never reads "Dear ,".
      recipient_name: (c.contactName || '').trim() || 'Hiring Team',
      recipient_first_name: first || 'Hiring Team',
      recipient_email: c.email || '',
      // Friendly aliases -- both {{company}} and {{company_name}} work.
      company_name: c.company || 'your team',
      job_role: c.title || 'the advertised role',
      my_title: c.myTitle || '',
      highlight: c.highlight || (c.headline || 'a background that maps onto the core requirements you listed'),
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

  // ===================================================================
  // GMAIL AUTH -- two paths
  // -------------------------------------------------------------------
  // A) Runtime-configured (preferred when the repo is public): the user
  //    pastes a client_id into the extension; nothing is committed. Uses
  //    launchWebAuthFlow with the IMPLICIT flow, so there is no
  //    client_secret anywhere -- an extension cannot keep a secret, so the
  //    right answer is to not have one. Tokens are short-lived (~1h) and
  //    re-issued by re-running the flow.
  // B) Manifest-configured: chrome.identity.getAuthToken, which can only
  //    read client_id from the manifest. Simpler, and Chrome manages the
  //    token cache, but ties auth to the signed-in Chrome profile.
  //
  // Note for the record: an OAuth client_id is NOT a secret. For the
  // Chrome-Extension client type there is no secret at all -- the
  // extension ID is what Google validates. Path A exists to keep a public
  // repo clean and to allow a non-Chrome-profile Google account, not
  // because a leaked client_id is dangerous.
  // ===================================================================
  const KEY_OAUTH = 'followup_oauth';          // { clientId }
  const KEY_TOKEN = 'followup_oauth_token';    // { access_token, expires_at }

  function loadOAuthConfig() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_OAUTH], (r) => resolve((r && r[KEY_OAUTH]) || {}));
      } catch (e) {
        resolve({});
      }
    });
  }

  function saveOAuthConfig(cfg) {
    return new Promise((resolve) => {
      try {
        const clientId = String((cfg && cfg.clientId) || '').trim();
        chrome.storage.local.set({ [KEY_OAUTH]: { clientId } }, () => resolve(true));
      } catch (e) {
        resolve(false);
      }
    });
  }

  // The redirect the Google client must whitelist. Derived, not typed, so
  // it can't be got wrong.
  function redirectUri() {
    try {
      if (chrome.identity && chrome.identity.getRedirectURL) return chrome.identity.getRedirectURL();
    } catch (e) {}
    return 'https://' + (chrome.runtime && chrome.runtime.id) + '.chromiumapp.org/';
  }

  // Google treats ".../" and "..." as two DIFFERENT redirect URIs and matches
  // them byte-for-byte, but Chrome intercepts the whole chromiumapp.org
  // origin either way. So whichever variant the user actually pasted into
  // the Cloud Console is the one we must send. Rather than making the user
  // guess -- the single most common way this setup fails -- we probe both
  // and use whichever Google accepts.
  function redirectUriVariants() {
    const base = redirectUri().replace(/\/+$/, '');
    return [base + '/', base];
  }

  function buildAuthUrl(clientId, uri) {
    return 'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + encodeURIComponent(clientId) +
      '&response_type=token' +
      '&redirect_uri=' + encodeURIComponent(uri) +
      '&scope=' + encodeURIComponent(GMAIL_SCOPE) +
      '&prompt=consent';
  }

  // Google renders every setup failure as an HTML error PAGE inside the auth
  // popup. chrome.identity cannot read that page, so all Chrome ever reports
  // back is "the user closed the window" -- which is why this has been a dead
  // end. We can, however, fetch the same URL ourselves and read the page.
  // Credentials are omitted deliberately: parameter validation happens before
  // sign-in, so an anonymous request still surfaces the real error, and we
  // never touch the user's Google cookies.
  function classifyAuthPage(text, status) {
    const t = String(text || '');
    if (/redirect_uri_mismatch/i.test(t)) return { code: 'redirect_uri_mismatch' };
    if (/deleted_client/i.test(t)) return { code: 'deleted_client' };
    if (/invalid_client|OAuth client was not found/i.test(t)) return { code: 'invalid_client' };
    if (/invalid_scope/i.test(t)) return { code: 'invalid_scope' };
    if (/admin_policy_enforced/i.test(t)) return { code: 'admin_policy_enforced' };
    if (/org_internal/i.test(t)) return { code: 'org_internal' };
    if (/access_denied|has not completed the Google verification/i.test(t)) return { code: 'access_denied' };
    // A 400 we can't name is still a definite failure; anything else means
    // Google was happy enough to move on to sign-in/consent.
    if (status === 400) return { code: 'unknown_400' };
    return { code: 'ok' };
  }

  async function probeRedirect(clientId, uri) {
    try {
      const res = await fetch(buildAuthUrl(clientId, uri), {
        credentials: 'omit',
        redirect: 'follow',
      });
      return classifyAuthPage(await res.text(), res.status);
    } catch (e) {
      // Network/CSP failure tells us nothing about the config -- don't
      // block the real flow on it.
      return { code: 'unprobeable', detail: (e && e.message) || String(e) };
    }
  }

  // Returns the redirect URI Google accepts, or throws naming the exact fix.
  async function resolveRedirectUri(clientId) {
    const variants = redirectUriVariants();
    const results = [];
    for (const uri of variants) {
      const r = await probeRedirect(clientId, uri);
      results.push({ uri, code: r.code });
      if (r.code === 'ok' || r.code === 'unprobeable') return uri;
      // These are client-level faults; trying the other slash won't help.
      if (r.code === 'invalid_client' || r.code === 'deleted_client') {
        throw new Error(
          'Google rejected the client ID itself (' + r.code + '). The ID saved here does not match a live ' +
          'OAuth client in your project — re-copy it from Google Cloud Console → Credentials.'
        );
      }
    }
    if (results.every((r) => r.code === 'redirect_uri_mismatch')) {
      throw new Error(
        'redirect_uri_mismatch — neither redirect URI is registered on your OAuth client. ' +
        'In Google Cloud Console → Credentials → your Web application client → Authorised redirect URIs ' +
        '(NOT Authorised JavaScript origins), add:\n  ' + variants[0] + '\nthen Save and wait ~60s.'
      );
    }
    const first = results[0] || {};
    throw new Error('Google rejected the authorisation request (' + (first.code || 'unknown') + ').');
  }

  function _cachedToken() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_TOKEN], (r) => {
          const t = r && r[KEY_TOKEN];
          // 60s safety margin so a token can't expire mid-request.
          if (t && t.access_token && t.expires_at && t.expires_at - 60000 > Date.now()) resolve(t.access_token);
          else resolve('');
        });
      } catch (e) {
        resolve('');
      }
    });
  }

  function _storeToken(accessToken, expiresInSec) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({
          [KEY_TOKEN]: {
            access_token: accessToken,
            expires_at: Date.now() + (Number(expiresInSec || 3600) * 1000),
          },
        }, () => resolve(true));
      } catch (e) {
        resolve(true);
      }
    });
  }

  function _clearToken() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove([KEY_TOKEN], () => resolve(true));
      } catch (e) {
        resolve(true);
      }
    });
  }

  async function getTokenViaWebFlow(interactive) {
    const { clientId } = await loadOAuthConfig();
    if (!clientId) throw new Error('No Gmail client ID saved — paste one into the extension and click Save');

    const cached = await _cachedToken();
    if (cached) return cached;
    if (!interactive) throw new Error('Gmail authorisation expired — click Connect Gmail');

    // Find the variant Google accepts BEFORE opening the window. This throws
    // with the precise, actionable cause instead of letting the user hit an
    // opaque error page.
    const uri = await resolveRedirectUri(clientId);
    const url = buildAuthUrl(clientId, uri);

    const redirect = await new Promise((resolve, reject) => {
      try {
        chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
          const err = chrome.runtime.lastError;
          if (err || !responseUrl) {
            // The preflight already cleared the config, so a failure here is
            // almost always consent-side: account not on the test-user list,
            // or the window genuinely dismissed.
            reject(new Error(
              ((err && err.message) || 'Authorisation window closed') +
              ' — the redirect URI checked out, so if Google showed a block screen, add your Google ' +
              'account under OAuth consent screen → Test users and confirm the Gmail API is enabled.'
            ));
            return;
          }
          resolve(responseUrl);
        });
      } catch (e) {
        reject(e);
      }
    });

    // Implicit flow returns the token in the URL fragment.
    const frag = String(redirect).split('#')[1] || '';
    const params = new URLSearchParams(frag);
    const token = params.get('access_token');
    if (!token) {
      const oauthErr = params.get('error') || new URLSearchParams(String(redirect).split('?')[1] || '').get('error');
      throw new Error('Google did not return a token' + (oauthErr ? ' (' + oauthErr + ')' : ''));
    }
    await _storeToken(token, params.get('expires_in'));
    return token;
  }

  // ---- Gmail auth + send ----------------------------------------------
  function getAuthTokenFromManifest(interactive) {
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

  // Prefer the runtime-configured path when the user has saved a client ID
  // (nothing committed, any Google account); fall back to the manifest.
  async function getAuthToken(interactive) {
    const { clientId } = await loadOAuthConfig();
    if (clientId) return getTokenViaWebFlow(interactive);
    return getAuthTokenFromManifest(interactive);
  }

  async function authMode() {
    const { clientId } = await loadOAuthConfig();
    if (clientId) return 'runtime';
    let manifest = {};
    try { manifest = chrome.runtime.getManifest() || {}; } catch (e) {}
    const mid = manifest.oauth2 && manifest.oauth2.client_id;
    if (mid && !/YOUR_|REPLACE|xxxx/i.test(mid)) return 'manifest';
    return 'unconfigured';
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

    const mode = await authMode();
    // Runtime path: only the saved client ID and the whitelisted redirect
    // matter. The manifest checks below are irrelevant in that mode, so
    // don't report them as failures.
    if (mode === 'runtime') {
      const cfg = await loadOAuthConfig();
      add(!!cfg.clientId, 'client ID saved on this device', 'Paste your OAuth client ID and click Save client ID.');

      // Ask Google directly which redirect URI it accepts, so this reports
      // the actual cause rather than a list of things it might be.
      const variants = redirectUriVariants();
      if (cfg.clientId) {
        const probes = [];
        for (const uri of variants) probes.push({ uri, code: (await probeRedirect(cfg.clientId, uri)).code });
        const good = probes.find((p) => p.code === 'ok');
        const clientBad = probes.find((p) => p.code === 'invalid_client' || p.code === 'deleted_client');
        const unprobeable = probes.every((p) => p.code === 'unprobeable');

        add(!clientBad, 'client ID recognised by Google',
          'Google says the client does not exist (' + (clientBad && clientBad.code) +
          '). Re-copy the ID from Cloud Console → Credentials.');

        if (unprobeable) {
          add(true, 'redirect URI (could not verify — offline?): ' + variants[0], '');
        } else {
          add(!!good, good ? 'redirect URI registered: ' + good.uri : 'redirect URI registered',
            'NOT registered. In Cloud Console → Credentials → your Web application client → ' +
            'Authorised redirect URIs (not Authorised JavaScript origins), add exactly:  ' + variants[0] +
            '  — then Save and wait ~60s.');
        }
      } else {
        add(true, 'redirect URI: ' + variants[0], '');
      }

      let tokenOk = false; let tokenErr = '';
      try { await getAuthToken(false); tokenOk = true; } catch (e) { tokenErr = (e && e.message) || String(e); }
      add(tokenOk, 'Gmail authorisation present',
        'Click Connect Gmail and complete the Google consent screen. If Google blocks it, add your ' +
        'account under OAuth consent screen → Test users and confirm the Gmail API is ENABLED. (' + tokenErr + ')');
      const failed = checks.filter((c) => !c.ok);
      return {
        ok: failed.length === 0,
        mode,
        extensionId: (chrome.runtime && chrome.runtime.id) || '',
        clientId: cfg.clientId || '',
        checks,
        summary: failed.length === 0
          ? 'Gmail is connected and ready to send (client ID stored on this device).'
          : failed.length + ' issue(s) to fix: ' + failed.map((c) => c.name).join('; '),
      };
    }

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
    return _clearToken().then(() => getAuthTokenFromManifest(false))
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
        // Evict from whichever cache issued it so the next attempt
        // re-prompts instead of failing forever.
        await _clearToken();
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

  // ===================================================================
  // SEND POLICY -- the anti-spam guard
  // -------------------------------------------------------------------
  // Email is permanent in the recipient's mailbox. A recruiter opening a
  // thread sees EVERY note you have ever sent them, so five near-identical
  // "I applied today" messages across five roles at one company reads as a
  // blast and gets the sender flagged -- which poisons every future
  // application to that employer, not just this one.
  //
  // Per-posting dedupe is not enough, because the same careers@ inbox
  // serves every role. These limits are deliberately conservative: the
  // downside of one unsent follow-up is nothing; the downside of being
  // marked a spammer at a company you want to work at is permanent.
  // ===================================================================
  // What actually triggers a spam judgement is DENSITY, not lifetime total:
  // three notes in one week reads badly, three across three months is just
  // a candidate who wants to work there. So the first few notes are free
  // (applying to several roles at once is normal and legitimate), then a
  // short gap applies, and a rolling window caps the overall rate.
  //
  // Over the limit we SKIP rather than nag: no dialog, nothing sent, and
  // the panel says when the company becomes eligible again.
  const SEND_POLICY = {
    perCompanyBurst: 3,             // first 3 notes to a company: no gap required
    perCompanyCooldownDays: 5,      // after that, 5 days between notes
    // Backstop only. It must stay ABOVE what the burst + gap can produce
    // (3 free + one every 5 days), otherwise the window would silently
    // override the gap and impose a month-long wait instead of 5 days.
    perCompanyMaxInWindow: 6,
    perCompanyWindowDays: 30,
  };

  const DAY_MS = 86400000;

  function _normCompany(c) {
    return String(c || '').toLowerCase().replace(/\b(inc|llc|ltd|limited|gmbh|plc|corp|corporation|co|company|group|holdings)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function _readLog() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_SENT_LOG], (r) => resolve((r && r[KEY_SENT_LOG]) || {}));
      } catch (e) { resolve({}); }
    });
  }

  /**
   * Should we send to this recipient/company right now?
   * @returns {{allowed, blocked, reasons:[], warnings:[], history:[]}}
   */
  async function checkSendPolicy({ company, email, jobKey } = {}) {
    const log = await _readLog();
    const entries = Object.keys(log).map((k) => Object.assign({ key: k }, log[k]))
      .filter((e) => e && e.at);
    const now = Date.now();
    const addr = String(email || '').toLowerCase();
    const comp = _normCompany(company);

    const toSameAddress = entries.filter((e) => String(e.to || '').toLowerCase() === addr && addr);
    const toSameCompany = entries.filter((e) => comp && _normCompany(e.company) === comp);

    const reasons = [];
    const warnings = [];
    let nextEligibleAt = 0;

    const history = toSameCompany
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 8)
      .map((e) => ({ at: e.at, to: e.to, title: e.title || '', jobId: e.jobId || '' }));

    // 1. Never twice for the same posting -- that is pure duplication.
    if (jobKey && log[jobKey]) {
      return {
        allowed: false, skip: true, sameposting: true,
        reasons: ['Already followed up on this exact posting (' +
          new Date(log[jobKey].at).toLocaleDateString('en-GB') + ') — skipping.'],
        warnings, history, nextEligibleAt: 0,
      };
    }

    const companyCount = toSameCompany.length;
    const lastToCompany = companyCount
      ? Math.max.apply(null, toSameCompany.map((e) => new Date(e.at).getTime()))
      : 0;
    const inWindow = toSameCompany.filter((e) =>
      now - new Date(e.at).getTime() < SEND_POLICY.perCompanyWindowDays * DAY_MS);

    // 2. Rolling-rate cap always applies -- this is the real spam signal.
    if (inWindow.length >= SEND_POLICY.perCompanyMaxInWindow) {
      const oldestInWindow = Math.min.apply(null, inWindow.map((e) => new Date(e.at).getTime()));
      nextEligibleAt = oldestInWindow + SEND_POLICY.perCompanyWindowDays * DAY_MS;
      reasons.push('Already sent ' + inWindow.length + ' notes to ' + (company || 'this company') +
        ' in the last ' + SEND_POLICY.perCompanyWindowDays + ' days — skipping to stay out of their spam filter.');
    } else if (companyCount >= SEND_POLICY.perCompanyBurst && lastToCompany) {
      // 3. Past the free burst, require a short gap between notes.
      const days = Math.floor((now - lastToCompany) / DAY_MS);
      if (days < SEND_POLICY.perCompanyCooldownDays) {
        nextEligibleAt = lastToCompany + SEND_POLICY.perCompanyCooldownDays * DAY_MS;
        reasons.push('Last note to ' + (company || 'this company') + ' was ' +
          (days === 0 ? 'today' : days + ' day(s) ago') + ' — skipping until the ' +
          SEND_POLICY.perCompanyCooldownDays + '-day gap has passed.');
      }
    }

    // Inside the burst allowance: fine to send, but say so, because writing
    // as a first contact when they already have notes from you reads oddly.
    if (!reasons.length && companyCount > 0) {
      warnings.push('You have emailed ' + (company || 'this company') + ' ' + companyCount +
        ' time(s) before (' + toSameCompany.slice(0, 3).map((e) => e.title || 'a role').join(', ') +
        '). Consider referencing that rather than writing as a first contact.');
    }

    return {
      allowed: reasons.length === 0,
      skip: reasons.length > 0,
      reasons, warnings, history, nextEligibleAt,
      sentToCompany: companyCount,
      burstRemaining: Math.max(0, SEND_POLICY.perCompanyBurst - companyCount),
    };
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
    listTemplates, setActiveTemplate, createTemplate, deleteTemplate,
    BUILT_IN_TEMPLATES,
    buildTokens, render, compose,
    isConnected, connect, disconnect, diagnose, authMode,
    loadOAuthConfig, saveOAuthConfig, redirectUri, redirectUriVariants, probeRedirect,
    send, sendTest, buildRaw,
    alreadySent, markSent, checkSendPolicy, SEND_POLICY,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.FollowupEmail;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
