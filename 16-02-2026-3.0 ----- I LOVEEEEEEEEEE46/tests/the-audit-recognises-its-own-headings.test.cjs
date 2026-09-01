// THE AUDIT REPORTED A MISSING SECTION THAT WAS RIGHT THERE.
//
// Every CV this extension generates came back with
//
//   missing-standard-headers: "ATS parsers look for standard section
//   headers. Missing/non-standard: Experience"
//
// on a document whose experience section is headed PROFESSIONAL
// EXPERIENCE, correctly named, correctly placed, and parsing fine. The
// check's pattern was /^(WORK\s+)?EXPERIENCE$/, which matches
// EXPERIENCE and WORK EXPERIENCE and not the third spelling -- the one
// the renderer canonicalises everything to on purpose.
//
// This is the third instance of one fault in this file: a hand-written
// list of section names that does not contain the name this code
// itself standardises on. The summary clamp had it, and there the
// consequence was deleting the rest of the CV. Here the consequence is
// milder and still costly: a checker that cries wolf on its own correct
// output trains its reader to ignore it, so the day it reports a real
// missing heading, nobody looks.
//
// The fix is to stop keeping a second list. _EXP_HEAD is the shared
// pattern the rest of the file already uses for this exact question.
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

const cvWith = (expHead, skillsHead, summaryHead, eduHead) =>
  ['Max Okafor', 'Software Engineer', 'Dublin, IE | maxokafordev@gmail.com', '',
    summaryHead, 'Analyst with five years in data analysis.',
    expHead,
    'Meta', 'Dublin, Ireland', 'Software Engineer', 'January 2023 - Present',
    '- Built backend services in Python and C++.',
    skillsHead, 'Python, SQL, Power BI',
    eduHead, 'Imperial College London'].join('\n');

const missingOf = (cv) => {
  const o = RA.runRecruiterAudit({ cvText: cv, jdText: 'x', jdTitle: 'Software Engineer',
    jobKeywords: ['SQL'], experience: [] });
  const w = o.report.warnings.find((x) => x.kind === 'missing-standard-headers');
  return w ? w.missing : [];
};

console.log('THE HEADING THE RENDERER ACTUALLY WRITES');
{
  const m = missingOf(cvWith('PROFESSIONAL EXPERIENCE', 'TECHNICAL SKILLS',
    'PROFESSIONAL SUMMARY', 'EDUCATION'));
  t('  a fully canonical CV reports nothing missing', m.length === 0, JSON.stringify(m));
}

console.log('\nAND EVERY SPELLING THE REST OF THE FILE ACCEPTS');
for (const head of ['PROFESSIONAL EXPERIENCE', 'WORK EXPERIENCE', 'EXPERIENCE',
  'RELEVANT EXPERIENCE', 'EMPLOYMENT', 'EMPLOYMENT HISTORY', 'CAREER HISTORY']) {
  const m = missingOf(cvWith(head, 'TECHNICAL SKILLS', 'PROFESSIONAL SUMMARY', 'EDUCATION'));
  t('  "' + head + '"', m.indexOf('Experience') === -1, JSON.stringify(m));
}

console.log('\nTHE OTHER THREE SECTIONS TOO');
for (const [head, name] of [['SUMMARY', 'Summary/Profile'], ['PROFESSIONAL SUMMARY', 'Summary/Profile'],
  ['PROFILE', 'Summary/Profile']]) {
  const m = missingOf(cvWith('PROFESSIONAL EXPERIENCE', 'TECHNICAL SKILLS', head, 'EDUCATION'));
  t('  "' + head + '"', m.indexOf(name) === -1, JSON.stringify(m));
}
for (const head of ['SKILLS', 'TECHNICAL SKILLS', 'TECHNICAL PROFICIENCIES', 'CORE COMPETENCIES']) {
  const m = missingOf(cvWith('PROFESSIONAL EXPERIENCE', head, 'PROFESSIONAL SUMMARY', 'EDUCATION'));
  t('  "' + head + '"', m.indexOf('Skills') === -1, JSON.stringify(m));
}

console.log('\nAND IT STILL DOES ITS JOB');
{
  // The check exists for a reason. A CV whose headings are invented
  // must still be caught, or removing the false alarm has just removed
  // the check.
  const bad = ['Max Okafor', 'Dublin, IE | maxokafordev@gmail.com', '',
    'MY BACKGROUND', 'Analyst.',
    'WHERE I HAVE WORKED',
    'Meta', 'Dublin, Ireland', 'Software Engineer', 'January 2023 - Present',
    '- Built backend services.',
    'THINGS I CAN DO', 'Python, SQL',
    'WHERE I STUDIED', 'Imperial College London'].join('\n');
  const m = missingOf(bad);
  t('  invented headings are reported', m.length >= 3, JSON.stringify(m));
  for (const name of ['Summary/Profile', 'Education', 'Skills']) {
    t('  ...including ' + name, m.indexOf(name) !== -1, JSON.stringify(m));
  }
  // Experience is no longer WARNED about here, because it is REPAIRED:
  // the role block under "WHERE I HAVE WORKED" is recognisable (title,
  // company, date), so ensureExperienceHeading inserts the canonical
  // heading and the roles actually parse. A fix beats a warning.
  const RA2 = global.RecruiterAudit;
  const o2 = RA2.runRecruiterAudit({ cvText: bad, jdText: 'x', jdTitle: 'Software Engineer',
    jobKeywords: [], experience: [] });
  t('  ...and Experience is repaired instead of reported',
    m.indexOf('Experience') === -1
      && /^PROFESSIONAL EXPERIENCE$/m.test(o2.cvText)
      && o2.report.fixes.some((f) => /PROFESSIONAL EXPERIENCE heading/.test(f)),
    JSON.stringify({ missing: m, fixes: o2.report.fixes.filter((f) => /heading/i.test(f)) }));
}
{
  // One missing section, three present: the report must name only the
  // one that is actually absent.
  const m = missingOf(['Max Okafor', 'Software Engineer', 'Dublin, IE | a@b.com', '',
    'PROFESSIONAL SUMMARY', 'Analyst.',
    'PROFESSIONAL EXPERIENCE', 'Meta', 'Dublin, Ireland', 'Software Engineer',
    'January 2023 - Present', '- Did the work.',
    'TECHNICAL SKILLS', 'Python, SQL'].join('\n'));
  t('  a CV with no education names exactly that',
    m.length === 1 && m[0] === 'Education', JSON.stringify(m));
}

console.log('\nAND THERE IS ONLY ONE LIST OF EXPERIENCE HEADINGS');
{
  // The whole point. A second copy is what drifted in the first place.
  const src = fs.readFileSync(path.join(DIR, 'recruiter-audit.js'), 'utf8');
  t('  the check is built from _EXP_HEAD, not a fresh pattern',
    /_EXP_HEAD_MULTILINE = new RegExp\(_EXP_HEAD\.source/.test(src)
      && /STANDARD_SECTION_HEADERS = \[\s*_EXP_HEAD_MULTILINE/.test(src),
    'a second experience-heading pattern has appeared again');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
