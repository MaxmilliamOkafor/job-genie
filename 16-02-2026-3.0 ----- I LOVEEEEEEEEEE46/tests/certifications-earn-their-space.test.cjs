// THE SECTION COMES OUT. ALWAYS. UNLESS THE PROFILE SAYS KEEP IT.
//
// Removed on request, to buy the page back -- six certification lines
// is most of an inch.
//
// The first version of this file pinned a CONDITIONAL rule: keep the
// section whenever the posting mentioned certification, because there
// it is a live matching criterion. Nobody asked for that, and the
// result was reported as "certificates appear and disappear on random
// generation" -- which is exactly what it was, on a condition
// invisible to the person reading the output. A rule the user cannot
// see is not a feature.
//
// One switch decides now, and it is theirs.
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

const CV = ['Maxmilliam Okafor', 'Data Analyst', 'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Analyst with five years in data analysis.', '',
  'PROFESSIONAL EXPERIENCE', 'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
  '- Rebuilt the reporting suite in SQL.', '',
  'TECHNICAL SKILLS', 'Programming: SQL, Python', '',
  'CERTIFICATIONS',
  'AWS Certified Machine Learning - Specialty',
  'AWS Certified Solutions Architect - Professional',
  'Google Cloud Professional Machine Learning Engineer', '',
  'EDUCATION', 'MSc in Machine Learning, Distinction', 'Imperial College London'].join('\n');

const run = (jd, flags, visible) => RA.runRecruiterAudit({
  cvText: CV, jdText: jd, jdTitle: 'Data Analyst', jobKeywords: ['SQL'],
  experience: [], flags: flags || {}, certificationsVisible: visible === true,
});

console.log('THE SECTION IS REMOVED, WHATEVER THE POSTING SAYS');
{
  const o = run('We need a data analyst with SQL and Python for reporting work.');
  t('  the heading is gone', !/^CERTIFICATIONS$/m.test(o.cvText), 'still on the page');
  t('  and the cert lines with it', o.cvText.indexOf('AWS Certified') === -1,
    o.cvText.split('\n').filter((l) => /Certified/.test(l)).join(' / '));
  t('  the neighbours are intact',
    /^TECHNICAL SKILLS$/m.test(o.cvText) && /^EDUCATION$/m.test(o.cvText)
      && /Imperial College London/.test(o.cvText), 'a neighbour section was damaged');
  t('  with no triple blank left behind', !/\n\n\n\n/.test(o.cvText), 'a hole in the page');
  t('  and the removal is reported',
    o.report.fixes.some((f) => /Removed the CERTIFICATIONS section/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /CERTIF/i.test(f))));
}

console.log('\nEVEN ON A POSTING THAT ASKS FOR CERTIFICATIONS');
// This is the case that used to keep it, and the reason the output
// looked random. The posting no longer gets a vote.
for (const jd of [
  'AWS Certified Solutions Architect preferred for this data role.',
  'Relevant certifications are a plus.',
  'The ideal candidate holds a cloud certification.',
]) {
  const o = run(jd);
  t('  still removed for: "' + jd.slice(0, 38) + '..."',
    !/^CERTIFICATIONS$/m.test(o.cvText) && o.cvText.indexOf('AWS Certified') === -1,
    o.cvText.split('\n').filter((l) => /CERTIF|Certified/i.test(l)).join(' / '));
}

console.log('\nAND THE ONE SWITCH THAT KEEPS IT IS THE PROFILE\'S');
for (const jd of ['A data role with no mention of credentials.',
  'AWS Certified Solutions Architect preferred.']) {
  const o = run(jd, {}, true);
  t('  kept when the profile says so, JD irrelevant',
    /^CERTIFICATIONS$/m.test(o.cvText) && /AWS Certified Machine Learning/.test(o.cvText),
    'the profile switch was ignored');
  t('  ...and nothing is reported as removed',
    !o.report.fixes.some((f) => /Removed the CERTIFICATIONS/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /CERTIF/i.test(f))));
}

console.log('\nTHE SAME CV GIVES THE SAME ANSWER EVERY TIME');
{
  const outs = [
    'Analyst role.', 'Analyst role, AWS Certified preferred.',
    'Certifications a plus.', 'Nothing about credentials here.',
  ].map((jd) => /^CERTIFICATIONS$/m.test(run(jd).cvText));
  t('  four different postings, one outcome',
    outs.every((x) => x === false), JSON.stringify(outs));
}

console.log('\nAND THE EDGES HOLD');
{
  const noCerts = CV.replace(/CERTIFICATIONS[\s\S]*?\n\n(?=EDUCATION)/, '');
  const o = run.call(null, 'Plain analyst role.');
  const o2 = RA.runRecruiterAudit({ cvText: noCerts, jdText: 'Plain analyst role.',
    jdTitle: 'Data Analyst', jobKeywords: ['SQL'], experience: [] });
  t('  a CV with no section reports nothing',
    !o2.report.fixes.some((f) => /CERTIFICATIONS/.test(f)), JSON.stringify(o2.report.fixes.filter((f) => /CERT/i.test(f))));
  t('  the flag turns the whole pass off',
    /^CERTIFICATIONS$/m.test(run('Plain analyst role.', { certsOnlyWhenAsked: false }).cvText),
    'removed despite certsOnlyWhenAsked: false');
  const last = ['Maxmilliam Okafor', '', 'PROFESSIONAL EXPERIENCE', 'Citigroup', 'Data Analyst',
    'August 2017 - March 2021', '- Work.', '', 'CERTIFICATIONS', 'AWS Certified'].join('\n');
  const o3 = RA.runRecruiterAudit({ cvText: last, jdText: 'analyst', jdTitle: 'Data Analyst',
    jobKeywords: [], experience: [] });
  t('  a section at the end of the file is removed cleanly',
    o3.cvText.indexOf('AWS Certified') === -1 && /- Work\./.test(o3.cvText),
    JSON.stringify(o3.cvText.slice(-80)));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
