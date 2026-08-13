// THE GAP BRIDGE PATH THREW INSTEAD OF RETURNING A LETTER.
//
// cover-letter-generator.js runs CareerBoostEngine over the posting and
// the CV. When it finds a strong adjacency -- the posting asks for
// something the candidate has not literally done, but has done something
// close enough to claim honestly -- it produces one sentence connecting
// the two. That sentence is the most valuable line in the letter,
// because it is the one that answers the requirement the candidate would
// otherwise be screened out on.
//
// The line that merged it in read:
//
//     Body = `${body.replace(/\s+$/, '')} ${gapBridgeLine}`;
//
// Capital B. Nothing declares `Body`, and this file opens with
// 'use strict', so that is a ReferenceError rather than an accidental
// global. Every letter where CareerBoost found a strong adjacency threw
// out of generate(). The single case the feature was written for was the
// single case that crashed.
//
// It survived because the existing cover-letter suite never loaded
// career-boost-engine.js: with the engine undefined the whole block is
// skipped, gapBridgeLine stays empty, and the broken line is never
// reached. This suite loads it, which is the only reason the test is
// worth anything.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
global.performance = global.performance || { now: () => Date.now() };
for (const f of ['content-quality-engine.js', 'regional-format.js', 'recruiter-audit.js',
                 'career-boost-engine.js', 'cover-letter-generator.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const CLG = global.CoverLetterGenerator;
const CBE = global.CareerBoostEngine;

t('  career-boost-engine actually loaded', !!CBE,
  'without it this whole suite silently tests nothing, which is how the bug survived');

// A posting that asks for things the CV covers only adjacently, plus a
// named team and a stated challenge so the hook path runs too.
const JD = [
  'Senior Technical Business Analyst, Payments Platform team at Stripe.',
  'You will own requirements gathering and stakeholder management across',
  'the payments platform, run data profiling on transaction data, and build',
  'reporting in Tableau. We are trying to cut reconciliation time from days',
  'to hours. Experience with Kubernetes, Terraform and Snowflake preferred.',
  'You will write user stories, run UAT, and manage the product backlog.',
].join(' ');

const CV = [
  'Maxmilliam Okafor',
  'PROFESSIONAL SUMMARY',
  'Data analyst working across fraud, risk and regulatory reporting.',
  'PROFESSIONAL EXPERIENCE',
  'Citigroup, Data Analyst, August 2017 - March 2021',
  '- Developed fraud and risk-scoring models in Python with scikit-learn.',
  // Docker is the adjacency the posting's Kubernetes requirement bridges
  // to. Without it CareerBoost finds no strong adjacency, the merge
  // branch never runs, and this suite silently proves nothing.
  '- Containerised the scoring service with Docker and deployed it nightly.',
  '- Re-engineered ETL workflows in SQL and Apache Airflow, cutting end-to-end',
  '  processing from a full day to under two hours.',
  '- Investigated trading-system anomalies with SQL and Pandas, built Tableau',
  '  dashboards and presented root-cause findings to VP-level stakeholders.',
  'EDUCATION',
  'MSc Artificial Intelligence',
].join('\n');

const CAND = {
  firstName: 'Maxmilliam', lastName: 'Okafor', email: 'max@example.com',
  phone: '+353 874 261 508', city: 'Dublin, IE', location: 'Dublin, Ireland',
  cvText: CV, skills: ['Python', 'SQL', 'Tableau', 'Pandas', 'Docker'],
  professional_experience: [
    { company: 'Citigroup', title: 'Data Analyst', dates: 'August 2017 - March 2021',
      bullets: ['Built fraud models over the daily transaction feed.'] },
  ],
};
const JOB = { title: 'Senior Technical Business Analyst', company: 'Stripe',
  location: 'Dublin, Ireland', description: JD };
const KW = ['requirements gathering', 'stakeholder management', 'data profiling',
  'Tableau', 'reporting', 'SQL', 'user stories', 'UAT', 'backlog'];

console.log('\nTHE ADJACENCY PATH IS ACTUALLY REACHED');
// If this is empty the suite below proves nothing, so assert it directly
// rather than assume.
let gaps = null;
try {
  gaps = CBE.analyzeGaps(JD, CV, { maxGaps: 1 });
} catch (e) {
  gaps = { error: e.message };
}
t('  analyzeGaps returns a gap with an adjacent match',
  !!(gaps && gaps.gaps && gaps.gaps.length && gaps.gaps[0].hasAdjacent),
  'no adjacency found, so the crashing branch would not run: ' + JSON.stringify(gaps).slice(0, 300));

console.log('\nAND GENERATING THE LETTER DOES NOT THROW');
let err = null, out = null;
try {
  out = CLG.generate(CAND, JOB, KW);
} catch (e) {
  err = e;
}
t('  generate() returns instead of throwing', !err,
  err ? (err.name + ': ' + err.message) : '');
t('  ...and specifically not a ReferenceError',
  !(err && err instanceof ReferenceError),
  err ? err.message : '');

const text = out ? ((out.text || out.coverLetter) || String(out)) : '';
t('  a letter came back', text.length > 200, String(text.length) + ' chars');
t('  it is addressed and signed',
  /Dear /.test(text) && /Maxmilliam/.test(text), text.slice(0, 200));
t('  it names the employer', /Stripe/.test(text), text.slice(0, 300));

console.log('\nAND THE BRIDGE SENTENCE SURVIVES INTO THE BODY');
// The whole reason the branch exists. If the merge silently dropped it,
// the crash would be fixed and the feature still dead.
const bridge = gaps && gaps.gaps && gaps.gaps[0] && gaps.gaps[0].bridge;
if (bridge) {
  // The bridge is sanitised after merging, so compare on distinctive
  // words rather than the exact string.
  const words = String(bridge).toLowerCase().match(/[a-z]{6,}/g) || [];
  const kept = words.filter((w) => text.toLowerCase().includes(w));
  t('  most of the bridge\'s distinctive words are in the letter',
    words.length > 0 && kept.length >= Math.ceil(words.length * 0.5),
    kept.length + '/' + words.length + ' survived.\n              bridge: ' + bridge
      + '\n              letter: ' + text.slice(0, 400));
} else {
  t('  a bridge sentence was produced', false, 'analyzeGaps gave no bridge text');
}

console.log('\nAND IT STILL WORKS WHEN THERE IS NO ADJACENCY TO BRIDGE');
// The common case must not regress while fixing the rare one.
const plainJob = { title: 'Data Analyst', company: 'Revolut',
  location: 'Dublin, Ireland', description: 'SQL, Python, Tableau, reporting.' };
let err2 = null, out2 = null;
try { out2 = CLG.generate(CAND, plainJob, ['SQL', 'Python', 'Tableau']); } catch (e) { err2 = e; }
t('  a posting with no gap still generates', !err2 && !!out2,
  err2 ? err2.message : 'no output');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
