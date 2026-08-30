// WHAT ENHANCV, RESUME WORDED, JOBSCAN AND REZI CHECK AND THIS DID NOT.
//
// Their rubrics were read against the thirty checks already here. Most
// of what they score was covered, and several things they do not check
// at all were covered better: fabricated keywords, an inflated years
// figure, a headline claiming a title the history does not contain.
//
// Four real gaps remained. All four are things a HUMAN discounts rather
// than scoring conventions, which is the reason to adopt them:
//
//   TENSE. A finished job written in the present tense.
//   PRONOUNS. "I managed a team of six" in a bullet.
//   PASSIVE AND DUTY LANGUAGE. "Was responsible for the migration."
//   SCOPE. No number anywhere for team size, budget or headcount.
//
// Deliberately NOT adopted: an overall 0-100 score. Jobscan gives 71
// and Resume Worded 55 for the same CV against the same posting, and
// neither is what Workday computes. A number invites optimising for the
// number; a named defect with its line does not.
//
// All four are warnings. Each needs a judgement about the work that
// this code does not have, and a rewrite it guessed at would be worse
// than the sentence it replaced.
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

const cv = (bullets, dates) => ['Maxmilliam Okafor', 'Data Analyst',
  'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Analyst with five years in data analysis.',
  'PROFESSIONAL EXPERIENCE',
  'Citigroup', 'London, United Kingdom', 'Data Analyst',
  dates || 'August 2017 - March 2021',
  ...bullets,
  'TECHNICAL SKILLS', 'SQL, Python, Power BI',
  'EDUCATION', 'Imperial College London'].join('\n');

const warn = (bullets, kind, dates) => RA.runRecruiterAudit({
  cvText: cv(bullets, dates), jdText: 'analyst', jdTitle: 'Data Analyst',
  jobKeywords: ['SQL'], experience: [],
}).report.warnings.find((w) => w.kind === kind);

console.log('1. A FINISHED JOB IN THE PRESENT TENSE');
{
  const w = warn([
    '- Build and own the credit risk reporting suite in SQL and Python.',
    '- Manage the monthly reporting cycle for a consumer lending portfolio.',
  ], 'tense-mismatch');
  t('  it is caught', !!w, 'a role that ended in 2021 says "Build"');
  t('  and names the verbs', !!w && /"Build"/.test(w.note) && /"Manage"/.test(w.note),
    w && w.note);
  t('  ...with the offending line', !!w && /credit risk reporting/.test(w.samples[0].sample),
    JSON.stringify(w && w.samples));
}
{
  // The reverse is legitimate: work finished inside a role still held.
  const w = warn([
    '- Rebuilt the credit risk reporting suite in SQL and Python.',
    '- Automated the daily regulatory feed using Airflow.',
  ], 'tense-mismatch', 'January 2023 - Present');
  t('  past tense inside a CURRENT role is left alone', !w, JSON.stringify(w));
}
{
  const w = warn([
    '- Build and own the ads delivery platform in Python and C++.',
    '- Deliver ranking model improvements in Python and PyTorch.',
  ], 'tense-mismatch', 'January 2023 - Present');
  t('  present tense in a current role is correct, not flagged', !w, JSON.stringify(w));
}
{
  // "Led", "built" and "held" are past but do not end in -ed. A naive
  // rule calls them present tense and flags a correct CV.
  const w = warn([
    '- Led the analysis behind the IFRS 9 staging criteria review.',
    '- Built the credit risk reporting suite in SQL and Python.',
    '- Held primary responsibility for the regulatory data feed.',
    '- Wrote the specification and test scripts for the migration.',
  ], 'tense-mismatch');
  t('  irregular past forms are not mistaken for present tense', !w, JSON.stringify(w));
}

console.log('\n2. PRONOUNS IN A BULLET');
{
  const w = warn([
    '- I rebuilt the credit risk reporting suite in SQL and Python.',
    '- Managed the reporting cycle for our consumer lending portfolio.',
  ], 'pronouns-in-bullets');
  t('  it is caught', !!w, 'a bullet opens with "I"');
  t('  and both are found', !!w && w.count >= 2, JSON.stringify(w && w.count));
  t('  ...naming the word', !!w && /^(I|our)$/i.test(w.samples[0].word),
    JSON.stringify(w && w.samples));
}
{
  // "us" inside "customers", "we" inside "weekly": a bare substring
  // test flags a clean CV on every line.
  const w = warn([
    '- Rebuilt the reporting suite used weekly by customers across nine markets.',
    '- Automated the industry data feed after three late submissions.',
    '- Trained 24 analysts in SQL and Power BI, reducing turnaround to same day.',
  ], 'pronouns-in-bullets');
  t('  a pronoun inside another word is not a pronoun', !w, JSON.stringify(w));
}

console.log('\n3. PASSIVE AND DUTY LANGUAGE');
for (const [bullet, label] of [
  ['- Was responsible for the migration of 47 services to AWS.', 'responsible for'],
  ['- Tasked with rebuilding the credit risk reporting suite.', 'tasked with'],
  ['- Duties included producing the monthly regulatory return.', 'duties included'],
  ['- The reporting pack was replaced by a Power BI suite.', 'passive voice'],
  ['- Helped to deliver the data warehouse migration.', 'helped'],
  ['- Assisted with the IFRS 9 staging criteria review.', 'assisted with'],
  ['- Involved in the anti money laundering alert redesign.', 'involved in'],
]) {
  const w = warn([bullet], 'passive-or-duty-language');
  t('  "' + label + '" is caught', !!w, bullet);
}
{
  const w = warn([
    '- Rebuilt the credit risk reporting suite in SQL and Python for a GBP 2.6bn portfolio.',
    '- Replaced a 40 tab Excel pack with a Power BI suite, cutting the cycle to three days.',
    '- Trained 24 analysts across two offices in SQL and Power BI.',
  ], 'passive-or-duty-language');
  t('  and active, specific bullets are left alone', !w, JSON.stringify(w));
}

console.log('\n4. NO SCOPE ANYWHERE');
{
  const vague = [
    '- Rebuilt the credit risk reporting suite in SQL and Python.',
    '- Replaced the Excel reporting pack with a Power BI suite.',
    '- Redesigned anti money laundering alert scoring in Python.',
    '- Automated the daily regulatory data feed using Airflow.',
    '- Led the analysis behind the IFRS 9 staging criteria review.',
    '- Collected requirements for a data warehouse migration.',
  ];
  const w = warn(vague, 'no-scope-signals');
  t('  a CV with no numbers at all is flagged', !!w, 'six bullets, no scale');
  t('  ...and says what is missing',
    !!w && /team size, budget, headcount/.test(w.note), w && w.note);
}
{
  // The real Citigroup bullets. Every one of these carries scale.
  const real = [
    '- Rebuilt the credit risk reporting suite in SQL and Python for a GBP 2.6bn consumer lending portfolio.',
    '- Replaced a 40 tab Excel reporting pack with a Power BI suite, cutting the cycle from nine days to three.',
    '- Trained 24 analysts across the London and Belfast offices in SQL and Power BI.',
    '- Collected requirements from nine stakeholder groups for a data warehouse migration.',
    '- Led the analysis behind the IFRS 9 staging criteria review across four years of data.',
    '- Automated the daily regulatory data feed after three late submissions in a single year.',
  ];
  t('  and a CV that has them is silent', !warn(real, 'no-scope-signals'),
    JSON.stringify(warn(real, 'no-scope-signals')));
}
{
  // Absence only means something once there is enough to judge.
  t('  a short CV is not accused of lacking scope',
    !warn(['- Rebuilt the reporting suite.', '- Automated the feed.'], 'no-scope-signals'),
    'two bullets is not evidence of anything');
}

console.log('\nAND NONE OF THEM REWRITES THE CV');
{
  // Three separate faults on three lines. The tense check reads the
  // OPENING verb, so a bullet starting "I" is a pronoun fault and not
  // also a tense one -- putting them on one line would test the wrong
  // thing.
  const bullets = [
    '- Build and own the credit risk reporting suite in SQL and Python.',
    '- I rebuilt the monthly reporting cycle for the lending portfolio.',
    '- Was responsible for the migration of the data warehouse.',
  ];
  const o = RA.runRecruiterAudit({
    cvText: cv(bullets), jdText: 'analyst', jdTitle: 'Data Analyst',
    jobKeywords: ['SQL'], experience: [],
  });
  t('  every bullet reaches the page exactly as written',
    bullets.every((b) => o.cvText.indexOf(b.replace('- ', '')) !== -1),
    'a guessed rewrite replaced the writer\'s sentence');
  const kinds = o.report.warnings.map((w) => w.kind);
  t('  ...and all three faults are reported',
    ['tense-mismatch', 'pronouns-in-bullets', 'passive-or-duty-language']
      .every((k) => kinds.indexOf(k) !== -1), JSON.stringify(kinds));
}

console.log('\nAND THERE IS STILL NO OVERALL SCORE');
{
  const o = RA.runRecruiterAudit({
    cvText: cv(['- Rebuilt the suite.']), jdText: 'analyst', jdTitle: 'Data Analyst',
    jobKeywords: ['SQL'], experience: [],
  });
  t('  the report exposes no 0-100 number',
    typeof o.report.score === 'undefined' && typeof o.report.atsScore === 'undefined',
    'a number to optimise for has appeared');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
