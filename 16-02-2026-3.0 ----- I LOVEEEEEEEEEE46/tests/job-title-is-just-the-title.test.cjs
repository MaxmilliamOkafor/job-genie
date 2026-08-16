// "AI PRODUCT MANAGER (CONTRACT, PART-TIME)" IS NOT A JOB TITLE.
//
// Measured on a generated document, the Job Title a parser extracts was
//
//     "AI Product Manager (Contract, part-time)"
//
// That is a real stored field. Workday, Taleo and iCIMS keep it,
// recruiters search and filter on it, and several normalise it against a
// title taxonomy. That string matches neither a search for "AI Product
// Manager" nor any taxonomy entry, so the role is harder to find than it
// would be with no qualifier at all.
//
// The qualifier is not dropped, because whether a role was a contract is
// something an employer is entitled to know. It moves to the one place
// that costs nothing. Ranked by how much damage a stray qualifier does:
//
//     Job Title   searched and matched directly    keep clean
//     Company     matched against employer names   keep clean
//     Dates       parsed for tenure arithmetic     keep clean
//     Bullets     free text, keyword-matched only  safe
//
// so it becomes the role's first bullet, read in the same glance.
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
const run = (cv) => global.RecruiterAudit.runRecruiterAudit({
  cvText: cv, jdText: 'product', jdTitle: 'AI Product Manager', jobKeywords: ['genai'],
}).cvText.split('\n');

const build = (title) => [
  'Max Okafor', '', 'PROFESSIONAL EXPERIENCE',
  'SolimHealth', title, 'August 2022 - December 2022',
  '- Built a GenAI system.', '',
  'EDUCATION', 'MSc Artificial Intelligence (Distinction)',
].join('\n');

console.log('THE QUALIFIER LEAVES THE TITLE AND KEEPS ITS MEANING');
for (const [title, clean, moved] of [
  ['AI Product Manager (Contract, part-time)', 'AI Product Manager', 'Contract, part-time'],
  ['Data Analyst (Internship)', 'Data Analyst', 'Internship'],
  ['Software Engineer (Freelance)', 'Software Engineer', 'Freelance'],
  ['Delivery Lead (Fixed-term)', 'Delivery Lead', 'Fixed-term'],
  ['Ops Manager (Maternity cover)', 'Ops Manager', 'Maternity cover'],
  ['Analyst (Temporary)', 'Analyst', 'Temporary'],
]) {
  const lines = run(build(title));
  const titleLine = lines.find((l) => l.trim().startsWith(clean));
  t('  ' + title, titleLine && titleLine.trim() === clean, 'title line: ' + JSON.stringify(titleLine));
  t('    -> kept as "' + moved + '"',
    lines.some((l) => new RegExp('^\\s*-\\s*' + moved.replace(/[-[\]{}()*+?.\\^$|]/g, '\\$&') + '\\.', 'i').test(l)),
    JSON.stringify(lines.filter((l) => /^\s*-/.test(l))));
}

console.log('\nBUT A PARENTHETICAL THAT IS PART OF THE JOB IS LEFT ALONE');
// "(EMEA)" and "(Data Platform)" name the job. Stripping them would
// remove information the title genuinely carries.
for (const title of ['Senior Software Engineer (EMEA)', 'Engineer (Data Platform)',
  'Analyst (Risk & Controls)', 'Manager (Northern Region)']) {
  const lines = run(build(title));
  t('  ' + title, lines.some((l) => l.trim() === title), JSON.stringify(lines.slice(0, 8)));
}

console.log('\nAND NOTHING OUTSIDE THE EXPERIENCE SECTION IS TOUCHED');
{
  const lines = run(build('AI Product Manager (Contract)'));
  t('  a degree keeps its classification',
    lines.some((l) => /MSc Artificial Intelligence \(Distinction\)/.test(l)),
    'the education line was rewritten: ' + JSON.stringify(lines.filter((l) => /MSc/.test(l))));
}

console.log('\nAND THE DATE STAYS GLUED TO ITS TITLE');
// The adjacency is what binds a date to a role. Inserting the bullet
// between them would hand the date to whichever title came before.
{
  const lines = run(build('AI Product Manager (Contract, part-time)')).filter((l) => l.trim());
  const ti = lines.findIndex((l) => l.trim() === 'AI Product Manager');
  const di = lines.findIndex((l) => /August 2022/.test(l));
  t('  the date is the very next line', ti > -1 && di === ti + 1,
    'title at ' + ti + ', date at ' + di + ': ' + JSON.stringify(lines));
  t('  and the qualifier sits after it, as a bullet',
    /^\s*-\s*Contract, part-time\./i.test(lines[di + 1] || ''),
    JSON.stringify(lines[di + 1]));
  t('  the role\'s real bullets survive',
    lines.some((l) => /Built a GenAI system/.test(l)), JSON.stringify(lines));
}

console.log('\nAND IT IS REPORTED AS A FIX, NOT A WARNING');
{
  const out = global.RecruiterAudit.runRecruiterAudit({
    cvText: build('AI Product Manager (Contract, part-time)'),
    jdText: 'product', jdTitle: 'AI Product Manager', jobKeywords: ['genai'],
  });
  t('  the change is stated', out.report.fixes.some((f) => /employment type/i.test(f)),
    JSON.stringify(out.report.fixes));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
