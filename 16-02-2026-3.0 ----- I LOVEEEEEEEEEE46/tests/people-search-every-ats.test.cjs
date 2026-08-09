// THE NEW PEOPLE SEARCH HAS TO WORK ON EVERY ATS, NOT JUST THE ONE IT
// WAS WRITTEN AGAINST.
//
// Finding the decision maker needs three things off the posting: the
// employer, the role and the place. Any platform where one of those does
// not come out is a platform where the button silently produces nothing
// -- and "silently produces nothing" is exactly the failure that is
// impossible to tell apart from "the provider found nobody".
//
// The other ATS suites prove the description, requisition id and contact
// harvest work everywhere. This one takes the next step: on each
// platform's OWN markup, read the posting, then confirm the searches
// that get built are scoped and specific.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP people-search-every-ats: jsdom not installed'); process.exit(0); }
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
const dom = new JSDOM('<body></body>', { url: 'https://example.test/' });
global.window = dom.window; global.document = dom.window.document;
global.chrome = { runtime: { id: 'x' }, storage: { local: {
  get: (k, cb) => { cb && cb({}); return Promise.resolve({}); },
  set: (o, cb) => { cb && cb(); return Promise.resolve(); } } } };
const load = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null);
  m.filename = file; m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return m.exports;
};
const AP = load('ats-platforms.js');
global.ATSPlatforms = AP; global.window.ATSPlatforms = AP;
load('linkedin-people-search.js');
load('contact-enrichment.js');
// Both modules bind to `window` when one exists, and here that is the
// jsdom window -- so they attach there rather than to node's global.
const LPS = global.window.LinkedInPeopleSearch || global.LinkedInPeopleSearch;
const CE = global.window.ContactEnrichment || global.ContactEnrichment;
if (!LPS || !CE) { console.log('  FAIL  modules did not load'); process.exit(1); }

// A representative host per platform, in the shape those hosts really take.
const HOST = {
  greenhouse: 'job-boards.greenhouse.io', workday: 'acme.wd1.myworkdayjobs.com',
  smartrecruiters: 'jobs.smartrecruiters.com', workable: 'apply.workable.com',
  icims: 'careers-acme.icims.com', taleo: 'acme.taleo.net',
  teamtailor: 'acme.teamtailor.com', bamboohr: 'acme.bamboohr.com',
  recruitee: 'acme.recruitee.com', jazzhr: 'acme.applytojob.com',
  jobvite: 'jobs.jobvite.com', successfactors: 'acme.successfactors.com',
  personio: 'acme.jobs.personio.com', eightfold: 'acme.eightfold.ai',
  avature: 'acme.avature.net', cornerstone: 'acme.csod.com',
  brassring: 'acme.brassring.com', ultipro: 'acme.ultipro.com',
  adp: 'workforcenow.adp.com', breezy: 'acme.breezy.hr',
  dover: 'app.dover.io', pinpoint: 'acme.pinpointhq.com',
  zohorecruit: 'acme.zohorecruit.com', occupop: 'acme.occupop.com',
  bullhorn: 'acme.bullhornstaffing.com', oracle: 'acme.oraclecloud.com',
  dayforce: 'acme.dayforcehcm.com', freshteam: 'acme.freshteam.com',
  gusto: 'jobs.gusto.com', paylocity: 'recruiting.paylocity.com',
  comeet: 'acme.comeet.co', polymer: 'jobs.polymer.co',
  linkedin: 'www.linkedin.com',
};

// The posting, written into each platform's OWN containers.
function pageFor(id) {
  const sel = (field) => (AP.PLATFORMS[id][field] || [])[0] || '';
  // Build markup that the platform's own selector actually matches,
  // including descendant selectors like ".iCIMS_Logo img" -- a wrapper
  // holding an image, which is how iCIMS and Taleo carry the employer.
  const one = (part) => {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)(?:\[([\w-]+)(?:[~^*$|]?=)"?([^\]"]*)"?\s*i?\])?/i.exec(part) || [];
    const el = (m[1] || 'div').toLowerCase();
    const classes = (m[2] || '').split(/[.#]/).filter(Boolean);
    const isId = (m[2] || '').startsWith('#');
    let attrs = '';
    if (m[3]) attrs += ' ' + m[3] + '="' + (m[4] || 'x') + '"';
    if (classes.length) attrs += isId ? ' id="' + classes[0] + '"' : ' class="' + classes.join(' ') + '"';
    return { el, attrs };
  };
  const tag = (s, text) => {
    if (!s) return '';
    // Only the first alternative of a selector list needs to match.
    const parts = String(s).split(',')[0].trim().split(/\s+(?![^\[]*\])/).filter(Boolean);
    if (!parts.length) return '';
    let inner = '';
    for (let i = parts.length - 1; i >= 0; i--) {
      const { el, attrs } = one(parts[i]);
      if (i === parts.length - 1) {
        // A void element carries its value in an attribute, not as content
        // -- which is exactly what the iCIMS and Taleo selectors rely on.
        inner = (el === 'img' || el === 'input' || el === 'meta')
          ? '<' + el + attrs + ' alt="' + text + '" content="' + text + '" />'
          : '<' + el + attrs + '>' + text + '</' + el + '>';
      } else {
        inner = '<' + el + attrs + '>' + inner + '</' + el + '>';
      }
    }
    return inner;
  };

  return tag(sel('title'), 'Senior Software Engineer')
    + tag(sel('company'), 'Salesforce')
    + tag(sel('location'), 'Dublin, Ireland')
    + tag(sel('description'), 'We are hiring a Senior Software Engineer in Dublin. '
        + 'You will build distributed services and mentor others.');
}

// What the popup ends up with, however it got there: the JSON-LD path and
// the selector path both converge on this shape.
function readPosting(id) {
  const host = HOST[id];
  const d = new JSDOM('<body>' + pageFor(id) + '</body>',
    { url: 'https://' + host + '/acme/job/12345' }).window.document;
  // Read a field the way content.js does -- text, then alt/content/value.
  // iCIMS and Taleo point their company selector at the logo IMAGE, which
  // has no textContent, so a text-only read finds nothing there.
  const first = (field) => {
    for (const s of AP.selectorsFor(id, field)) {
      let el = null;
      try { el = d.querySelector(s); } catch (e) { continue; }
      if (!el) continue;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt) return txt;
      const attr = (el.getAttribute('alt') || el.getAttribute('content')
        || el.getAttribute('value') || '');
      const val = String(attr).replace(/\s*logo\s*/i, '').trim();
      if (val) return val;
    }
    return '';
  };
  return { company: first('company'), title: first('title'),
    location: first('location'), description: first('description') };
}

const ids = AP.list().map((p) => p.id);
console.log('AUDITING ' + ids.length + ' PLATFORMS');

const broken = [];
for (const id of ids) {
  const host = HOST[id];
  if (!host) { t(id + ': has a representative host in this test', false,
    'add one, or this platform is not really being checked'); continue; }

  // 1. the platform is identified from its own hostname
  const detected = AP.detect(host, 'https://' + host + '/acme/job/12345');
  const okDetect = detected === id;

  // 2. the three fields the search needs come off its own markup
  const post = readPosting(id);
  const okCompany = !!post.company, okTitle = !!post.title;

  // 3. the searches actually build, and are scoped and specific
  const groups = LPS.searchUrls({ company: post.company, title: post.title, location: post.location });
  const okSearch = groups.length >= 3;
  const okScoped = groups.every((g) => g.keywords.indexOf('"Salesforce"') !== -1);
  const okSpecific = groups.length
    && groups[0].titles.some((x) => /Technical|Engineering/i.test(x));

  // 4. and the provider queries the same posting produces are scoped too
  const queries = CE.buildQueries({ company: post.company, title: post.title, location: post.location });
  const okQueries = queries.length > 0 && queries.every((q) => q.company === post.company);

  const all = okDetect && okCompany && okTitle && okSearch && okScoped && okSpecific && okQueries;
  if (!all) {
    broken.push(id);
    t(id, false, [
      okDetect ? '' : 'detect(' + host + ') -> ' + JSON.stringify(detected),
      okCompany ? '' : 'no company read from its own markup',
      okTitle ? '' : 'no title read from its own markup',
      okSearch ? '' : 'searches did not build (' + groups.length + ')',
      okScoped ? '' : 'a search was not scoped to the employer',
      okSpecific ? '' : 'first search is not discipline-specific: '
        + JSON.stringify(groups[0] && groups[0].titles),
      okQueries ? '' : 'provider queries did not build',
    ].filter(Boolean).join('; '));
  } else {
    t(id + ' (' + host + ')', true);
  }
}

console.log('\nTHE LOGO-ALT READ IS LOAD-BEARING, NOT DECORATION');
// iCIMS and Taleo point their company selector at the logo IMAGE. Proving
// the fix matters means proving a text-only read still fails there --
// otherwise this suite would be green with the bug back in place.
for (const id of ['icims', 'taleo']) {
  const host = HOST[id];
  const d = new JSDOM('<body>' + pageFor(id) + '</body>',
    { url: 'https://' + host + '/acme/job/12345' }).window.document;
  let textOnly = '';
  for (const sel of AP.selectorsFor(id, 'company')) {
    let el = null;
    try { el = d.querySelector(sel); } catch (e) { continue; }
    const txt = el && (el.textContent || '').trim();
    if (txt) { textOnly = txt; break; }
  }
  t('  ' + id + ': a text-only read finds no employer', textOnly === '',
    'got ' + JSON.stringify(textOnly) + ' -- this platform no longer proves the fix');
  t('  ' + id + ': reading alt finds it', readPosting(id).company === 'Salesforce',
    JSON.stringify(readPosting(id)));
}
// And the product itself must do the same, in both places that read fields.
const contentSrc = fs.readFileSync(path.join(DIR, 'content.js'), 'utf8');
const popupSrc = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');
t('  content.js falls back to alt/content/value',
  /getAttribute\('alt'\)[\s\S]{0,80}getAttribute\('content'\)/.test(contentSrc),
  'the platform selector for iCIMS and Taleo would read empty');
t('  popup.js does too',
  /getAttribute\('alt'\)[\s\S]{0,80}getAttribute\('content'\)/.test(popupSrc),
  'the injected extractor would disagree with the content script');

console.log('\nTHE PIECES THE SEARCH DEPENDS ON');
t('  every platform is covered by this audit', broken.length === 0,
  'failing: ' + broken.join(', '));

// A posting with no employer must refuse rather than search for strangers.
const noCompany = LPS.searchUrls({ company: '', title: 'Senior Software Engineer', location: 'Dublin' });
t('  a posting with no employer builds no search', noCompany.length === 0,
  'an unscoped people search returns strangers');

// Remote roles are the common case where location is absent; the search
// must still build, just without the city term.
const remote = LPS.searchUrls({ company: 'Salesforce', title: 'Senior Software Engineer', location: '' });
t('  a remote posting still searches, without a city', remote.length >= 3
  && remote.every((g) => g.keywords.indexOf('"Salesforce"') !== -1), JSON.stringify(remote[0]));

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
