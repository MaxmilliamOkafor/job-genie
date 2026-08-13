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
  global.window = global;
  global.chrome = {
    storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() } },
    cookies: { get: (d, cb) => cb(opts.noCookie ? null : { value: '"ajax:1234567890123456789"' }) },
    tabs: opts.noTabsApi ? undefined : {
      query: (q, cb) => { log.push('tabs.query'); cb(opts.hasTab ? [{ id: 7, url: 'https://www.linkedin.com/feed/' }] : []); },
    },
    scripting: opts.noTabsApi ? undefined : {
      executeScript: async (o) => {
        log.push('executeScript:' + o.target.tabId);
        if (opts.tabThrows) throw new Error('cannot script this tab');
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
    t('  and runs the search inside it', log.some((l) => /^executeScript:/.test(l)), JSON.stringify(log));
    t('  it does NOT fetch from the extension origin',
      !log.includes('direct-fetch'),
      'the cross-site request is exactly what LinkedIn rejects');
    t('  profiles come back', r.ok && r.profiles.length === 1, JSON.stringify(r));
    t('  with the right slug', (r.profiles[0] || {}).profile === 'jane-recruiter-123',
      JSON.stringify(r.profiles));
    t('  and the trace says where it ran',
      (r.trace || []).some((x) => /first-party|LinkedIn tab/i.test(x)), JSON.stringify(r.trace));
  }

  console.log('\nAND THE 403 THAT USED TO BE UNEXPLAINED NOW SAYS WHAT TO DO');
  {
    const { V, log } = boot({ hasTab: false, directStatus: 403 });
    const r = await search(V);
    t('  it falls back to the direct request', log.includes('direct-fetch'), JSON.stringify(log));
    t('  it warns beforehand that this usually fails',
      (r.trace || []).some((x) => /no LinkedIn tab open/i.test(x)), JSON.stringify(r.trace));
    t('  no profiles, correctly', !r.ok && r.profiles.length === 0, JSON.stringify(r));
    t('  the reason tells the user to open a LinkedIn tab',
      /open linkedin\.com in a tab/i.test(r.reason || ''), r.reason);
    t('  ...and does not blame the posting for naming nobody',
      !/names nobody/i.test(r.reason || ''), r.reason);
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
    const { V, log } = boot({ hasTab: true, tabThrows: true, directStatus: 200 });
    const r = await search(V);
    t('  a tab that cannot be scripted falls back instead of throwing',
      log.includes('direct-fetch'), JSON.stringify(log));
    t('  and still returns a result shape', Array.isArray(r.profiles), JSON.stringify(r));
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

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('SUITE THREW:', e); process.exit(1); });
