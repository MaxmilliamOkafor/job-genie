// ONE ENTRY HAS TO LOOK LIKE ONE ENTRY.
//
// A live OpenResume parse returned ONE education entry from two degrees
// and ONE project from three. The second degree and two of the projects
// were not dropped -- they were absorbed into the first entry's
// descriptions, which is worse, because the CV looks complete and the
// structured fields are wrong.
//
// The cause, measured off that parse's own text-item coordinates:
//
//   EDUCATION   14 units between lines INSIDE an entry, 17 between entries
//   PROJECTS    13-15 inside an entry, 13-14 between entries
//
// Projects had no gap difference at all. OpenResume splits subsections on
// round(prevY - y) exceeding a threshold, so with nothing to find it read
// each section as a single entry.
//
// A blank line in the CV text emitted no paragraph and no space, so the
// separation the text intended never reached the document. It does now.
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

const CV = ['Maxmilliam Okafor', 'a@b.com', '',
  'PROFESSIONAL EXPERIENCE', 'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Built pipelines on Kafka.', '',
  'PROJECTS',
  'SignalDesk, Market-Sentiment Engine', 'Python, Kafka, AWS', '- Streams live news.', '',
  'DriftGuard, Self-Healing MLOps', 'Python, MLflow, Docker', '- Watches for drift.', '',
  'LedgerLens, Credit-Risk API', 'Python, SHAP, FastAPI', '- Returns SHAP explanations.', '',
  'EDUCATION',
  'Master of Science in Artificial Intelligence - Distinction', 'Imperial College London', '',
  'Bachelor of Science in Computer Science - First Class Honours', 'University of Derby',
].join('\n');

const out = RA.runRecruiterAudit({ cvText: CV, jdText: 'x', jdTitle: 'Software Engineer', jobKeywords: [] });
const built = DG.fromCvText(out.cvText, { name: 'cv' });
t('the docx generates', built.success === true, built.error);

const tmp = path.join(os.tmpdir(), 'jg-gap-' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'd.docx'), Buffer.from(built.base64, 'base64'));
cp.execSync('cd ' + tmp + ' && unzip -qo d.docx');
const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');
fs.rmSync(tmp, { recursive: true, force: true });

const paras = xml.match(/<w:p>[\s\S]*?<\/w:p>/g) || [];
const find = (needle) => paras.filter((p) => {
  const txt = (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
    .map((x) => x.replace(/<[^>]+>/g, '')).join('');
  return txt.indexOf(needle) !== -1;
})[0] || '';
const before = (needle) => {
  const m = /w:before="(\d+)"/.exec(find(needle));
  return m ? parseInt(m[1], 10) : 0;
};

console.log('\nA NEW ENTRY GETS A GAP THE PARSER CAN SEE');
for (const [what, needle] of [
  ['the second project', 'DriftGuard'],
  ['the third project', 'LedgerLens'],
  ['the second degree', 'Bachelor of Science'],
]) {
  t('  ' + what + ' opens with a leading gap', before(needle) >= 150,
    'w:before=' + before(needle) + ' -- with no gap the parser folds it into the entry above');
}

console.log('\nBUT A LINE INSIDE AN ENTRY DOES NOT');
// The gap has to be a DIFFERENCE. Spacing every line equally restores the
// exact problem: nothing for the splitter to find.
for (const [what, needle] of [
  ['a project tech line', 'Python, MLflow, Docker'],
  ['an institution line', 'University of Derby'],
]) {
  t('  ' + what + ' has no leading gap', before(needle) < 150,
    'w:before=' + before(needle) + ' -- an even gap is the same as no gap');
}

console.log('\nAND THE GAP IS CLEARLY BIGGER THAN THE LINE ADVANCE');
{
  const entry = before('DriftGuard');
  // 11pt on top of a ~14pt advance roughly doubles it. Anything under
  // half the advance is inside the noise the parser already tolerates.
  t('  the added gap is at least half a line', entry >= 140,
    'added ' + entry + ' twips (' + (entry / 20) + 'pt) against a ~14pt advance');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
