// A RESULTS LIST IS NOT A JOB.
//
// From a real trace (2026-08-07). On
//   linkedin.com/jobs/search-results/?keywords=...
// the extension reported a job:
//
//   title       "Jobs | LinkedIn"
//   company     "LinkedIn"
//   description 10,370 characters -- "Easy ApplyDate postedIn my network
//               Jobs based on your preferences ... 99+ results ..."
//
// It stored that as ats_lastJob, put it in the history, and restored it
// onto the next page as "Job found (from the posting)". Tailoring a CV to
// it would have matched against 99 unrelated postings at a company called
// LinkedIn.
//
// The densest-block fallback is what produced the description: on a list
// page the densest block IS the list. Nothing downstream can recover from
// that, so the page has to be refused up front.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP list-page: jsdom not installed'); process.exit(0); }

let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const popupSrc = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');

const fnStart = popupSrc.indexOf('function extractJobInfoFromPageInjected');
const extractSrc = popupSrc.slice(fnStart, popupSrc.indexOf('\n}', fnStart) + 2);
const run = (html, url) => {
  const dom = new JSDOM(html, { url });
  try {
    return new Function('document', 'window', extractSrc + '\nreturn extractJobInfoFromPageInjected();')
      (dom.window.document, dom.window);
  } catch (e) {
    return { error: e.message };
  }
};

// ---- the page from the trace ----------------------------------------
const LI_SEARCH = 'https://www.linkedin.com/jobs/search-results/?keywords=full-time%20Machine'
  + '%20Learning%20Engineer&origin=PREFERENCES_LANDING&start=225';
const cards = Array.from({ length: 12 }, (_, i) =>
  `<li data-occludable-job-id="44491523${60 + i}">
     <a class="job-card-container__link" href="/jobs/view/44491523${60 + i}/">AI Engineer</a>
     <div>Company ${i} &middot; Remote &middot; Easy Apply</div></li>`).join('');
const LI_HTML = `<!doctype html><html><head><title>Jobs | LinkedIn</title></head><body>
<a href="/feed/">Skip to main content</a><span>0 notifications</span>
<h2>Jobs based on your preferences</h2><p>99+ results</p>
<div class="scaffold-layout__list"><ul>${cards}</ul></div>
</body></html>`;

console.log('THE PAGE FROM THE TRACE');
{
  const r = run(LI_HTML, LI_SEARCH);
  t('the LinkedIn search page is recognised as a list', r.isListPage === true,
    'isListPage=' + r.isListPage + ' title=' + JSON.stringify(r.title));
}

// ---- the same shape on other platforms ------------------------------
console.log('\nBOARD INDEXES ON OTHER PLATFORMS');
const boardCards = Array.from({ length: 9 }, (_, i) =>
  `<a href="/acme/jobs/54773450${10 + i}">Engineer ${i}</a>`).join('');
for (const [name, url, html] of [
  ['Greenhouse board index', 'https://boards.greenhouse.io/acme',
   `<!doctype html><html><head><title>Acme Jobs</title></head><body><div class="opening">${boardCards}</div></body></html>`],
  ['Workday search', 'https://acme.wd1.myworkdayjobs.com/careers/search?q=engineer',
   '<!doctype html><html><head><title>Search</title></head><body><main>Results</main></body></html>'],
  ['a generic careers search', 'https://careers.acme.test/jobs?q=data+engineer',
   '<!doctype html><html><head><title>Careers</title></head><body><main>Search results</main></body></html>'],
]) {
  const r = run(html, url);
  t(name + ' is a list', r.isListPage === true, 'isListPage=' + r.isListPage);
}

// ---- and a REAL posting must never be refused ------------------------
// This is the half that matters most: over-eager rejection would break
// every platform, and would look exactly like the fix working.
console.log('\nREAL POSTINGS ARE NOT LISTS');
const LD = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'JobPosting',
  title: 'Microsoft Dynamics 365 Project Manager',
  description: '<p>Lead delivery in Dublin.</p>',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Corp' },
});
const REAL_DESC = '<div class="job-description">' + 'Requirements and responsibilities. '.repeat(30) + '</div>';

for (const [name, url, html] of [
  ['Greenhouse posting', 'https://boards.greenhouse.io/acme/jobs/5477345004',
   `<!doctype html><html><head><title>PM</title></head><body>${REAL_DESC}</body></html>`],
  ['a posting WITH a similar-jobs rail',
   'https://boards.greenhouse.io/acme/jobs/5477345004',
   `<!doctype html><html><head><title>PM</title>
    <script type="application/ld+json">${LD}</script></head><body>${REAL_DESC}
    <aside>${boardCards}</aside></body></html>`],
  ['a LinkedIn job view', 'https://www.linkedin.com/jobs/view/4449152363/',
   `<!doctype html><html><head><title>AI Engineer | Acme</title>
    <script type="application/ld+json">${LD}</script></head><body>${REAL_DESC}</body></html>`],
  ['a Workday posting', 'https://acme.wd1.myworkdayjobs.com/careers/job/Dublin/PM_R-12345',
   `<!doctype html><html><head><title>PM</title></head><body>${REAL_DESC}</body></html>`],
]) {
  const r = run(html, url);
  t(name + ' is NOT a list', r.isListPage !== true,
    'refused a real posting -- this would break the platform entirely');
}

// ---- the popup must act on the flag ---------------------------------
console.log('\nTHE POPUP REFUSES IT');
t('detectCurrentJob returns early on a list page',
  /if \(fresh && fresh\.isListPage\) \{[\s\S]{0,400}?return false;/.test(popupSrc),
  'the flag is computed but ignored');
t('...and refuses BEFORE the context is reconciled',
  popupSrc.indexOf('fresh.isListPage') < popupSrc.indexOf('await this.reconcileJobContext'),
  'the list would still be captured as a context and restored onto the next page');
t('...and says something useful',
  /This is a results list/.test(popupSrc));

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
