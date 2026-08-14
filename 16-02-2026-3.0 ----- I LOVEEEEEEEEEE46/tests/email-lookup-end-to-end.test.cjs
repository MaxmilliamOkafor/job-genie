// THE POSTING NAMES NOBODY. FIND THE PERSON, THEN FIND THEIR ADDRESS.
//
// This is the chain the whole follow-up feature rests on:
//
//   1. the JD carries no email        -> nothing to send to
//   2. search for a LinkedIn profile  -> publicIdentifier ("slug")
//   3. resolve that slug to an email  -> Closely / ContactOut
//
// Step 2 was fixed earlier. Step 3 was the reason it still did nothing.
//
// Closely's parseProfile was written against ONE observed response shape:
// data.entries[].emails[] with each email a plain string. Every other
// shape the API can answer with returned nobody:
//
//   emails: [{email, type}]  -> _clean() on an object gives the string
//                               "[object Object]", which is not an
//                               address but IS non-empty, so it travelled
//                               further than a null would have
//   email: "a@b.com"         -> not read at all
//   entries at top level     -> not read at all
//   data: [ ... ]            -> THREW, and _findWith swallows parse
//                               errors, so the throw was invisible
//
// All four look identical from the outside: "no-match after 2
// request(s)". A lookup that fetched a perfectly good address and a
// lookup that found nobody reported the same thing, which is why testing
// it repeatedly never revealed anything.
//
// So this suite asserts two things. That the readers accept every shape
// these APIs plausibly return. And that when a response still yields
// nobody, the trace says what actually came back instead of leaving the
// next person to guess.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;

const store = {};
global.chrome = {
  storage: { local: {
    get: (k, cb) => { const o = {}; (Array.isArray(k) ? k : [k]).forEach((x) => { if (x in store) o[x] = store[x]; }); cb(o); },
    set: (o, cb) => { Object.assign(store, o); cb && cb(); },
    remove: (k, cb) => { (Array.isArray(k) ? k : [k]).forEach((x) => delete store[x]); cb && cb(); },
  } },
  cookies: { get: (d, cb) => cb({ value: '"ajax:1234567890123456789"' }) },
  runtime: { lastError: null, id: 'test' },
};

for (const f of ['contact-enrichment.js', 'linkedin-voyager.js', 'profile-web-search.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const CE = global.ContactEnrichment;
const P = CE.PROVIDERS;
const EMAIL = 'jane.doe@coforge.com';

console.log('CLOSELY IS READ WHATEVER SHAPE IT ANSWERS WITH');
const shapes = {
  'emails as strings': { data: { entries: [{ full_name: 'Jane Doe', emails: [EMAIL] }] } },
  'emails as {email,type} objects': { data: { entries: [{ full_name: 'Jane Doe', emails: [{ email: EMAIL, type: 'work' }] }] } },
  'a singular email field': { data: { entries: [{ full_name: 'Jane Doe', email: EMAIL }] } },
  'entries at the top level': { entries: [{ full_name: 'Jane Doe', emails: [EMAIL] }] },
  'data as a bare array': { data: [{ full_name: 'Jane Doe', emails: [EMAIL] }] },
  'data.contacts': { data: { contacts: [{ full_name: 'Jane Doe', emails: [EMAIL] }] } },
  'one person, unwrapped': { data: { full_name: 'Jane Doe', emails: [EMAIL] } },
  'address instead of email': { data: { entries: [{ full_name: 'Jane', emails: [{ address: EMAIL }] }] } },
};
for (const [label, json] of Object.entries(shapes)) {
  let rows;
  try { rows = P.closely.parseProfile(json); }
  catch (e) { rows = [{ email: 'THREW: ' + e.message }]; }
  t('  ' + label, rows.length > 0 && rows[0].email === EMAIL,
    rows.length ? rows[0].email : 'returned nobody');
}
t('  and never yields the string "[object Object]"',
  !Object.values(shapes).some((j) => {
    try { return (P.closely.parseProfile(j) || []).some((r) => /object Object/.test(r.email)); }
    catch (e) { return false; }
  }), 'an object was stringified into the email field');

console.log('\nCONTACTOUT TOO');
t('  work_email as objects',
  (P.contactout.parseProfile({ profile: { full_name: 'Jane', contact_info: { work_email: [{ email: EMAIL }] } } })[0] || {}).email === EMAIL,
  'object-shaped work_email was not read');
t('  work_email as a bare string',
  (P.contactout.parseProfile({ profile: { full_name: 'Jane', contact_info: { work_email: EMAIL } } })[0] || {}).email === EMAIL,
  'string work_email was not read');

console.log('\nGARBAGE IS STILL REJECTED');
// Tolerance must not become credulity: an address that is not an address
// has to be dropped, because the next step emails it.
[{ data: { entries: [{ emails: [{ nope: 1 }] }] } },
 { data: { entries: [{ emails: [''] }] } },
 { data: { entries: [{}] } },
 { data: {} }, {}, null].forEach((j, i) => {
  let rows; try { rows = P.closely.parseProfile(j); } catch (e) { rows = 'THREW: ' + e.message; }
  t('  junk response #' + (i + 1) + ' yields nothing and does not throw',
    Array.isArray(rows) && rows.length === 0, JSON.stringify(rows));
});

console.log('\nTHE WHOLE CHAIN, POSTING TO ADDRESS');
// The end-to-end case the user actually runs: a Workday-style posting
// naming nobody, at a company, with a Closely account and no search key.
const VOYAGER = { included: [
  { template: 'UNIVERSAL', navigationUrl: 'https://www.linkedin.com/in/jane-recruiter-123?x=1',
    title: { text: 'Jane Doe' }, primarySubtitle: { text: 'Technical Recruiter at Coforge' },
    secondarySubtitle: { text: 'Dublin, Ireland' } },
  { template: 'AD', navigationUrl: 'https://www.linkedin.com/in/an-advert' },
] };
const calls = [];
global.fetch = async (url, init) => {
  calls.push(String(url));
  if (String(url).includes('linkedin.com/voyager')) {
    return { ok: true, status: 200, json: async () => VOYAGER };
  }
  if (String(url).includes('closelyhq.com')) {
    // The object shape, i.e. the one that used to yield nobody.
    return { ok: true, status: 200,
      json: async () => ({ data: { entries: [{ full_name: 'Jane Doe',
        title: 'Technical Recruiter', company: 'Coforge',
        emails: [{ email: EMAIL, type: 'work' }] }] } }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

(async () => {
  await CE.saveConfig({ enabled: true, provider: 'closely' });
  await CE.saveKey('closely', { token: 'test-token' });
  const r = await CE.findContacts({
    company: 'Coforge', jobTitle: 'Senior Technical Business Analyst',
    location: 'Dublin, Ireland', domain: 'coforge.com',
  }, { noCache: true });

  t('  a profile was found for a posting that named nobody',
    (r.trace || []).some((x) => /found \d+ profile/.test(x)), JSON.stringify(r.trace));
  t('  LinkedIn was actually called', calls.some((c) => /linkedin\.com\/voyager/.test(c)), JSON.stringify(calls));
  t('  the advert entry was not mistaken for a person',
    !calls.some((c) => /an-advert/.test(c)), 'a non-person slug was resolved');
  t('  Closely was actually called', calls.some((c) => /closelyhq\.com/.test(c)),
    'the token is still not being spent: ' + JSON.stringify(r.trace));
  t('  an address came back', r.ok && r.results.length > 0,
    'reason=' + r.reason + ' trace=' + JSON.stringify(r.trace));
  t('  it is the right address', (r.results[0] || {}).email === EMAIL,
    JSON.stringify(r.results[0]));
  t('  and it is attributed to the poster, not a guess',
    (r.results[0] || {}).source === 'job-poster', JSON.stringify(r.results[0]));

  console.log('\nAND A LOOKUP THAT FINDS NOBODY SAYS WHY');
  // The failure that made this untestable: "no-match after 2 request(s)"
  // for a response the parser simply did not recognise.
  CE.clearCache();
  global.fetch = async (url) => {
    if (String(url).includes('linkedin.com/voyager')) return { ok: true, status: 200, json: async () => VOYAGER };
    return { ok: true, status: 200, json: async () => ({ weird: { unexpected: [1, 2] } }) };
  };
  const r2 = await CE.findContacts({
    company: 'Coforge', jobTitle: 'Analyst', location: 'Dublin, Ireland',
  }, { noCache: true });
  const tr = (r2.trace || []).join(' | ');
  t('  the trace reports the shape that came back', /returned \{/.test(tr), tr);
  t('  ...naming the unrecognised key', /weird/.test(tr), tr);
  t('  ...and the HTTP status', /HTTP 200/.test(tr), tr);
  t('  no address is invented from an unreadable response',
    r2.results.length === 0, JSON.stringify(r2.results));

  console.log('\nAND THE SHAPE REPORT NEVER LEAKS PERSONAL DATA');
  // The trace is shown in the UI and pasted into bug reports, and these
  // responses carry personal data. Key names and types only.
  CE.clearCache();
  global.fetch = async (url) => {
    if (String(url).includes('linkedin.com/voyager')) return { ok: true, status: 200, json: async () => VOYAGER };
    return { ok: true, status: 200,
      json: async () => ({ unknown_wrapper: { person: 'Jane Doe', secret: 'hunter2', mail: EMAIL } }) };
  };
  const r3 = await CE.findContacts({ company: 'Coforge', jobTitle: 'Analyst' }, { noCache: true });
  const tr3 = (r3.trace || []).join(' | ');
  t('  an unknown wrapper still yields the address', (r3.results[0] || {}).email === EMAIL,
    JSON.stringify(r3.results));
  t('  the key names are reported', /unknown_wrapper/.test(tr3), tr3);
  t('  but no value is', !/Jane Doe|hunter2/.test(tr3), tr3);

  console.log('\nAND A FAILED PROFILE SEARCH SAYS WHAT FAILED');
  // If step 1 finds nobody, Closely has nothing to resolve and the whole
  // lookup reports "needs-named-poster". That reason used to send the user
  // off to buy a second provider, when the actual cause can be that they
  // are not signed in to LinkedIn in this browser. The specific reason has
  // to survive as far as the caller.
  CE.clearCache();
  global.chrome.cookies.get = (d, cb) => cb(null);        // no LinkedIn session
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  const r4 = await CE.bestEmail({ company: 'Coforge', jobTitle: 'Analyst',
    location: 'Dublin, Ireland' });
  t('  no address, as expected', !r4.email, JSON.stringify(r4));
  t('  the reason names the profile-search failure, not just "no poster"',
    !!r4.profileWhy, 'profileWhy was empty: ' + JSON.stringify(r4));
  t('  ...and it mentions the LinkedIn session',
    /sign|session|log/i.test(r4.profileWhy || ''), r4.profileWhy);
  t('  the full trace is handed to the caller too',
    Array.isArray(r4.trace) && r4.trace.length > 0, JSON.stringify(r4.trace));

  console.log('\nAN UNRECOGNISED SHAPE IS READ ANYWAY, NOT REPORTED BACK');
  // Waiting for a human to paste an unknown response to a developer is
  // the same silent failure with a longer feedback loop. A shape nobody
  // wrote a reader for has to work on the first try.
  const weird = {
    'an unknown wrapper': { payload: { records: [{ person: { fullName: 'Jane Doe' },
      contact: { primaryMail: EMAIL } }] } },
    'buried eight deep': { a: { b: { c: { d: { e: { who: 'Jane Doe', mail: EMAIL } } } } } },
    'an array of arrays': [[{ full_name: 'Jane Doe', x: { y: EMAIL } }]],
    'a key nobody has seen': { result: { hit: { name: 'Jane Doe', businessEmailAddress: EMAIL } } },
  };
  for (const [label, json] of Object.entries(weird)) {
    CE.clearCache();
    global.fetch = async () => ({ ok: true, status: 200, json: async () => json });
    const rr = await CE.findContacts({ company: 'Coforge',
      linkedinProfiles: ['jane-recruiter-123'] }, { noCache: true });
    t('  ' + label, (rr.results[0] || {}).email === EMAIL,
      JSON.stringify(rr.results) + ' trace=' + JSON.stringify(rr.trace));
  }
  {
    CE.clearCache();
    global.fetch = async () => ({ ok: true, status: 200,
      json: async () => weird['an unknown wrapper'] });
    const rr = await CE.findContacts({ company: 'Coforge',
      linkedinProfiles: ['jane-recruiter-123'] }, { noCache: true });
    t('  and it says it had to do that, rather than hiding it',
      (rr.trace || []).some((x) => /not recognised/i.test(x)), JSON.stringify(rr.trace));
  }

  console.log('\nBUT A BROAD SCAN MUST NOT PICK UP RUBBISH');
  const rubbish = {
    'the provider\'s own support address': { error: 'contact support@closelyhq.com' },
    'an unattended mailbox': { data: { entries: [{ emails: ['noreply@coforge.com'] }] } },
    'a do-not-reply, however spelt': { data: { entries: [{ emails: ['Do-Not-Reply@coforge.com'] }] } },
    'a postmaster': { data: { entries: [{ emails: ['postmaster@coforge.com'] }] } },
  };
  for (const [label, json] of Object.entries(rubbish)) {
    CE.clearCache();
    global.fetch = async () => ({ ok: true, status: 200, json: async () => json });
    const rr = await CE.findContacts({ company: 'Coforge',
      linkedinProfiles: ['jane-recruiter-123'] }, { noCache: true });
    t('  ' + label + ' is not offered as a contact',
      rr.results.length === 0, JSON.stringify(rr.results.map((x) => x.email)));
  }

  console.log('\nA CACHED MISS MUST NOT MASQUERADE AS A COMPLETED LOOKUP');
  // readCache returns hit.results for a miss, which is []. In JavaScript
  // [] is truthy, so findContacts returned { ok: true, results: [] } with
  // NO reason -- and the caller reported "no address (none)". A lookup
  // that never ran, described as a lookup that found nobody.
  //
  // Worse than the wording: for the life of the entry NOTHING downstream
  // is reached. Not the LinkedIn search, not the provider, not the shape
  // readers. Every fix in this file is bypassed by a two-hour-old miss.
  {
    CE.clearCache();
    // An earlier block removed the LinkedIn cookie to test that path.
    // Restore it, or the chain stops before a cache entry is ever written.
    global.chrome.cookies.get = (d, cb) => cb({ value: '"ajax:1234567890123456789"' });
    let closelyCalls = 0;
    global.fetch = async (url) => {
      if (String(url).includes('linkedin.com/voyager')) return { ok: true, status: 200, json: async () => VOYAGER };
      closelyCalls++;
      return { ok: true, status: 200, json: async () => ({ data: { entries: [] } }) };
    };
    const ctx = { company: 'CachedCo', jobTitle: 'Analyst', location: 'Dublin, Ireland' };
    const first = await CE.findContacts(ctx, {});     // populates the miss
    t('  the first lookup genuinely runs', closelyCalls > 0 || (first.trace || []).length > 0,
      JSON.stringify(first));

    const before = closelyCalls;
    const second = await CE.findContacts(ctx, {});    // served from cache
    t('  the second is served from cache', second.source === 'cache', JSON.stringify(second));
    t('  and carries a reason instead of nothing', second.reason === 'no-match',
      'reason was ' + JSON.stringify(second.reason) + ' -- the caller shows "(none)"');
    t('  the trace says it was a cached miss',
      (second.trace || []).some((x) => /cached miss/i.test(x)), JSON.stringify(second.trace));
    t('  and no provider credit was spent on it', closelyCalls === before,
      'a cached miss must not re-call the provider');

    const hit = await CE.bestEmail(ctx);
    t('  bestEmail no longer reports the bare "none"', hit.reason === 'no-match',
      'reason was ' + JSON.stringify(hit.reason));
  }

  console.log('\nAND A MISS CACHED BY AN OLDER BUILD IS DISCARDED');
  // The entries written while the lookup was broken would otherwise keep
  // answering for two hours after the fix ships, so the fix would look
  // like it changed nothing -- which is exactly how this was reported.
  {
    CE.clearCache();
    global.chrome.cookies.get = (d, cb) => cb({ value: '"ajax:1234567890123456789"' });
    const ctx = { company: 'StaleCo', jobTitle: 'Analyst' };
    // Hand-write an entry in the OLD shape: no version stamp.
    await new Promise((resolve) => {
      chrome.storage.local.get(['enrichment_cache'], (r) => {
        const all = (r && r.enrichment_cache) || {};
        all['staleco|analyst|'] = { at: Date.now(), results: [] };   // no v
        chrome.storage.local.set({ enrichment_cache: all }, resolve);
      });
    });
    let reached = false;
    global.fetch = async (url) => {
      if (String(url).includes('linkedin.com/voyager')) return { ok: true, status: 200, json: async () => VOYAGER };
      reached = true;
      return { ok: true, status: 200,
        json: async () => ({ data: { entries: [{ full_name: 'Jane Doe', emails: [EMAIL] }] } }) };
    };
    const r5 = await CE.findContacts(ctx, {});
    t('  the stale entry does not short-circuit the lookup', reached,
      'an unversioned miss still answered, so the fix would look like a no-op');
    t('  and the address is found', (r5.results[0] || {}).email === EMAIL,
      JSON.stringify(r5.results) + ' reason=' + r5.reason);
  }

  console.log('\nTHE BALANCE CAN BE READ, SO "WAS MY TOKEN USED" IS ANSWERABLE');
  // The original complaint about this feature was that the saved Closely
  // token never seemed to be spent -- and from the outside a lookup that
  // quietly did nothing reported the same "found nobody" as one that ran.
  // A number either side of the lookup is the only direct evidence.
  {
    global.chrome.cookies.get = (d, cb) => cb({ value: '"ajax:1234567890123456789"' });
    await CE.saveKey('closely', { token: 'test-token' });
    global.fetch = async (url) => {
      if (String(url).includes('/credits')) {
        return { ok: true, status: 200,
          json: async () => ({ data: { paid_balance: 40, free_balance: 2 } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const bal = await CE.creditBalance('closely');
    t('  the balance is read as a number', bal.ok && bal.balance === 42, JSON.stringify(bal));
  }
  {
    // A provider that reports no numeric balance is not an error: it is
    // simply unknowable, and must not be shown as a failure.
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: { plan: 'pro' } }) });
    const bal = await CE.creditBalance('closely');
    t('  no numeric balance is reported as unknown, not as failure',
      bal.ok && bal.balance === null && /no numeric balance/i.test(bal.detail || ''),
      JSON.stringify(bal));
  }
  {
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    const bal = await CE.creditBalance('closely');
    t('  a rejected token is reported as not ok', !bal.ok && /401/.test(bal.detail || ''),
      JSON.stringify(bal));
  }
  {
    await CE.clearKey('closely');
    const bal = await CE.creditBalance('closely');
    t('  no credential saved says so plainly',
      !bal.ok && /no credential/i.test(bal.detail || ''), JSON.stringify(bal));
    await CE.saveKey('closely', { token: 'test-token' });
  }

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('SUITE THREW:', e); process.exit(1); });
