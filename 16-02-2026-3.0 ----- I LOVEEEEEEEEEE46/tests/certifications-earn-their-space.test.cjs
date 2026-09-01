// SIX CERTIFICATION LINES IS MOST OF AN INCH.
//
// Removed on request, to buy the page back -- but not blindly. When
// the POSTING mentions certification ("AWS Certified preferred",
// "relevant certifications a plus"), the section is a live matching
// criterion: a screener filtering on the cert finds it or filters you
// out. So the posting decides, exactly the way it already decides the
// mirrored vocabulary and the acronym pairs:
//
//   posting silent on certs  -> section removed, space reclaimed
//   posting mentions certs   -> section kept, and the report says why
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

const run = (jd, flags) => RA.runRecruiterAudit({
  cvText: CV, jdText: jd, jdTitle: 'Data Analyst', jobKeywords: ['SQL'],
  experience: [], flags: flags || {},
});

console.log('A POSTING THAT NEVER MENTIONS CERTIFICATION LOSES THE SECTION');
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

console.log('\nA POSTING THAT ASKS FOR CERTS KEEPS THE SECTION');
for (const jd of [
  'AWS Certified Solutions Architect preferred for this data role.',
  'Relevant certifications are a plus.',
  'The ideal candidate holds a cloud certification.',
]) {
  const o = run(jd);
  t('  kept for: "' + jd.slice(0, 40) + '..."',
    /^CERTIFICATIONS$/m.test(o.cvText) && /AWS Certified Machine Learning/.test(o.cvText),
    'the matching criterion was deleted');
}
{
  const o = run('Relevant certifications are a plus.');
  t('  ...and the report says why it stayed',
    o.report.fixes.some((f) => /Kept the CERTIFICATIONS section/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /CERTIF/i.test(f))));
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
