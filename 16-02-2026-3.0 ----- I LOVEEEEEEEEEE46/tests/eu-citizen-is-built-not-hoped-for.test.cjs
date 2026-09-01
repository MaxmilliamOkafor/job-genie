// "LANGUAGES & CITIZENSHIP: PYTHON, SQL, JAVA" -- AND NO EU CITIZEN.
//
// Requested twice: EU Citizen bold in the skills section, where the
// screener hunting for the right-to-work answer actually looks. The
// first fix bolded the words wherever they appear -- and the model
// never wrote them. It borrowed the label for its programming list,
// and a rendering rule cannot bold text that does not exist.
//
// So the line is a GUARANTEE now, like projects and education dates:
//
//   - a programming list wearing the label is relabelled to
//     "Programming" (merged into an existing Programming line, so the
//     label never appears twice);
//   - the REAL line -- spoken languages plus the citizenship claim --
//     is built from the profile and placed first in the section;
//   - the claim falls back to the profile's own country: an EU home
//     country makes "EU Citizen" a fact, not an embellishment;
//   - the renderer's existing rule then bolds it on the page.
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

const LANGS = 'English (native), French (native), Spanish (advanced), German (advanced)';
const cvWith = (skillsLines) => ['Maxmilliam Okafor', 'Data Analyst',
  'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Analyst with five years in data analysis.', '',
  'PROFESSIONAL EXPERIENCE', 'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
  '- Rebuilt the reporting suite in SQL.', '',
  'TECHNICAL SKILLS', ...skillsLines, '',
  'EDUCATION', 'Imperial College London'].join('\n');

const run = (skillsLines, extra) => RA.runRecruiterAudit(Object.assign({
  cvText: cvWith(skillsLines), jdText: 'analyst', jdTitle: 'Data Analyst',
  jobKeywords: ['SQL'], experience: [],
  languages: LANGS, profileLocation: 'Dublin, Ireland',
}, extra || {}));

console.log('THE MISLABELLED LINE IS RELABELLED, AND THE REAL ONE IS BUILT');
{
  const o = run(['Languages & Citizenship: Python, SQL, Java, TypeScript, C++',
    'Cloud & DevOps: AWS, Docker']);
  const lines = o.cvText.split('\n');
  const at = lines.findIndex((l) => l.trim() === 'TECHNICAL SKILLS');
  t('  the first skills line is the real Languages & Citizenship',
    /^Languages & Citizenship: English \(native\), French \(native\), Spanish \(advanced\), German \(advanced\) - EU Citizen$/.test(lines[at + 1]),
    JSON.stringify(lines[at + 1]));
  t('  the programming list is relabelled Programming',
    lines.slice(at, at + 5).some((l) => /^Programming: Python, SQL, Java, TypeScript, C\+\+$/.test(l)),
    JSON.stringify(lines.slice(at, at + 5)));
  t('  no programming term is left under the citizenship label',
    !o.cvText.split('\n').some((l) => /^Languages & Citizenship:.*Python/.test(l)),
    'the mislabel survived');
  t('  and both repairs are reported',
    o.report.fixes.some((f) => /Languages & Citizenship: relabelled.*and put the real line/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /Citizenship/i.test(f))));
}

console.log('\nAND MERGED WHEN A PROGRAMMING LINE ALREADY EXISTS');
{
  const o = run(['Programming: Go, Scala', 'Languages & Citizenship: Python, SQL, Java']);
  const progLines = o.cvText.split('\n').filter((l) => /^Programming:/.test(l));
  t('  one Programming line, not two', progLines.length === 1, JSON.stringify(progLines));
  t('  carrying both sets', /Go, Scala, Python, SQL, Java/.test(progLines[0] || ''),
    JSON.stringify(progLines[0]));
}

console.log('\nTHE CLAIM COMES FROM THE PROFILE, NOT FROM HOPE');
{
  const o = run(['Programming: Python, SQL'], { languages: '', profileLocation: 'Dublin, IE' });
  t('  an EU country code alone still yields the claim',
    /^Citizenship: EU Citizen$/m.test(o.cvText), o.cvText.split('\n').find((l) => /Citizen/.test(l)) || 'nothing');
}
{
  const o = run(['Programming: Python, SQL'], { languages: '', profileLocation: 'Austin, United States' });
  t('  a non-EU country claims nothing', !/EU Citizen/.test(o.cvText),
    o.cvText.split('\n').find((l) => /Citizen/.test(l)));
}
{
  const o = run(['Programming: Python, SQL'],
    { languages: '', profileLocation: 'London, United Kingdom', citizenship: 'Right to Work in the UK' });
  t('  an explicit claim from the profile wins as stated',
    /Citizenship: Right to Work in the UK/.test(o.cvText),
    o.cvText.split('\n').find((l) => /Citizen|Right/.test(l)));
}

console.log('\nAND IT NEVER DOUBLES UP');
{
  const genuine = 'Languages & Citizenship: ' + LANGS + ' - EU Citizen';
  const o = run([genuine, 'Programming: Python, SQL']);
  t('  a correct line already present is left alone',
    o.cvText.split('\n').filter((l) => /Languages & Citizenship:/.test(l)).length === 1
      && o.cvText.indexOf(genuine) !== -1,
    JSON.stringify(o.cvText.split('\n').filter((l) => /Citizenship/.test(l))));
}
{
  const o = run(['Languages & Citizenship: ' + LANGS, 'Programming: Python, SQL']);
  const line = o.cvText.split('\n').find((l) => /^Languages & Citizenship:/.test(l)) || '';
  t('  a genuine line missing only the claim gains it',
    / - EU Citizen$/.test(line)
      && o.cvText.split('\n').filter((l) => /Languages & Citizenship:/.test(l)).length === 1,
    JSON.stringify(line));
}

console.log('\nAND THE RENDERED DOCX CARRIES IT BOLD');
{
  const o = run(['Languages & Citizenship: Python, SQL, Java', 'Cloud & DevOps: AWS, Docker']);
  const G = global.DocxGenerator;
  const built = G.fromCvText(o.cvText, {});
  const os = require('os'), cp = require('child_process');
  const tmp = path.join(os.tmpdir(), 'jg-euc-' + Date.now() + '.docx');
  fs.writeFileSync(tmp, Buffer.from(built.base64, 'base64'));
  const xml = cp.execSync('python3 -c ' + JSON.stringify(
    'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
  ) + ' ' + JSON.stringify(tmp)).toString();
  fs.unlinkSync(tmp);
  const eu = [...xml.matchAll(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)]
    .map((m) => ({ txt: [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join(''), bold: /<w:b\/>/.test(m[0]) }))
    .find((r) => r.txt === 'EU Citizen');
  t('  "EU Citizen" is a bold run on the page', !!eu && eu.bold, JSON.stringify(eu));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
