// WORK THE PROFILE RECORDS AND THE CV DOES NOT.
//
// Reported: "I updated my profile section with new bullets but all
// bullets aren't generating from my extension generated tailored cv."
//
// Twenty-eight bullets across four roles went in. Thirteen came out, as
// 4 / 3 / 3 / 3.
//
// THREE THINGS CAN REMOVE A BULLET, and telling them apart is the whole
// point of this file:
//
//   1. the tailoring model never returning it -- RULE 11b in the prompt
//      caps a role at 4-6 bullets recent, 2-4 older, and 4/3/3/3 sits
//      inside those bands, so this is where the reported ones went
//   2. capBulletsPerRole here, at 6 recent and 4 older, which reports
//      its own trim as a fix
//   3. fitToOnePage, which on that CV cut nothing at all: measured, it
//      was 145% of a page WITH the thirteen, so the fitter gave up and
//      reverted rather than gut the history for no gain
//
// Reported as one number, those three tell the user nothing about which
// to change. So this counts ONLY the first, above the cap in the
// pipeline, and says which knob moves it.
//
// Any of the three may be right for a given posting. What is not
// defensible is that the only way to find out half your work was missing
// is to count it by hand against the profile page.
//
// This does not put them back. The model rewrites what it keeps, so
// splicing raw profile text in beside it gives a CV in two voices.
// Restoring is a decision, and it belongs to the person applying.
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
  return (m.exports && m.exports.DocxGenerator) || m.exports;
};
load('docx-generator.js');
load('content-quality-engine.js');
load('recruiter-audit.js');
const RA = global.RecruiterAudit;

// The real Meta role, verbatim from the profile.
const META_PROFILE = [
  "Build and own backend services written in Python and C++ for Meta's ads delivery platform, which serves billions of requests daily, and cut response times by running downstream calls in parallel rather than in sequence.",
  'Rewrote the internal campaign diagnostics tool in React, TypeScript and GraphQL. It had been slow enough that sales engineers raised tickets rather than use it, and the rewrite cleared most of that queue.',
  'Deliver ranking model improvements in Python and PyTorch, including new inputs derived from advertiser bid history, which produced a revenue increase that held across a four week live test.',
  "Rebuilt the PySpark and Presto pipeline behind impression reporting, cutting the overnight run from six hours to under one so the data is ready before the reporting team's deadline rather than after it.",
  'Hold primary on call responsibility for two critical services. Authored the incident response documentation the team now uses, and led the review that resolved a failure which had recurred monthly for over a year.',
  'Raised automated test coverage with pytest and added checks to the build pipeline that block unsafe database queries before release, which ended routine production rollbacks.',
  'Mentor two junior engineers and an intern who converted to a permanent role, and author the design documents for cross team changes, including consolidating three duplicated services behind one interface.',
];

// And the four the tailoring actually kept, rewritten as it rewrote them.
const META_ON_CV = [
  "- Build and own backend services written in Python and C++ for Meta's ads delivery platform, which serves billions of requests daily and cut response times by running downstream calls in parallel.",
  '- Rewrote the internal campaign diagnostics tool in React, TypeScript and GraphQL. It had been slow enough that sales engineers raised tickets rather than use it.',
  '- Deliver ranking model improvements in Python and PyTorch, including new inputs derived from advertiser bid history, which produced a revenue increase.',
  '- Rebuilt the PySpark and Presto pipeline behind impression reporting, cutting the overnight run from six hours to under one.',
];

const cvWith = (bullets) => ['Maxmilliam Okafor', 'Dublin | max@x.com', '',
  'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer', 'January 2023 - Present', ...bullets, '',
  'EDUCATION', 'Imperial College London'].join('\n');

const run = (bullets, experience) => RA.runRecruiterAudit({
  cvText: cvWith(bullets), jdText: 'business analyst', jdTitle: 'Senior Business Analyst',
  jobKeywords: ['Salesforce'], experience,
}).report.warnings.find((w) => w.kind === 'profile-bullets-dropped');

console.log('THE REPORTED CASE: SEVEN IN THE PROFILE, FOUR ON THE CV');
{
  const w = run(META_ON_CV, [{ company: 'Meta', bullets: META_PROFILE }]);
  t('  it is reported at all', !!w, 'the loss stays silent, which is the bug');
  t('  with the right count', !!w && w.count === 3, JSON.stringify(w && w.count));
  t('  and the right totals', !!w && w.profileBullets !== 0
    && w.roles[0].profileBullets === 7 && w.roles[0].cvBullets === 4,
    JSON.stringify(w && w.roles));
  // The three that actually went, named.
  for (const phrase of ['on call', 'test coverage', 'Mentor two junior']) {
    t('  names the dropped bullet about "' + phrase + '"',
      !!w && w.dropped === undefined
        ? w.roles[0].dropped.some((d) => d.indexOf(phrase) !== -1)
        : false,
      JSON.stringify(w && w.roles[0].dropped));
  }
  t('  and says where the cap lives', !!w && /RULE 11b/.test(w.note), w && w.note);
  t('  ...and names the extension\'s own cap separately',
    !!w && /extension caps too, at 6 recent and 4 older/.test(w.note), w && w.note);
}

console.log('\nA REWRITTEN BULLET IS NOT A MISSING ONE');
// The model rewrites everything it keeps, so an exact-match check would
// report all seven as dropped and be useless.
{
  const w = run(META_ON_CV, [{ company: 'Meta', bullets: META_PROFILE.slice(0, 4) }]);
  t('  four kept, four in the profile, nothing reported', !w,
    JSON.stringify(w && w.roles));
}
{
  // Heavily reworded but the same work.
  const reworded = ['- Own the Python and C++ backend services behind the ads delivery '
    + 'platform at Meta, which serves billions of requests daily, parallelising downstream '
    + 'calls to cut response times.'];
  const w = run(reworded, [{ company: 'Meta', bullets: [META_PROFILE[0]] }]);
  t('  a paraphrase still counts as present', !w, JSON.stringify(w && w.roles[0].dropped));
}

console.log('\nAND IT DOES NOT INVENT A LOSS');
{
  t('  no profile experience, nothing reported',
    !run(META_ON_CV, []), 'warned with nothing to compare against');
  t('  a profile role with no bullets is not a loss',
    !run(META_ON_CV, [{ company: 'Meta' }]), 'an empty profile role reported as dropped');
  t('  a company the CV does not carry is skipped',
    !run(META_ON_CV, [{ company: 'Google', bullets: META_PROFILE }]),
    'reported bullets for a role that is not on this CV');
  // Inside the extension's own cap of six, so nothing else can trim and
  // the only possible cause of a warning would be a false positive.
  const six = META_PROFILE.slice(0, 6);
  t('  every bullet present means silence',
    !run(six.map((b) => '- ' + b), [{ company: 'Meta', bullets: six }]),
    'warned when nothing was lost');
}

console.log('\nAND IT READS THE PROFILE SHAPES THE APP ACTUALLY SAVES');
{
  const asText = [{ company: 'Meta', description: META_PROFILE.join('\n') }];
  const w = run(META_ON_CV, asText);
  t('  bullets held as a newline description are counted',
    !!w && w.roles[0].profileBullets === 7, JSON.stringify(w && w.roles));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
