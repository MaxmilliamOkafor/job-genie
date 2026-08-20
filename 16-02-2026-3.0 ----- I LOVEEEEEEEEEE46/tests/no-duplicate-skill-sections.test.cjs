// THERE IS ONE SKILLS SECTION, AND A SKILL APPEARS IN IT ONCE.
//
// The CV rendered CORE COMPETENCIES and TECHNICAL PROFICIENCIES from two
// separate fields (coreCompetencies, skills) through two separate
// renderers, and nothing connected them. When both were populated the
// same skill printed under both headings: padding to a human, and a
// keyword an ATS was already counting.
//
// Removing the overlap fixed the repetition and left the real problem
// standing. A parser finds the skills section by looking for the word
// "skill" in a heading, so nothing under CORE COMPETENCIES was ever
// indexed as a skill -- a live parse of a real generated CV came back
// with that section empty. Worse, the lookup returns the FIRST heading
// that matches and stops, so two skills-named sections lose one of them
// whichever way they are named.
//
// So the two lists are one list, under TECHNICAL SKILLS, competencies
// first because they are the tailored job-matched phrases, each skill
// once, compared by shape rather than spelling.
//
// The static half runs anywhere. The render half needs jspdf/pdf-parse
// and skips cleanly when they are absent, since the repo carries no
// node_modules:
//   npm i jspdf pdf-parse
//   NODE_PATH=/path/to/node_modules node tests/no-duplicate-skill-sections.test.cjs
let PASS = 0, FAIL = 0, SKIP = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };
const skip = (n, why) => { SKIP++; console.log('  SKIP  ' + n + '\n           >> ' + why); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');

let jspdfLib = null, PDFParse = null;
try { jspdfLib = require('jspdf'); PDFParse = require('pdf-parse').PDFParse; } catch (e) {}

global.window = global;
if (jspdfLib) global.jspdf = jspdfLib;
global.performance = global.performance || { now: () => Date.now() };
(() => {
  const file = path.join(DIR, 'professional-pdf-engine.js');
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
})();
const E = global.ProfessionalPDFEngine;

// ---- the comparison key ----------------------------------------------
// Duplicates rarely arrive spelled identically, so an exact-string
// comparison would let most of them through.
console.log('SKILLS ARE COMPARED BY SHAPE, NOT SPELLING');
for (const [a, b, same] of [
  ['Power BI', 'power bi', true],
  ['Power BI', 'PowerBI', true],
  ['Power BI', 'Power  BI', true],
  ['Azure DevOps', '- Azure DevOps,', true],
  ['Power BI', 'Power Automate', false],
  ['ERP migration', 'ERP', false],
]) {
  const got = E.skillKey(a) === E.skillKey(b);
  t('  ' + JSON.stringify(a) + (same ? ' == ' : ' != ') + JSON.stringify(b), got === same,
    'skillKey: ' + JSON.stringify(E.skillKey(a)) + ' vs ' + JSON.stringify(E.skillKey(b)));
}
t('  an empty key does not swallow real skills', E.skillKey('') === '' && E.skillKey(null) === '');

// ---- structureCVData is where the decision is made -------------------
console.log('\nTHE TWO LISTS BECOME ONE, COMPETENCIES FIRST');
const structured = E.structureCVData(
  { firstName: 'Max', lastName: 'Okafor' },
  { summary: 's',
    coreCompetencies: ['Stakeholder management', 'Azure DevOps', 'Power BI'],
    skills: 'power bi, PowerBI, Terraform, Azure DevOps, Kubernetes' },
  null);

const skillKeys = structured.skills.map((s) => E.skillKey(s));

t('  nothing is left in a second section',
  structured.coreCompetencies.length === 0,
  'a section a parser cannot find still holds ' + JSON.stringify(structured.coreCompetencies));
t('  every competency is in the skills list',
  ['Stakeholder management', 'Azure DevOps', 'Power BI']
    .every((c) => skillKeys.includes(E.skillKey(c))),
  'a tailored keyword phrase was dropped: ' + JSON.stringify(structured.skills));
t('  ...and leads it, where a recruiter scans',
  structured.skills[0] === 'Stakeholder management', JSON.stringify(structured.skills));
t('  no skill is listed twice',
  new Set(skillKeys).size === skillKeys.length,
  'still duplicated: ' + JSON.stringify(structured.skills));
// The competency spelling is the one that prints, because that list is
// written for the reader; the skills list arrives from a parsed CV and
// carries whatever casing the source had. "power bi" on a CV is the tell
// that a machine assembled the line.
t('  the competency spelling wins over the copy in the skills list',
  structured.skills.includes('Power BI') && !structured.skills.includes('power bi'),
  JSON.stringify(structured.skills));
for (const keep of ['Terraform', 'Kubernetes']) {
  t('  "' + keep + '" survives as a genuine extra',
    skillKeys.includes(E.skillKey(keep)), JSON.stringify(structured.skills));
}

// ---- nothing is lost when the two lists say the same thing -----------
console.log('\nA FULLY OVERLAPPING PAIR IS STILL A FULL SECTION');
const allDupes = E.structureCVData(
  { firstName: 'Max' },
  { summary: 's', coreCompetencies: ['Power BI', 'Terraform'], skills: 'power bi, terraform' },
  null);
t('  each term survives exactly once',
  allDupes.skills.length === 2
    && allDupes.skills.map((s) => E.skillKey(s)).join('|') === 'powerbi|terraform',
  JSON.stringify(allDupes.skills));

// ---- nothing changes when only one field is populated ----------------
console.log('\nTHE COMMON CASE IS UNAFFECTED');
const skillsOnly = E.structureCVData(
  { firstName: 'Max' }, { summary: 's', skills: 'Power BI, Terraform' }, null);
t('  skills alone are left intact', skillsOnly.skills.length === 2,
  JSON.stringify(skillsOnly.skills));
t('  ...and no competencies are invented', skillsOnly.coreCompetencies.length === 0);

// ---- end to end ------------------------------------------------------
console.log('\nAND THE RENDERED PDF SAYS EACH SKILL ONCE');
if (!PDFParse) {
  skip('render and count occurrences', 'jspdf / pdf-parse not resolvable');
  done();
} else {
  (async () => {
    const built = await E.generateCV(
      { firstName: 'Maxmilliam', lastName: 'Okafor', email: 'maxokafordev@gmail.com' },
      { summary: 'Project manager.',
        coreCompetencies: ['Stakeholder management', 'Azure DevOps', 'Power BI'],
        skills: 'power bi, Terraform, Azure DevOps, Kubernetes',
        experience: [{ title: 'PM', company: 'Northbound', startDate: '01/2023',
          endDate: 'Present', bullets: ['Delivered a rollout.'] }],
        education: [{ degree: 'BSc', institution: 'Trinity', year: '2019' }] },
      {}, null);
    t('  the CV generates', built.success !== false, built.error);
    if (built.success === false) return done();

    const b64 = built.base64 || built.pdfBase64 || built.pdf;
    t('  it returns PDF bytes', !!b64, 'keys: ' + Object.keys(built).join(', '));
    if (!b64) return done();

    const parsed = await new PDFParse({
      data: new Uint8Array(Buffer.from(b64, 'base64')) }).getText();
    const flat = parsed.text.toLowerCase().replace(/[^a-z0-9]+/g, '');

    for (const skill of ['Power BI', 'Azure DevOps']) {
      const k = E.skillKey(skill);
      const n = flat.split(k).length - 1;
      t('  "' + skill + '" appears exactly once', n === 1, 'appeared ' + n + ' times');
    }
    for (const skill of ['Terraform', 'Kubernetes']) {
      t('  "' + skill + '" is still present', flat.includes(E.skillKey(skill)),
        'a genuine extra was dropped');
    }
    done();
  })().catch((e) => { t('  the render check completes', false, e && e.stack); done(); });
}

function done() {
  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed' + (SKIP ? ', ' + SKIP + ' skipped' : ''));
  process.exit(FAIL ? 1 : 0);
}
