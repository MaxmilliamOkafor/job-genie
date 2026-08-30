// A DRAWING ERROR WAS ABLE TO ABORT THE WHOLE TAILORING RUN.
//
// Reported as "extension is still doing nothing you broke it", then
// "it wasn't finding or tailoring anything or generating the files",
// with a screenshot of the analysis panel holding keywords and two
// document rows left over from an earlier run.
//
// updateMatchAnalysisUI is called from inside the tailoring flow, on an
// unguarded line, both before the run (to show the keywords that were
// extracted) and after it. So anything that throws while DRAWING the
// panel takes the tailoring down with it: no CV, no cover letter, no
// visible error, and a panel frozen at whatever it had rendered.
//
// Rendering is not load-bearing and now has its own boundary.
//
// The three-state redesign that first accompanied this fix has been
// REVERTED. It changed how the panel looks, which was never asked for
// and made a working screen look broken. What is kept here is only the
// part that cannot be seen: the render can no longer take the run down.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');

console.log('THE RENDER HAS ITS OWN BOUNDARY');
{
  t('  updateMatchAnalysisUI only calls the renderer inside a try',
    /updateMatchAnalysisUI\(\)\s*\{\s*try\s*\{\s*this\._renderMatchAnalysis\(\);/.test(src),
    'the render is still on the tailoring flow\'s own stack');
  t('  ...and the catch says the tailoring continues',
    /match panel render failed, tailoring continues/.test(src),
    'a swallowed error with no explanation is the same bug one level down');
  t('  the body moved to _renderMatchAnalysis', /_renderMatchAnalysis\(\)\s*\{/.test(src),
    'no separate renderer to guard');
}

console.log('\nAND THE RENDERER RUNS WITH NO DOM AT ALL');
{
  // The harshest version of the failure: every getElementById returns
  // null. If the renderer survives that, an unexpected DOM state cannot
  // take the tailoring with it.
  const lift = (signature, name) => {
    const start = src.indexOf(signature);
    if (start === -1) return null;
    let d = 0, end = -1;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) { end = i + 1; break; } }
    }
    const body = src.slice(start, end).replace(/^\s*[A-Za-z_]+/, 'function ' + name);
    return new Function('return (' + body + ')')();
  };
  const render = lift('  _renderMatchAnalysis() {', 'render');
  const gauge = lift('  updateMatchGauge(score, matched, total) {', 'gauge');
  const chips = lift('  batchUpdateKeywordChips(keywordsObj, cvText, matchedKeywords) {', 'chips');
  const clean = lift('  cleanKeywordList(list) {', 'clean');
  t('  all four methods lift out of popup.js',
    !!(render && gauge && chips && clean),
    JSON.stringify([!!render, !!gauge, !!chips, !!clean]));

  if (render && gauge && chips && clean) {
    global.document = { getElementById: () => null, createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }) };
    const ctx = {
      generatedDocuments: { matchScore: 0, matchedKeywords: [], missingKeywords: [], cv: '' },
      aiProvider: 'openai',
      cleanKeywordList: clean,
      updateMatchGauge: gauge,
      batchUpdateKeywordChips: chips,
      updateKeywordCoverageUI: () => {},
      escapeHtml: (x) => String(x),
    };
    const KW = ['SQL', 'Power BI', 'forecasting', 'stakeholder management'];

    for (const [label, docs, ran] of [
      ['nothing at all', { matchScore: 0, matchedKeywords: [], missingKeywords: [], cv: '' }, false],
      ['keywords, not yet tailored', { matchScore: 0, matchedKeywords: [], missingKeywords: KW, cv: '' }, false],
      ['tailored with a CV', { matchScore: 75, matchedKeywords: KW.slice(0, 3), missingKeywords: KW.slice(3), cv: 'x'.repeat(400) }, true],
      ['tailored, no CV back', { matchScore: 0, matchedKeywords: [], missingKeywords: KW, cv: '' }, true],
      ['nulls throughout', { matchScore: null, matchedKeywords: null, missingKeywords: null, cv: null }, true],
      ['junk types', { matchScore: 'x', matchedKeywords: [null, 3, {}], missingKeywords: 'nope', cv: 5 }, true],
    ]) {
      ctx.generatedDocuments = docs;
      ctx._tailoringRanThisJob = ran;
      let threw = null;
      try { render.call(ctx); } catch (e) { threw = e; }
      t('  survives "' + label + '"', !threw, threw && (threw.stack || threw.message));
    }
    delete global.document;
  }
}

console.log('\nAND A FAILURE REACHES THE LOG THE USER CAN EXPORT');
{
  // The console is gone the moment the popup closes, and the debug
  // export is the artefact the user is actually asked to send back.
  // DebugLogger persists to chrome.storage; popup.js's own _debugLogs
  // array does not, and popup.html did not even load DebugLogger -- so
  // every export read "4 entries, 0 errors, 0 successes" whatever had
  // gone wrong, and three rounds were spent guessing from screenshots.
  const html = fs.readFileSync(path.join(DIR, 'popup.html'), 'utf8');
  t('  popup.html loads debug-logger.js', /src="debug-logger\.js"/.test(html),
    'the export cannot see anything the popup does');
  // Comments mention popup.js by name, so compare the script TAGS.
  t('  ...before the scripts that use it',
    html.indexOf('src="debug-logger.js"') < html.indexOf('src="popup.js"'),
    'loaded too late to be available');
  t('  the tailoring path logs through a wrapper that cannot throw',
    /function jgLog\(level, event, message, data\) \{[\s\S]*?catch \(e\) \{ \/\* logging must never break the run \*\/ \}/.test(src),
    'logging can itself kill the run it is reporting on');
  t('  an empty CV is logged as an error with the response keys',
    /jgLog\('error', 'tailor_empty_cv'/.test(src) && /responseKeys/.test(src),
    'a silent empty result again');
  t('  a successful run is logged too, so silence means "never ran"',
    /jgLog\('success', 'tailor_ok'/.test(src),
    'a missing success entry is indistinguishable from a missing logger');
  t('  and the top-level failure carries its stack and context',
    /jgLog\('error', 'extract_and_apply_failed'/.test(src)
      && /stack: error && error\.stack/.test(src) && /hasSession/.test(src),
    'the one failure the user is asked to export is console-only');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
