// "JANUARY 2023, PRESENT"
//
// _cleanCorruption folds em and en dashes to a comma, because the user
// asked for no em dashes anywhere and a comma keeps a sentence whole
// without the glyph. In prose that is right.
//
// It ran over the WHOLE document, and a CV is mostly not prose. Models
// write date ranges with an en dash by default, so every role line
//
//     Software Engineer    January 2023 – Present
//
// came out as "January 2023, Present". That is bad to read, and it is
// worse than it looks: ROLE_DATE_RE requires a dash between the two
// dates, and it is how every later pass finds where one role ends and
// the next begins. _cleanCorruption runs at line 2328; bullet ordering,
// the per-role cap and the pivot summary rewrite run at 2396, 2408 and
// 2420. All three were handed a document whose roles they could no
// longer see, so all three did nothing -- silently, on a CV that still
// looked fine, for the normal case rather than an edge one.
//
// The same shape as the two caches: something upstream destroyed the
// input, so the fix downstream could never be observed.
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

const build = (dateA, dateB) => [
  'Maxmilliam Okafor', '', 'PROFESSIONAL SUMMARY',
  'Engineer with delivery experience.', '',
  'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer\t' + dateA,
  '- Wrote internal tooling nobody asked about.',
  '- Built data pipelines in Python and SQL for clinical reporting.',
  '- Kept the build green.',
  '', 'Accenture', 'Data Analyst\t' + dateB,
  '- Reported to stakeholders monthly.',
  '', 'EDUCATION', 'MSc Artificial Intelligence',
].join('\n');

const run = (cv) => RA.runRecruiterAudit({
  cvText: cv, jdText: 'python sql data pipelines',
  jdTitle: 'Data Engineer', jobKeywords: ['python', 'sql', 'pipelines'],
});

console.log('A DATE RANGE KEEPS A DASH, WHATEVER DASH IT ARRIVED AS');
for (const [name, a, b] of [
  ['en dash, month and year', 'January 2023 – Present', 'June 2020 – December 2022'],
  ['em dash, month and year', 'January 2023 — Present', 'June 2020 — December 2022'],
  ['bare years', '2023 – Present', '2020 – 2022'],
  ['numeric months', '01/2023 – Present', '06/2020 – 12/2022'],
  ['no spaces around the dash', 'January 2023–Present', 'June 2020–December 2022'],
  ['abbreviated months', 'Jan. 2023 – Present', 'Jun. 2020 – Dec. 2022'],
  ['Current rather than Present', '2023 – Current', '2020 – 2022'],
]) {
  const out = run(build(a, b)).cvText;
  const line = out.split('\n').find((l) => /Software Engineer/.test(l)) || '';
  t('  ' + name, /\d\s*-\s*(Present|Current|\d)/i.test(line) && !/,\s*(Present|Current)/i.test(line),
    JSON.stringify(line));
}

console.log('\nAND NO EM OR EN DASH SURVIVES ANYWHERE');
// The original requirement still holds: the glyph must not reach the
// document, in a date range or anywhere else.
{
  const out = run(build('January 2023 – Present', 'June 2020 — December 2022')).cvText;
  t('  not one is left', !/[–—]/.test(out),
    JSON.stringify((out.match(/.{0,30}[–—].{0,30}/) || [''])[0]));
}

console.log('\nAND PROSE DASHES ARE STILL COMMAS');
// The rule that was right stays right: only the date case changed.
{
  const cv = build('January 2023 - Present', 'June 2020 - December 2022')
    .replace('- Kept the build green.', '- Owned delivery — end to end — for three teams.');
  const out = run(cv).cvText;
  t('  a dash between words becomes a comma',
    /Owned delivery, end to end, for three teams/.test(out),
    JSON.stringify((out.split('\n').find((l) => /Owned delivery/.test(l)) || '')));
}

console.log('\nAND THE PASSES THAT NEED ROLE BOUNDARIES WORK AGAIN');
// The point of the fix. With the dates destroyed, ordering could not
// find a role to order within, so it left the bullets alone and looked
// exactly like a feature that was not running.
{
  const out = run(build('January 2023 – Present', 'June 2020 – December 2022'));
  const lines = out.cvText.split('\n');
  const iTooling = lines.findIndex((l) => /internal tooling/.test(l));
  const iPipelines = lines.findIndex((l) => /data pipelines in Python/i.test(l));
  t('  both bullets are still present', iTooling > -1 && iPipelines > -1,
    'ordering must never drop a bullet');
  t('  the bullet carrying the posting keywords is ordered above the one that does not',
    iPipelines < iTooling,
    'tooling at ' + iTooling + ', pipelines at ' + iPipelines
      + ' -- with the date line broken this could not happen');
  t('  and education is untouched below it',
    /MSc Artificial Intelligence/.test(out.cvText), 'the rewrite escaped the experience section');
}

console.log('\nAND THE DATE FOLD RUNS BEFORE THE PASSES THAT DEPEND ON IT');
{
  const SRC = fs.readFileSync(path.join(DIR, 'recruiter-audit.js'), 'utf8');
  const clean = SRC.indexOf('cvText = _cleanCorruption(cvText');
  const order = SRC.indexOf('orderBulletsByRelevance(outCV');
  const pivot = SRC.indexOf('rewritePivotSummary(outCV');
  t('  both passes run after the clean', clean > -1 && clean < order && clean < pivot,
    'clean=' + clean + ' order=' + order + ' pivot=' + pivot);
  t('  so the date case has to be handled inside the clean itself',
    /Present\|Current\|Ongoing/.test(SRC), 'no date-aware branch in _cleanCorruption');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
