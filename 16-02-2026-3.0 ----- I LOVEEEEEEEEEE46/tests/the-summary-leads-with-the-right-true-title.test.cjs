// THE SUMMARY LED WITH THE LEAST RELEVANT TRUE THING.
//
// A Reinsurance Analyst CV opened "Accomplished Software Engineer with
// over 10 years of experience" -- under a headline reading Reinsurance
// Analyst, above a history full of analytics. Nothing on the page was
// false: Software Engineer is a title he holds. It was the wrong one
// to lead with, and the first line a screener reads announced a
// different profession than the one being hired for.
//
// TWO RULES THAT LOOK LIKE ONE AND ARE NOT.
//
//   THE HEADLINE carries the TARGET role. That is deliberate, chosen
//   by the owner of this CV, and the employment block underneath
//   states every real title with its dates.
//
//   THE SUMMARY is held to titles the history CONTAINS -- a separate
//   guarantee, so a pivot is argued with real overlap rather than a
//   borrowed title.
//
// A first attempt at this check compared the summary against the
// TARGET title and fired whenever they differed, which would have told
// the user to undo the second guarantee on almost every application.
// It is narrower now: it warns only when the opening profession shares
// no word with the target AND the candidate holds a title that does.
// Nothing is rewritten -- positioning is a judgement, so the warning
// names the better title and leaves the sentence alone.
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

// Two real titles in the history: Software Engineer and Data Analyst.
const cvWith = (summary) => ['Maxmilliam Okafor', 'X', 'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', summary,
  'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Built and owned backend services in Python and C++.',
  'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
  '- Rebuilt the credit risk reporting suite in SQL and Python.',
  'TECHNICAL SKILLS', 'Programming: SQL, Python',
  'EDUCATION', 'Imperial College London'].join('\n');

const warn = (summary, jdTitle) => RA.runRecruiterAudit({
  cvText: cvWith(summary), jdText: 'role', jdTitle, jobKeywords: [], experience: [],
}).report.warnings.find((w) => w.kind === 'summary-names-another-profession');

console.log('THE REPORTED DOCUMENT');
{
  const w = warn('Accomplished Software Engineer with over 10 years of experience.',
    'Reinsurance Analyst');
  t('  it is caught', !!w, 'a Software Engineer opening on a Reinsurance application');
  t('  ...naming what was claimed', !!w && /software engineer/i.test(w.claimed),
    JSON.stringify(w && w.claimed));
  t('  ...and the role applied for', !!w && w.target === 'Reinsurance Analyst',
    JSON.stringify(w && w.target));
  t('  ...and suggesting the closer TRUE title', !!w && w.better === 'Data Analyst',
    JSON.stringify(w && w.better));
  t('  ...marked critical, because it is the first line read',
    !!w && w.severity === 'critical', JSON.stringify(w && w.severity));
}

console.log('\nAND NOTHING IS REWRITTEN');
{
  const s = 'Accomplished Software Engineer with over 10 years of experience.';
  const o = RA.runRecruiterAudit({
    cvText: cvWith(s), jdText: 'role', jdTitle: 'Reinsurance Analyst',
    jobKeywords: [], experience: [],
  });
  const lines = o.cvText.split('\n');
  const summary = lines[lines.findIndex((l) => /PROFESSIONAL SUMMARY/.test(l)) + 1];
  t('  the sentence is the writer\'s, not a guess',
    /Software Engineer|Data Analyst/.test(summary) && summary.length > 20,
    JSON.stringify(summary));
  t('  and both real titles still stand in the history',
    /Software Engineer/.test(o.cvText) && /Data Analyst/.test(o.cvText),
    'a real title was removed from the employment block');
}

console.log('\nIT IS SILENT WHEN THE SUMMARY ALREADY LEADS WELL');
for (const [summary, title] of [
  ['Data Analyst with five years in credit risk analytics.', 'Senior Data Analyst'],
  ['Experienced Software Engineer building backend services.', 'Software Engineer'],
  ['Data Analyst with five years across regulatory reporting.', 'Data Analyst'],
]) {
  t('  "' + summary.slice(0, 34) + '..." for ' + title,
    !warn(summary, title), 'a correct summary was flagged');
}

console.log('\nAND WHEN THERE IS NOTHING BETTER TO SUGGEST');
{
  // No held title is any closer to the posting, so naming one would be
  // advice the history cannot support.
  t('  no closer true title -> no warning',
    !warn('Accomplished Software Engineer with ten years in Python.', 'Registered Nurse'),
    'it suggested a title that is no closer');
}
{
  // A summary that opens on no profession at all is a style choice,
  // not a mis-positioning.
  t('  an opening with no profession is left alone',
    !warn('Five years turning messy data into decisions people act on.',
      'Reinsurance Analyst'), 'a profession was inferred from prose');
}
{
  t('  and no posting title means no opinion',
    !warn('Accomplished Software Engineer with ten years in Python.', ''),
    'it judged the summary against nothing');
}

console.log('\nAND THE STALE HEADLINE WARNING IS GONE');
{
  // The headline carrying the TARGET role is the shipped design. The
  // old warning told the user their headline was wrong and to go and
  // change the prompt rule that produces it -- firing on almost every
  // application, against a decision they had made deliberately.
  const o = RA.runRecruiterAudit({
    cvText: cvWith('Data Analyst with five years in credit risk analytics.'),
    jdText: 'role', jdTitle: 'Reinsurance Analyst', jobKeywords: [], experience: [],
  });
  t('  no headline-claimed-an-unheld-title warning',
    !o.report.warnings.some((w) => w.kind === 'headline-claimed-an-unheld-title'),
    JSON.stringify(o.report.warnings.map((w) => w.kind)));
  t('  the headline is the role applied for',
    o.cvText.split('\n').filter((l) => l.trim())[1] === 'Reinsurance Analyst',
    o.cvText.split('\n').filter((l) => l.trim())[1]);
  t('  and the fix line says that, rather than the opposite',
    o.report.fixes.some((f) => /headline under your name to the role you are applying for/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /headline/i.test(f))));
  t('  ...with no line still promising a held title',
    !o.report.fixes.some((f) => /only ever a title your history/.test(f))
      && !o.report.fixes.some((f) => /is a title your history does not contain/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /headline/i.test(f))));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
