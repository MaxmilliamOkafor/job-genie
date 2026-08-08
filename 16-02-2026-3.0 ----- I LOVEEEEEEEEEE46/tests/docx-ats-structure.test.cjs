// THE STRUCTURAL RULES AN ATS PARSER DEPENDS ON.
//
// Asked whether the documents parse perfectly in an ATS. Section content
// is only half of it -- the other half is document STRUCTURE, and the
// features that break resume parsers are well known and few:
//
//   TABLES        cells are read in an order the parser chooses, not the
//                 order you laid out
//   TEXT BOXES    frequently skipped entirely -- text simply vanishes
//   COLUMNS       a two-column layout interleaves the two halves
//   HEADERS       many parsers never read header/footer parts, so a name
//   AND FOOTERS   and phone number placed there are lost
//   IMAGES        contribute no text at all
//   TABS          a delimiter parsers disagree about: some emit "\t",
//                 some drop it, welding the words on either side
//
// This asserts the generated CV and cover letter contain none of the
// first five, and that nothing welds where a tab IS used.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), os = require('os');
const cp = require('child_process'), Module = require('module');
const DIR = path.join(__dirname, '..');

global.window = global;
const load = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return m.exports;
};
const DGmod = load('docx-generator.js');
const DG = DGmod.DocxGenerator || DGmod;

const CV = [
  'Maxmilliam Okafor',
  'Dublin, Ireland | +353 87 000 0000 | maxokafordev@gmail.com | linkedin.com/in/maxokafor',
  '',
  'PROFESSIONAL SUMMARY',
  'Project manager with six years delivering Dynamics 365.',
  '',
  'CORE COMPETENCIES',
  'Stakeholder management, Azure DevOps, Agile delivery, Power BI, ERP migration',
  '',
  'WORK EXPERIENCE',
  'Northbound Technologies', 'Senior Project Manager', '01/2023 - Present',
  '- Delivered a D365 rollout across four regions.',
  '',
  'Acme Corp', 'Project Manager', '06/2019 - 12/2022',
  '- Ran the ERP migration.',
  '',
  'EDUCATION', 'Trinity College Dublin', 'BSc Computer Science', '2015 - 2019',
  '',
  'CERTIFICATIONS', 'PMP, Azure Fundamentals',
].join('\n');

const COVER = [
  'Maxmilliam Okafor',
  'Dublin, Ireland | maxokafordev@gmail.com',
  '',
  'Dear Hiring Manager,',
  '',
  'I am applying for the Project Manager role at Acme Corp.',
  '',
  'Kind regards,',
  'Maxmilliam Okafor',
].join('\n');

function unpack(base64, label) {
  // The label reaches a shell path, so anything but [a-z0-9] must go.
  const slug = String(label).replace(/[^a-z0-9]+/gi, '-');
  const tmp = path.join(os.tmpdir(), 'jg-struct-' + slug + '-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'd.docx'), Buffer.from(base64, 'base64'));
  cp.execSync(`cd ${tmp} && unzip -qo d.docx`);
  const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');
  const listing = cp.execSync(`cd ${tmp} && unzip -l d.docx`).toString();
  fs.rmSync(tmp, { recursive: true, force: true });
  return { xml, listing };
}

// Text runs only. <w:t[^>]*> also matches <w:tab .../> and <w:tabs>,
// which would put markup in the "text" and make every check meaningless.
const TEXT_RUN = '<w:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/w:t>';
// Tabs and text in document order, so a tab's two neighbours can be found.
// <w:tabs> declares the STOPS in the paragraph properties and is not a tab
// character; only the self-closing <w:tab/> inside a run is one.
const TOKENS = '(<w:tab\\s*\\/>)|' + TEXT_RUN;
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const paragraphs = (xml) => xml.split(/<w:p[ >]/).slice(1).map((p) => {
  const toks = [];
  const re = new RegExp(TOKENS, 'g');
  let m;
  while ((m = re.exec(p))) toks.push(m[1] ? { tab: true } : { text: unesc(m[2]) });
  return toks;
}).filter((toks) => toks.some((k) => k.text && k.text.trim()));

// A parser that drops <w:tab/> concatenates the runs on either side. That
// only welds if the join has no separator of its own -- so look AT THE
// JUNCTION, not at the line. Scanning a whole line for [a-z][A-Z] flags
// "Azure DevOps", a single run with no tab anywhere near it.
const tabWelds = (toks) => {
  for (let i = 0; i < toks.length; i++) {
    if (!toks[i].tab) continue;
    let before = '', after = '';
    for (let j = i - 1; j >= 0 && !before; j--) if (toks[j].text) before = toks[j].text;
    for (let j = i + 1; j < toks.length && !after; j++) if (toks[j].text) after = toks[j].text;
    if (!before || !after) continue;               // tab at an edge welds nothing
    const l = before.slice(-1), r = after.slice(0, 1);
    if (/[A-Za-z0-9]/.test(l) && /[A-Za-z0-9]/.test(r)) return before + '⮐' + after;
  }
  return null;
};
const lineOf = (toks) => toks.map((k) => k.text || '').join('').trim();

const docs = [
  ['CV', DG.fromCvText(CV, { name: 'cv', filename: 'cv.docx' })],
  ['cover letter', DG.fromCoverLetterText(COVER, { name: 'cl', filename: 'cl.docx' })],
];

for (const [label, built] of docs) {
  console.log('\n' + label.toUpperCase());
  t(label + ' generates', built.success === true, built.error);
  if (!built.success) continue;
  const { xml, listing } = unpack(built.base64, label);

  for (const [hazard, present, why] of [
    ['no tables', !/<w:tbl[ >]/.test(xml),
     'cells are read in an order the parser chooses'],
    ['no text boxes', !/<w:txbxContent|<v:textbox/.test(xml),
     'text boxes are frequently skipped entirely'],
    ['no multi-column section', !/<w:cols[^>]*w:num="[2-9]"/.test(xml),
     'columns interleave when flattened to text'],
    ['no images or drawings', !/<w:drawing|<w:pict/.test(xml),
     'images contribute no text'],
    ['no header part', !/word\/header\d*\.xml/.test(listing),
     'many parsers never read headers -- contact details there are lost'],
    ['no footer part', !/word\/footer\d*\.xml/.test(listing),
     'same for footers'],
  ]) t('  ' + label + ': ' + hazard, present, why);

  // Where a tab IS used -- the role line puts dates at a right stop --
  // dropping it must not weld the words on either side together.
  console.log('  ' + label + ': nothing welds when tabs are dropped');
  const paras = paragraphs(xml);
  t('    the document has paragraphs to check', paras.length > 3, String(paras.length));
  for (const toks of paras) {
    const weld = tabWelds(toks);
    t('    ' + JSON.stringify(lineOf(toks).slice(0, 52)), !weld,
      'two runs joined with no separator at the tab: ' + JSON.stringify(weld)
        + '\n              a parser that drops <w:tab/> reads that as one word');
  }
  // The guard on the guard: if no paragraph carried a tab, the loop above
  // asserted nothing. The role line uses a right stop for its dates.
  if (label === 'CV') {
    t('    a tab IS present, so the check above ran on something',
      paras.some((toks) => toks.some((k) => k.tab)),
      'no <w:tab/> anywhere -- the weld check is vacuous');
  }
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
