// Most ATS are TWO pages: the posting at one URL, the form at another.
// On the form page the description, the company and the address printed
// in the JD body are simply not in the DOM, so keyword extraction,
// tailoring and the contact lookup all had nothing to read -- and the
// old code made it worse by overwriting the context it had captured on
// the posting a second earlier.
//
// These assert the carry-forward, and just as hard, its LIMITS: a
// context must never be attached to a different employer's application.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP jd-context: jsdom not installed'); process.exit(0); }

let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
const loadCjs = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return m.exports;
};

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// A minimal chrome.storage.local, which is all JDContext uses.
let STORE = {};
global.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const out = {};
        for (const k of [].concat(keys)) if (k in STORE) out[k] = STORE[k];
        cb(out);
      },
      set: (obj, cb) => { Object.assign(STORE, obj); cb && cb(); },
    },
  },
};

const AP = loadCjs('ats-platforms.js');
const JC = loadCjs('jd-context.js');

// ---- 1. the key: a posting and its apply page are the same posting ----
// One pair per ATS, in the shapes these platforms actually use.
const PAIRS = [
  ['Greenhouse',      'https://boards.greenhouse.io/acme/jobs/5477345004',
                      'https://boards.greenhouse.io/acme/jobs/5477345004#app'],
  ['Greenhouse (apply path)', 'https://job-boards.greenhouse.io/acme/jobs/5477345004',
                      'https://job-boards.greenhouse.io/acme/jobs/5477345004/application'],
  ['Workday',         'https://acme.wd1.myworkdayjobs.com/en-US/careers/job/Dublin/PM_R-12345',
                      'https://acme.wd1.myworkdayjobs.com/en-US/careers/job/Dublin/PM_R-12345/apply'],
  ['Workday (login)', 'https://acme.wd1.myworkdayjobs.com/en-US/careers/job/Dublin/PM_R-12345',
                      'https://acme.wd1.myworkdayjobs.com/en-US/careers/login?redirect=job/PM_R-12345'],
  ['SmartRecruiters', 'https://jobs.smartrecruiters.com/acme/743999123456',
                      'https://jobs.smartrecruiters.com/acme/743999123456/apply'],
  ['Workable',        'https://apply.workable.com/acme/j/ABC123DEF/',
                      'https://apply.workable.com/acme/j/ABC123DEF/apply/'],
  ['iCIMS',           'https://careers-acme.icims.com/jobs/12345/project-manager/job',
                      'https://careers-acme.icims.com/jobs/12345/project-manager/candidate'],
  ['iCIMS (login)',   'https://careers-acme.icims.com/jobs/12345/project-manager/job',
                      'https://careers-acme.icims.com/jobs/12345/login'],
  ['Teamtailor',      'https://acme.teamtailor.com/jobs/123456-project-manager',
                      'https://acme.teamtailor.com/jobs/123456-project-manager/applications/new'],
  ['BambooHR',        'https://acme.bamboohr.com/careers/42',
                      'https://acme.bamboohr.com/careers/42/apply'],
  ['Recruitee',       'https://acme.recruitee.com/o/project-manager',
                      'https://acme.recruitee.com/o/project-manager/c/new'],
  ['Breezy',          'https://acme.breezy.hr/p/abc123def456',
                      'https://acme.breezy.hr/p/abc123def456/apply'],
  ['Jobvite',         'https://jobs.jobvite.com/acme/job/oABC123',
                      'https://jobs.jobvite.com/acme/job/oABC123/apply'],
  ['Personio',        'https://acme.jobs.personio.de/job/123456',
                      'https://acme.jobs.personio.de/job/123456/applications/new'],
  ['Dayforce',        'https://acme.dayforcehcm.com/CandidatePortal/en-US/acme/Posting/View/12345',
                      'https://acme.dayforcehcm.com/CandidatePortal/en-US/acme/Posting/Apply/12345'],
  ['Taleo',           'https://acme.taleo.net/careersection/jobdetail.ftl?job=1234567',
                      'https://acme.taleo.net/careersection/application.jss?job=1234567'],
  ['SuccessFactors',  'https://career5.successfactors.eu/sfcareer/jobreqcareer?jobId=123456',
                      'https://career5.successfactors.eu/sfcareer/jobreqcareer?jobId=123456&apply=true'],
  ['Pinpoint',        'https://acme.pinpointhq.com/postings/123456',
                      'https://acme.pinpointhq.com/postings/123456/apply'],
  ['Polymer',         'https://jobs.polymer.co/acme/123456',
                      'https://jobs.polymer.co/acme/123456/apply'],
  ['Gusto',           'https://jobs.gusto.com/postings/acme-project-manager-abc',
                      'https://jobs.gusto.com/postings/acme-project-manager-abc/apply'],
  ['Cross-subdomain', 'https://jobs.acme-ats.com/careers/postings/998877',
                      'https://apply.acme-ats.com/careers/postings/998877/submit'],
];
console.log('THE POSTING AND ITS APPLY PAGE RESOLVE TO THE SAME JOB');
for (const [label, jd, apply] of PAIRS) {
  const a = JC.keyFor(jd), b = JC.keyFor(apply);
  t(label, a === b, '\n              posting: ' + a + '\n              apply:   ' + b);
}

// ---- 2. and DIFFERENT jobs must not ----------------------------------
console.log('\nDIFFERENT JOBS STAY DIFFERENT');
const DISTINCT = [
  ['two postings on one board',
   'https://boards.greenhouse.io/acme/jobs/5477345004',
   'https://boards.greenhouse.io/acme/jobs/5477345999'],
  ['two employers on one ATS',
   'https://acme.teamtailor.com/jobs/123456-pm',
   'https://globex.teamtailor.com/jobs/777777-pm'],
  ['two requisitions at one employer',
   'https://acme.wd1.myworkdayjobs.com/careers/job/Dublin/PM_R-12345',
   'https://acme.wd1.myworkdayjobs.com/careers/job/Dublin/PM_R-99999'],
  ['different ATS entirely',
   'https://boards.greenhouse.io/acme/jobs/5477345004',
   'https://apply.workable.com/acme/j/ABC123DEF/'],
];
for (const [label, a, b] of DISTINCT) {
  t(label, JC.keyFor(a) !== JC.keyFor(b), 'both resolved to ' + JC.keyFor(a));
}

// ---- 3. recognising an application page ------------------------------
console.log('\nAPPLICATION PAGES ARE RECOGNISED');
const blank = new JSDOM('<!doctype html><html><body></body></html>').window.document;
for (const u of [
  'https://boards.greenhouse.io/acme/jobs/123/application',
  'https://acme.teamtailor.com/jobs/1-pm/applications/new',
  'https://careers-acme.icims.com/jobs/1/candidate',
  'https://acme.bamboohr.com/careers/42/apply',
]) t('by URL: ' + u.slice(8, 60), JC.isApplicationPage(blank, u));

const postingDoc = new JSDOM('<!doctype html><html><body><div class="job-description">'
  + 'x'.repeat(1200) + '</div></body></html>').window.document;
t('a posting is NOT an application page',
  !JC.isApplicationPage(postingDoc, 'https://boards.greenhouse.io/acme/jobs/123'));

const formDoc = new JSDOM('<!doctype html><html><body><form>'
  + '<input><input><input><input><input><input><input type="file">'
  + '</form></body></html>').window.document;
t('a form-heavy page with no description IS one (SPA flows have no URL cue)',
  JC.isApplicationPage(formDoc, 'https://acme.wd1.myworkdayjobs.com/careers/x'));

// ---- 4. capture, recall and the no-downgrade rule ---------------------
const JD_URL = 'https://boards.greenhouse.io/acme/jobs/5477345004';
const APPLY_URL = 'https://boards.greenhouse.io/acme/jobs/5477345004/application';
const POSTING = {
  title: 'Microsoft Dynamics 365 Project Manager',
  company: 'Acme Corp',
  location: 'Dublin, Ireland',
  description: 'Lead Dynamics 365 delivery. ' + 'Requirements and responsibilities. '.repeat(40),
  url: JD_URL,
  emails: [{ email: 'talent@acme-corp.test', score: 90 }],
  names: [{ name: 'Jane Doe' }],
  org: 'Acme Corp',
};
// What the apply page actually yields: a heading and a form.
const THIN = { title: 'Apply', company: '', location: '', description: '', url: APPLY_URL };

(async () => {
  console.log('\nCARRY FORWARD');
  STORE = {};
  await JC.capture(POSTING, { url: JD_URL, tabId: 7 });

  const recalled = await JC.recall(APPLY_URL, { tabId: 7 });
  t('the posting is recalled on the apply page', !!recalled, 'nothing recalled');
  t('  matched by the requisition id, not by luck', recalled && recalled._via === 'key', recalled && recalled._via);

  const merged = JC.merge(THIN, recalled);
  t('the description survives', (merged.description || '').length > 500, String((merged.description || '').length));
  t('the company survives', merged.company === 'Acme Corp', merged.company);
  t('the address published in the JD survives',
    (merged.emails || []).some((e) => e.email === 'talent@acme-corp.test'), JSON.stringify(merged.emails));
  t('the apply page URL is still the current URL', merged.url === APPLY_URL, merged.url);
  t('and it records where the context came from', merged._restoredFrom === JD_URL, merged._restoredFrom);

  // The live page must always win where it has something real.
  const RENAMED = { title: 'Senior PM', company: 'Acme Ireland', description: '', url: APPLY_URL };
  const m2 = JC.merge(RENAMED, recalled);
  t('the live page wins on the fields it does have',
    m2.title === 'Senior PM' && m2.company === 'Acme Ireland', m2.title + ' / ' + m2.company);

  // ...but "Apply" is the <h1> of half the forms on the internet, and it
  // is not a job title. Letting it through puts "Apply" in the tailored
  // CV and in the subject line of the email to the recruiter.
  console.log('\nPAGE FURNITURE IS NOT JOB DATA');
  for (const junk of ['Apply', 'Apply now', 'Application', 'Submit application',
                      'Careers', 'Login', 'Sign in', 'Create account', 'Thank you']) {
    const m = JC.merge({ title: junk, description: '', url: APPLY_URL }, recalled);
    t('"' + junk + '" never becomes the job title',
      m.title === 'Microsoft Dynamics 365 Project Manager', m.title);
  }
  // The company guessed from a hostname like recruiting.paylocity.com.
  const m3 = JC.merge({ title: 'Apply', company: 'Recruiting', description: '', url: APPLY_URL },
    recalled, { isApplicationPage: true });
  t('a hostname-guessed company does not replace the real one on an apply page',
    m3.company === 'Acme Corp', m3.company);
  // On a POSTING page the live company still wins -- the page is right there.
  const m4 = JC.merge({ title: 'Senior PM', company: 'Acme Ireland', description: 'd'.repeat(900), url: JD_URL },
    recalled, { isApplicationPage: false });
  t('on a posting page the live page still wins',
    m4.company === 'Acme Ireland' && m4.title === 'Senior PM', m4.company + ' / ' + m4.title);

  console.log('\nNO DOWNGRADE');
  STORE = {};
  await JC.capture(POSTING, { url: JD_URL, tabId: 7 });
  // Arriving at the apply page used to overwrite the posting with this.
  await JC.capture(THIN, { url: APPLY_URL, tabId: 7 });
  const after = await JC.recall(APPLY_URL, { tabId: 7 });
  t('a thin apply-page capture does not replace the posting',
    after && (after.description || '').length > 500,
    'description is now ' + ((after && after.description) || '').length + ' chars');
  t('...and the address is still there',
    after && (after.emails || []).some((e) => e.email === 'talent@acme-corp.test'));

  console.log('\nTAB LINEAGE (a careers site handing off to an ATS)');
  STORE = {};
  await JC.capture(POSTING, { url: 'https://careers.acme-corp.test/roles/pm-dublin', tabId: 11 });
  const cross = await JC.recall('https://boards.greenhouse.io/acme/jobs/5477345004/application', { tabId: 11 });
  t('the posting follows the user across the handoff', !!cross, 'nothing recalled');
  t('  and says so', cross && cross._via === 'tab', cross && cross._via);
  const otherTab = await JC.recall('https://boards.greenhouse.io/acme/jobs/5477345004/application', { tabId: 99 });
  t('a DIFFERENT tab gets nothing', !otherTab, 'leaked into another tab');

  console.log('\nTHE LIMITS (a context must never reach another employer)');
  STORE = {};
  await JC.capture(POSTING, { url: JD_URL, tabId: 7 });
  t('another posting on the same board does not inherit it',
    !(await JC.recall('https://boards.greenhouse.io/acme/jobs/5477345999/application', { tabId: 3 })),
    'inherited the wrong job');
  t('another employer does not inherit it',
    !(await JC.recall('https://globex.teamtailor.com/jobs/777-pm/applications/new', { tabId: 3 })),
    'inherited across employers');
  t('an unrelated site does not inherit it',
    !(await JC.recall('https://example.test/anything', { tabId: 3 })),
    'inherited on an unrelated site');

  console.log('\nEXPIRY AND BOUNDS');
  STORE = {};
  await JC.capture(POSTING, { url: JD_URL, tabId: 7 });
  const list = await JC.all();
  list[0].at = Date.now() - (JC.TTL_MS + 1000);
  await new Promise((r) => chrome.storage.local.set({ [JC.KEY]: list }, r));
  t('an expired context is not used', !(await JC.recall(APPLY_URL, { tabId: 7 })), 'stale context reused');

  STORE = {};
  for (let i = 0; i < 60; i++) {
    await JC.capture({ title: 'Job ' + i, description: 'd'.repeat(200), url: 'https://boards.greenhouse.io/acme/jobs/100000' + i },
      { url: 'https://boards.greenhouse.io/acme/jobs/100000' + i });
  }
  t('the store stays bounded', (await JC.all()).length <= 40, String((await JC.all()).length));

  console.log('\nRECONCILE (the one call the rest of the extension makes)');
  STORE = {};
  await JC.capture(POSTING, { url: JD_URL, tabId: 7 });
  const done = await JC.reconcile(THIN, { url: APPLY_URL, tabId: 7 });
  t('reconcile returns a complete job on the apply page',
    done.company === 'Acme Corp' && (done.description || '').length > 500 && (done.emails || []).length === 1,
    JSON.stringify({ c: done.company, d: (done.description || '').length, e: (done.emails || []).length }));
  t('reconcile with no context returns the page as-is',
    (await JC.reconcile({ title: 'X', url: 'https://example.test/x' }, { url: 'https://example.test/x', tabId: 1 })).title === 'X');

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
