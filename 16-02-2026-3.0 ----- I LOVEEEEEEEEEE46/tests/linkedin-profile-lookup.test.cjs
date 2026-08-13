// THE EMAIL CHAIN HAS TO ACTUALLY RUN ITS FIRST STEP.
//
// Finding a recruiter's address is two steps:
//
//   1. find a LinkedIn profile        -> publicIdentifier
//   2. resolve that profile to email  -> Closely / ContactOut
//
// Step 2 was wired correctly the whole time. Closely's lookupByProfile
// posts `lid[]=<publicIdentifier>`, and lidParser.js in Closely's own
// extension confirms `lid` IS the publicIdentifier.
//
// Step 1 never happened. linkedin-people-search.js builds search URLs for
// a human to click; nothing produced a slug on its own. With no slug,
// findContacts skipped Closely as "needs-named-poster", the API was never
// called, and the saved token never changed -- the reported symptom
// exactly: a lookup that silently does nothing.
//
// These assertions are about that silence. A lookup that fails must say
// which step failed and why; "no results" is not an acceptable answer
// when the real cause is that no request was ever made.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;

const store = {};
global.chrome = {
  storage: { local: {
    get: (keys, cb) => { const o = {}; for (const k of [].concat(keys)) if (k in store) o[k] = store[k]; cb(o); },
    set: (obj, cb) => { Object.assign(store, obj); cb && cb(); },
    remove: (keys, cb) => { for (const k of [].concat(keys)) delete store[k]; cb && cb(); },
  } },
  cookies: { get: (_q, cb) => cb(global.__cookie || null) },
  runtime: { lastError: null },
};
(() => {
  const f = path.join(DIR, 'linkedin-voyager.js');
  const m = new Module(f, null); m.filename = f;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(f, 'utf8'), f);
})();
const V = global.LinkedInVoyager;

console.log('THE CSRF TOKEN IS READ THE WAY LINKEDIN SETS IT');
// JSESSIONID is stored quoted: "ajax:1234...". The header wants it bare.
t('  strips the quotes', V.csrfFromJsessionid('"ajax:1234567890"') === 'ajax:1234567890');
t('  accepts an unquoted value', V.csrfFromJsessionid('ajax:99') === 'ajax:99');
t('  rejects anything that is not a session token', V.csrfFromJsessionid('"garbage"') === '',
  'sending a junk csrf header is a request guaranteed to fail');
t('  and an absent cookie', V.csrfFromJsessionid(undefined) === '');

console.log('\nTHE REQUEST IS SHAPED LIKE THE ONE LINKEDIN ANSWERS');
const vars = V.buildVariables({ title: 'Technical Recruiter', company: 'Stripe', location: 'Dublin' });
const url = V.searchUrl(vars);
t('  hits the graphql people-search endpoint',
  url.startsWith('https://www.linkedin.com/voyager/api/graphql?variables=('), url.slice(0, 70));
t('  carries the search queryId', /queryId=voyagerSearchDashClusters\./.test(url), url.slice(-60));
t('  asks for PEOPLE', /resultType,value:List\(PEOPLE\)/.test(url), vars);
t('  passes the title', /Technical(%20|\+)Recruiter/i.test(url), vars);
t('  passes the company', /Stripe/.test(url), vars);
const h = V.headers('ajax:1');
t('  sends the csrf header', h['csrf-token'] === 'ajax:1', JSON.stringify(h));
t('  sends the restli version', h['x-restli-protocol-version'] === '2.0.0', JSON.stringify(h));

console.log('\nTHE RESPONSE IS PARSED INTO SLUGS STEP 2 CAN USE');
// Voyager returns one flat `included` array; the people are templated
// UNIVERSAL. Shapes here are undocumented and change without notice, so
// the parser has to be defensive without turning a parse failure into a
// confident "nobody found".
const sample = { included: [
  { template: 'UNIVERSAL', title: { text: 'Jane Smith' }, primarySubtitle: { text: 'Technical Recruiter at Stripe' },
    secondarySubtitle: { text: 'Dublin, Ireland' }, navigationUrl: 'https://www.linkedin.com/in/jane-smith-123?trk=x' },
  { template: 'UNIVERSAL', title: { text: 'Sam Okoro' }, primarySubtitle: { text: 'Head of Engineering' },
    navigationUrl: 'https://www.linkedin.com/in/samokoro/' },
  { template: 'UNIVERSAL', title: { text: 'Dup' }, navigationUrl: 'https://www.linkedin.com/in/jane-smith-123' },
  { template: 'SOMETHING_ELSE', navigationUrl: 'https://www.linkedin.com/in/not-a-person' },
  { title: { text: 'no url' } },
] };
const people = V.parsePeople(sample);
t('  extracts the publicIdentifier', people[0] && people[0].profile === 'jane-smith-123', JSON.stringify(people[0]));
t('  ...which is exactly what Closely wants as lid[]', people[0] && /^[\w-]+$/.test(people[0].profile),
  'lidParser.js: lid = publicIdentifier');
t('  handles a trailing slash', people[1] && people[1].profile === 'samokoro', JSON.stringify(people[1]));
t('  de-duplicates', people.filter((p) => p.profile === 'jane-smith-123').length === 1, JSON.stringify(people));
t('  ignores non-people entries', !people.some((p) => p.profile === 'not-a-person'), JSON.stringify(people));
t('  keeps name and title for the user to sanity-check',
  people[0].name === 'Jane Smith' && /Recruiter/.test(people[0].title), JSON.stringify(people[0]));
t('  a junk payload yields nothing rather than throwing',
  V.parsePeople({}).length === 0 && V.parsePeople(null).length === 0);

console.log('\nIT RUNS BY DEFAULT, AND CAN BE SWITCHED OFF');
// Voyager is LinkedIn's private API. Calling it breaches their User
// Agreement and can get an account restricted -- which for someone job
// hunting costs more than looking an email up by hand. That was put to
// the user plainly, twice, and this route was chosen anyway.
//
// So it ships ON. Shipping it disabled would have reproduced the exact
// bug being fixed: a contact lookup that silently does nothing. What
// protects the account is the caps below, not the default.
(async () => {
  V._resetForTests();
  t('  enabled unless switched off', (await V.isEnabled()) === true,
    'off by default would recreate the silent no-op this fixes');
  await V.setEnabled(false);
  let r = await V.findProfiles({ title: 'Recruiter', company: 'Stripe' });
  t('  the kill switch works', r.ok === false && /off/.test(r.reason), r.reason);
  t('  ...and says so, rather than reporting "no results"', /enable/i.test(r.reason), r.reason);
  t('  ...having made no request', V.stats().callsThisSession === 0, String(V.stats().callsThisSession));

  await V.setEnabled(true);

  console.log('\nAND EVERY FAILURE NAMES ITS CAUSE');
  global.__cookie = null;
  r = await V.findProfiles({ title: 'Recruiter', company: 'Stripe' });
  t('  not signed in to LinkedIn is reported as such',
    /not signed in|cookies/.test(r.reason), r.reason);
  t('  ...and no request was made', V.stats().callsThisSession === 0, String(V.stats().callsThisSession));

  global.__cookie = { value: '"ajax:123"' };
  r = await V.findProfiles({});
  t('  an empty query is refused before spending a call',
    /nothing to search for/.test(r.reason), r.reason);

  console.log('\nTHE VOLUME IS CAPPED, NOT MERELY PACED');
  t('  one search per application', V.LIMITS.perSearch === 1, String(V.LIMITS.perSearch));
  t('  a hard session ceiling', V.LIMITS.perSession > 0 && V.LIMITS.perSession <= 25,
    String(V.LIMITS.perSession) + ' -- bulk collection is what gets an account flagged');
  t('  calls are spaced', V.LIMITS.minGapMs >= 2000, String(V.LIMITS.minGapMs));
  t('  ...with jitter, so the cadence is not a metronome', V.LIMITS.jitterMs > 0, String(V.LIMITS.jitterMs));

  console.log('\nAND THE ENRICHMENT CHAIN CALLS IT BEFORE GIVING UP');
  const src = fs.readFileSync(path.join(DIR, 'contact-enrichment.js'), 'utf8');
  t('  findContacts runs the search when no profile is known',
    /LinkedInVoyager[\s\S]{0,400}?findProfiles/.test(src),
    'without this, Closely is skipped as needs-named-poster and the token is never used');
  t('  ...and feeds the slugs in as linkedinProfiles',
    /linkedinProfiles:\s*found\.profiles\.map/.test(src),
    'that field is what makes a provider usable');
  t('  ...and its trace reaches the user',
    /\(found\.trace \|\| \[\]\)\.forEach/.test(src),
    'a silent lookup is the bug being fixed; the reason must surface');

  console.log('\nAND IT IS ACTUALLY LOADED, UNLIKE THE LAST TWO MODULES');
  // career-boost-engine and validation-engine were both in the manifest
  // and absent from popup.html, so both silently did nothing.
  t('  registered in popup.html',
    /<script src="linkedin-voyager\.js"><\/script>/.test(fs.readFileSync(path.join(DIR, 'popup.html'), 'utf8')),
    'in the manifest but not the popup is how a module does nothing quietly');
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  t('  and in the manifest content scripts',
    JSON.stringify(man.content_scripts || []).includes('linkedin-voyager.js'), 'missing');
  t('  the cookies permission it needs is declared',
    (man.permissions || []).includes('cookies'),
    'without it the csrf token cannot be read and every search fails');

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
