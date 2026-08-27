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
// The second fault in the same place: the panel could describe only one
// moment. Drawn BEFORE tailoring, matchedKeywords is [] and there is no
// CV, which is the normal state of a job nobody has tailored yet. The
// gauge used to hard-code "100%" and "Perfect profile match!", which
// was wrong there and everywhere else; replacing it with a real
// percentage made that state render as a red 0% reading "Nothing
// matched", which is wrong in a new way and reads as a broken tool.
// Three states now: pending, done, failed.
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
  const gauge = lift('  updateMatchGauge(score, matched, total, phase) {', 'gauge');
  const chips = lift('  batchUpdateKeywordChips(keywordsObj, cvText, matchedKeywords, phase) {', 'chips');
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

console.log('\nTHE THREE STATES ARE DISTINGUISHED');
{
  t('  a phase is computed from whether a run happened',
    /_tailoringRanThisJob \? 'done'/.test(src) && /'failed' : 'pending'/.test(src),
    'the panel cannot tell "not started" from "failed"');
  t('  the pending gauge does not show a percentage',
    /if \(phase === 'pending'\)/.test(src) && /Not tailored yet/.test(src),
    'a job nobody has tailored still renders as a score');
  t('  ...and its chips are neutral, not crosses',
    /Before tailoring, every keyword is legitimately unmatched/.test(src),
    'unrun keywords still render as failures');
  t('  the flag is cleared when a new posting is read',
    (src.match(/_tailoringRanThisJob = false/g) || []).length >= 2,
    'a CV from the previous job would be scored against this one');
  t('  and set when the tailoring returns',
    /_tailoringRanThisJob = true/.test(src), 'nothing ever leaves the pending state');
  t('  a run that returns no CV text is logged with the response keys',
    /tailoring returned no usable CV text/.test(src) && /Keys on the response/.test(src),
    'a silent empty result again');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
