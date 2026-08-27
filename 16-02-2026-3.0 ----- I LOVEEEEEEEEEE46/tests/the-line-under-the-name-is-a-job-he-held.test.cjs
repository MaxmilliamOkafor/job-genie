// EVERY CV WENT OUT CLAIMING A JOB TITLE HE HAS NEVER HELD.
//
// Asked to find why applications were being auto-rejected or ignored.
// The document was clean: checked against a real generated .docx, the
// package validates, no tables or text boxes or headers, one safe font,
// the email and phone extract, four role/date lines parse, one skills
// heading. The culprit was not formatting. It was line 2.
//
//   Maxmilliam Okafor
//   Business Operations Sr Analyst      <-- line 2
//   São Paulo, BR | +353 087 426 1508
//   ...
//   PROFESSIONAL EXPERIENCE
//   Meta            Dublin, Ireland
//   Software Engineer   January 2023 - Present
//
// EVERY RESUME PARSER READS THE LINE UNDER THE NAME AS THE TITLE HELD
// NOW. So the stored candidate record says "Business Operations Sr
// Analyst" while the employment block says "Software Engineer at Meta,
// January 2023 to Present". The record contradicts itself, and a
// recruiter holding both sees someone misrepresenting their job. On an
// ATS that merges candidates by email, the stored headline also changes
// on every application to the same employer.
//
// THE PASS THAT WAS SUPPOSED TO PREVENT THIS ONLY CHECKED ITS OWN WORK.
// ensureHeadline refuses to invent a title: it uses the posting's title
// only when the history contains it, and otherwise the candidate's real
// most recent one. But when a headline was ALREADY on the page it
// returned immediately, on the reasoning that there was nothing to add.
// The tailoring prompt tells the model to write the posting's title on
// exactly that line, so the model wrote it, this pass stepped aside, and
// the check applied to headlines it wrote and to no others.
//
// Measured before the fix: "Director of Business Operations" survived
// with no warning at all.
//
// The truthfulness rule now applies to the line however it got there.
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

// His real history, as the profile records it.
const cv = (headline) => ['Maxmilliam Okafor']
  .concat(headline ? [headline] : [])
  .concat(['Dublin, IE | maxokafordev@gmail.com', '',
    'PROFESSIONAL SUMMARY', 'Analyst.',
    'PROFESSIONAL EXPERIENCE',
    'Meta', 'Dublin, Ireland', 'Software Engineer', 'January 2023 - Present',
    '- Built backend services in Python and C++ for the ads delivery platform.',
    'Citigroup', 'London, United Kingdom', 'Data Analyst', 'August 2017 - March 2021',
    '- Rebuilt the credit risk reporting suite in SQL and Python.',
    'EDUCATION', 'Imperial College London']).join('\n');

const run = (headline, jdTitle) => RA.runRecruiterAudit({
  cvText: cv(headline), jdText: 'business operations analyst',
  jdTitle: jdTitle || 'Business Operations Sr Analyst',
  jobKeywords: ['SQL'], experience: [],
});
const lineTwo = (o) => o.cvText.split('\n').filter((l) => l.trim())[1];
const warned = (o) => o.report.warnings.find((w) => w.kind === 'headline-claimed-an-unheld-title');

console.log('THE REPORTED DOCUMENT');
{
  const o = run('Business Operations Sr Analyst');
  t('  the unheld title does not survive',
    lineTwo(o) !== 'Business Operations Sr Analyst', lineTwo(o));
  t('  it becomes a title he has actually held',
    lineTwo(o) === 'Software Engineer', lineTwo(o));
  t('  and it is reported, not swapped in silence', !!warned(o),
    JSON.stringify(o.report.warnings.map((w) => w.kind)));
  t('  ...naming what it replaced', !!warned(o) && warned(o).was === 'Business Operations Sr Analyst',
    JSON.stringify(warned(o)));
  t('  the fix says why the line matters', o.report.fixes.some((f) =>
    /parser|current|hold/i.test(f) && /headline/i.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /headline/i.test(f))));
}

console.log('\nSENIORITY CANNOT BE INVENTED EITHER');
for (const claim of ['Director of Business Operations', 'Head of Data',
  'Senior Solutions Architect', 'VP Engineering', 'Chief Data Officer']) {
  const o = run(claim, claim);
  t('  "' + claim + '" is replaced', lineTwo(o) === 'Software Engineer',
    lineTwo(o));
}

console.log('\nAND A TITLE HE HAS HELD IS LEFT ALONE');
for (const held of ['Software Engineer', 'Data Analyst']) {
  const o = run(held, held);
  t('  "' + held + '" stays', lineTwo(o) === held, lineTwo(o));
  t('  ...with no warning', !warned(o), JSON.stringify(warned(o)));
}
{
  // A narrower form of a held title is still true: he held "Data
  // Analyst", so "Analyst" claims nothing he has not done.
  const o = run('Data Analyst', 'Senior Data Analyst');
  t('  and the posting asking for a senior version changes nothing',
    lineTwo(o) === 'Data Analyst', lineTwo(o));
}

console.log('\nTHE EMPTY SLOT STILL GETS FILLED');
{
  const o = run('');
  t('  a CV with no headline gets his real one',
    lineTwo(o) === 'Software Engineer', lineTwo(o));
  t('  reported as an addition, not a replacement',
    o.report.fixes.some((f) => /Added the role headline/.test(f)) && !warned(o),
    JSON.stringify(o.report.fixes.filter((f) => /headline/i.test(f))));
}

console.log('\nAND THE LINE IS NOT MISTAKEN FOR SOMETHING ELSE');
{
  // The contact line lives here on some layouts. It is not a headline
  // and must never be overwritten with one.
  const o = RA.runRecruiterAudit({
    cvText: ['Maxmilliam Okafor', 'Dublin, IE | maxokafordev@gmail.com | +353 87 426 1508', '',
      'PROFESSIONAL EXPERIENCE', 'Meta', 'Dublin, Ireland', 'Software Engineer',
      'January 2023 - Present', '- Did the work.',
      'EDUCATION', 'Imperial College London'].join('\n'),
    jdText: 'ops', jdTitle: 'Business Operations Sr Analyst', jobKeywords: ['SQL'], experience: [],
  });
  t('  a contact line is never overwritten',
    /maxokafordev@gmail.com/.test(o.cvText), o.cvText.split('\n').slice(0, 4).join(' / '));
}

console.log('\nAND THE PROMPT NO LONGER ASKS FOR IT');
{
  // The renderer fix works on extension reload; the prompt lives in an
  // edge function deployed separately. Both have to change or the model
  // keeps writing the claim and this pass keeps undoing it.
  const p = path.join(DIR, '..', 'supabase', 'functions', 'tailor-application', 'index.ts');
  if (fs.existsSync(p)) {
    const src = fs.readFileSync(p, 'utf8');
    t('  the rule requires a held title',
      /IT MUST BE A TITLE THE CANDIDATE HAS ACTUALLY HELD/.test(src),
      'the prompt still asks for the posting title');
    t('  ...and no longer calls it positioning rather than a claim',
      !/It is positioning, not a claim of current employment/.test(src),
      'the old justification is still in the prompt');
  } else {
    t('  (edge function not in this checkout, skipped)', true);
  }
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
