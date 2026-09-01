// A NICER SENTENCE IS NOT WORTH A LOST KEYWORD.
//
// Asked directly: "keywords land only in the skills section -- is that
// not wrong? what about the Professional Experience bullet points?"
//
// Keywords reach bullets through the model, the vocabulary mirror, the
// acronym pairing and the reordering. But one leak remained: when the
// model REWRITES a real profile bullet, the rewrite stands in for the
// original -- and a rewrite of "Automated the daily regulatory feed
// using Airflow and SQL Server" that comes back without "Airflow" has
// quietly traded a posting keyword for nicer prose, in the one place a
// keyword counts most: inside the work that proves it.
//
// Where that happens, the candidate's own original sentence is put
// back, word for word. That is not injection -- it is their bullet.
//
// SCOPED TIGHT. A keyword the role still shows in ANOTHER bullet was
// merely moved, and the model's arrangement stands. A keyword the
// original never carried triggers nothing. A rewrite that kept its
// keywords is kept.
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

const ORIGINAL = 'Automated the daily regulatory data feed using Airflow and SQL Server after three late submissions in a single year.';
const REWRITE = 'Automated the daily regulatory data feed after three late submissions in a single year.';
const KEEPER = 'Rebuilt the credit risk reporting suite in SQL and Python for a GBP 2.6bn consumer lending portfolio.';

const EXPERIENCE = [{
  company: 'Citigroup', title: 'Data Analyst', location: 'London, United Kingdom',
  bullets: [ORIGINAL, KEEPER],
}];

const cvWith = (bullets) => ['Maxmilliam Okafor', 'Data Analyst',
  'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Analyst with five years in data analysis.',
  'PROFESSIONAL EXPERIENCE',
  'Citigroup', 'London, United Kingdom', 'Data Analyst', 'August 2017 - March 2021',
  ...bullets.map((b) => '- ' + b),
  'TECHNICAL SKILLS', 'SQL, Python, Power BI',
  'EDUCATION', 'Imperial College London'].join('\n');

const run = (bullets, keywords) => RA.runRecruiterAudit({
  cvText: cvWith(bullets), jdText: 'airflow analyst', jdTitle: 'Data Analyst',
  jobKeywords: keywords, experience: EXPERIENCE,
});

console.log('A REWRITE THAT LOST A POSTING KEYWORD IS REPLACED BY THE ORIGINAL');
{
  const o = run([REWRITE, KEEPER], ['Airflow', 'SQL']);
  t('  the original sentence is back, word for word',
    o.cvText.indexOf(ORIGINAL) !== -1,
    o.cvText.split('\n').filter((l) => /Automated/.test(l)).join(' / '));
  t('  the rewrite that lost it is gone',
    o.cvText.indexOf(REWRITE) === -1, 'both versions are on the page');
  t('  the sibling bullet the model kept faithful is untouched',
    o.cvText.indexOf(KEEPER) !== -1, 'a faithful rewrite was churned');
  t('  and the fix names the keyword',
    o.report.fixes.some((f) => /lost a posting keyword \(Airflow\)/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /keyword/.test(f))));
}

console.log('\nAND NOTHING FIRES WHEN NOTHING WAS LOST');
{
  const o = run([ORIGINAL, KEEPER], ['Airflow', 'SQL']);
  t('  a faithful CV is not churned',
    o.cvText.indexOf(ORIGINAL) !== -1 && !o.report.fixes.some((f) => /lost a posting keyword/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /experience/i.test(f))));
}
{
  // The posting never asked for Airflow: the rewrite is the model's
  // judgement to keep.
  const o = run([REWRITE, KEEPER], ['Python', 'SQL']);
  t('  a keyword the posting never asked for reclaims nothing',
    o.cvText.indexOf(REWRITE) !== -1 && !o.report.fixes.some((f) => /lost a posting keyword/.test(f)),
    o.cvText.split('\n').filter((l) => /Automated/.test(l)).join(' / '));
}
{
  // The keyword was MOVED, not lost: another bullet in the role still
  // carries it, so the model's arrangement stands.
  const moved = 'Scheduled every batch job in Airflow with automated retries.';
  const o = RA.runRecruiterAudit({
    cvText: cvWith([REWRITE, moved, KEEPER]), jdText: 'airflow analyst', jdTitle: 'Data Analyst',
    jobKeywords: ['Airflow'],
    experience: [{ company: 'Citigroup', title: 'Data Analyst', bullets: [ORIGINAL, moved, KEEPER] }],
  });
  t('  a keyword moved to a sibling bullet is left where the model put it',
    o.cvText.indexOf(REWRITE) !== -1 && !o.report.fixes.some((f) => /lost a posting keyword/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /keyword|experience/i.test(f))));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
