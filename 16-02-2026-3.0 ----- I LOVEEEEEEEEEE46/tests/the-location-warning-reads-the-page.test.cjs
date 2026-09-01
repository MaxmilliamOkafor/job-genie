// "4 ROLE(S) HAVE NO LOCATION" -- ON A PROFILE WHERE ALL FOUR HAD ONE.
//
// The profile app's audit confirmed it: 4 roles, 0 missing `location`,
// 0 rows backfilled. Its explanation -- "the extension reads a
// different key name" -- was checked against the code and is wrong:
// the filter read r.location FIRST, before ten fallback spellings.
//
// The real faults were two:
//
//   SHAPE. The keys were read through String(), so a location saved as
//   an OBJECT ({city, country}, which is what a form with two boxes
//   naturally produces) stringifies to "[object Object]" -- truthy for
//   the warning, garbage for the page.
//
//   AUTHORITY. The warning's claim is "the CV goes out without one",
//   but the verdict was read off the PROFILE OBJECT, not off the CV.
//   The tailored text already carried every city; the page was fine
//   and the warning fired anyway. The CV is in scope at that line, so
//   the CV is what gets checked now: only a role whose block on the
//   FINISHED PAGE has no location is reported.
//
// A warning that cries wolf teaches the user to stop reading warnings,
// which is worse than having none.
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

const cv = (expLines) => ['Maxmilliam Okafor', 'Data Analyst',
  'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Analyst with five years in data analysis.',
  'PROFESSIONAL EXPERIENCE',
  ...expLines,
  'TECHNICAL SKILLS', 'SQL, Python, Power BI',
  'EDUCATION', 'Imperial College London'].join('\n');

const run = (expLines, experience) => RA.runRecruiterAudit({
  cvText: cv(expLines), jdText: 'analyst', jdTitle: 'Data Analyst',
  jobKeywords: ['SQL'], experience,
});
const locWarn = (o) => o.report.warnings.find((w) => w.kind === 'roles-without-location');

console.log('A LOCATION SAVED AS AN OBJECT IS A LOCATION');
{
  // Two boxes on a form save two fields. That is not "no location".
  const o = run(
    ['Citigroup', 'Data Analyst', 'August 2017 - March 2021', '- Rebuilt the reporting suite.'],
    [{ company: 'Citigroup', location: { city: 'London', country: 'United Kingdom' } }],
  );
  t('  no warning fires', !locWarn(o), JSON.stringify(locWarn(o)));
  t('  the city reaches the company line',
    /Citigroup\tLondon, United Kingdom/.test(o.cvText),
    o.cvText.split('\n').find((l) => /Citigroup/.test(l)));
  t('  and "[object Object]" reaches nothing',
    o.cvText.indexOf('object Object') === -1, 'the object was stringified raw');
}

console.log('\nA PAGE THAT ALREADY CARRIES THE CITY IS NOT WARNED ABOUT');
{
  // The tailored text's own layout: company, location line, title. The
  // profile object arriving shaped differently (or empty) changes
  // nothing the reader of the CV can see.
  const o = run(
    ['Citigroup', 'London, United Kingdom', 'Data Analyst',
      'August 2017 - March 2021', '- Rebuilt the reporting suite.'],
    [{ company: 'Citigroup' }],
  );
  t('  a location line under the company silences it', !locWarn(o), JSON.stringify(locWarn(o)));
}
{
  // Comma-joined onto the company line: re-delimited by the attach
  // pass, and equally not missing.
  const o = run(
    ['Citigroup, London, United Kingdom', 'Data Analyst',
      'August 2017 - March 2021', '- Rebuilt the reporting suite.'],
    [{ company: 'Citigroup' }],
  );
  t('  a comma-joined company line silences it too', !locWarn(o), JSON.stringify(locWarn(o)));
}

console.log('\nBUT A ROLE WITH NO LOCATION ANYWHERE IS STILL REPORTED');
{
  const o = run(
    ['Citigroup', 'Data Analyst', 'August 2017 - March 2021', '- Rebuilt the reporting suite.'],
    [{ company: 'Citigroup' }],
  );
  const w = locWarn(o);
  t('  the warning fires', !!w, 'a genuinely missing location went unmentioned');
  t('  and names the company', !!w && w.samples.join() === 'Citigroup', JSON.stringify(w));
}
{
  // A date line under the company is not a location, even with a comma.
  const o = run(
    ['Citigroup', 'August 2017 - March 2021', '- Rebuilt the reporting suite.'],
    [{ company: 'Citigroup' }],
  );
  t('  a date line does not pass for a city', !!locWarn(o), 'the date silenced the warning');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
