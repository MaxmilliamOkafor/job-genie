// ONE SKILLS SECTION, AND THE PANEL SHOWS THE DOCUMENT THAT IS SENT.
//
// A live parse of a real generated CV came back with the competencies
// EMPTY. Nothing was wrong with the words: a parser finds the skills
// section by searching headings for "skill" -- OpenResume's lookup is
// literally `["skill"]` -- and "CORE COMPETENCIES" contains no such
// word. Eight tailored, job-matched keyword phrases sitting in the
// six-second scan zone were never indexed as skills at all.
//
// Renaming that heading alone makes it worse, which is the part worth
// remembering. The lookup returns the FIRST heading that matches and
// stops, so a CV with "CORE SKILLS" up top and "TECHNICAL SKILLS" lower
// down loses the second one instead: the same bug, pointed the other
// way. One section is the only shape with no losing case.
//
// The second half of this file is about a subtler version of the same
// problem. The merge, the section order and the canonical headings were
// all decided inside the DOCX generator, on the way to the file, so the
// panel previewed the model's raw output while the attachment went out
// reordered, renamed and merged. Two documents, and the one that
// reached an employer was the one nobody had read.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), os = require('os');
const cp = require('child_process'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
const load = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return (m.exports && m.exports.DocxGenerator) || m.exports;
};
const DG = load('docx-generator.js');
load('content-quality-engine.js');
load('recruiter-audit.js');
const RA = global.RecruiterAudit;

const CV = ['Maxmilliam Okafor', 'Dublin, Ireland | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Engineer.', '',
  'CORE COMPETENCIES',
  'Machine Learning, MLOps, Data Engineering, Cloud Architecture, Stakeholder Management', '',
  'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Built streaming pipelines on Kafka.', '',
  'EDUCATION', 'MSc Artificial Intelligence', 'Imperial College London', '',
  'TECHNICAL SKILLS',
  'Python, SQL, mlops, Kubernetes, Terraform, Airflow'].join('\n');

const audited = RA.runRecruiterAudit({
  cvText: CV, jdText: 'kafka kubernetes', jdTitle: 'Software Engineer',
  jobKeywords: ['Kafka', 'Kubernetes'],
});

// ---- what the file says ---------------------------------------------
const built = DG.fromCvText(audited.cvText, { name: 'cv' });
t('the docx generates', built.success === true, built.error);

const tmp = path.join(os.tmpdir(), 'jg-skills-' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'd.docx'), Buffer.from(built.base64, 'base64'));
cp.execSync('cd ' + tmp + ' && unzip -qo d.docx');
const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');
fs.rmSync(tmp, { recursive: true, force: true });

const paras = (xml.match(/<w:p>[\s\S]*?<\/w:p>/g) || []).map((p) =>
  (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
    .map((x) => x.replace(/<[^>]+>/g, '')).join('').replace(/&amp;/g, '&').trim())
  .filter((l) => l);

console.log('A PARSER FINDS EXACTLY ONE SKILLS SECTION');
const headings = paras.filter((l) => /^[A-Z][A-Z &/]{3,}$/.test(l));
const skillHeads = headings.filter((h) => /SKILL/.test(h));
t('  one heading contains the word a parser looks for',
  skillHeads.length === 1, JSON.stringify(headings));
t('  and it is the conventional wording',
  skillHeads[0] === 'TECHNICAL SKILLS', JSON.stringify(skillHeads));
t('  the competencies wording is gone from the document',
  !paras.some((l) => /CORE COMPETENCIES/i.test(l)),
  'a section a parser cannot find is still carrying keywords');

console.log('\nAND NOTHING WAS LOST TO THE MERGE');
const skillsIdx = paras.indexOf('TECHNICAL SKILLS');
const nextHeadIdx = paras.findIndex((l, i) => i > skillsIdx && /^[A-Z][A-Z &/]{3,}$/.test(l));
const items = paras.slice(skillsIdx + 1, nextHeadIdx === -1 ? paras.length : nextHeadIdx)
  .join(' ').split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
for (const term of ['Machine Learning', 'MLOps', 'Data Engineering', 'Cloud Architecture',
  'Stakeholder Management', 'Python', 'SQL', 'Kubernetes', 'Terraform', 'Airflow']) {
  t('  "' + term + '" is recoverable as its own item', items.includes(term),
    JSON.stringify(items));
}
t('  the competencies lead, where a recruiter scans',
  items[0] === 'Machine Learning', JSON.stringify(items.slice(0, 3)));
t('  "mlops" is folded into "MLOps" rather than listed beside it',
  items.filter((s) => /^mlops$/i.test(s)).length === 1, JSON.stringify(items));

console.log('\nAND IT SITS IN THE SCAN ZONE, NOT BELOW THE HISTORY');
t('  under the summary', paras.indexOf('PROFESSIONAL SUMMARY') < skillsIdx,
  JSON.stringify(headings));
t('  above the experience', skillsIdx < paras.indexOf('PROFESSIONAL EXPERIENCE'),
  JSON.stringify(headings));
t('  education is still last', headings[headings.length - 1] === 'EDUCATION',
  JSON.stringify(headings));

console.log('\nTHE PREVIEWED TEXT IS THE DOCUMENT THAT GETS SENT');
// The audit returns the text the panel renders and the text the DOCX is
// built from. If the generator still has reordering left to do when it
// receives that text, the user was shown something else.
t('  the generator finds nothing left to change',
  DG.normalizeSections(audited.cvText) === audited.cvText,
  'the file will not match the preview');
const previewHeads = audited.cvText.split('\n').map((l) => l.trim())
  .filter((l) => /^[A-Z][A-Z &/]{3,}$/.test(l));
t('  the preview shows the same headings, in the same order',
  previewHeads.join(' -> ') === headings.join(' -> '),
  previewHeads.join(' -> ') + '   vs   ' + headings.join(' -> '));

// Running it twice must not shuffle anything: the audit normalises, then
// the generator normalises again on its way to the file.
t('  and normalising twice changes nothing',
  DG.normalizeSections(DG.normalizeSections(CV)) === DG.normalizeSections(CV),
  'the pass is not idempotent, so preview and file can disagree');

console.log('\nA CV WITH ONLY ONE OF THE TWO IS LEFT ALONE');
{
  const only = ['Max Okafor', 'a@b.com', '', 'PROFESSIONAL SUMMARY', 'Engineer.', '',
    'TECHNICAL SKILLS', 'Python, SQL', '',
    'PROFESSIONAL EXPERIENCE', 'Meta', 'Engineer', 'January 2023 - Present',
    '- Did work.', '', 'EDUCATION', 'Imperial College London'].join('\n');
  const outText = DG.normalizeSections(only);
  t('  its single skills section survives intact',
    /TECHNICAL SKILLS\nPython, SQL/.test(outText), JSON.stringify(outText));
  t('  and no second one is invented',
    (outText.match(/SKILLS/g) || []).length === 1, JSON.stringify(outText));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
