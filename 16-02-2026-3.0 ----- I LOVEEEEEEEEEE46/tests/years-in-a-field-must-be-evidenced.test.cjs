// A YEARS-IN-A-FIELD CLAIM NEEDS A FIELD THE CV ACTUALLY SHOWS.
//
// Replacing a borrowed title fixes half the sentence. The real generated
// CV that prompted this still read:
//
//   "Experienced Software Engineer with 5+ years in anti-financial crime
//    compliance and AFC governance across EU markets."
//
// over bullets that were Kafka, Kubernetes and MLflow start to finish.
// Every parser scores that at 100% and the first human or LLM screener
// stops on line two. Nothing automated flags it, which is exactly why it
// is expensive.
//
// The whole guard turns on which text counts as evidence. A claim about
// years in a field is answered by what the candidate DID and EARNED --
// experience, education, certifications. It is not answered by Core
// Competencies or the skills list, because the same generation pass
// wrote those: a competency line reading "Anti-Financial Crime" is the
// claim again, not support for it. Score the summary against the skills
// list and any invented domain vouches for itself, so these tests pin
// that separation directly.
//
// The tolerance is pinned just as hard. Deleting a true claim makes the
// CV weaker, which is the opposite of tailoring, so a claim survives on
// a single word of support and is cut only when the record contains
// nothing of it.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
for (const f of ['content-quality-engine.js', 'recruiter-audit.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const RA = global.RecruiterAudit;

// A software engineer's real record. Nothing in it is compliance work.
const EXPERIENCE = [
  'PROFESSIONAL EXPERIENCE',
  'Meta',
  'Software Engineer',
  'January 2023 - Present',
  '- Built streaming pipelines on Kafka handling millions of events a day.',
  '- Ran model deployments through MLflow and Kubernetes.',
  '',
  'Citigroup',
  'Data Engineer',
  'June 2020 - December 2022',
  '- Rebuilt the nightly batch layer in Spark and Airflow.',
  '',
  'EDUCATION',
  'MSc Artificial Intelligence',
];

const cv = (summary, extra) => ['Maxmilliam Okafor', '', 'PROFESSIONAL SUMMARY', summary, '']
  .concat(extra || []).concat(EXPERIENCE).join('\n');

const run = (summary, extra, jdTitle) => {
  const out = RA.runRecruiterAudit({
    cvText: cv(summary, extra),
    jdText: 'anti-financial crime compliance',
    jdTitle: jdTitle || 'Software Engineer',
    jobKeywords: ['compliance'],
  });
  return { line: out.cvText.split('\n')[3], text: out.cvText, fixes: out.report.fixes };
};

console.log('THE UNSUPPORTED DOMAIN CLAIM COMES OUT');
{
  const r = run('Experienced Software Engineer with 5+ years in anti-financial crime '
    + 'compliance and AFC governance across EU markets.');
  t('  the invented years-in-a-field claim is gone',
    !/5\+ years/.test(r.line) && !/anti-financial crime/i.test(r.line), r.line);
  t('  the true part of the sentence survives',
    /Software Engineer/.test(r.line), r.line);
  t('  what is left still reads as a sentence',
    /^[A-Z]/.test(r.line.trim()) && /\.$/.test(r.line.trim())
      && !/\s{2,}|\.\.|,\s*\./.test(r.line), JSON.stringify(r.line));
  t('  and it is reported as a fix, not a warning',
    r.fixes.some((f) => /years in a field/.test(f)), JSON.stringify(r.fixes));
}

console.log('\nCORE COMPETENCIES DO NOT VOUCH FOR THE SUMMARY');
// The decisive case. The same generation pass writes both, so a
// competency list naming the invented domain is the claim restated. If
// this scored as support, the guard would never fire on a real tailored
// CV -- which is the only kind it ever sees.
{
  const r = run('Experienced Software Engineer with 5+ years in anti-financial crime '
    + 'compliance and AFC governance across EU markets.',
    ['CORE COMPETENCIES',
      'Anti-Financial Crime | Compliance Governance | AML | KYC | EU Markets', '']);
  t('  a competency list naming the domain does not rescue the claim',
    !/5\+ years/.test(r.line) && !/anti-financial crime/i.test(r.line), r.line);
  t('  and the competency list itself is left alone',
    /Anti-Financial Crime \| Compliance Governance/.test(r.text),
    'the guard is confined to the summary');
}
{
  const r = run('Experienced Software Engineer with 5+ years in anti-financial crime '
    + 'compliance and AFC governance across EU markets.',
    ['TECHNICAL SKILLS',
      'Anti-Financial Crime, Compliance, Governance, EU Markets, Python', '']);
  t('  nor does a skills line naming it',
    !/5\+ years/.test(r.line), r.line);
}

console.log('\nBUT AN EVIDENCED CLAIM SURVIVES INTACT');
// Tolerance matters as much as the guard.
{
  const honest = 'Experienced Software Engineer with 5+ years in Kafka streaming '
    + 'and Kubernetes deployment.';
  const r = run(honest);
  t('  a claim the bullets back up is untouched', r.line === honest, r.line);
  t('  and nothing is reported', !r.fixes.some((f) => /years in a field/.test(f)),
    JSON.stringify(r.fixes));
}
{
  // One word of real support is enough. "Spark" is in the record; the
  // rest of the phrase is not, and a true claim should not be cut for
  // being worded loosely.
  const loose = 'Experienced Software Engineer with 6 years of experience in Spark.';
  const r = run(loose);
  t('  a short claim survives on a single word of support', r.line === loose, r.line);
}
{
  // Education counts as record: it is something earned, not asserted.
  const edu = 'Experienced Software Engineer with 5+ years in artificial intelligence.';
  const r = run(edu);
  t('  education is evidence too', r.line === edu, r.line);
}
{
  const noYears = 'Experienced Software Engineer who ships reliable systems.';
  const r = run(noYears);
  t('  a summary making no years claim is untouched', r.line === noYears, r.line);
}

console.log('\nIT NEVER RUNS WITHOUT A RECORD TO CHECK AGAINST');
{
  const bare = ['Name', '', 'PROFESSIONAL SUMMARY',
    'Experienced Analyst with 5+ years in anti-financial crime compliance.'].join('\n');
  const out = RA.runRecruiterAudit({ cvText: bare, jdText: 'x', jdTitle: 'Analyst',
    jobKeywords: [] });
  t('  no employment history means no cut',
    /5\+ years in anti-financial crime/.test(out.cvText),
    'with nothing to contradict the claim there is no basis to change it');
}

console.log('\nAND IT NEVER LEAVES AN EMPTY SUMMARY');
{
  // The whole summary is one unsupported claim with no connective to cut
  // at. A blank opening section reads worse than an overreach, so the
  // model's judgement decides rather than this.
  const r = run('5+ years in anti-financial crime compliance and AFC governance.');
  t('  a summary that is nothing but the claim is left for the model',
    r.line.trim().length > 0, JSON.stringify(r.line));
}

console.log('\nAND THE REST OF THE CV IS NOT TOUCHED');
{
  const r = run('Experienced Software Engineer with 5+ years in anti-financial crime '
    + 'compliance and AFC governance across EU markets.');
  t('  the experience bullets survive verbatim',
    /Built streaming pipelines on Kafka handling millions of events a day\./.test(r.text)
      && /Rebuilt the nightly batch layer in Spark and Airflow\./.test(r.text),
    'the guard must be confined to the summary');
  t('  the employment history is intact',
    /Meta/.test(r.text) && /Citigroup/.test(r.text) && /MSc Artificial Intelligence/.test(r.text),
    r.text.slice(0, 300));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
