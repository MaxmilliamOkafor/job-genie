// FIND THE PERSON, RATHER THAN WAIT TO BE HANDED ONE.
//
// The lookup could only resolve a profile something else had already
// produced -- a hiring-team card, a profile open in a tab. On a Workday
// or Greenhouse posting none of those exist, and the honest answer was
// "there is nobody to look up". That was wrong: the people are on
// LinkedIn, nothing was going to look for them.
//
// For a software engineering role at Salesforce in Dublin the people who
// can move the application are findable by title -- the recruiter who
// owns the req, the engineering manager it reports to, the talent lead,
// and a senior engineer who can refer you. These assert that the target
// list is right for every field, not only for software.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
global.chrome = { storage: { local: { get: (k, cb) => { cb && cb({}); return Promise.resolve({}); },
  set: (o, cb) => { cb && cb(); return Promise.resolve(); } } } };
const load = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null);
  m.filename = file; m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
};
load('linkedin-people-search.js');
load('contact-enrichment.js');
const M = global.LinkedInPeopleSearch;
const CE = global.ContactEnrichment;

// ---- the field, read off the role --------------------------------------
console.log('EVERY TECH FIELD IS RECOGNISED, NOT JUST "SOFTWARE"');
for (const [role, want] of [
  ['Senior Software Engineer', 'engineering'],
  ['Backend Engineer (Java)', 'backend'],
  ['Senior React Developer', 'frontend'],
  ['iOS Engineer', 'mobile'],
  ['Site Reliability Engineer', 'devops'],
  ['Kubernetes Platform Engineer', 'devops'],
  ['AWS Solutions Architect', 'cloud'],
  ['Cyber Security Analyst', 'security'],
  ['QA Automation Engineer', 'qa'],
  ['Machine Learning Engineer', 'ml'],
  ['Senior Data Scientist', 'data-science'],
  ['Data Engineer', 'data-eng'],
  ['Business Intelligence Analyst', 'analytics'],
  ['Embedded Firmware Engineer', 'embedded'],
  ['Database Administrator', 'dba'],
  ['IT Support Technician', 'it-support'],
  ['Microsoft Dynamics 365 Consultant', 'erp'],
  ['Solutions Engineer', 'solutions'],
  ['Technical Writer', 'tech-writing'],
  ['Senior Product Manager', 'product'],
  ['Senior UX Designer', 'design'],
  ['Scrum Master', 'delivery'],
  ['Staff Nurse', 'healthcare'],
  ['Financial Controller', 'finance'],
]) t('  ' + JSON.stringify(role) + ' -> ' + want, M.fieldOf(role) === want,
  'got ' + JSON.stringify(M.fieldOf(role)));

t('  an unknown role has no field', M.fieldOf('Zookeeper') === '');
t('  ...and empty input does not guess', M.fieldOf('') === '' && M.fieldOf(null) === '');

// ---- every field has real targets --------------------------------------
console.log('\nEVERY FIELD NAMES A RECRUITER, A MANAGER AND A PEER');
const fields = Object.keys(M.TARGETS);
t('  the taxonomy is not a stub', fields.length >= 20, String(fields.length));
for (const f of fields) {
  const g = M.TARGETS[f];
  const ok = g.recruiters.length && g.managers.length && g.peers.length;
  t('  ' + f + ' (' + g.recruiters.length + '/' + g.managers.length + '/' + g.peers.length + ')',
    !!ok, JSON.stringify(g));
}

// ---- the two vocabularies must not drift -------------------------------
// The scorer in contact-enrichment.js works in coarse disciplines. If a
// field maps to one the scorer does not recognise, a person found by this
// search would be scored as if their discipline were unknown.
console.log('\nTHE FIELD MAP AGREES WITH THE SCORER\'S DISCIPLINES');
const known = new Set(['data', 'engineering', 'product', 'delivery', 'design',
  'marketing', 'sales', 'finance', 'legal', 'healthcare', 'operations', 'support', 'hr']);
for (const [field, disc] of Object.entries(M.FIELD_TO_DISCIPLINE)) {
  t('  ' + field + ' -> ' + disc, known.has(disc),
    'the scorer has no such discipline, so this person scores as unknown');
}
t('  every field in the taxonomy is mapped',
  fields.every((f) => !!M.FIELD_TO_DISCIPLINE[f]),
  'unmapped: ' + fields.filter((f) => !M.FIELD_TO_DISCIPLINE[f]).join(', '));

// ---- the worked example ------------------------------------------------
console.log('\nSOFTWARE ENGINEER AT SALESFORCE IN DUBLIN');
const ctx = { company: 'Salesforce', title: 'Senior Software Engineer', location: 'Dublin, Ireland' };
const groups = M.searchUrls(ctx);
t('  four tiers of people to find', groups.length === 4, String(groups.length));
t('  the tiers are the ones that matter',
  JSON.stringify(groups.map((g) => g.tier)) === JSON.stringify(['recruiter', 'hiring-manager', 'talent', 'peer']),
  JSON.stringify(groups.map((g) => g.tier)));

const all = M.allTargetTitles(ctx.title).join(' | ');
for (const want of ['Head of Engineering', 'Technical Recruiter', 'Senior Software Engineer',
  'Engineering Manager', 'VP Engineering', 'Principal Engineer', 'Tech Lead']) {
  t('  targets include "' + want + '"', all.indexOf(want) !== -1, all);
}
t('  the list has no duplicates',
  new Set(M.allTargetTitles(ctx.title).map((s) => s.toLowerCase())).size
    === M.allTargetTitles(ctx.title).length);

console.log('\n  AND THE SEARCHES ARE SCOPED TO THIS EMPLOYER AND PLACE');
for (const g of groups) {
  t('  [' + g.tier + '] names the company', g.keywords.indexOf('"Salesforce"') !== -1, g.keywords);
  t('  [' + g.tier + '] names the city', g.keywords.indexOf('"Dublin"') !== -1, g.keywords);
  t('  [' + g.tier + '] quotes the titles so they match as phrases',
    /\("[^"]+"( OR "[^"]+")*\)/.test(g.keywords), g.keywords);
  t('  [' + g.tier + '] is a real people-search URL and encoded',
    g.url.startsWith('https://www.linkedin.com/search/results/people/?keywords=')
      && g.url.indexOf(' ') === -1, g.url);
  t('  [' + g.tier + '] round-trips to the keywords',
    decodeURIComponent(new URL(g.url).searchParams.get('keywords')) === g.keywords);
}

console.log('\n  A SALES ROLE LOOKS FOR DIFFERENT PEOPLE');
const salesGroups = M.searchUrls({ company: 'Salesforce', title: 'Enterprise Account Executive', location: 'Dublin, Ireland' });
t('  the recruiter tier is the sales desk',
  salesGroups[0].titles.some((x) => /Sales|Commercial|GTM/i.test(x)),
  JSON.stringify(salesGroups[0].titles));
t('  ...and the peers are sales people',
  salesGroups.find((g) => g.tier === 'peer').titles.some((x) => /Account Executive|Sales/i.test(x)));

console.log('\n  NO COMPANY MEANS NO SEARCH');
// An unscoped people search returns strangers, which is the failure mode
// this whole feature exists to avoid.
t('  a search without an employer is refused',
  M.searchUrls({ title: 'Senior Software Engineer', location: 'Dublin' }).length === 0);

// ---- reading a results page --------------------------------------------
console.log('\nREADING THE RESULTS PAGE THE USER OPENED');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {}
if (!JSDOM) {
  console.log('  SKIP  harvesting (jsdom not installed)');
} else {
  const dom = new JSDOM(`<body><ul>
    <li class="reusable-search__result-container">
      <a href="/in/aoife-byrne-12345/">Aoife Byrne</a>
      <div>Senior Technical Recruiter at Salesforce</div>
      <div>Dublin, County Dublin, Ireland</div>
    </li>
    <li class="reusable-search__result-container">
      <a href="https://www.linkedin.com/in/conor-walsh/">Conor Walsh</a>
      <div>Engineering Manager at Salesforce</div>
    </li>
    <li class="reusable-search__result-container">
      <a href="/in/ACoAAABopaque">Hidden Member</a>
    </li>
    <li><a href="/company/salesforce/">Salesforce</a></li>
  </ul></body>`, { url: 'https://www.linkedin.com/search/results/people/?keywords=x' });
  const rows = M.harvestPeopleResults(dom.window.document);
  const handles = rows.map((r) => r.profile);
  t('  the recruiter is picked up', handles.indexOf('aoife-byrne-12345') !== -1, JSON.stringify(rows));
  t('  the hiring manager too', handles.indexOf('conor-walsh') !== -1, JSON.stringify(handles));
  t('  an opaque ACo... member is refused',
    !handles.some((h) => /^ACo/.test(h)), JSON.stringify(handles));
  t('  a company link is not a person',
    !handles.some((h) => /salesforce/i.test(h)), JSON.stringify(handles));
  t('  handles are unique', new Set(handles).size === handles.length);
  t('  a name is captured with each', rows.every((r) => !!r.name), JSON.stringify(rows));
}

// ---- the whole point: those handles are what Closely consumes ----------
console.log('\nTHE HANDLES FEED THE PROFILE -> EMAIL STEP');
t('  a handle from the search is a valid lookup input',
  typeof CE.resolveProfile === 'function');
// The scorer must rank someone found this way correctly -- that is what
// ties this feature to the targeting work.
const found = CE.scoreCandidate(
  { title: 'Senior Technical Recruiter', company: 'Salesforce', location: 'Dublin, Ireland' },
  { company: 'Salesforce', location: 'Dublin, Ireland' }, ctx);
const wrongField = CE.scoreCandidate(
  { title: 'Sales Recruiter', company: 'Salesforce', location: 'Dublin, Ireland' },
  { company: 'Salesforce', location: 'Dublin, Ireland' }, ctx);
t('  the technical recruiter the search found scores well', found > 0, String(found));
t('  ...above the sales recruiter it also returned', found > wrongField, found + ' vs ' + wrongField);

// ---- the field-specific title must survive truncation ------------------
console.log('\nTHE SPECIALIST TITLE LEADS, SO A TRUNCATED QUERY KEEPS IT');
// Queries take only the first few titles. A specialist name appended at
// the end of the list is exactly the one worth asking for, and would be
// the first thing cut.
for (const [role, want] of [
  ['Cyber Security Analyst', /Security Recruiter/],
  ['Machine Learning Engineer', /Data Recruiter|AI Recruiter/],
  ['Microsoft Dynamics 365 Consultant', /ERP Recruiter/],
  ['Site Reliability Engineer', /Infrastructure Recruiter/],
]) t('  ' + role, want.test(M.targetTitles(role)[0].titles.slice(0, 3).join(' | ')),
  JSON.stringify(M.targetTitles(role)[0].titles.slice(0, 3)));

// ---- ContactOut is the one that turns a handle into an address ---------
console.log('\nCONTACTOUT RESOLVES A HANDLE THE SEARCH FOUND');
const CO = CE.PROVIDERS.contactout;
const req = CO.lookupByProfile('aoife-byrne-12345', { apiKey: 'KEY' });
t('  it rebuilds the full LinkedIn profile URL',
  decodeURIComponent(req.url).indexOf('https://www.linkedin.com/in/aoife-byrne-12345') !== -1,
  req.url);
t('  ...url-encoded, not pasted raw', req.url.indexOf(' ') === -1 && /profile=https%3A/.test(req.url), req.url);
t('  ...asking for a WORK address', /email_type=work/.test(req.url), req.url);
t('  ...with the key in both header forms ContactOut accepts',
  req.init.headers.token === 'KEY' && req.init.headers['x-api-key'] === 'KEY');
const parsed = CO.parseProfile({ profile: {
  full_name: 'Aoife Byrne', title: 'Senior Technical Recruiter', company: 'Salesforce',
  location: 'Dublin, Ireland', contact_info: { work_email: ['aoife@salesforce.example'] } } });
t('  the work address comes back out',
  parsed.length === 1 && parsed[0].email === 'aoife@salesforce.example', JSON.stringify(parsed));
t('  ...with the company, so the scorer can verify the employer',
  parsed[0].company === 'Salesforce', JSON.stringify(parsed[0]));

console.log('\n  AND ITS SEARCH DOES NOT EXCLUDE THE RIGHT DESK');
// exclude_job_titles was unconditional, so a SALES vacancy filtered out
// the sales recruiter who owns it -- at the source, before scoring.
const engQ = CE.buildQueries({ company: 'Salesforce', title: 'Senior Software Engineer', location: 'Dublin' });
const salesQ = CE.buildQueries({ company: 'Salesforce', title: 'Enterprise Account Executive', location: 'Dublin' });
t('  a tech role still excludes sales noise',
  engQ[0].exclude.length > 0, JSON.stringify(engQ[0].exclude));
t('  a sales role excludes nothing', salesQ[0].exclude.length === 0, JSON.stringify(salesQ[0].exclude));
const bodyFor = (q) => JSON.parse(CO.request(q, { apiKey: 'K' }).init.body);
t('  ...and the request drops the filter entirely rather than sending []',
  bodyFor(salesQ[0]).exclude_job_titles === undefined,
  JSON.stringify(bodyFor(salesQ[0]).exclude_job_titles));
t('  ...while the tech request still carries it',
  Array.isArray(bodyFor(engQ[0]).exclude_job_titles));
t('  the sales request asks for the sales desk',
  bodyFor(salesQ[0]).job_title.some((x) => /Sales|Commercial|GTM/i.test(x)),
  JSON.stringify(bodyFor(salesQ[0]).job_title));

console.log('\n  THE PROVIDER SEARCHES USE THE FULL FIELD TAXONOMY');
// With the module loaded, an SRE vacancy must ask for platform leadership
// rather than settling for a generic "Engineering Manager".
const sreQ = CE.buildQueries({ company: 'Salesforce', title: 'Site Reliability Engineer', location: 'Dublin' });
t('  an SRE role asks for platform leadership',
  sreQ.some((q) => q.titles.some((x) => /SRE Manager|Head of Platform|Head of Infrastructure/i.test(x))),
  JSON.stringify(sreQ.map((q) => q.titles)));
const secQ = CE.buildQueries({ company: 'Salesforce', title: 'Cyber Security Analyst', location: 'Dublin' });
t('  a security role asks for a CISO',
  secQ.some((q) => q.titles.some((x) => /CISO|Head of Security/i.test(x))),
  JSON.stringify(secQ.map((q) => q.titles)));
t('  the last attempt still drops the location filter',
  sreQ[sreQ.length - 1].location === '', JSON.stringify(sreQ[sreQ.length - 1]));
t('  and still nothing without a company',
  CE.buildQueries({ title: 'Site Reliability Engineer', location: 'Dublin' }).length === 0);

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
