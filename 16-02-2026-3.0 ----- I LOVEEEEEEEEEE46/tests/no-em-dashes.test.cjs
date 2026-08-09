// AN EM DASH IS A MACHINE-WRITTEN TELL, AND THE FIX WAS BREAKING DATES.
//
// Reported: em dashes are not wanted in the generated documents. They are
// one of the strongest signals a recruiter reads as AI-written, alongside
// round percentages.
//
// The sanitiser already removed them, but the way it did so was worse
// than the problem. Every dash became a full stop, which
//
//   destroyed employment dates -- "January 2023 — Present" came out as
//   "January 2023. Present", so the range an ATS parses for tenure was
//   gone; and
//
//   cut parentheticals into fragments -- "Reduced cost — a 12% saving —
//   in year one." became "Reduced cost. a 12% saving. in year one.",
//   which reads more machine-written than the dash it replaced and breaks
//   the prompt's own no-fragments rule.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
(() => {
  const f = path.join(DIR, 'content-quality-engine.js');
  const m = new Module(f, null); m.filename = f;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(f, 'utf8'), f);
})();
const E = global.ContentQualityEngine;

console.log('DATE RANGES SURVIVE AS RANGES');
for (const [input, want] of [
  ['January 2023 — Present', 'January 2023 - Present'],
  ['2019—2022', '2019 - 2022'],
  ['June 2019 – December 2022', 'June 2019 - December 2022'],
  ['2021 — Current', '2021 - Current'],
]) t('  ' + JSON.stringify(input), E.removeEmDashes(input) === want,
  'got ' + JSON.stringify(E.removeEmDashes(input)) + ' -- an ATS reads tenure from this');

console.log('\nPARENTHETICALS STAY WHOLE SENTENCES');
for (const [input, want] of [
  ['Reduced cost — a 12% saving — in year one.', 'Reduced cost, a 12% saving, in year one.'],
  ['Senior PM — Acme Corp', 'Senior PM, Acme Corp'],
  ['Led delivery – for 11,842 users.', 'Led delivery, for 11,842 users.'],
]) t('  ' + JSON.stringify(input.slice(0, 40)), E.removeEmDashes(input) === want,
  'got ' + JSON.stringify(E.removeEmDashes(input)));

console.log('\nNO DASH SURVIVES EITHER DOCUMENT PATH');
const sample = 'Delivered the rollout — across four regions — on time.';
t('  the CV path is clean', !/[—–]/.test(E.sanitiseCVBlock(sample)),
  JSON.stringify(E.sanitiseCVBlock(sample)));
t('  the cover letter path is clean',
  !/[—–]/.test(E.sanitiseContent(sample, { removePronouns: false })),
  JSON.stringify(E.sanitiseContent(sample, { removePronouns: false })));
t('  ...and neither produces a fragment',
  !/\.\s+[a-z]/.test(E.sanitiseCVBlock(sample)),
  'a lowercase word after a full stop is a fragment: '
    + JSON.stringify(E.sanitiseCVBlock(sample)));

console.log('\nAND THE PROMPT STOPS PRODUCING THEM IN THE FIRST PLACE');
let prompt = null;
try {
  prompt = fs.readFileSync(
    path.join(DIR, '../supabase/functions/tailor-application/index.ts'), 'utf8');
} catch (e) {}
if (!prompt) {
  console.log('  SKIP  tailoring prompt not present in this checkout');
} else {
  t('  dashes are banned by rule', /NO EM DASHES OR EN DASHES IN ANY OUTPUT/.test(prompt));
  t('  ...with a plain hyphen prescribed for date ranges',
    /January 2023 - Present/.test(prompt));
  t('  ...and the instructions\' own dashes excluded from imitation',
    /not a style to imitate/i.test(prompt),
    'the prompt is full of em dashes; without this the model copies the style');
  t('  the checklist asks for zero dashes',
    /ZERO em dashes or en dashes/.test(prompt));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
