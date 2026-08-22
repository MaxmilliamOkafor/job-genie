// A CV CAME BACK WITH THE BULLETS STILL CAPPED AND THE AUDIT SAID NOTHING.
//
// The restore had shipped. The generated document showed 6/4/5/5
// against a profile of 7/6/7/7, in the tailoring's order rather than
// the profile's, and there was no way to tell from the output whether
// the pass had run and found nothing to do, thrown, or never seen the
// profile at all. Those are three different fixes and they look
// identical from the outside.
//
// Reported as: "bullets layout seems mixed up, for example look at
// Citigroup, that was not my first bullet in my layout" and "bullet
// size for meta was 7, Solimhealth 6, Accenture 7, citigroup 7".
//
// FOUR FAULTS, all of the same kind: doing nothing, quietly.
//
//   ONE try BLOCK FOR TWO PASSES. The counting and the restoring shared
//   a try with an empty catch, so any throw in the counting -- which
//   touches more of the document -- skipped the restore too.
//
//   ORDER ONLY CHANGED AS A SIDE EFFECT. A role missing nothing was
//   skipped entirely, which left the relevance re-ordering as the last
//   word on it. A complete role could still be shuffled out of the
//   order its owner arranged. A profile that records the work records
//   the order of it.
//
//   ONE FIELD NAME FOR THE BULLETS. It read `bullets` and `description`
//   and nothing else. The location field has already turned up missing
//   for exactly this reason, and a list arriving as `responsibilities`
//   fails the same way: an empty list is indistinguishable from a role
//   the model kept in full.
//
//   AND NO WAY TO SEE ANY OF IT. A pass that matches no role must say
//   so, with the names it compared, because every version of this bug
//   has been a field arriving under a name nobody expected.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
const load = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
};
load('docx-generator.js');
load('content-quality-engine.js');
load('recruiter-audit.js');
const RA = global.RecruiterAudit;

const BULLETS = [
  'Rebuilt the credit risk reporting suite in SQL and Python for a consumer lending '
    + 'portfolio, replacing four conflicting sources with a single agreed set of exposure '
    + 'figures used daily by risk and finance.',
  'Replaced a 40 tab Excel reporting pack with a Power BI and Tableau suite, cutting the '
    + 'month end reporting cycle from nine working days to three.',
  'Automated the daily regulatory data feed using Airflow and SQL Server after three late '
    + 'submissions in a single year, and it met every deadline thereafter.',
  'Trained 24 analysts across the London and Belfast offices in SQL and Power BI, '
    + 'reducing turnaround on routine data requests to same day.',
];

const cvWith = (bullets) => ['Maxmilliam Okafor', 'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Analyst.',
  'PROFESSIONAL EXPERIENCE',
  'Citigroup', 'London, United Kingdom', 'Data Analyst', 'August 2017 - March 2021',
  ...bullets.map((b) => '- ' + b),
  'EDUCATION', 'Imperial College London'].join('\n');

const audit = (cv, experience) => RA.runRecruiterAudit({
  cvText: cv, jdText: 'SQL Power BI data analysis',
  jdTitle: 'Business Operations Sr Analyst',
  jobKeywords: ['SQL', 'Power BI', 'Data Analysis'], experience,
});
const bulletsOf = (o) => o.cvText.split('\n').filter((l) => /^\s*[-•*]/.test(l))
  .map((l) => l.replace(/^\s*[-•*]\s*/, ''));

console.log('THE REPORTED ONE: NOTHING MISSING, EVERYTHING SHUFFLED');
{
  // Every bullet present, but the relevance ordering has pulled the
  // SQL/Power BI training bullet to the front -- which is exactly the
  // Citigroup complaint. The profile's order is the one that ships.
  const shuffled = [BULLETS[3], BULLETS[0], BULLETS[1], BULLETS[2]];
  const o = audit(cvWith(shuffled), [{ company: 'Citigroup', bullets: BULLETS }]);
  const got = bulletsOf(o);
  t('  all four are still there', got.length === 4, got.length + '');
  t('  and the profile\'s first bullet leads again',
    /credit risk reporting suite/.test(got[0]), got[0]);
  t('  ...with the training bullet back at the end',
    /Trained 24 analysts/.test(got[3]), JSON.stringify(got.map((b) => b.slice(0, 40))));
  t('  the re-order is reported', o.report.fixes.some((f) =>
    /put 1 role\(s\) back into your profile's order/.test(f)),
    JSON.stringify(o.report.fixes));
}

console.log('\nWHICHEVER FIELD THE PROFILE PUT THEM IN');
for (const field of ['bullets', 'description', 'responsibilities', 'achievements',
  'highlights', 'points', 'duties']) {
  const src = { company: 'Citigroup' };
  src[field] = field === 'description' ? BULLETS.join('\n') : BULLETS.slice();
  const got = bulletsOf(audit(cvWith(BULLETS.slice(0, 2)), [src]));
  t('  "' + field + '" is read', got.length === 4, got.length + ' of 4');
}
{
  // A list of objects, which is how a repeater UI usually saves.
  const src = { company: 'Citigroup', bullets: BULLETS.map((b) => ({ text: b })) };
  const got = bulletsOf(audit(cvWith(BULLETS.slice(0, 2)), [src]));
  t('  and so is a list of { text } objects', got.length === 4, got.length + ' of 4');
}

console.log('\nA PASS THAT MATCHED NOTHING SAYS SO');
{
  // The company names disagree, so nothing can be restored. Silence
  // here is indistinguishable from the model having returned it all.
  const o = audit(cvWith(BULLETS.slice(0, 2)), [{ company: 'Citibank NA', bullets: BULLETS }]);
  const w = o.report.warnings.find((x) => x.kind === 'profile-experience-unmatched');
  t('  it is reported', !!w, JSON.stringify(o.report.warnings.map((x) => x.kind)));
  t('  ...naming what it compared', !!w && /Citigroup/.test(w.note) && /Citibank NA/.test(w.note),
    w && w.note);
}
{
  // The role matched but carries no work underneath it, which is the
  // shape a profile takes when the bullets are not in the payload.
  const o = audit(cvWith(BULLETS.slice(0, 2)),
    [{ company: 'Citigroup', title: 'Data Analyst' }]);
  const w = o.report.warnings.find((x) => x.kind === 'profile-experience-has-no-bullets');
  t('  an empty profile role is reported too', !!w,
    JSON.stringify(o.report.warnings.map((x) => x.kind)));
  t('  ...and says to check which field they save under',
    !!w && /which field the bullets save under/.test(w.note), w && w.note);
}

console.log('\nAND THE COUNT FAILING DOES NOT TAKE THE RESTORE WITH IT');
{
  // The two passes shared a try with an empty catch. Whatever the
  // counting does, the document still gets its bullets back.
  const o = audit(cvWith(BULLETS.slice(0, 2)), [{ company: 'Citigroup', bullets: BULLETS }]);
  t('  four bullets, from a CV that had two', bulletsOf(o).length === 4,
    JSON.stringify(bulletsOf(o).map((b) => b.slice(0, 40))));
  t('  and no failure is swallowed unreported',
    !o.report.warnings.some((x) => x.kind === 'profile-bullets-restore-failed'),
    JSON.stringify(o.report.warnings.find((x) => x.kind === 'profile-bullets-restore-failed')));
}

console.log('\nAND NOTHING IS SAID WHEN THERE IS NOTHING TO SAY');
{
  const o = audit(cvWith(BULLETS), [{ company: 'Citigroup', bullets: BULLETS }]);
  t('  a CV that already agrees with the profile is left alone',
    !o.report.fixes.some((f) => /^Work experience:/.test(f)), JSON.stringify(o.report.fixes));
  t('  ...and raises none of the diagnostics',
    !o.report.warnings.some((x) => /^profile-experience-/.test(x.kind)),
    JSON.stringify(o.report.warnings.map((x) => x.kind)));
  t('  no profile at all is not a fault', (() => {
    const p = audit(cvWith(BULLETS), []);
    return !p.report.warnings.some((x) => /^profile-experience-/.test(x.kind));
  })(), 'warned with nothing to compare against');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
