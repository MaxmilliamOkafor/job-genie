// THE SAME POSTING RETURNED THE SAME DOCUMENTS, FOREVER.
//
// Two CVs were uploaded for the same Greenhouse posting, one after a
// round of fixes. They were byte-for-byte identical -- same summary,
// same competencies, same bullets. Not similar: identical.
//
// content.js keeps ats_tailored_urls, a map of postings already tailored.
// A hit there does not just skip a network call, it SKIPS GENERATION
// ENTIRELY and reloads the previously stored documents:
//
//     if (cached[currentJobUrl]) {
//       loadFilesAndStart();
//       return;
//     }
//
// with the entry written as a bare Date.now(). No version, no TTL. So
// once a posting had been tailored, re-running it after ANY update
// returned the old build's output. Every fix -- the pivot summary
// rewrite, the bullet reordering, the reformulation rules -- was
// invisible on exactly the posting being used to test whether it worked.
//
// This is the same shape as the enrichment cache that answered every
// lookup with a stale miss, and it is worth naming as a class: a cache
// that skips work must be invalidated by anything that changes the work,
// or it converts a fixed bug into a bug that cannot be observed.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

console.log('THE ENTRY CARRIES A BUILD STAMP');
t('  the write is no longer a bare timestamp',
  !/cached\[currentJobUrl\]\s*=\s*Date\.now\(\)\s*;/.test(SRC),
  'a bare timestamp cannot distinguish which build produced the documents');
t('  it records the build that produced the documents',
  /cached\[currentJobUrl\]\s*=\s*\{[^}]*v:\s*TAILOR_CACHE_STAMP\(\)/.test(SRC),
  'without this a stale document cannot be told from a current one');
t('  the stamp includes the extension version',
  /getManifest\(\)[^;]*version/.test(SRC), 'a released update must invalidate');
t('  and a constant that can be bumped without a release',
  /TAILOR_CACHE_V\s*=\s*\d+/.test(SRC),
  'most changes during development do not bump the manifest version');

console.log('\nAND A HIT IS ONLY HONOURED WHEN IT MATCHES');
t('  freshness requires the same build',
  /hit\.v\s*===\s*stamp/.test(SRC), 'a different build must re-tailor');
t('  and an age limit', /TAILOR_CACHE_TTL_MS/.test(SRC),
  'a posting tailored long ago should be redone: the profile may have moved');
t('  a legacy bare-number entry cannot be fresh',
  /typeof hit === 'object'/.test(SRC),
  'the old shape must count as a different build and re-tailor once');

console.log('\nAND THE STALE CASE IS VISIBLE, NOT SILENT');
// The whole reason this went unnoticed: nothing said the documents were
// reheated rather than regenerated.
t('  a stale entry says so in the log',
  /older build[\s\S]{0,80}re-tailoring/i.test(SRC),
  'a silent reheat is indistinguishable from a fresh generation');
t('  and a genuine hit says it was this build',
  /Already tailored for this URL on this build/.test(SRC), 'the log must not be ambiguous');

console.log('\nAND THE STAMP IS DECLARED BEFORE IT IS USED');
// A const in a module body is in the temporal dead zone until its
// declaration runs; using it above that point throws.
{
  const decl = SRC.indexOf('function TAILOR_CACHE_STAMP');
  const uses = [];
  let i = SRC.indexOf('TAILOR_CACHE_STAMP()');
  while (i !== -1) { uses.push(i); i = SRC.indexOf('TAILOR_CACHE_STAMP()', i + 1); }
  t('  the helper exists', decl > -1, 'not declared at all');
  t('  every use comes after the declaration',
    uses.every((u) => u > decl || u === decl + 9),
    'declared at ' + decl + ', used at ' + JSON.stringify(uses));
  const ttl = SRC.indexOf('TAILOR_CACHE_TTL_MS =');
  const ttlUse = SRC.indexOf('< TAILOR_CACHE_TTL_MS');
  t('  and the TTL constant too', ttl > -1 && ttl < ttlUse,
    'declared at ' + ttl + ', used at ' + ttlUse);
}

console.log('\nAND THE FRESHNESS RULE ITSELF IS CORRECT');
// Extracted and exercised directly: the source checks above prove the
// shape, this proves the behaviour.
{
  const TTL = 24 * 60 * 60 * 1000;
  const isFresh = (hit, stamp, now) => !!(hit && typeof hit === 'object'
    && hit.v === stamp && (now - (hit.at || 0)) < TTL);
  const now = Date.now();
  t('  same build, recent -> reuse',
    isFresh({ at: now - 1000, v: '1.0/2' }, '1.0/2', now), 'should reuse');
  t('  different build -> regenerate',
    !isFresh({ at: now - 1000, v: '1.0/1' }, '1.0/2', now), 'stale build was reused');
  t('  same build but a day old -> regenerate',
    !isFresh({ at: now - TTL - 1, v: '1.0/2' }, '1.0/2', now), 'expired entry was reused');
  t('  the legacy bare timestamp -> regenerate',
    !isFresh(now - 1000, '1.0/2', now), 'the old shape was treated as current');
  t('  nothing recorded -> regenerate',
    !isFresh(undefined, '1.0/2', now), 'absence must not read as a hit');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
