// AN EM DASH IS A MACHINE-WRITTEN TELL, AND THE FIX WAS BREAKING DATES.
//
// Reported: em dashes are not wanted in the generated documents. They are
// one of the strongest signals a recruiter reads as AI-written, alongside
// round percentages.
//
// The sanitiser already removed them, but the way it did so was worse
// than the problem. Every dash became a full stop, which
//
//   destroyed employment dates -- "January 2023 — Present" came out as
//   "January 2023. Present", so the range an ATS parses for tenure was
//   gone; and
//
//   cut parentheticals into fragments -- "Reduced cost — a 12% saving —
//   in year one." became "Reduced cost. a 12% saving. in year one.",
//   which reads more machine-written than the dash it replaced and breaks
//   the prompt's own no-fragments rule.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
(() => {
  const f = path.join(DIR, 'content-quality-engine.js');
  const m = new Module(f, null); m.filename = f;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(f, 'utf8'), f);
})();
const E = global.ContentQualityEngine;

console.log('DATE RANGES SURVIVE AS RANGES');
for (const [input, want] of [
  ['January 2023 — Present', 'January 2023 - Present'],
  ['2019—2022', '2019 - 2022'],
  ['June 2019 – December 2022', 'June 2019 - December 2022'],
  ['2021 — Current', '2021 - Current'],
]) t('  ' + JSON.stringify(input), E.removeEmDashes(input) === want,
  'got ' + JSON.stringify(E.removeEmDashes(input)) + ' -- an ATS reads tenure from this');

console.log('\nPARENTHETICALS STAY WHOLE SENTENCES');
for (const [input, want] of [
  ['Reduced cost — a 12% saving — in year one.', 'Reduced cost, a 12% saving, in year one.'],
  // A dash before a CAPITAL is part of a NAME ("Company - Title",
  // "AWS Certified Machine Learning - Specialty"), so it becomes a
  // hyphen. A comma there mangles the credential, and an ATS matches
  // certifications as exact strings.
  ['Senior PM — Acme Corp', 'Senior PM - Acme Corp'],
  ['AWS Certified Machine Learning – Specialty', 'AWS Certified Machine Learning - Specialty'],
  ['Led delivery – for 11,842 users.', 'Led delivery, for 11,842 users.'],
]) t('  ' + JSON.stringify(input.slice(0, 40)), E.removeEmDashes(input) === want,
  'got ' + JSON.stringify(E.removeEmDashes(input)));

console.log('\nNO DASH SURVIVES EITHER DOCUMENT PATH');
const sample = 'Delivered the rollout — across four regions — on time.';
t('  the CV path is clean', !/[—–]/.test(E.sanitiseCVBlock(sample)),
  JSON.stringify(E.sanitiseCVBlock(sample)));
t('  the cover letter path is clean',
  !/[—–]/.test(E.sanitiseContent(sample, { removePronouns: false })),
  JSON.stringify(E.sanitiseContent(sample, { removePronouns: false })));
t('  ...and neither produces a fragment',
  !/\.\s+[a-z]/.test(E.sanitiseCVBlock(sample)),
  'a lowercase word after a full stop is a fragment: '
    + JSON.stringify(E.sanitiseCVBlock(sample)));

console.log('\nNEITHER GENERATED DOCUMENT CARRIES ONE');
// The sanitiser upstream is not the only path into a document. Both
// generators are called directly elsewhere, so each has to guarantee this
// for itself. Verified on real generated files, not on source text: the
// PDF was emitting an en dash in the DATE field ("01-2023 – Present") and
// in education ("BSc – Trinity"), and both formats passed summary and
// bullet prose through untouched.
const os = require('os'), cp = require('child_process');
let jspdf = null, PDFParse = null;
try { jspdf = require('jspdf'); PDFParse = require('pdf-parse').PDFParse; } catch (e) {}

const DASHY_SUMMARY = 'Project manager \u2014 six years \u2014 delivering Dynamics 365.';
const DASHY_BULLET = 'Cut deploy time \u2014 a 12% saving \u2014 across weekly releases.';
const CV_TEXT = ['Maxmilliam Okafor', 'Dublin | max@example.com', '',
  'PROFESSIONAL SUMMARY', DASHY_SUMMARY, '',
  'WORK EXPERIENCE', 'Northbound', 'Senior Project Manager',
  'January 2023 \u2014 Present', '- ' + DASHY_BULLET, ''].join('\n');

(() => {
  const DGm = (() => {
    const f = path.join(DIR, 'docx-generator.js');
    const m = new Module(f, null); m.filename = f;
    m.paths = Module._nodeModulePaths(DIR);
    m._compile(fs.readFileSync(f, 'utf8'), f);
    return m.exports;
  })();
  const DG = DGm.DocxGenerator || DGm;
  const built = DG.fromCvText(CV_TEXT, { name: 'cv', filename: 'cv.docx' });
  t('  the DOCX generates', built && built.success === true, built && built.error);
  if (!built || !built.success) return;
  const tmp = path.join(os.tmpdir(), 'jg-dash-' + Date.now() + '.docx');
  fs.writeFileSync(tmp, Buffer.from(built.base64, 'base64'));
  const xml = cp.execSync('python3 -c ' + JSON.stringify(
    'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
  ) + ' ' + JSON.stringify(tmp)).toString();
  fs.unlinkSync(tmp);
  const text = xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '');
  t('  the DOCX carries no en or em dash', !/[\u2013\u2014]/.test(text),
    JSON.stringify((text.match(/.{0,30}[\u2013\u2014].{0,30}/) || [])[0] || ''));
  t('  ...and the date range still reads correctly',
    /January 2023 - Present/.test(text), 'date separator lost');
})();

if (!jspdf || !PDFParse) {
  console.log('  SKIP  PDF check (jspdf / pdf-parse not installed)');
} else {
  global.jspdf = jspdf;
  global.performance = global.performance || { now: () => Date.now() };
  (() => {
    const f = path.join(DIR, 'professional-pdf-engine.js');
    const m = new Module(f, null); m.filename = f;
    m.paths = Module._nodeModulePaths(DIR);
    m._compile(fs.readFileSync(f, 'utf8'), f);
  })();
  const PE = global.ProfessionalPDFEngine;
  const done = PE.generateCV(
    { firstName: 'Max', lastName: 'Okafor', email: 'max@example.com', phone: '+353870000000', location: 'Dublin' },
    { summary: DASHY_SUMMARY,
      experience: [{ title: 'Senior Project Manager', company: 'Northbound',
        startDate: '01/2023', endDate: 'Present', bullets: [DASHY_BULLET] }],
      education: [{ degree: 'BSc Computer Science', institution: 'Trinity College Dublin', year: '2019' }] },
    {}, null);
  module.exports.__pdf = done.then(async (r) => {
    const b64 = r.base64 || r.pdfBase64 || r.pdf;
    t('  the PDF generates', !!b64, r.error || 'no bytes');
    if (!b64) return finish();
    const parsed = await new PDFParse({ data: new Uint8Array(Buffer.from(b64, 'base64')) }).getText();
    t('  the PDF carries no en or em dash', !/[\u2013\u2014]/.test(parsed.text),
      JSON.stringify((parsed.text.match(/.*[\u2013\u2014].*/) || [])[0] || ''));
    t('  ...including in the date field',
      !/\d[\u2013\u2014]|[\u2013\u2014]\s*Present/.test(parsed.text),
      'the date range is the one field where a parse failure costs a whole role');
    finish();
  });
}

console.log('\nHEDGED FIGURES ARE STRIPPED');
// From a real generated CV: "cut the manual review queue by ~40%". The
// tilde is the symbol form of "approximately", which is already a banned
// WORD -- so the ban was evaded by writing it as punctuation. A hedged
// figure reads as a guessed figure, which costs more than no figure.
for (const [input, want] of [
  ['cut the review queue by ~40% with no loss', 'cut the review queue by 40% with no loss'],
  ['saved approx. 12 hours weekly', 'saved 12 hours weekly'],
  ['grew revenue by circa 2m', 'grew revenue by 2m'],
  ['around 5 engineers reported to me', '5 engineers reported to me'],
]) t('  ' + JSON.stringify(input.slice(0, 42)), E.stripApproximations(input) === want,
  'got ' + JSON.stringify(E.stripApproximations(input)));
t('  a tilde in ordinary prose is left alone',
  E.stripApproximations('the tilde ~ in prose stays') === 'the tilde ~ in prose stays');
t('  "roughly speaking" is not a hedged number',
  E.stripApproximations('roughly speaking it worked') === 'roughly speaking it worked');
t('  it runs in the shared pipeline, not only when called directly',
  !/~\s*\d/.test(E.sanitiseCVBlock('cut the queue by ~40%')),
  JSON.stringify(E.sanitiseCVBlock('cut the queue by ~40%')));

console.log('\nAND THE PROMPT STOPS PRODUCING THEM IN THE FIRST PLACE');
let prompt = null;
try {
  prompt = fs.readFileSync(
    path.join(DIR, '../supabase/functions/tailor-application/index.ts'), 'utf8');
} catch (e) {}
if (!prompt) {
  console.log('  SKIP  tailoring prompt not present in this checkout');
} else {
  t('  dashes are banned by rule', /NO EM DASHES OR EN DASHES IN ANY OUTPUT/.test(prompt));
  t('  ...with a plain hyphen prescribed for date ranges',
    /January 2023 - Present/.test(prompt));
  t('  ...and the instructions\' own dashes excluded from imitation',
    /not a style to imitate/i.test(prompt),
    'the prompt is full of em dashes; without this the model copies the style');
  t('  the checklist asks for zero dashes',
    /ZERO em dashes or en dashes/.test(prompt));
}

function finish() {
  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
}
if (!jspdf || !PDFParse) finish();
