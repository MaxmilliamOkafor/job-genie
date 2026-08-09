// DOES CLOSELY EVER ACTUALLY GET THE LINKEDIN PROFILE?
//
// Reported: "I don't believe Closely is doing anything -- I asked for it
// to actually search the LinkedIn profile for the email."
//
// Closely is profile-only by design: searchByCompany is false, because
// Closely publishes no company-search endpoint. Its ONE confirmed
// capability is profile handle -> verified email. So the whole feature
// hangs on a chain of five links, and a break anywhere in it looks
// exactly the same from outside -- nothing happens, silently:
//
//   1. the hiring-team card on the posting carries an /in/ href
//   2. JDContactSources.harvest() captures the handle as names[].profile
//   3. JDContactExtractor.extract() carries it into sourceNames
//   4. followupPosterProfiles() reads sourceNames -> ctx.linkedinProfiles
//   5. findContacts() passes it to Closely's lookupByProfile
//
// Links 1-3 and 5 are asserted here against the real modules, with only
// the network stubbed. Link 4 is a one-line read in popup.js, asserted on
// its source, since popup.js cannot be loaded outside a browser.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.log('SKIP closely-poster-chain: jsdom not installed (npm i -D jsdom to run)');
  process.exit(0);
}
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
const load = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return m.exports;
};

const dom = new JSDOM('<body></body>', { url: 'https://www.linkedin.com/jobs/view/4447701131/' });
global.window = dom.window;
global.document = dom.window.document;

// ---- 1 + 2: the card, and the handle off it --------------------------
console.log('1-2. THE HIRING-TEAM CARD YIELDS A PROFILE HANDLE');
const Sources = load('jd-contact-sources.js');
document.body.innerHTML = `
  <div class="jobs-description">
    <p>We are hiring a Senior Project Manager to deliver Dynamics 365.</p>
  </div>
  <div class="hirer-card__hirer-information">
    <a href="https://www.linkedin.com/in/aoife-byrne-12345/">Aoife Byrne</a> • 2nd
    <div class="hirer-card__hirer-job-title">Talent Acquisition Partner at Northbound</div>
  </div>`;

const harvested = Sources.harvest(document);
const poster = (harvested.names || []).find((n) => n.name === 'Aoife Byrne');
t('  the poster is captured', !!poster, JSON.stringify(harvested.names));
t('  ...with the profile handle, not the full URL',
  poster && poster.profile === 'aoife-byrne-12345',
  'profile was ' + JSON.stringify(poster && poster.profile)
    + ' -- without a bare handle Closely cannot be called at all');
t('  ...and their title, which the scorer needs',
  poster && /Talent Acquisition/.test(poster.title || ''), JSON.stringify(poster && poster.title));

// LinkedIn's opaque URN form is not a public handle and must be refused
// rather than sent to the provider as if it were one.
document.body.innerHTML = `
  <div class="hirer-card__hirer-information">
    <a href="/in/ACoAAABxyzOPAQUE">Someone Else</a>
  </div>`;
const urnOnly = (Sources.harvest(document).names || [])[0];
t('  an opaque ACo... URN is refused', !urnOnly || !urnOnly.profile,
  'that URN would be sent to Closely as a handle and always miss');

// ---- 3: the handle survives into sourceNames -------------------------
console.log('\n3. THE EXTRACTOR CARRIES IT INTO sourceNames');
const Extractor = load('jd-contact-extractor.js');
const detected = Extractor.extract({
  jdText: 'We are hiring a Senior Project Manager.',
  url: 'https://www.linkedin.com/jobs/view/4447701131/',
  title: 'Senior Project Manager',
  company: 'Northbound',
  ownEmail: 'maxokafordev@gmail.com',
  pageSources: harvested,
});
const carried = (detected.sourceNames || []).find((n) => n.name === 'Aoife Byrne');
t('  sourceNames carries the poster', !!carried, JSON.stringify(detected.sourceNames));
t('  ...still with the handle attached',
  carried && carried.profile === 'aoife-byrne-12345',
  'the handle is dropped here, so the popup has nothing to give Closely');

// ---- 4: the popup reads it -------------------------------------------
console.log('\n4. THE POPUP TURNS sourceNames INTO ctx.linkedinProfiles');
const popupSrc = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');
t('  followupPosterProfiles reads sourceNames[].profile',
  /sourceNames[\s\S]{0,200}?\.map\(\(n\) => n && n\.profile\)/.test(popupSrc),
  'the poster handles never reach the lookup');
t('  ...and the lookup context is given linkedinProfiles',
  /linkedinProfiles: await this\.followupProfileHandles\(\)/.test(popupSrc));
t('  the page is harvested from the JOB TAB, not the popup document',
  /pageSources: await this\.followupHarvestPageSources\(\)/.test(popupSrc),
  'harvesting the popup\'s own document finds no employer contacts');
// LinkedIn loads only two content scripts, so the harvester has to be
// injected on demand or the card is never read on the one site that has it.
t('  jd-contact-sources.js is injected before harvesting',
  /files: \['jd-contact-sources\.js'\]/.test(popupSrc),
  'on linkedin.com content.js is not injected, so nothing would call harvest()');

// ---- 5: Closely is actually called with it ---------------------------
console.log('\n5. CLOSELY IS CALLED WITH THAT HANDLE');
const store = {
  enrichment_config: {
    enabled: true, provider: 'closely',
    keys: { closely: { token: 'TESTTOKEN', refreshToken: 'R', at: Date.now() } },
  },
};
global.chrome = {
  storage: { local: {
    get: (keys, cb) => {
      const out = {};
      for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
      cb && cb(out);
      return Promise.resolve(out);
    },
    set: (o, cb) => { Object.assign(store, o); cb && cb(); return Promise.resolve(); },
    remove: (k, cb) => { for (const x of [].concat(k)) delete store[x]; cb && cb(); return Promise.resolve(); },
  } },
};
const calls = [];
global.fetch = async (url, init) => {
  calls.push({ url: String(url), method: (init && init.method) || 'GET', body: init && init.body });
  if (String(url).includes('/explorer/contacts/find')) {
    return { ok: true, status: 200, text: async () => '', json: async () => ({
      data: { entries: [{
        full_name: 'Aoife Byrne', title: 'Talent Acquisition Partner',
        company: 'Northbound', location: 'Dublin',
        emails: ['aoife.byrne@northbound.example'],
      }] } }) };
  }
  return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
};

const CE = load('contact-enrichment.js');

(async () => {
  const r = await CE.findContacts(
    { company: 'Northbound', title: 'Senior Project Manager', location: 'Dublin',
      linkedinProfiles: [carried ? carried.profile : 'aoife-byrne-12345'] },
    { noCache: true });

  const find = calls.find((c) => c.url.includes('/explorer/contacts/find'));
  t('  a request reached Closely', !!find,
    'calls made: ' + JSON.stringify(calls.map((c) => c.url)));
  if (find) {
    t('  ...as a POST to the confirmed endpoint',
      find.method === 'POST' && find.url === 'https://api.closelyhq.com/explorer/contacts/find',
      find.method + ' ' + find.url);
    t('  ...carrying the handle in Closely\'s bracket form',
      /lid\[\]=aoife-byrne-12345/.test(find.body || ''), find.body);
    t('  ...asking for the email', /contact\[\]=email/.test(find.body || ''), find.body);
  }
  t('  the address comes back out',
    r.ok && r.results.some((p) => p.email === 'aoife.byrne@northbound.example'),
    JSON.stringify(r));
  t('  and is attributed to the named poster',
    r.results.some((p) => p.source === 'job-poster' && p.provider === 'closely'),
    JSON.stringify(r.results));

  // The trace is the answer to "is it doing anything at all".
  console.log('\n  IT SAYS WHAT IT DID');
  t('  a trace is returned', Array.isArray(r.trace) && r.trace.length > 0, JSON.stringify(r.trace));

  // ---- the skip path must be loud, not silent ------------------------
  // Closely has no documented company search, so with no profile it has
  // nothing to do. It probes ONCE for a Lead Finder endpoint, remembers
  // the answer, and after that must say so rather than going quiet.
  console.log('\nWITH NO PROFILE, IT SAYS WHY RATHER THAN GOING QUIET');
  calls.length = 0;
  const none = await CE.findContacts(
    { company: 'Northbound', title: 'Senior Project Manager', linkedinProfiles: [] },
    { noCache: true });

  const probeCount = calls.length;
  t('  it probes for a search endpoint once', probeCount > 0, 'never probed');
  // The bug this replaces: those probe requests went through fetch
  // directly rather than call(), so the diagnostic said "0 request(s)"
  // for a lookup that had just made eight -- which reads as "it never ran".
  const closelyLine = (none.trace || []).find((l) => /^Closely:/.test(l)) || '';
  t('  ...and the trace admits to them',
    !/after 0 request/.test(closelyLine),
    'trace under-reports the work done: ' + JSON.stringify(closelyLine));
  const claimed = +(/after (\d+) request/.exec(closelyLine) || [])[1];
  t('  ...counting every one', claimed === probeCount,
    'trace says ' + claimed + ', network saw ' + probeCount);

  t('  the reason names the real cause', none.reason === 'needs-named-poster',
    'reason=' + none.reason + ' -- "no-match" reads as "nobody was there", '
      + 'when in fact nothing was looked at');

  // Remembering the answer is what stops this costing eight requests every
  // time. Without it the probe would repeat on every single lookup.
  calls.length = 0;
  const again = await CE.findContacts(
    { company: 'Northbound', title: 'Senior Project Manager', linkedinProfiles: [] },
    { noCache: true });
  t('  the negative answer is remembered, so it never re-probes',
    calls.length === 0, 're-probed: ' + JSON.stringify(calls.map((c) => c.url)));
  t('  ...and it still reports the actionable reason',
    again.reason === 'needs-named-poster', 'reason=' + again.reason);

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
