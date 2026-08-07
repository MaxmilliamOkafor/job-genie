// What the extension reads when the platform SELECTORS MISS.
//
// This is the case that cannot be verified against fixtures built from
// those same selectors, and it is the case that matters most: a selector
// that is wrong for a real ATS is invisible to every other test here.
// So the requirement is that a wrong selector must not be fatal.
//
// Two failures this locks down, both real:
//
//   JSON-LD was consulted LAST in the popup's extractor, after a fallback
//   that had already dumped up to 15,000 characters of page text into the
//   description -- and the JSON-LD branch only overrides a LONGER string,
//   so it could never win. The employer's own structured description was
//   being read and thrown away on exactly the pages it exists to cover.
//
//   That fallback took main/body wholesale, which sweeps in the nav, the
//   footer and the "similar jobs" rail. Tailoring a CV to that means
//   tailoring it partly to OTHER companies' postings.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP jd-fallback-order: jsdom not installed'); process.exit(0); }

let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const popupSrc = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');

// ---- 1. ordering, asserted structurally ------------------------------
const fnStart = popupSrc.indexOf('function extractJobInfoFromPageInjected');
const fnSrc = popupSrc.slice(fnStart, fnStart + 60000);
const iJsonLd = fnSrc.indexOf('--- JSON-LD structured data ---');
const iFallback = fnSrc.indexOf('--- Fallback: meta description');
t('the extractor consults JSON-LD before the text fallback',
  iJsonLd > 0 && iFallback > 0 && iJsonLd < iFallback,
  'jsonld@' + iJsonLd + ' fallback@' + iFallback);
t('the raw main/body dump is no longer the primary fallback',
  !/if \(result\.description\.length < 200\) \{\s*const mainEl = document\.querySelector\('main'\)/.test(fnSrc),
  'still dumps the whole page');
t('page furniture is stripped before measuring a block',
  /\[class\*="similar" i\]/.test(fnSrc) && /\[role="contentinfo"\]/.test(fnSrc));

// ---- 2. behaviour, on a page whose selectors all miss -----------------
// Deliberately built with markup NO selector in the product matches, so
// the only ways through are JSON-LD and the densest-block fallback.
const REAL_JD = 'We are hiring a Microsoft Dynamics 365 Project Manager to lead delivery in Dublin. '
  + 'You will own stakeholder management, Azure DevOps pipelines, Agile ceremonies, budgeting and ERP migration. '
  + 'Requirements: five or more years of project management experience, Power BI reporting, and D365 F&O exposure. ';
const SIMILAR = 'Senior Data Engineer at Globex. Staff Nurse at Mercy Health. Warehouse Operative at Bolt Logistics. '
  + 'Account Executive at Initech. Delivery Driver at Swiftly. Sous Chef at The Bistro. ';

const html = `<!doctype html><html><head><title>Careers</title>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'JobPosting',
  title: 'Microsoft Dynamics 365 Project Manager',
  description: '<p>' + REAL_JD + '</p>',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Corp' },
  jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Dublin' } },
})}</script></head><body>
<nav><a href="/a">Home</a><a href="/b">Jobs</a><a href="/c">About</a></nav>
<div class="zz-unknown-shell"><div class="zz-body">${REAL_JD.repeat(3)}</div></div>
<aside class="similar-jobs">${SIMILAR.repeat(6)}</aside>
<footer>Cookies. Privacy. Terms.</footer>
</body></html>`;

const dom = new JSDOM(html, { url: 'https://acme.unknown-ats.test/careers/jobs/123' });
// jsdom has no layout, so innerText is undefined; textContent is used.
global.window = dom.window;
global.document = dom.window.document;

// Run the real injected extractor against this document.
const extractSrc = popupSrc.slice(fnStart, popupSrc.indexOf('\n}', fnStart) + 2);
const extract = new Function('document', 'window', extractSrc + '\nreturn extractJobInfoFromPageInjected();');
let out;
try { out = extract(dom.window.document, dom.window); }
catch (e) { out = { error: e.message }; }

console.log('');
t('the employer\'s own JSON-LD description is used',
  !out.error && (out.description || '').indexOf('Dynamics 365 Project Manager to lead delivery') !== -1,
  out.error || JSON.stringify((out.description || '').slice(0, 120)));
t('the title comes through', out.title === 'Microsoft Dynamics 365 Project Manager', out.title);
t('the company comes through', out.company === 'Acme Corp', out.company);
t('the "similar jobs" rail is NOT in the description',
  !/Staff Nurse|Warehouse Operative|Sous Chef/.test(out.description || ''),
  'another employer\'s posting leaked into the JD');
t('the nav and footer are not in the description',
  !/Cookies\. Privacy\. Terms\./.test(out.description || ''));

// ---- 3. and with NO JSON-LD at all, the block picker must still work --
const html2 = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
const dom2 = new JSDOM(html2, { url: 'https://acme.unknown-ats.test/careers/jobs/123' });
let out2;
try { out2 = extract(dom2.window.document, dom2.window); }
catch (e) { out2 = { error: e.message }; }

console.log('');
t('with no JSON-LD, the real description is still found',
  !out2.error && (out2.description || '').indexOf('stakeholder management') !== -1,
  out2.error || JSON.stringify((out2.description || '').slice(0, 120)));
t('...and still without the similar-jobs rail',
  !/Staff Nurse|Warehouse Operative|Sous Chef/.test(out2.description || ''),
  'the fallback swept in other employers\' postings');
t('...and it is long enough to tailor from',
  (out2.description || '').length > 300, String((out2.description || '').length));

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
