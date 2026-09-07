// A REINSURANCE ANALYST CV WENT OUT WITH A THIRTY-CHARACTER SUMMARY.
//
// In full, the PROFESSIONAL SUMMARY read:
//
//     Experienced Software Engineer.
//
// Thirty characters on a 220-character budget, and everything the
// candidate actually brings to a reinsurance role deleted.
//
// The clamp accumulated WHOLE sentences while under the cap and
// stopped at the first one that would exceed it. A model that opens
// with a short sentence and follows it with a long one -- which is
// most of them -- therefore published the short one alone. The cap is
// a LIMIT, not a target; stopping at 14% of it is not clamping, it is
// deleting.
//
// This file exists because the fix was written once and LOST: a later
// patch restored an older copy of the function, taking the two-line
// cap and the clause fallback with it, and nothing failed. The
// behaviour now has a test, so the next time it disappears something
// goes red.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
for (const f of ['docx-generator.js', 'content-quality-engine.js', 'recruiter-audit.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const RA = global.RecruiterAudit;

const CAP = 220;
const clamp = (summary) => RA.clampSummary(
  ['PROFESSIONAL SUMMARY', summary, '', 'PROFESSIONAL EXPERIENCE'].join('\n'));
const textOf = (o) => o.text.split('\n')[1];

console.log('THE CAP IS TWO RENDERED LINES');
{
  t('  the default is 220 characters, not 360',
    /function clampSummary\(text, \{ maxChars = 220 \} = \{\}\)/
      .test(fs.readFileSync(path.join(DIR, 'recruiter-audit.js'), 'utf8')),
    'the two-line cap was lost again');
  t('  ...and the pipeline passes the same number',
    /clampSummary\(outCV, \{ maxChars: 220 \}\)/
      .test(fs.readFileSync(path.join(DIR, 'recruiter-audit.js'), 'utf8')),
    'the call site disagrees with the default');
}

console.log('\nTHE REPORTED DOCUMENT');
{
  // A short opening sentence followed by a long one: the exact shape
  // that produced the stub.
  const s = 'Experienced Software Engineer. Reinsurance analyst with five years '
    + 'across treaty and facultative portfolios, pricing and reserving in SQL and '
    + 'Python, partnering with underwriting and finance on GBP 2.6bn of ceded '
    + 'exposure across three markets.';
  const got = textOf(clamp(s));
  t('  the summary is not a stub', got.length > CAP * 0.45,
    got.length + ' chars: ' + JSON.stringify(got));
  t('  ...and still fits the budget', got.length <= CAP, got.length + ' chars');
  t('  the second sentence survives in substance',
    /Reinsurance analyst with five years/.test(got), JSON.stringify(got));
  t('  and it ends as a finished sentence',
    /[.!?]$/.test(got) && !/[,;-][.!?]$/.test(got), JSON.stringify(got.slice(-40)));
}

console.log('\nA DECIMAL IS NOT A SENTENCE END');
{
  // "GBP 2.6bn" contains a full stop. The old splitter ended a
  // sentence there, and the fragment fit the cap, so the clamp
  // published "...up to GBP 2." as the whole summary.
  const s = 'Data Analyst with five years across credit risk, regulatory reporting '
    + 'and anti money laundering analytics, working in SQL, Python and Power BI on '
    + 'consumer lending portfolios up to GBP 2.6bn, partnering with risk and finance '
    + 'stakeholders across three countries.';
  const got = textOf(clamp(s));
  t('  the summary does not end on the decimal', !/GBP 2\.$/.test(got), JSON.stringify(got));
  t('  ...and the figure survives whole', /GBP 2\.6bn/.test(got), JSON.stringify(got));
  t('  ...within the budget', got.length <= CAP, got.length + ' chars');
}

console.log('\nWHOLE SENTENCES ARE PREFERRED WHEN THEY FILL THE SPACE');
{
  const s = 'Reinsurance Analyst with five years in treaty pricing. Works in SQL, '
    + 'Python and Power BI on GBP 2.6bn ceded portfolios across three markets.';
  const o = clamp(s);
  t('  a summary that already fits is untouched',
    o.clamped === false && textOf(o) === s, JSON.stringify(textOf(o)));
}
{
  // Two sentences whose total is just over the cap: the first alone is
  // still substantial, so no clause cut is needed.
  const a = 'Reinsurance Analyst with five years across treaty and facultative '
    + 'portfolios, pricing and reserving in SQL, Python and Power BI. ';
  const b = 'Partnered with underwriting and finance on GBP 2.6bn of ceded exposure '
    + 'across three separate markets and two regulatory regimes.';
  const got = textOf(clamp(a + b));
  // A complete first sentence IS a good summary -- it needs to be
  // substantial, not to fill the budget to the last character.
  t('  the whole first sentence is kept when it is substantial',
    got === a.trim() && got.length > CAP * 0.45,
    got.length + ' chars: ' + JSON.stringify(got));
  t('  ...and it ends cleanly, not on a dangling clause',
    /[.!?]$/.test(got) && !/[,;-]\s*[.!?]$/.test(got), JSON.stringify(got.slice(-30)));
}

console.log('\nAND A SHORT SUMMARY IS LEFT ENTIRELY ALONE');
for (const s of [
  'Reinsurance Analyst with five years in treaty pricing and reserving.',
  'Data Analyst.',
]) {
  const o = clamp(s);
  t('  "' + s.slice(0, 40) + '..." is unchanged',
    o.clamped === false && textOf(o) === s, JSON.stringify(textOf(o)));
}

console.log('\nAND THE REST OF THE CV IS NEVER TOUCHED');
{
  // The clamp once ate everything below the summary, because it could
  // not find where the summary ended. The guard for that stays pinned.
  const cv = ['Maxmilliam Okafor', 'Reinsurance Analyst', 'Dublin, IE | a@b.com', '',
    'PROFESSIONAL SUMMARY',
    'Experienced Software Engineer. Reinsurance analyst with five years across '
      + 'treaty and facultative portfolios, pricing and reserving in SQL and Python, '
      + 'partnering with underwriting and finance on GBP 2.6bn of ceded exposure.',
    'PROFESSIONAL EXPERIENCE', 'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
    '- Rebuilt the credit risk reporting suite in SQL and Python.',
    'TECHNICAL SKILLS', 'Programming: SQL, Python',
    'EDUCATION', 'Imperial College London'].join('\n');
  const o = RA.runRecruiterAudit({
    cvText: cv, jdText: 'Reinsurance Analyst, treaty pricing', jdTitle: 'Reinsurance Analyst',
    jobKeywords: ['SQL'], experience: [],
  });
  for (const kept of ['PROFESSIONAL EXPERIENCE', 'Citigroup', 'TECHNICAL SKILLS',
    'EDUCATION', 'Imperial College London', 'Rebuilt the credit risk reporting suite']) {
    t('  "' + kept + '" survives', o.cvText.indexOf(kept) !== -1, 'the clamp ate the CV again');
  }
  const summaryLine = o.cvText.split('\n')[o.cvText.split('\n')
    .findIndex((l) => l.trim() === 'PROFESSIONAL SUMMARY') + 1];
  t('  and the summary itself is a real summary',
    summaryLine.length > CAP * 0.45 && summaryLine.length <= CAP,
    summaryLine.length + ' chars: ' + JSON.stringify(summaryLine));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
