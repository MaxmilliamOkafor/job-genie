// A BULLET FROM A REAL JOB IS THE LAST THING SPENT ON THE PAGE.
//
// The user's words: "why did you limit my professional experience roles
// bullets to 2 each? I never asked for that."
//
// They did not. The one-page fitter did, and a bullet was the only thing
// it knew how to spend -- so a CV with more on it than a page holds paid
// for the page entirely out of its employment history. Four roles, every
// one cut to the floor of two.
//
// Worse, on the CV that prompted this it bought nothing at all. Measured
// after the trimming, that document was still 139% of a page: the
// history was gutted AND it ran to two pages. A two-page CV with whole
// roles is strictly better than a 1.3-page CV with hollow ones.
//
// So: cheaper things go first, and if the page still cannot be reached,
// everything goes back and the caller is told what would actually have
// to change.
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
const DG = load('docx-generator.js');
load('content-quality-engine.js');
load('recruiter-audit.js');
const RA = global.RecruiterAudit;

const BULLET = '- Re-architected the data-ingestion layer in Python and SQL on an Apache '
  + 'Kafka stream, partitioning and caching hot paths to roughly halve p95 query latency.';
const PROJECT = (i) => ['Project ' + i + ', A Real-Time Engine',
  'Python, LLMs (RAG), Kafka, FastAPI, React, AWS',
  '- Streams live financial news through an LLM that extracts entities and sentiment '
    + 'with inline citations and a hallucination-eval harness.',
  'Live demo: maxmilliamokafor.github.io/p' + i + ' | Code: github.com/MaxmilliamOkafor/p' + i, ''];

// The parts of a CV this cannot touch: certifications, education, the
// summary. `heavy` adds the ones the reported CV actually carried, which
// is what put it beyond rescue.
const CERTS = 'AWS Certified Machine Learning - Specialty, AWS Certified Solutions '
  + 'Architect - Professional, Google Cloud Professional Machine Learning Engineer, '
  + 'Microsoft Certified: Azure AI Engineer Associate, Microsoft Certified: Azure '
  + 'Solutions Architect Expert, TensorFlow Developer Certificate, Certified '
  + 'Kubernetes Administrator (CKA)';

const build = ({ bullets = 3, projects = 3, roles = 4, summary = 'Engineer.', heavy = false }) => {
  const names = [['Meta', 'Software Engineer', 'January 2023 - Present'],
    ['SolimHealth', 'AI Product Manager', 'August 2022 - December 2022'],
    ['Accenture', 'Solutions Architect', 'April 2021 - July 2022'],
    ['Citigroup', 'Data Analyst', 'August 2017 - March 2021']].slice(0, roles);
  return ['Maxmilliam Okafor', 'Dublin, IE | maxokafordev@gmail.com',
    ...(heavy ? ['https://linkedin.com/in/maxokafor | https://github.com/MaxmilliamOkafor'] : []), '',
    'PROFESSIONAL SUMMARY', summary, '',
    'TECHNICAL SKILLS', 'Python, SQL, Kafka, AWS, Kubernetes, Docker', '',
    'PROFESSIONAL EXPERIENCE',
    ...names.flatMap(([c, ti, d]) => [c, ti, d, ...Array(bullets).fill(BULLET), '']),
    'PROJECTS', ...Array.from({ length: projects }).flatMap((_, i) => PROJECT(i)),
    ...(heavy ? ['CERTIFICATIONS', CERTS, ''] : []),
    'EDUCATION', 'MSc Artificial Intelligence', 'Imperial College London',
    ...(heavy ? ['BSc Computer Science - First Class Honours', 'University of Derby'] : [])
  ].join('\n');
};

const audit = (cv) => RA.runRecruiterAudit({
  cvText: cv, jdText: 'python kafka', jdTitle: 'Software Engineer', jobKeywords: ['Kafka'],
});
const bulletsPerRole = (cvText) => {
  const lines = cvText.split('\n');
  const counts = [];
  let inExp = false, run = null;
  for (const l of lines) {
    if (/^PROFESSIONAL EXPERIENCE$/i.test(l.trim())) { inExp = true; continue; }
    if (/^[A-Z][A-Z &/]{3,}$/.test(l.trim())) { inExp = false; continue; }
    if (!inExp) continue;
    if (/^\s*-\s*\S/.test(l)) { run = (run || 0) + 1; continue; }
    if (run !== null && l.trim() === '') { counts.push(run); run = null; }
  }
  if (run !== null) counts.push(run);
  return counts;
};

// A summary the length the model actually writes, which is part of why
// these CVs run over.
const LONG_SUMMARY = 'Experienced Software Engineer with a strong background in '
  + 'cybersecurity and customer support, adept at problem-solving and mentoring teams. '
  + 'Ability to enhance customer satisfaction through effective technical support and '
  + 'training. Skilled in developing and optimising technology solutions that meet '
  + 'customer needs.';

console.log('WHEN THE PAGE CANNOT BE REACHED, NOTHING IS CUT');
{
  // Half again over a page, which is roughly where the reported CV sat.
  // Even cut to the floor -- two bullets a role, two projects -- this
  // one is 130% of a page, so the trimming can only do damage.
  const cv = build({ bullets: 3, projects: 3, roles: 4, summary: LONG_SUMMARY, heavy: true });
  t('  the fixture genuinely does not fit', !DG.measureCv(cv).fitsOnePage,
    JSON.stringify(DG.measureCv(cv)));
  t('  ...and would not fit even cut to the floor',
    !DG.measureCv(build({ bullets: 2, projects: 2, roles: 4,
      summary: LONG_SUMMARY, heavy: true })).fitsOnePage,
    'the fixture is rescuable, so it tests the wrong branch');
  const out = audit(cv);
  t('  every role keeps all three bullets',
    bulletsPerRole(out.cvText).every((n) => n === 3),
    JSON.stringify(bulletsPerRole(out.cvText)));
  t('  no role was taken to the floor of two',
    !bulletsPerRole(out.cvText).some((n) => n === 2),
    JSON.stringify(bulletsPerRole(out.cvText)));
  t('  and the report says so, rather than claiming a fix',
    out.report.warnings.some((w) => w.kind === 'two-pages'),
    JSON.stringify(out.report.warnings.map((w) => w.kind)));
  t('  ...naming what would actually have to come down',
    out.report.warnings.some((w) => w.kind === 'two-pages'
      && /project|certification|summary/i.test(w.note)), 'the warning gives no direction');
  t('  and no trim is reported as a fix',
    !out.report.fixes.some((f) => /Fitted to one page/.test(f)),
    JSON.stringify(out.report.fixes.filter((f) => /Fitted/.test(f))));
}

console.log('\nWHEN IT CAN, THE CHEAP LINES GO FIRST');
// A CV over the line. The ladder spends the cheap things first: the
// project descriptions come down to one line each, then whole projects
// go, and only then would a bullet at Meta be touched.
{
  const cv = build({ bullets: 2, projects: 6, roles: 4 });
  const before = DG.measureCv(cv);
  const out = audit(cv);
  const after = DG.measureCv(out.cvText);
  console.log('    before ' + before.heightTwips + ', after ' + after.heightTwips
    + ' of ' + after.pageHeightTwips);
  if (!before.fitsOnePage && after.fitsOnePage) {
    t('  it fits now', true);
    t('  every role kept its bullets',
      bulletsPerRole(out.cvText).every((n) => n === 2),
      JSON.stringify(bulletsPerRole(out.cvText)));
    t('  the descriptions came down to one line each',
      out.cvText.split('\n').filter((l) => /^- Streams/.test(l)).every((l) => l.length <= 100),
      JSON.stringify(out.cvText.split('\n').filter((l) => /^- Streams/.test(l)).map((l) => l.length)));
    t('  and projects were spent before a bullet was',
      (out.cvText.match(/A Real-Time Engine/g) || []).length < 6,
      'the projects are untouched and a bullet went instead');
    t('  but never below two projects',
      (out.cvText.match(/A Real-Time Engine/g) || []).length >= 2,
      'the section was gutted');
    t('  and it is reported', out.report.fixes.some((f) => /Fitted to one page/.test(f)),
      JSON.stringify(out.report.fixes));
  } else {
    // The fixture is on the wrong side of the line for this machine's
    // measurements; the assertions above are meaningless then, and
    // pretending otherwise is worse than saying so.
    t('  SKIPPED: fixture did not land just over the line',
      true, 'before fits=' + before.fitsOnePage + ' after fits=' + after.fitsOnePage);
  }
}

console.log('\nAND A CV THAT ALREADY FITS IS NOT TOUCHED AT ALL');
{
  const cv = build({ bullets: 2, projects: 1, roles: 2 });
  t('  the fixture fits', DG.measureCv(cv).fitsOnePage, JSON.stringify(DG.measureCv(cv)));
  const out = audit(cv);
  t('  both roles keep their bullets',
    bulletsPerRole(out.cvText).every((n) => n === 2),
    JSON.stringify(bulletsPerRole(out.cvText)));
  t('  the project survives', /A Real-Time Engine/.test(out.cvText), 'a project was dropped');
  t('  and nothing is warned about',
    !out.report.warnings.some((w) => w.kind === 'two-pages'),
    'warned about two pages on a CV that fits');
}

console.log('\nA ROLE WITH NO LOCATION IS SAID OUT LOUD, NOT LEFT BLANK');
// Nothing here can invent a city, so a profile with no location produces
// a CV without one -- and the only symptom is an absence, invisible
// until an employer's form asks for it and it gets typed by hand again.
{
  const cv = build({ bullets: 2, projects: 1, roles: 2 });
  const withRoles = (exp) => RA.runRecruiterAudit({
    cvText: cv, jdText: 'python', jdTitle: 'Software Engineer', jobKeywords: ['Kafka'],
    experience: exp,
  }).report.warnings.find((w) => w.kind === 'roles-without-location');

  const some = withRoles([{ company: 'Meta', location: 'Dublin, Ireland' },
    { company: 'SolimHealth' }]);
  t('  the role without one is named', !!some && some.samples.join() === 'SolimHealth',
    JSON.stringify(some));
  const none = withRoles([{ company: 'Meta' }, { company: 'SolimHealth' }]);
  t('  both are named when neither has one', !!none && none.count === 2, JSON.stringify(none));
  t('  ...and the warning says where to put it',
    !!none && /City, Country/.test(none.note), JSON.stringify(none && none.note));
  const all = withRoles([{ company: 'Meta', location: 'Dublin, Ireland' },
    { company: 'SolimHealth', location: 'Dallas, Texas, United States' }]);
  t('  and nothing is said when every role has one', !all, JSON.stringify(all));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
