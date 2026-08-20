// EVERY PROJECT IN THE SECTION HAS THE SAME SHAPE.
//
// From a live ATS audit: "one project used a different layout to its two
// siblings and was absorbed into the previous entry and lost." A
// feature-scoring parser segments a section by the shape of its entries,
// so the odd one out reads as a continuation of the entry above it.
//
// It was in the CV that shipped. SignalDesk and LedgerLens had their
// tech stack tab-joined to the title; DriftGuard had it on a line of its
// own. Two rules disagreed about the same line:
//
//   a stack line was "a comma list of at most 60 characters"
//   a pair was tab-joined when title + stack came to 96 or less
//
// DriftGuard's stack is 61 characters. It therefore failed to be a stack
// at all, fell through to the ordinary body branch, and printed on its
// own line -- while its 46-character siblings sat beside their titles.
// Neither number was wrong; asking two questions with one of them was.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), os = require('os');
const cp = require('child_process'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
const DG = (() => {
  const file = path.join(DIR, 'docx-generator.js');
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return (m.exports && m.exports.DocxGenerator) || m.exports;
})();

const cvWith = (projects) => ['Maxmilliam Okafor', 'Dublin | max@x.com', '',
  'PROJECTS',
  ...projects.flatMap(([title, stack], i) => [title, stack,
    '- Did a thing worth reading about.',
    'Live demo: x.github.io/p' + i + ' | Code: github.com/x/p' + i, '']),
  'EDUCATION', 'Imperial College London'].join('\n');

const paragraphsOf = (cvText) => {
  const built = DG.fromCvText(cvText, { name: 'cv' });
  if (!built || !built.success) return null;
  const tmp = path.join(os.tmpdir(), 'jg-proj-' + Date.now() + Math.random().toString(36).slice(2));
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'd.docx'), Buffer.from(built.base64, 'base64'));
  cp.execSync('cd ' + tmp + ' && unzip -qo d.docx');
  const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  return (xml.match(/<w:p>[\s\S]*?<\/w:p>/g) || []).map((p) => ({
    xml: p,
    text: (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map((x) => x.replace(/<[^>]+>/g, '')).join('').replace(/&amp;/g, '&').trim(),
    tabbed: /<w:tab\/>/.test(p),
  }));
};

// The three from the CV that shipped, with their real lengths.
const REAL = [
  ['SignalDesk, Real-Time Market-Sentiment Engine', 'Python, LLMs (RAG), Kafka, FastAPI, React, AWS'],
  ['DriftGuard, Self-Healing MLOps Platform', 'Python, MLflow, Evidently, Docker, Kubernetes, GitHub Actions'],
  ['LedgerLens, Explainable Credit-Risk Scoring API', 'Python, XGBoost, SHAP, FastAPI, Fairlearn, Docker'],
];
const SHORT = [
  ['SignalDesk, Sentiment Engine', 'Python, Kafka, AWS'],
  ['DriftGuard, MLOps Platform', 'Python, Docker, MLflow'],
  ['LedgerLens, Credit-Risk API', 'Python, SHAP, FastAPI'],
];

const titlesOf = (paras) => paras.filter((p) => /SignalDesk|DriftGuard|LedgerLens/.test(p.text));

console.log('THE THREE FROM THE CV THAT SHIPPED');
{
  const paras = paragraphsOf(cvWith(REAL));
  t('  the docx generates', !!paras, 'generation failed');
  const titles = titlesOf(paras);
  t('  all three projects are present', titles.length === 3,
    JSON.stringify(titles.map((p) => p.text)));
  t('  and every one has the same shape',
    new Set(titles.map((p) => p.tabbed)).size === 1,
    JSON.stringify(titles.map((p) => [p.text.slice(0, 24), p.tabbed])));
  // The long one cannot share its line, so none of them do.
  t('  ...which here is title and stack on separate lines',
    titles.every((p) => !p.tabbed), 'one pair does not fit, so none may be joined');
  t('  the stacks are all still on the page',
    ['React, AWS', 'GitHub Actions', 'Fairlearn'].every((s) => paras.some((p) => p.text.includes(s))),
    'a tech stack was dropped rather than moved');
}

console.log('\nAND WHEN THEY ALL FIT, THEY ALL SHARE THE LINE');
{
  const paras = paragraphsOf(cvWith(SHORT));
  const titles = titlesOf(paras);
  t('  all three are tab-joined', titles.length === 3 && titles.every((p) => p.tabbed),
    JSON.stringify(titles.map((p) => [p.text, p.tabbed])));
  t('  which is one line per project, not two',
    !paras.some((p) => /^(Python, Kafka, AWS|Python, Docker, MLflow|Python, SHAP, FastAPI)$/.test(p.text)),
    'a stack was emitted as a paragraph of its own');
}

console.log('\nONE LONG STACK IS ENOUGH TO CHANGE THE WHOLE SECTION');
// The rule is all-or-nothing on purpose: a section of three where two
// are joined is the defect, whichever way round it falls.
{
  const mixed = [SHORT[0], REAL[1], SHORT[2]];
  const titles = titlesOf(paragraphsOf(cvWith(mixed)));
  t('  a single oversized pair unjoins its siblings',
    titles.length === 3 && titles.every((p) => !p.tabbed),
    JSON.stringify(titles.map((p) => [p.text.slice(0, 24), p.tabbed])));
}

console.log('\nAND A SECTION WITH NO STACKS AT ALL IS UNTOUCHED');
{
  const noStacks = ['Maxmilliam Okafor', 'Dublin | max@x.com', '', 'PROJECTS',
    'SignalDesk', '- Streams live financial news.', 'Live demo: x.github.io/a', '',
    'DriftGuard', '- Watches a model for drift.', 'Live demo: x.github.io/b', '',
    'EDUCATION', 'Imperial College London'].join('\n');
  const paras = paragraphsOf(noStacks);
  t('  both titles print', titlesOf(paras).length === 2,
    JSON.stringify(paras.map((p) => p.text)));
  t('  and neither is tab-joined to a bullet',
    titlesOf(paras).every((p) => !p.tabbed), 'a description was pulled onto the title line');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
