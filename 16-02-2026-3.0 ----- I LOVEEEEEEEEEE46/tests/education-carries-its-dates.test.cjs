// EDUCATION ENTRIES CARRY THEIR DATES.
//
// A live Workday parse of a generated CV returned `date: ""` for both
// education entries. Workday's education block has required From/To year
// fields and the enterprise tier broadly shares that shape, so every one
// of those applications was being hand-typed on a field the profile
// already knew the answer to.
//
// The cause is not the renderer. The model writes the education section
// and reliably emits degree and institution and reliably drops the year,
// so asking it more firmly is not a guarantee. Reading the date out of
// the structured profile and putting it back is -- the same pattern the
// SELECTED PROJECTS section already uses.
//
// The honesty constraint is unchanged: nothing is invented. A date is
// restored only when the profile carries one for an entry the CV already
// names, and an entry that already shows a year is left alone.
//
// Then the DOCX side. A date on its own line parses as a stray text item
// that binds to nothing, so education gets the same institution-and-date
// -on-one-line shape the experience block uses -- the layout the parse
// report specifically confirmed works, where the two stay separate text
// items and land in separate fields.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
const load = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return (m.exports && m.exports.DocxGenerator) || m.exports;
};
for (const f of ['content-quality-engine.js', 'recruiter-audit.js']) load(f);
const RA = global.RecruiterAudit;

// Exactly the section a real generated CV produced: degree, institution,
// no year anywhere.
const CV = ['Maxmilliam Okafor', '', 'PROFESSIONAL SUMMARY',
  'Software Engineer building streaming systems.', '',
  'PROFESSIONAL EXPERIENCE', 'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Built streaming pipelines on Kafka handling millions of events a day.', '',
  'EDUCATION',
  'Master of Science in Artificial Intelligence and Machine Learning - Distinction',
  'Imperial College London', '',
  'Bachelor of Science in Computer Science - First Class Honours',
  'University of Derby'].join('\n');

const PROFILE_EDU = [
  { degree: 'MSc Artificial Intelligence and Machine Learning',
    institution: 'Imperial College London', graduationDate: '2022' },
  { degree: 'BSc Computer Science', institution: 'University of Derby',
    startDate: '2016', endDate: '2019' },
];

const run = (cvText, education) => RA.runRecruiterAudit({
  cvText, jdText: 'software engineer', jdTitle: 'Software Engineer',
  jobKeywords: ['Kafka'], education,
});

console.log('THE DATES COME BACK FROM THE PROFILE');
{
  const out = run(CV, PROFILE_EDU);
  const edu = out.cvText.slice(out.cvText.indexOf('EDUCATION'));
  t('  the single graduation year lands under its institution',
    /Imperial College London\n2022/.test(edu), JSON.stringify(edu));
  t('  a start/end pair becomes a range with a plain hyphen',
    /University of Derby\n2016 - 2019/.test(edu), JSON.stringify(edu));
  t('  and it is reported as a fix',
    out.report.fixes.some((f) => /education: graduation date restored on 2/.test(f)),
    JSON.stringify(out.report.fixes));
  t('  the degree lines are untouched',
    /Master of Science in Artificial Intelligence and Machine Learning - Distinction/.test(edu)
      && /Bachelor of Science in Computer Science - First Class Honours/.test(edu), edu);
}

console.log('\nNOTHING IS INVENTED');
{
  // A profile entry with no date at all cannot produce one.
  const out = run(CV, [{ degree: 'MSc AI', institution: 'Imperial College London' }]);
  t('  an entry the profile cannot date is left undated',
    !/(19|20)\d{2}/.test(out.cvText.slice(out.cvText.indexOf('EDUCATION'))),
    out.cvText.slice(out.cvText.indexOf('EDUCATION')));
}
{
  // A profile school the CV never names must not have its date bolted
  // onto a different school's entry.
  const out = run(CV, [{ institution: 'Trinity College Dublin', graduationDate: '2015' }]);
  t('  a school the CV does not name contributes nothing',
    !/2015/.test(out.cvText), out.cvText.slice(out.cvText.indexOf('EDUCATION')));
}
{
  const out = run(CV, []);
  t('  no profile education means no change',
    out.cvText.indexOf('Imperial College London\n\n') !== -1
      || !/Imperial College London\n2/.test(out.cvText),
    out.cvText.slice(out.cvText.indexOf('EDUCATION')));
}

console.log('\nAN ENTRY THAT ALREADY HAS A DATE IS LEFT ALONE');
{
  const dated = CV.replace('Imperial College London', 'Imperial College London\n2021');
  const out = run(dated, PROFILE_EDU);
  t('  the year the CV already carries survives', /2021/.test(out.cvText), out.cvText);
  t('  and the profile year is not added alongside it',
    !/2022/.test(out.cvText.slice(out.cvText.indexOf('EDUCATION'))),
    out.cvText.slice(out.cvText.indexOf('EDUCATION')));
}
{
  // Some CVs put the year on the degree line itself.
  const inline = CV.replace('- Distinction', '- Distinction, 2022');
  const out = run(inline, PROFILE_EDU);
  const edu = out.cvText.slice(out.cvText.indexOf('EDUCATION'));
  t('  a year on the degree line counts as dated',
    (edu.match(/2022/g) || []).length === 1, edu);
}

console.log('\nAND NO OTHER SECTION IS TOUCHED');
{
  const out = run(CV, PROFILE_EDU);
  t('  the experience block is unchanged',
    /Meta\nSoftware Engineer\nJanuary 2023 - Present/.test(out.cvText),
    out.cvText.slice(0, 400));
  t('  the bullet survives verbatim',
    /Built streaming pipelines on Kafka handling millions of events a day\./.test(out.cvText),
    out.cvText);
}

console.log('\nTHE DOCX PUTS THE DATE ON THE ENTRY LINE, NOT ITS OWN');
// A date on its own line extracts as a stray text item that binds to
// nothing. The parse report confirmed the opposite shape works: an entry
// and its date on one line with a right tab stop stay two separate text
// items and land in two separate fields, which is what the experience
// block already does.
{
  const os = require('os'), cp = require('child_process');
  const DG = load('docx-generator.js');
  const out = run(CV, PROFILE_EDU);
  const built = DG.fromCvText(out.cvText, { name: 'cv', filename: 'cv.docx' });
  t('  the docx generates', built.success === true, built.error);
  const tmp = path.join(os.tmpdir(), 'jg-edu-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'd.docx'), Buffer.from(built.base64, 'base64'));
  cp.execSync('cd ' + tmp + ' && unzip -qo d.docx');
  const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });

  // The paragraph carrying the institution, isolated.
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
  const eduPara = paras.filter((p) => /Imperial College London/.test(p))[0] || '';
  t('  the institution and its date are one paragraph',
    /2022/.test(eduPara), eduPara.slice(0, 400));
  t('  separated by a tab, so they stay two text items',
    /<w:tab\/>/.test(eduPara), eduPara.slice(0, 400));
  t('  with a right tab stop, not padding',
    /<w:tab\b[^>]*w:val="right"/.test(eduPara) || /w:val="right"/.test(eduPara),
    eduPara.slice(0, 400));
  t('  and the date is not also emitted as a standalone paragraph',
    paras.filter((p) => /<w:t[^>]*>\s*2022\s*<\/w:t>/.test(p)
      && !/Imperial/.test(p)).length === 0,
    'a bare date paragraph binds to nothing');
  t('  the second entry gets the same treatment',
    (paras.filter((p) => /University of Derby/.test(p) && /2016 - 2019/.test(p))[0] || '')
      .indexOf('<w:tab/>') !== -1,
    JSON.stringify(paras.filter((p) => /University of Derby/.test(p))[0] || '').slice(0, 400));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
