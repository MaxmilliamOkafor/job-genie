// THE LINE UNDER THE NAME IS THE ROLE BEING APPLIED FOR.
//
// This file used to assert the opposite: that a posting title the
// history did not contain was replaced by the closest title it did.
// The reasoning was that every resume parser stores the line under the
// name as the job held NOW, so an unheld title there contradicts the
// employment block beneath it.
//
// The owner of this CV has overruled that, twice and explicitly: the
// line is the target role. It is positioning, the employment block
// directly underneath states every real title with its dates, and the
// posting's own words in the first line a screener reads are worth
// more than the distinction. His call, his CV, and the reasoning is
// defensible -- this is what the file pins now.
//
// What survives from the old rule: with NO posting title in hand, the
// line still falls back to a title the history genuinely contains,
// because inventing one from nothing would be a different thing
// entirely.
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
  t('  the posting title is what the line reads',
    lineTwo(o) === 'Business Operations Sr Analyst', lineTwo(o));
  t('  ...verbatim, not a held substitute',
    lineTwo(o).indexOf('Data Analyst') === -1
      && lineTwo(o).indexOf('Software Engineer') === -1, lineTwo(o));
  t('  and the employment block still states every real title',
    /Software Engineer/.test(o.cvText) && /Data Analyst/.test(o.cvText),
    'a real title was lost from the history');
}

console.log('\nWHATEVER THE POSTING IS CALLED, THE LINE SAYS IT');
for (const claim of ['Director of Business Operations', 'Head of Data',
  'Senior Solutions Architect', 'VP Engineering', 'Chief Data Officer']) {
  const o = run(claim, claim);
  t('  "' + claim + '" reaches the line', lineTwo(o) === claim, lineTwo(o));
}

console.log('\nAND A TITLE HE HAS HELD IS LEFT ALONE');
for (const held of ['Software Engineer', 'Data Analyst']) {
  const o = run(held, held);
  t('  "' + held + '" stays', lineTwo(o) === held, lineTwo(o));
  t('  ...with no warning', !warned(o), JSON.stringify(warned(o)));
}
{
  // The posting's exact wording wins over the CV's existing line, even
  // when that line is a held title one word away.
  const o = run('Data Analyst', 'Senior Data Analyst');
  t('  and a posting asking for the senior version says so',
    lineTwo(o) === 'Senior Data Analyst', lineTwo(o));
}

console.log('\nTHE EMPTY SLOT STILL GETS FILLED');
{
  const o = run('');
  t('  a CV with no headline gets the posting title',
    lineTwo(o) === 'Business Operations Sr Analyst', lineTwo(o));
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
