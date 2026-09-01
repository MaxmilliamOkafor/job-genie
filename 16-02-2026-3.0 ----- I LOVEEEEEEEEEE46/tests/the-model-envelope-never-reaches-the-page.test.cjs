// A GENERATED CV WENT OUT WITH "{" AS THE CANDIDATE'S NAME.
//
// Uploaded back with "what is this nonsense": the name line was "{",
// the headline was '"tailoredResume": "Maxmilliam Okafor', every role
// was plain unbolded text, and the projects were gone. One root cause:
// the model wrapped its answer in the JSON the server asked for, wrote
// LITERAL newlines inside the quoted value (which JSON forbids), the
// upstream parse failed, and the raw envelope rendered as the CV.
//
// The cascade is the instructive part. That text had no PROFESSIONAL
// EXPERIENCE heading and listed each role as TITLE / company / date in
// shouted caps -- so the renderer recognised no role at all, and every
// audit guarantee that walks roles (the held-title headline, the years
// guard, the location attach) found nothing to walk.
//
// Three repairs, run before everything else in the audit:
//   1. stripJsonEnvelope -- layered: real JSON.parse, then tolerant
//      extraction for the "JSON" a model actually writes.
//   2. ensureExperienceHeading -- an unlabelled role block after the
//      summary gets the heading everything downstream keys on.
//   3. repairRoleHeaders -- title-first headers swapped to company-
//      first and shouted titles folded to title case, matched against
//      the PROFILE's own company names, never a guess.
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

// The uploaded document's shape, reconstructed.
const CV_BODY = ['Maxmilliam Okafor', 'Oracle EBS Business Analyst',
  'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY',
  'Accomplished Software Engineer with over 10 years of experience in developing technical solutions.',
  'SOFTWARE ENGINEER', 'Meta', 'January 2023 - Present',
  '- Build and own backend services written in Python and C++ for the ads delivery platform.',
  'DATA ANALYST', 'Citigroup', 'August 2017 - March 2021',
  '- Rebuilt the credit risk reporting suite in SQL and Python.',
  'TECHNICAL SKILLS', 'Programming: Python, SQL',
  'EDUCATION', 'Master of Science in Machine Learning - Distinction', 'Imperial College London'];
const RAW = ['{', '"tailoredResume": "' + CV_BODY[0], ...CV_BODY.slice(1), '",',
  '"tailoredCoverLetter": "Dear Hiring Manager, I am writing to apply."', '}'].join('\n');

const EXPERIENCE = [
  { company: 'Meta', title: 'Software Engineer', location: 'Dublin, Ireland' },
  { company: 'Citigroup', title: 'Data Analyst', location: 'London, United Kingdom' },
];

console.log('THE ENVELOPE IS STRIPPED, HOWEVER BROKEN THE JSON IS');
{
  const o = RA.stripJsonEnvelope(RAW);
  t('  literal-newline "JSON" unwraps', o.stripped === true, 'not recognised');
  t('  the text now starts with the name',
    o.text.indexOf('Maxmilliam Okafor') === 0, JSON.stringify(o.text.slice(0, 60)));
  t('  and carries no JSON syntax',
    o.text.indexOf('tailoredResume') === -1 && o.text.indexOf('{') === -1
      && o.text.indexOf('tailoredCoverLetter') === -1,
    o.text.split('\n').filter((l) => /[{}"]/.test(l)).slice(0, 3).join(' / '));
}
{
  const valid = JSON.stringify({ tailoredResume: CV_BODY.join('\n') });
  const o = RA.stripJsonEnvelope(valid);
  t('  VALID JSON unwraps too', o.stripped && o.text.indexOf('Maxmilliam Okafor') === 0,
    JSON.stringify(o.text.slice(0, 40)));
}
{
  const o = RA.stripJsonEnvelope('```json\n' + JSON.stringify({ tailoredResume: 'Maxmilliam Okafor\nCV text here' }) + '\n```');
  t('  a fenced block unwraps', o.stripped && o.text.indexOf('Maxmilliam') === 0, o.text.slice(0, 40));
}
{
  const plain = CV_BODY.join('\n');
  const o = RA.stripJsonEnvelope(plain);
  t('  a plain CV passes through untouched', !o.stripped && o.text === plain, 'a clean CV was rewritten');
}

console.log('\nTHE MISSING HEADING IS INSERTED WHERE THE ROLES START');
{
  const o = RA.ensureExperienceHeading(CV_BODY.join('\n'));
  t('  it is added', o.added === true, 'no heading inserted');
  const lines = o.text.split('\n');
  const at = lines.indexOf('PROFESSIONAL EXPERIENCE');
  t('  directly above the first role, not above the summary',
    at !== -1 && lines[at + 1] === 'SOFTWARE ENGINEER'
      && /Accomplished/.test(lines[at - 1]), JSON.stringify(lines.slice(at - 1, at + 2)));
  t('  a CV that already has one is untouched',
    !RA.ensureExperienceHeading(o.text).added, 'inserted twice');
}
{
  // Education's date range must not read as an unlabelled role.
  const edu = ['Maxmilliam Okafor', '', 'EDUCATION',
    'Master of Science', 'Imperial College London', '2013 - 2017'].join('\n');
  t('  education dates do not conjure an experience section',
    !RA.ensureExperienceHeading(edu).added, RA.ensureExperienceHeading(edu).text);
}

console.log('\nTITLE-FIRST ROLE HEADERS ARE PUT COMPANY-FIRST, AGAINST THE PROFILE');
{
  const withHead = RA.ensureExperienceHeading(CV_BODY.join('\n')).text;
  const o = RA.repairRoleHeaders(withHead, EXPERIENCE);
  t('  both roles are swapped', o.swapped === 2, 'swapped=' + o.swapped);
  const lines = o.text.split('\n');
  const meta = lines.indexOf('Meta');
  t('  Meta sits above its title, above its date',
    meta !== -1 && /Software Engineer/i.test(lines[meta + 1])
      && /January 2023/.test(lines[meta + 2]), JSON.stringify(lines.slice(meta, meta + 3)));
  t('  and the shouted titles are folded to title case',
    o.deshouted === 2 && o.text.indexOf('SOFTWARE ENGINEER') === -1
      && o.text.indexOf('Software Engineer') !== -1
      && o.text.indexOf('Data Analyst') !== -1, JSON.stringify({ d: o.deshouted }));
  t('  with no profile to check against, nothing is swapped',
    RA.repairRoleHeaders(withHead, []).swapped === 0, 'a guess was made');
}

console.log('\nAND THE FULL AUDIT TURNS THE UPLOADED MESS INTO A CV');
{
  const o = RA.runRecruiterAudit({
    cvText: RAW,
    coverLetterText: '{ "tailoredCoverLetter": "Dear Hiring Manager, I am writing to apply." }',
    jdText: 'Oracle EBS Business Analyst role in Dublin', jdTitle: 'Oracle EBS Business Analyst',
    jobKeywords: ['SQL'], experience: EXPERIENCE,
    profileLocation: 'Dublin, Ireland',
  });
  const lines = o.cvText.split('\n').filter((l) => l.trim());
  t('  the first line is the name, not a brace',
    lines[0] === 'Maxmilliam Okafor', JSON.stringify(lines[0]));
  t('  PROFESSIONAL EXPERIENCE exists',
    /^PROFESSIONAL EXPERIENCE$/m.test(o.cvText), 'still no heading');
  // Inside the experience section -- the headline under the name is
  // legitimately "Software Engineer" too, replaced there because the
  // posting's title is not a title the history contains.
  const expAt = o.cvText.indexOf('PROFESSIONAL EXPERIENCE');
  const exp = o.cvText.slice(expAt);
  t('  companies sit above their titles',
    exp.indexOf('Meta') !== -1 && exp.indexOf('Meta') < exp.indexOf('Software Engineer'),
    exp.split('\n').slice(0, 6).join(' / '));
  t('  the unheld posting title is replaced by a held one under the name',
    o.report.fixes.some((f) => /headline/i.test(f) && /Oracle EBS/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /headline/i.test(f))));
  t('  no JSON syntax reaches the page',
    o.cvText.indexOf('tailoredResume') === -1 && !/^\s*[{}]\s*$/m.test(o.cvText),
    o.cvText.split('\n').filter((l) => /tailoredResume|^[{}]$/.test(l.trim())).join(' / '));
  t('  the cover letter is unwrapped too',
    o.coverLetterText.indexOf('Dear Hiring Manager') !== -1
      && o.coverLetterText.indexOf('tailoredCoverLetter') === -1,
    JSON.stringify(o.coverLetterText.slice(0, 60)));
  t('  and the fixes say what happened',
    o.report.fixes.some((f) => /PROFESSIONAL EXPERIENCE heading/.test(f))
      && o.report.fixes.some((f) => /Role headers:/.test(f)),
    JSON.stringify(o.report.fixes.slice(0, 6)));
  t('  a missing projects section is explained, not silent',
    o.report.warnings.some((w) => w.kind === 'no-projects-anywhere'),
    JSON.stringify(o.report.warnings.map((w) => w.kind)));
}

console.log('\nAND POPUP.JS STRIPS THE SAME HEAD AT THE SOURCE');
{
  const src = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');
  const lift = (signature, name) => {
    const start = src.indexOf(signature);
    if (start === -1) return null;
    let d = 0, end = -1;
    for (let i = start + signature.length - 1; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) { end = i + 1; break; } }
    }
    const body = src.slice(start, end).replace(/^\s*[A-Za-z_]+/, 'function ' + name);
    return new Function('return (' + body + ')')();
  };
  const norm = lift('  normalizeDocumentText(rawDoc, type) {', 'norm');
  t('  normalizeDocumentText lifts', !!norm, 'method not found');
  if (norm) {
    const out = norm(RAW, 'cv');
    t('  the head of the envelope is stripped',
      out.indexOf('Maxmilliam Okafor') === 0, JSON.stringify(out.slice(0, 60)));
    t('  ...and the tail', out.indexOf('tailoredCoverLetter') === -1
      && !/[}"]\s*$/.test(out), JSON.stringify(out.slice(-40)));
    const plain = CV_BODY.join('\n');
    t('  a plain document is untouched', norm(plain, 'cv') === plain, 'clean text rewritten');
  }
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
