// AN UNFILLED PLACEHOLDER MUST NEVER SHIP.
//
// A generated cover letter went to an AI detector carrying, verbatim:
//
//   "I am eager to expand my knowledge in specific areas such as
//    [insert specific technology or skill mentioned in the job
//    description that the candidate lacks]."
//
// That is an instruction to the model, printed to the recruiter. It is
// worse than any AI-detection score: it says the letter was generated
// AND never read, and it volunteers a gap in the candidate's skills in
// the same breath. Either one ends an application on its own.
//
// The existing never-leak guard passed it through untouched -- it only
// knew about spelling and buzzwords. These tests pin the shape of the
// fix: the whole SENTENCE goes, not just the brackets, because deleting
// the brackets alone leaves "...areas such as ." which is its own tell,
// and the sentence exists only to host the placeholder.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
{
  const file = path.join(DIR, 'content-quality-engine.js');
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const E = global.ContentQualityEngine;

// The exact paragraph that shipped.
const REAL = 'While I have extensive experience with cloud platforms and integration '
  + 'processes, I am eager to expand my knowledge in specific areas such as [insert '
  + 'specific technology or skill mentioned in the job description that the candidate '
  + 'lacks]. My background in implementing CI/CD pipelines and mentoring junior '
  + 'engineers equips me with the adaptability and learning agility needed to quickly '
  + 'contribute to your team.';

console.log('THE REAL LEAK IS REMOVED');
{
  const out = E.neverLeakGuard(REAL);
  t('  the bracketed instruction is gone', !/\[insert/i.test(out), out);
  t('  no empty brackets are left behind', !/\[\s*\]/.test(out), out);
  t('  and no stranded "such as ." fragment',
    !/such as\s*\./i.test(out), out);
  t('  the surrounding sentence survives',
    /CI\/CD pipelines and mentoring junior engineers/.test(out), out);
  t('  what is left still reads as prose',
    /^[A-Z]/.test(out.trim()) && /[.!?]$/.test(out.trim()), JSON.stringify(out));
}

console.log('\nEVERY SHAPE THE SAME LEAK ARRIVES IN');
for (const [label, text, gone] of [
  ['square brackets', 'Skills include [ADD RELEVANT SKILLS HERE]. I led the platform migration end to end.', 'ADD RELEVANT'],
  ['mustache', 'Dear {{HiringManager}}. I built payment systems at scale for eight years.', 'HiringManager'],
  ['angle brackets', 'Contact me at <your email here>. I have shipped production systems since 2017.', 'your email'],
  ['TBD marker', 'My salary expectation is TBD. I led the migration of fifty applications.', 'TBD'],
  ['TODO marker', 'Add a closing line TODO. I have delivered platform work at scale for years.', 'TODO'],
  ['company placeholder', 'I want to join your company name soon. I have shipped production systems since 2017.', 'your company name'],
]) {
  const out = E.stripUnfilledPlaceholders(text);
  t('  ' + label + ' is stripped', !new RegExp(gone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(out), out);
}

console.log('\nAND REAL CONTENT IS NEVER TOUCHED');
// The guard must not eat legitimate prose. Brackets and capitals appear
// in real CVs, and a guard that removes true content is worse than the
// leak it prevents.
for (const keep of [
  'Reduced p95 latency by roughly half (from 400ms to 190ms) across the ingestion layer.',
  'Built an ETL pipeline in SQL and Airflow that cut processing from a day to two hours.',
  'Certified Kubernetes Administrator (CKA) and AWS Solutions Architect Professional.',
  'Led the XXL migration programme across four regions.',
]) {
  const out = E.stripUnfilledPlaceholders(keep);
  t('  kept: ' + keep.slice(0, 46) + '...', out.trim() === keep.trim(), JSON.stringify(out));
}

console.log('\nA PARAGRAPH REDUCED TO A FRAGMENT IS DROPPED WHOLE');
// A missing paragraph is invisible to a reader. A broken one is not.
{
  const out = E.stripUnfilledPlaceholders('Such as [insert skill].');
  t('  nothing but the placeholder leaves nothing', out.trim() === '', JSON.stringify(out));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
