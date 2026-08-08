// THE PDF HAS TO ACTUALLY RUN, NOT JUST READ CORRECTLY.
//
// The competencies fix was checked by reading the PDF engine's SOURCE for
// column-positioning code. That is not the same as running it, and the
// difference hid a real bug: renderCoreCompetencies called
// this.sanitizeForPDF(), which was never defined anywhere. Every CV with a
// CORE COMPETENCIES section threw TypeError, generateCV caught it and
// returned success:false, and the whole document was lost -- not just the
// section. A source-reading test cannot see that. Two checks follow.
//
//   STATIC   every this.method() the generators call is defined on the
//            object. No dependencies, so this always runs.
//
//   RENDER   generate a real PDF and read the text back out the way an
//            ATS does. Needs jspdf and pdf-parse; if they do not resolve
//            this reports SKIP rather than failing, because the repo
//            deliberately carries no node_modules.
//            To run it:  npm i jspdf pdf-parse
//                        NODE_PATH=$PWD/node_modules node tests/pdf-renders.test.cjs
let PASS = 0, FAIL = 0, SKIP = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };
const skip = (n, why) => { SKIP++; console.log('  SKIP  ' + n + '\n           >> ' + why); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');

// ---- STATIC: no call to a method that does not exist -----------------
console.log('EVERY this.method() IS DEFINED');
for (const f of ['professional-pdf-engine.js', 'docx-generator.js', 'pdf-ats-turbo.js']) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const called = new Set([...src.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  // Both object-literal forms: shorthand `name(args) {` and `name: function(`.
  const defined = new Set([...src.matchAll(/^\s{2,6}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)].map((m) => m[1]));
  for (const m of src.matchAll(/^\s{2,6}([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function)?\s*\(/gm)) defined.add(m[1]);
  const missing = [...called].filter((n) => !defined.has(n));
  t('  ' + f + ' (' + called.size + ' calls)', missing.length === 0,
    'called but never defined: ' + missing.join(', ')
      + '\n              this throws at render time and loses the whole document');
}

// ---- RENDER: generate a PDF and extract its text ---------------------
console.log('\nTHE GENERATED PDF EXTRACTS CORRECTLY');
let jspdfLib = null, PDFParse = null;
try { jspdfLib = require('jspdf'); PDFParse = require('pdf-parse').PDFParse; } catch (e) {}

if (!jspdfLib || !PDFParse) {
  skip('render the CV and read it back', 'jspdf / pdf-parse not resolvable -- npm i jspdf pdf-parse');
  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed, ' + SKIP + ' skipped');
  process.exit(FAIL ? 1 : 0);
}

global.window = global;
global.jspdf = jspdfLib;
global.performance = global.performance || { now: () => Date.now() };
(() => {
  const file = path.join(DIR, 'professional-pdf-engine.js');
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
})();
const E = global.ProfessionalPDFEngine;

const COMPS = ['Stakeholder management', 'Azure DevOps', 'Agile delivery',
  'Microsoft Dynamics 365 Finance and Operations', 'Budgeting', 'Power BI', 'ERP migration'];

(async () => {
  const built = await E.generateCV(
    { firstName: 'Maxmilliam', lastName: 'Okafor', email: 'maxokafordev@gmail.com',
      phone: '+353870000000', location: 'Dublin, Ireland' },
    { summary: 'Project manager with six years delivering Dynamics 365.',
      coreCompetencies: COMPS,
      experience: [{ title: 'Senior Project Manager', company: 'Northbound Technologies',
        startDate: '01/2023', endDate: 'Present',
        bullets: ['Delivered a D365 rollout across four regions.'] }],
      education: [{ degree: 'BSc Computer Science', institution: 'Trinity College Dublin',
        year: '2015 - 2019' }] },
    {}, { title: 'Project Manager', company: 'Acme' });

  // The crash this file exists for: it surfaced as success:false, so the
  // section assertions below would all have been unreachable.
  t('the CV generates at all', built.success !== false, built.error);
  if (built.success === false) { done(); return; }

  const b64 = built.base64 || built.pdfBase64 || built.pdf;
  t('it returns PDF bytes', !!b64, 'keys: ' + Object.keys(built).join(', '));
  if (!b64) { done(); return; }

  const parsed = await new PDFParse({ data: new Uint8Array(Buffer.from(b64, 'base64')) }).getText();
  const lines = parsed.text.split('\n').map((s) => s.trim()).filter(Boolean);

  console.log('\n  ONE COMPETENCY PER LINE');
  for (const c of COMPS) {
    t('    "' + c + '"', lines.some((l) => l.replace(/^[-•*]\s*/, '').trim() === c),
      'found instead: ' + JSON.stringify(lines.filter((l) => l.includes(c.split(' ')[0]))));
  }

  console.log('\n  NOTHING WELDED TO ITS NEIGHBOUR');
  // A PDF has no columns, only glyphs at coordinates. Extractors rebuild
  // lines by vertical position, so anything sharing a baseline runs
  // together -- which is how the old three-up grid failed.
  for (let i = 0; i < COMPS.length - 1; i++) {
    const glued = (COMPS[i] + COMPS[i + 1]).replace(/\s+/g, '');
    t('    "' + COMPS[i] + '" + next', !lines.some((l) => l.replace(/\s+/g, '').includes(glued)),
      'two skills extracted as one unmatchable phrase');
  }

  console.log('\n  EDUCATION KEEPS ITS DATES');
  // renderEducation read only degree and institution, so the year never
  // reached the page and an ATS recorded a degree with no date.
  const eduLine = lines.find((l) => /Trinity College Dublin/.test(l));
  t('    the education line survives', !!eduLine, JSON.stringify(lines));
  if (eduLine) {
    t('    the graduation dates are on it', /2015\s*-\s*2019/.test(eduLine), JSON.stringify(eduLine));
    // On the RAW line -- stripping whitespace first would weld it here in
    // the test and report a fault the document does not have.
    t('    and are separated from the institution',
      /Dublin\s+2015/.test(eduLine),
      'the right-aligned dates sit hard against the institution: '
        + JSON.stringify(eduLine));
  }

  console.log('\n  TYPOGRAPHY IS FOLDED TO ASCII');
  // jsPDF's built-in fonts are WinAnsi: a smart quote pasted in from a job
  // description has no glyph and extracts as garbage.
  t('    curly quotes and dashes fold',
    E.sanitizeForPDF('“It’s” — fine…') === '"It\'s" - fine...',
    JSON.stringify(E.sanitizeForPDF('“It’s” — fine…')));
  t('    a tab never survives into the PDF',
    !E.sanitizeForPDF('a\tb').includes('\t'), 'tabs are a delimiter parsers disagree about');

  done();
})().catch((e) => { t('the render check completes', false, e && e.stack); done(); });

function done() {
  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed' + (SKIP ? ', ' + SKIP + ' skipped' : ''));
  process.exit(FAIL ? 1 : 0);
}
