// THE SEARCH WAS BEING MADE FROM THE WRONG ORIGIN.
//
// Everything about the LinkedIn people search was right except where the
// request came from, and that was enough to make it never work.
//
// contact-enrichment.js runs in the popup, on a chrome-extension://
// origin. Its fetch to linkedin.com/voyager was therefore a cross-site
// credentialed request: Origin is the extension, Referer is absent, and
// the session cookies are subject to SameSite. LinkedIn answers that
// pattern with 403 or 999. The code then reported "LinkedIn rejected the
// session" or, worse, fell through as though the search had run and
// matched nobody.
//
// linkedin-voyager.js was ALSO injected into linkedin.com tabs by
// content_scripts[3] -- where the request would have been first-party
// and would have worked. But the file has no message handling of any
// kind, so nothing on a LinkedIn page ever called it. That injection was
// dead weight, and the only live caller was the one that could not
// succeed.
//
// The fix runs the same fetch inside an open linkedin.com tab via
// executeScript. Same query, same headers, same everything -- except it
// is now first-party, which is the entire difference. executeScript
// rather than messaging the content script, because a content script
// only exists in tabs loaded after the extension was last reloaded, and
// the normal case is a LinkedIn tab that has been open for hours.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');

const PEOPLE = { included: [
  { template: 'UNIVERSAL', navigationUrl: 'https://www.linkedin.com/in/jane-recruiter-123?x=1',
    title: { text: 'Jane Doe' }, primarySubtitle: { text: 'Technical Recruiter at Coforge' },
    secondarySubtitle: { text: 'Dublin, Ireland' } },
] };

// Rebuild the module against a fresh fake Chrome for each scenario.
function boot(opts) {
  const log = [];
  const store = opts.store || {};
  const live = opts.liveTabs || {};      // tabId -> url, tabs that exist
  if (opts.hasTab) live[7] = 'https://www.linkedin.com/feed/';
  global.window = global;
  global.chrome = {
    storage: { local: {
      get: (k, cb) => { const o = {}; (Array.isArray(k) ? k : [k]).forEach((x) => { if (x in store) o[x] = store[x]; }); cb(o); },
      set: (o, cb) => { Object.assign(store, o); cb && cb(); },
    } },
    cookies: { get: (d, cb) => cb(opts.noCookie ? null : { value: '"ajax:1234567890123456789"' }) },
    tabs: opts.noTabsApi ? undefined : {
      query: (q, cb) => { log.push('tabs.query'); cb(opts.hasTab ? [{ id: 7, url: 'https://www.linkedin.com/feed/' }] : []); },
      create: (o, cb) => {
        log.push('tabs.create:' + o.url + (o.active === false ? ' (background)' : ' (FOREGROUND)'));
        // Distinct ids, so two simultaneous opens are visible as two tabs
        // rather than one overwriting the other.
        const id = 42 + (opts.peak ? opts.peak.n++ : 0);
        live[id] = o.url;
        if (opts.peak) opts.peak.max = Math.max(opts.peak.max, Object.keys(live).length);
        cb({ id });
      },
      remove: (id, cb) => { log.push('tabs.remove:' + id); delete live[id]; cb && cb(); },
      get: (id, cb) => { log.push('tabs.get:' + id); cb(live[id] ? { id, url: live[id] } : undefined); },
      update: (id, o, cb) => { log.push('tabs.update:' + id + ' -> ' + o.url); cb && cb(); },
    },
    scripting: opts.noTabsApi ? undefined : {
      executeScript: async (o) => {
        if (opts.tabThrows) throw new Error('cannot script this tab');
        if (opts.tabUnscriptable === o.target.tabId) throw new Error('cannot access this tab');
        const src = String(o.func);
        if (/document\.readyState/.test(src)) return [{ result: 'complete' }];
        if (/querySelectorAll/.test(src)) {          // the search-page scrape
          log.push('scrape:' + o.target.tabId);
          return [{ result: opts.scraped || [] }];
        }
        log.push('api:' + o.target.tabId);
        return [{ result: { status: opts.tabStatus || 200, body: JSON.stringify(PEOPLE) } }];
      },
    },
    runtime: {},
  };
  global.fetch = async () => {
    log.push('direct-fetch');
    const st = opts.directStatus || 403;
    return { status: st, ok: st >= 200 && st < 300,
      json: async () => PEOPLE, text: async () => JSON.stringify(PEOPLE) };
  };
  const file = path.join(DIR, 'linkedin-voyager.js');
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
  const V = global.LinkedInVoyager;
  if (V._resetForTests) V._resetForTests();
  return { V, log };
}
const search = (V) => V.findProfiles({ title: 'Technical Recruiter', company: 'Coforge',
  location: 'Dublin, Ireland' }, { force: true });

(async () => {
  console.log('WITH A LINKEDIN TAB OPEN, THE REQUEST IS FIRST-PARTY');
  {
    const { V, log } = boot({ hasTab: true, directStatus: 403 });
    const r = await search(V);
    t('  it looks for an open LinkedIn tab', log.includes('tabs.query'), JSON.stringify(log));
    t('  and runs the search inside it', log.some((l) => /^api:7$/.test(l)), JSON.stringify(log));
    t('  it does not open a tab when one is already open',
      !log.some((l) => /^tabs\.create/.test(l)), JSON.stringify(log));
    t('  and does not close the user\'s tab',
      !log.some((l) => /^tabs\.remove/.test(l)), 'the user was mid-session in that tab');
    t('  nor navigate it away',
      !log.some((l) => /^tabs\.update/.test(l)), 'navigating the user\'s tab discards their work');
    t('  it does NOT fetch from the extension origin',
      !log.includes('direct-fetch'),
      'the cross-site request is exactly what LinkedIn rejects');
    t('  profiles come back', r.ok && r.profiles.length === 1, JSON.stringify(r));
    t('  with the right slug', (r.profiles[0] || {}).profile === 'jane-recruiter-123',
      JSON.stringify(r.profiles));
    t('  and the trace says where it ran',
      (r.trace || []).some((x) => /first-party|LinkedIn tab/i.test(x)), JSON.stringify(r.trace));
  }

  console.log('\nWITH NO LINKEDIN TAB OPEN, IT OPENS ONE ITSELF');
  // The whole point of "completely fixed": the user should not have to
  // remember to keep LinkedIn open for a lookup to work.
  {
    const { V, log } = boot({ hasTab: false, directStatus: 403 });
    const r = await search(V);
    t('  it opens a LinkedIn tab', log.some((l) => /^tabs\.create/.test(l)), JSON.stringify(log));
    t('  in the background, not stealing focus',
      log.some((l) => /tabs\.create.*\(background\)/.test(l)), JSON.stringify(log));
    t('  runs the search in it', log.some((l) => /^api:42$/.test(l)), JSON.stringify(log));
    t('  never falls back to the extension-origin fetch',
      !log.includes('direct-fetch'), 'the cross-site request is what LinkedIn rejects');
    t('  closes the tab it opened', log.some((l) => /^tabs\.remove:42$/.test(l)), JSON.stringify(log));
    t('  and profiles come back', r.ok && r.profiles.length === 1, JSON.stringify(r));
  }

  console.log('\nAND WHEN THE ROTATING queryId STOPS WORKING, IT READS THE PAGE');
  // The queryId in linkedin-voyager.js is a constant and LinkedIn rotates
  // it. Without a fallback, every lookup dies on that day until somebody
  // edits a hash. The search PAGE needs no queryId.
  {
    const { V, log } = boot({ hasTab: false, tabStatus: 400,
      scraped: [{ slug: 'jane-recruiter-123', name: 'Jane Doe', title: 'Technical Recruiter', location: 'Dublin' }] });
    const r = await search(V);
    t('  the API 400 does not end the lookup', r.ok, JSON.stringify(r));
    t('  it navigates its own tab to the search page',
      log.some((l) => /tabs\.update:42 -> .*search\/results\/people/.test(l)), JSON.stringify(log));
    t('  and reads the profiles out of the page',
      log.some((l) => /^scrape:42$/.test(l)) && r.profiles[0].profile === 'jane-recruiter-123',
      JSON.stringify(r.profiles));
    t('  the trace explains the switch',
      (r.trace || []).some((x) => /queryId rotates|search page/i.test(x)), JSON.stringify(r.trace));
    t('  it still closes the tab', log.some((l) => /^tabs\.remove:42$/.test(l)), JSON.stringify(log));
  }

  console.log('\nBUT IT NEVER NAVIGATES A TAB THE USER OPENED');
  // Their tab may have a half-written message in it.
  {
    const { V, log } = boot({ hasTab: true, tabStatus: 400, scraped: [{ slug: 'x', name: 'X' }] });
    const r = await search(V);
    t('  no navigation of the user\'s tab',
      !log.some((l) => /^tabs\.update/.test(l)), JSON.stringify(log));
    t('  no scrape either', !log.some((l) => /^scrape/.test(l)), JSON.stringify(log));
    t('  it reports the failure rather than taking over the tab',
      !r.ok && !!r.reason, JSON.stringify(r));
  }

  console.log('\nA 999 IS STILL A HARD STOP, NOT A RETRY');
  // Retrying into LinkedIn's block is how an account gets restricted.
  {
    const { V } = boot({ hasTab: true, tabStatus: 999 });
    const r = await search(V);
    t('  the session is disabled after a 999',
      !r.ok && /rate-limit/i.test(r.reason || ''), r.reason);
    const again = await search(V);
    t('  and a second search does not call LinkedIn again',
      !again.ok && /rate-limit|disabled/i.test(again.reason || ''), again.reason);
  }

  console.log('\nAND IT DEGRADES RATHER THAN BREAKING');
  {
    // A tab that cannot be scripted (discarded, still loading, a page the
    // browser will not inject into) must not end the lookup: opening our
    // own tab is strictly better than the extension-origin fetch, which
    // LinkedIn rejects anyway.
    const { V, log } = boot({ hasTab: true, tabUnscriptable: 7, directStatus: 200 });
    const r = await search(V);
    t('  an unscriptable tab is replaced with one we open',
      log.some((l) => /^tabs\.create/.test(l)), JSON.stringify(log));
    t('  and the search still succeeds', r.ok && r.profiles.length === 1, JSON.stringify(r));
    t('  without resorting to the extension-origin fetch',
      !log.includes('direct-fetch'), JSON.stringify(log));
  }
  {
    const { V, log } = boot({ noTabsApi: true, directStatus: 200 });
    const r = await search(V);
    t('  no tabs/scripting API at all still works via direct fetch',
      log.includes('direct-fetch') && r.profiles.length === 1, JSON.stringify(log));
  }
  {
    const { V } = boot({ hasTab: true, noCookie: true });
    const r = await search(V);
    t('  no LinkedIn cookie is reported as a sign-in problem',
      !r.ok && /sign|session|cookie|log/i.test(r.reason || ''), r.reason);
  }


  console.log('\nAND IT NEVER ACCUMULATES TABS');
  // A helper tab per application is a hundred tabs over a batch run, and a
  // browser that falls over is worse than a lookup that fails.
  {
    // Ten applications in a row, sharing one storage area as the real
    // extension does.
    const store = {}; const liveTabs = {};
    let opened = 0, removed = 0;
    for (let i = 0; i < 10; i++) {
      const { V, log } = boot({ hasTab: false, store, liveTabs });
      await search(V);
      opened += log.filter((l) => /^tabs\.create/.test(l)).length;
      removed += log.filter((l) => /^tabs\.remove/.test(l)).length;
    }
    t('  ten lookups open ten tabs and close ten', opened === 10 && removed === 10,
      'opened=' + opened + ' removed=' + removed);
    t('  and none is left behind at the end',
      Object.keys(liveTabs).length === 0, JSON.stringify(liveTabs));
  }

  console.log('\nAND AN INTERRUPTED LOOKUP COSTS ONE STRAY TAB, NOT ONE PER RUN');
  // The popup's JS context dies the moment it closes, so the `finally`
  // that removes the tab never runs. The id is remembered in storage so
  // the next run adopts that tab instead of opening another.
  {
    const store = { voyager_helper_tab: 42 };     // as if a run was cut short
    const liveTabs = { 42: 'https://www.linkedin.com/feed/' };
    const { V, log } = boot({ hasTab: false, store, liveTabs });
    const r = await search(V);
    t('  it checks whether the remembered tab still exists',
      log.some((l) => /^tabs\.get:42$/.test(l)), JSON.stringify(log));
    t('  and reuses it instead of opening another',
      !log.some((l) => /^tabs\.create/.test(l)), JSON.stringify(log));
    t('  the search still works', r.ok && r.profiles.length === 1, JSON.stringify(r));
    t('  and the stray tab is cleaned up', Object.keys(liveTabs).length === 0,
      JSON.stringify(liveTabs));
  }
  {
    // A remembered id for a tab the user has since closed must not be
    // reused: chrome.tabs.get returns nothing and scripting it would throw.
    const store = { voyager_helper_tab: 99 };
    const { V, log } = boot({ hasTab: false, store, liveTabs: {} });
    const r = await search(V);
    t('  a remembered tab that is gone is not reused',
      log.some((l) => /^tabs\.create/.test(l)), JSON.stringify(log));
    t('  and the lookup still succeeds', r.ok, JSON.stringify(r));
  }

  console.log('\nAND CONCURRENT LOOKUPS SHARE ONE TAB');
  // Two applications tailoring at once would otherwise open two.
  {
    const store = {}; const liveTabs = {}; const peak = { n: 0, max: 0 };
    const { V } = boot({ hasTab: false, store, liveTabs, peak });
    await Promise.all([search(V), search(V), search(V)]);
    // The property that matters is not how many were created over time but
    // how many existed AT ONCE. One is the answer; a browser dies of the
    // other kind.
    t('  never more than one helper tab exists at a time', peak.max <= 1,
      'peak was ' + peak.max + ' simultaneous tabs');
    t('  and none is left open', Object.keys(liveTabs).length === 0, JSON.stringify(liveTabs));
  }
  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('SUITE THREW:', e); process.exit(1); });
