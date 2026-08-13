// FIND THE PROFILE WITHOUT TOUCHING LINKEDIN.
//
// The email chain is two steps, and only the second was ever wired:
//
//   1. find a LinkedIn profile        -> publicIdentifier
//   2. resolve that profile to email  -> Closely / ContactOut
//
// Closely's contacts/find takes `lid[]=<publicIdentifier>`, and
// lidParser.js in Closely's own extension confirms `lid` IS the
// publicIdentifier -- so step 2 was correct all along. Nothing produced a
// slug, so the providers were skipped as "needs-named-poster", the API
// was never called, and the saved Closely token never changed. That is
// the whole reported symptom.
//
// Closely's extension does step 1 through LinkedIn's private Voyager API.
// That is against LinkedIn's User Agreement and is the known cause of
// account restriction, which for someone job hunting costs more than the
// convenience is worth. Search engines have already indexed the public
// profiles, so asking one gets the same slugs while LinkedIn sees no
// traffic at all.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
const store = {};
global.chrome = { storage: { local: {
  get: (keys, cb) => { const o = {}; for (const k of [].concat(keys)) if (k in store) o[k] = store[k]; cb(o); },
  set: (obj, cb) => { Object.assign(store, obj); cb && cb(); },
} }, runtime: { lastError: null } };
(() => {
  const f = path.join(DIR, 'profile-web-search.js');
  const m = new Module(f, null); m.filename = f;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(f, 'utf8'), f);
})();
const P = global.ProfileWebSearch;

console.log('THE QUERY TARGETS PROFILE PAGES, NOT THE WHOLE WEB');
const q = P.buildQuery({ title: 'Technical Recruiter', company: 'Stripe', location: 'Dublin' });
t('  restricted to profile URLs', /site:linkedin\.com\/in/.test(q), q);
t('  the title is quoted', /"Technical Recruiter"/.test(q),
  'unquoted, this matches any page containing both words: ' + q);
t('  the company is quoted', /"Stripe"/.test(q), q);
t('  the location is included', /Dublin/.test(q), q);
const many = P.buildQuery({ titles: ['Technical Recruiter', 'Talent Partner'], company: 'Stripe' });
t('  several titles become an OR', /\("Technical Recruiter" OR "Talent Partner"\)/.test(many), many);

console.log('\nA PROFILE URL YIELDS THE SLUG CLOSELY ASKS FOR');
for (const [url, want] of [
  ['https://www.linkedin.com/in/jane-smith-123', 'jane-smith-123'],
  ['https://www.linkedin.com/in/jane-smith-123/', 'jane-smith-123'],
  ['https://linkedin.com/in/samokoro?originalSubdomain=ie', 'samokoro'],
  ['https://ie.linkedin.com/in/maxokafor', 'maxokafor'],
  ['https://uk.linkedin.com/in/some-one-9b8a7', 'some-one-9b8a7'],
  ['https://www.linkedin.com/in/%C3%A9lodie-martin', 'élodie-martin'],
]) t('  ' + url.slice(0, 52), P.slugFromUrl(url) === want, JSON.stringify(P.slugFromUrl(url)));

console.log('\nAND ANYTHING THAT IS NOT A PROFILE IS REJECTED');
// A SERP mixes in company pages, job posts and help articles. Sending
// one of those to Closely spends a credit on nothing.
for (const url of [
  'https://www.linkedin.com/company/stripe',
  'https://www.linkedin.com/jobs/view/123456',
  'https://www.linkedin.com/pulse/some-article',
  'https://example.com/in/not-linkedin',
  'https://www.linkedin.com/in/',
  '',
  null,
]) t('  rejects ' + JSON.stringify(String(url).slice(0, 46)), P.slugFromUrl(url) === '',
  'got ' + JSON.stringify(P.slugFromUrl(url)));

console.log('\nRESULTS ARE DE-DUPLICATED AND CAPPED');
// Real slugs. One-character handles do not exist on LinkedIn and are
// rejected on purpose, so a fixture using them tests nothing.
const links = [
  'https://www.linkedin.com/in/jane-smith', 'https://www.linkedin.com/in/jane-smith/',
  'https://www.linkedin.com/company/stripe', 'https://www.linkedin.com/in/sam-okoro',
  'https://www.linkedin.com/in/aoife-byrne', 'https://www.linkedin.com/in/dan-oneill',
  'https://www.linkedin.com/in/eva-lynch', 'https://www.linkedin.com/in/finn-murray',
];
const got = P.profilesFromLinks(links);
t('  the same profile is not returned twice',
  got.filter((p) => p.profile === 'jane-smith').length === 1, JSON.stringify(got.map((p) => p.profile)));
t('  capped at ' + P.MAX_RESULTS, got.length <= P.MAX_RESULTS,
  String(got.length) + ' -- each one costs a credit at step 2');
t('  non-profiles are gone', !got.some((p) => /stripe/i.test(p.profile)), JSON.stringify(got));
t('  and the original URL is kept for the user to check',
  got[0] && /linkedin\.com\/in\//.test(got[0].url), JSON.stringify(got[0]));

console.log('\nEVERY FAILURE NAMES ITS CAUSE');
// The bug being fixed was a lookup that silently did nothing. "No
// results" must never be the answer when the truth is "no key saved".
(async () => {
  let r = await P.findProfiles({ company: 'Stripe' }, { config: {} });
  t('  no provider chosen is reported', /no search provider/.test(r.reason), r.reason);
  r = await P.findProfiles({ company: 'Stripe' }, { config: { provider: 'brave' } });
  t('  a missing key is reported, not silently skipped', /no API key/.test(r.reason), r.reason);
  t('  ...and names the engine', /Brave/.test(r.reason), r.reason);
  r = await P.findProfiles({}, { config: { provider: 'brave', key: 'k' } });
  t('  an empty query is refused before spending a call',
    /nothing to search for/.test(r.reason), r.reason);

  console.log('\nEACH ENGINE IS SHAPED THE WAY ITS API EXPECTS');
  const b = P.ENGINES.brave.build('q', 'tok');
  t('  Brave sends the subscription token header',
    b.init.headers['X-Subscription-Token'] === 'tok', JSON.stringify(b.init.headers));
  const s = P.ENGINES.serper.build('q', 'tok');
  t('  Serper POSTs with X-API-KEY',
    s.init.method === 'POST' && s.init.headers['X-API-KEY'] === 'tok', JSON.stringify(s.init));
  const g = P.ENGINES.google.build('q', 'KEY:ENGINE');
  t('  Google splits key:engineId', /key=KEY/.test(g.url) && /cx=ENGINE/.test(g.url), g.url);

  console.log('\nAND EACH ENGINE\'S RESULT SHAPE IS READ CORRECTLY');
  t('  Brave web.results[].url',
    P.ENGINES.brave.links({ web: { results: [{ url: 'https://www.linkedin.com/in/x' }] } })[0]
      === 'https://www.linkedin.com/in/x');
  t('  Serper organic[].link',
    P.ENGINES.serper.links({ organic: [{ link: 'https://www.linkedin.com/in/y' }] })[0]
      === 'https://www.linkedin.com/in/y');
  t('  Google items[].link',
    P.ENGINES.google.links({ items: [{ link: 'https://www.linkedin.com/in/z' }] })[0]
      === 'https://www.linkedin.com/in/z');
  t('  and an unexpected payload yields nothing rather than throwing',
    P.ENGINES.brave.links({}).length === 0 && P.ENGINES.serper.links(null).length === 0);

  console.log('\nTHE CHAIN PREFERS THIS ROUTE OVER CALLING LINKEDIN');
  const src = fs.readFileSync(path.join(DIR, 'contact-enrichment.js'), 'utf8');
  const webAt = src.indexOf('ProfileWebSearch.findProfiles');
  const liAt = src.indexOf('LinkedInVoyager.findProfiles');
  t('  both routes are wired', webAt > 0 && liAt > 0, 'web:' + webAt + ' li:' + liAt);
  t('  web search runs first', webAt < liAt,
    'the route that never contacts LinkedIn must be tried before the one that does');
  t('  ...and LinkedIn is only reached if nobody was found',
    /needProfiles\(\) && typeof LinkedInVoyager/.test(src), 'it would run regardless');
  t('  the reasons reach the user',
    /\(found\.trace \|\| \[\]\)\.forEach/.test(src),
    'a silent lookup is the bug being fixed');

  console.log('\nAND THE MODULE IS ACTUALLY LOADED');
  // career-boost-engine and validation-engine were each in the manifest
  // and missing from popup.html, so both silently did nothing.
  t('  registered in popup.html',
    /<script src="profile-web-search\.js"><\/script>/.test(fs.readFileSync(path.join(DIR, 'popup.html'), 'utf8')));
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  t('  and in the manifest content scripts',
    JSON.stringify(man.content_scripts || []).includes('profile-web-search.js'));

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
