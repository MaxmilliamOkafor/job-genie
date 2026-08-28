// "STILL CRASHES WHEN PROCESSING TAILORED DOCUMENT."
//
// chrome.storage.local is capped at 10 MB unless the extension declares
// unlimitedStorage. This manifest did not declare it.
//
// A single tailoring wrote the CV and the cover letter as base64 TWICE:
// once as cvPDF / cvDocx / coverPDF / coverDocx, and again inside
// ats_lastGeneratedDocuments, which held the entire generatedDocuments
// object with both PDFs in it. Add the keyword history and the debug
// log and a handful of runs fill the quota.
//
// At that point set() rejects with "QUOTA_BYTES quota exceeded" on an
// unguarded await, at exactly the point the user reported: immediately
// after "Processing tailored documents...". The rejection reached
// tailorDocuments' catch, which swallowed it, so the caller went on to
// print "Complete! Tailored CV and Cover Letter ready." while no file
// existed anywhere.
//
// Every symptom of the last several rounds follows from that: no
// documents, no error, a progress line stuck at one stage, and a run
// that got worse the more times it was tried, because each attempt
// added to the quota it was failing on.
//
// FOUR CHANGES:
//   1. unlimitedStorage is declared.
//   2. The write is quota-aware and degrades instead of throwing.
//   3. The PDF blobs go first when it degrades: the DOCX is the
//      attached format and the PDFs are backward compatibility.
//   4. ats_lastGeneratedDocuments no longer carries the blobs at all,
//      which is what filled the quota to begin with.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));

console.log('THE PERMISSION IS DECLARED');
{
  t('  unlimitedStorage is in the manifest',
    (manifest.permissions || []).indexOf('unlimitedStorage') !== -1,
    JSON.stringify(manifest.permissions));
  t('  ...alongside storage itself',
    (manifest.permissions || []).indexOf('storage') !== -1,
    JSON.stringify(manifest.permissions));
}

console.log('\nTHE DOCUMENTS ARE NOT WRITTEN TWICE');
{
  t('  the last-run key no longer carries generatedDocuments whole',
    src.indexOf('ats_lastGeneratedDocuments: this.generatedDocuments') === -1,
    'the whole object, base64 and all, is stored a second time');
  t('  the blobs are destructured out of it',
    /const \{ cvPdf, coverPdf, cvDocx, coverDocx, \.\.\.lastRun \} = this\.generatedDocuments;/.test(src),
    'no explicit removal of the four large fields');
  t('  and the lean object is what gets stored',
    /ats_lastGeneratedDocuments: lastRun/.test(src), 'the lean object is not used');
}

console.log('\nTHE WRITE DEGRADES INSTEAD OF THROWING');
{
  t('  a quota-aware helper exists',
    /async _setStorageOrTrim\(items\) \{/.test(src), 'the raw set() is still on the path');
  t('  the attach write goes through it',
    /await this\._setStorageOrTrim\(\{\s*\n\s*\/\/ CV \(DOCX is the attached file/.test(src)
      || /await this\._setStorageOrTrim\(\{/.test(src),
    'the write that failed is still unguarded');
  t('  it drops the PDF blobs first, not the DOCX',
    /delete lean\.cvPDF; delete lean\.coverPDF;/.test(src)
      && !/delete lean\.cvDocx/.test(src),
    'the attached format would be the thing discarded');
  t('  it clears previous-run keys as a last resort',
    /chrome\.storage\.local\.remove\(\[\s*\n?\s*'ats_lastGeneratedDocuments'/.test(src),
    'nothing is reclaimed before giving up');
  t('  and a non-quota error is not silently retried',
    /if \(!isQuota\(e\)\) \{ jgLog\('error', 'storage_write_failed'/.test(src),
    'a real storage fault would be mistaken for a full disk');
}

console.log('\nAND EVERY OUTCOME IS RECORDED');
{
  for (const [event, why] of [
    ['storage_quota', 'the first overflow is invisible'],
    ['storage_quota_recovered', 'a degraded run looks identical to a clean one'],
    ['storage_quota_fatal', 'the give-up point is invisible'],
  ]) {
    t('  ' + event + ' is logged', new RegExp("'" + event + "'").test(src), why);
  }
}

console.log('\nTHE HELPER BEHAVES, RUN AGAINST A FULL FAKE STORE');
{
  const start = src.indexOf('  async _setStorageOrTrim(items) {');
  let d = 0, end = -1;
  for (let i = start + '  async _setStorageOrTrim(items) {'.length - 1; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { end = i + 1; break; } }
  }
  const fn = new Function('jgLog', 'chrome',
    'return (' + src.slice(start, end).replace(/^\s*async _setStorageOrTrim/, 'async function _setStorageOrTrim') + ')');

  const run = async (failUntil) => {
    let calls = 0; const removed = [];
    const stored = [];
    const chrome = { storage: { local: {
      set: async (items) => {
        calls++;
        if (calls <= failUntil) { const e = new Error('QUOTA_BYTES quota exceeded'); throw e; }
        stored.push(Object.keys(items));
      },
      remove: async (keys) => { removed.push(...keys); },
    } } };
    const impl = fn(() => {}, chrome);
    const ok = await impl.call({}, { cvPDF: 'A', coverPDF: 'B', cvDocx: 'C', coverDocx: 'D' });
    return { ok, calls, removed, stored };
  };

  (async () => {
    const clean = await run(0);
    t('  a write that fits succeeds first time',
      clean.ok === true && clean.calls === 1, JSON.stringify(clean));
    t('  ...with every key intact',
      JSON.stringify(clean.stored[0].sort()) === JSON.stringify(['coverDocx', 'coverPDF', 'cvDocx', 'cvPDF']),
      JSON.stringify(clean.stored));

    const once = await run(1);
    t('  one quota failure drops the PDFs and succeeds',
      once.ok === true && once.calls === 2, JSON.stringify(once));
    t('  ...keeping the DOCX, which is the attached file',
      JSON.stringify(once.stored[0].sort()) === JSON.stringify(['coverDocx', 'cvDocx']),
      JSON.stringify(once.stored));

    const twice = await run(2);
    t('  two failures clear previous-run data and succeed',
      twice.ok === true && twice.calls === 3, JSON.stringify(twice));
    t('  ...clearing exactly the rebuildable keys',
      twice.removed.indexOf('ats_lastGeneratedDocuments') !== -1
        && twice.removed.indexOf('ats_keywordHistory') !== -1,
      JSON.stringify(twice.removed));

    let threw = null;
    try { await run(3); } catch (e) { threw = e; }
    t('  and only a truly full store reaches the caller', !!threw,
      'a permanently failing write reported success');

    console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
    process.exit(FAIL ? 1 : 0);
  })();
}
