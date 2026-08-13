// CORE COMPETENCIES MUST SURVIVE TEXT EXTRACTION.
//
// Reported: the section looks messy on a phone, and it has to be
// parseable by every ATS. Those are the same bug.
//
// It was rendered as a three-column grid: in the DOCX, one paragraph per
// row with TAB characters between items; in the PDF, doc.text() at fixed
// x offsets with nothing constraining an item to its column.
//
//   ON A PHONE the columns cannot reflow -- the tab stops and the x
//   offsets are absolute positions measured for A4 -- so items overflow
//   and, in the PDF, overprint the item beside them.
//
//   TO AN ATS the delimiter is lost. Parsers disagree about <w:tab/>:
//   some emit "\t", some drop it, and when it is dropped three skills
//   weld into one unmatchable phrase. A PDF has no columns at all, only
//   glyphs at coordinates, so extractors rebuild lines by vertical
//   position and a three-up grid comes out as each ROW run together.
//
// This generates a real .docx, unzips it, and reads the text out the way
// a parser does -- one line per <w:p> -- rather than trusting the markup
// to look right.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), os = require('os');
const cp = require('child_process');
const Module = require('module');
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

const COMPETENCIES = [
  'Stakeholder management',
  'Azure DevOps',
  'Agile delivery',
  'Microsoft Dynamics 365 Finance and Operations',   // long: used to overflow
  'Budgeting',
  'Power BI',
  'ERP migration',
];

const CV = [
  'Maxmilliam Okafor',
  'Dublin  |  +353 87 000 0000  |  maxokafordev@gmail.com',
  '',
  'CORE COMPETENCIES',
  COMPETENCIES.join(', '),
  '',
  'WORK EXPERIENCE',
  'Northbound',
  'Project Manager',
  '01/2023 - Present',
  '- Delivered a D365 rollout across four regions.',
  '',
].join('\n');

const built = DG.fromCvText(CV, { name: 'cv', filename: 'cv.docx' });
t('the CV generates', built.success === true, built.error);

// ---- read it back the way a parser does ------------------------------
const tmp = path.join(os.tmpdir(), 'jg-comp-' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
const docx = path.join(tmp, 'cv.docx');
fs.writeFileSync(docx, Buffer.from(built.base64, 'base64'));
cp.execSync(`cd ${tmp} && unzip -qo cv.docx`);
const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');

// Text runs only. <w:t[^>]*> is WRONG here: it also matches <w:tab ... />
// and <w:tabs>, so a paragraph carrying tab stops (the role line has a
// right stop for its dates) leaks raw XML into the extracted text and the
// assertions below would be reading markup rather than content.
// Requiring whitespace after <w:t excludes <w:tab> and <w:tabs> while
// still accepting <w:t> and <w:t xml:space="preserve">.
const TEXT_RUN = '<w:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/w:t>';
const paragraphs = xml.split(/<w:p[ >]/).slice(1);
const extract2 = (keepTabs) => paragraphs.map((p) => {
  const parts = [];
  const re = new RegExp((keepTabs ? '<w:tab\\s*\\/>|' : '') + TEXT_RUN, 'g');
  let m;
  while ((m = re.exec(p))) parts.push(m[1] === undefined ? '\t' : m[1]);
  return parts.join('').replace(/&amp;/g, '&').trim();
}).filter((l) => l.length);

// The charitable reading: tabs preserved as \t.
const linesKeepingTabs = extract2(true);
// And the reading several parsers actually apply -- tabs dropped, which
// is what welded skills together.
const linesDroppingTabs = extract2(false);

// The extractor itself has to be trustworthy, or every assertion below is
// measuring the wrong thing.
t('the extractor returns text, not markup',
  !linesKeepingTabs.some((l) => /<w:|w:val=|w:pos=/.test(l)),
  'raw XML leaked into the extracted text: '
    + JSON.stringify(linesKeepingTabs.filter((l) => /<w:/.test(l)).slice(0, 1)));

const compIndex = linesKeepingTabs.findIndex((l) => /^CORE COMPETENCIES$/i.test(l));
t('the section header survives', compIndex !== -1, JSON.stringify(linesKeepingTabs.slice(0, 6)));

const after = linesKeepingTabs.slice(compIndex + 1, compIndex + 1 + COMPETENCIES.length + 2);

console.log('\nNO TABS ANYWHERE IN THE SECTION');
t('the competencies contain no tab characters',
  !after.some((l) => l.includes('\t')),
  'a tab is a delimiter parsers disagree about: ' + JSON.stringify(after.slice(0, 3)));

console.log('\nONE COMPETENCY PER LINE');
for (const c of COMPETENCIES) {
  const line = linesKeepingTabs.find((l) => l.replace(/^[•\-*]\s*/, '').trim() === c);
  t('"' + c + '" is its own line', !!line,
    'found instead: ' + JSON.stringify(after.filter((l) => l.includes(c.split(' ')[0]))));
}

console.log('\nAND STILL SEPARATE WHEN A PARSER DROPS FORMATTING');
// The failure this replaces: with tabs dropped, "Stakeholder management"
// and "Azure DevOps" arrived welded into one string.
for (let i = 0; i < COMPETENCIES.length - 1; i++) {
  const glued = COMPETENCIES[i] + COMPETENCIES[i + 1];
  t('"' + COMPETENCIES[i] + '" is not welded to the next item',
    !linesDroppingTabs.some((l) => l.replace(/\s+/g, '').includes(glued.replace(/\s+/g, ''))),
    'two skills extracted as one unmatchable phrase');
}

console.log('\nTHE REST OF THE CV IS UNAFFECTED');
t('the name is still the first line', /Maxmilliam Okafor/.test(linesKeepingTabs[0]), linesKeepingTabs[0]);
// Either wording is fine -- the renderer normalises synonyms to the
// conventional heading, and what this asserts is that the section still
// arrives as a standalone heading line, not which synonym won.
t('work experience still parses',
  linesKeepingTabs.some((l) => /^(WORK|PROFESSIONAL) EXPERIENCE$/i.test(l)),
  JSON.stringify(linesKeepingTabs.filter((l) => /EXPERIENCE/i.test(l))));
t('the role bullet survives', linesKeepingTabs.some((l) => /Delivered a D365 rollout/.test(l)));

// ---- and the renderers no longer build columns -----------------------
console.log('\nNEITHER RENDERER BUILDS COLUMNS ANY MORE');
const docxSrc = fs.readFileSync(path.join(DIR, 'docx-generator.js'), 'utf8');
const pdfSrc = fs.readFileSync(path.join(DIR, 'professional-pdf-engine.js'), 'utf8');
t('the DOCX tab-grid is gone', !/GRID_TABS|gridCellRuns/.test(docxSrc),
  'the three-column tab layout can still be reached');
t('the PDF no longer positions items in columns',
  !/const COLS = 3;/.test(pdfSrc) && !/col \* colWidth/.test(pdfSrc),
  'items are still drawn at fixed column offsets');
t('the PDF wraps long items instead of overflowing',
  /splitTextToSize\(text, pageWidth - indent\)/.test(pdfSrc),
  'a long competency would overprint its neighbour');

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
