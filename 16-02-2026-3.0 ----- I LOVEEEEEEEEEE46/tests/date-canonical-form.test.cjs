// ONE DATE FORMAT REACHES THE ATS, WHATEVER THE SOURCE CV WROTE.
//
// The employment range is the field an ATS uses to work out tenure, and a
// parse failure there costs a whole employment record. So every way a
// date can arrive has to converge on the one form parsers are documented
// against:
//
//     Month YYYY - Month YYYY        January 2023 - December 2024
//     Month YYYY - Present           January 2023 - Present
//
// Full month name, four-digit year, a plain ASCII hyphen with spaces
// around it, and "Present" for an ongoing role.
//
// Two things had to agree for that to hold. isDateLine decides whether a
// line IS a date, and prettyDateRange normalises it. isDateLine knew
// fewer ways of saying "still there" than prettyDateRange did, so
// "01/2023 - Now" was not recognised as a date at all: it rendered as
// ordinary body text and never reached the normaliser.
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
  return m.exports;
};
const mod = load('docx-generator.js');
const DG = mod.DocxGenerator || mod;

const READ = 'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1])'
  + '.read("word/document.xml").decode("utf8"))';

function renderedDate(dateLine) {
  const cv = ['Maxmilliam Okafor', 'Dublin | max@example.com', '',
    'WORK EXPERIENCE', 'Northbound', 'Senior Project Manager', dateLine,
    '- Delivered the rollout.', ''].join('\n');
  const r = DG.fromCvText(cv, {});
  if (!r || !r.success) return null;
  const tmp = path.join(os.tmpdir(), 'jg-date-' + Date.now() + '.docx');
  fs.writeFileSync(tmp, Buffer.from(r.base64, 'base64'));
  const xml = cp.execSync('python3 -c ' + JSON.stringify(READ) + ' ' + JSON.stringify(tmp)).toString();
  fs.unlinkSync(tmp);
  const txt = xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '');
  const m = /(?:[A-Z][a-z]+ )?\d{4}\s*-\s*(?:Present|(?:[A-Z][a-z]+ )?\d{4})/.exec(txt);
  return m ? m[0] : null;
}

console.log('EVERY SOURCE FORM CONVERGES ON THE CANONICAL ONE');
for (const [input, want] of [
  ['January 2023 - Present', 'January 2023 - Present'],
  ['January 2023 — Present', 'January 2023 - Present'],   // em dash
  ['January 2023 – Present', 'January 2023 - Present'],   // en dash
  ['01/2023 - Present', 'January 2023 - Present'],
  ['Jan 2023 - Dec 2024', 'January 2023 - December 2024'],
  ['Sept 2020 - Present', 'September 2020 - Present'],
  ['06/2019 - 12/2022', 'June 2019 - December 2022'],
  ['2019—2022', '2019 - 2022'],
  // "Still there", however it was written. Present is the token every
  // documented parser recognises; the others are understood by some only.
  ['March 2021 - Current', 'March 2021 - Present'],
  ['01/2023 - Now', 'January 2023 - Present'],
  ['Jan 2020 - Ongoing', 'January 2020 - Present'],
  ['Sept 2020 - To date', 'September 2020 - Present'],
]) t('  ' + JSON.stringify(input).padEnd(28) + ' -> ' + want,
  renderedDate(input) === want, 'got ' + JSON.stringify(renderedDate(input)));

console.log('\nAND THE OUTPUT NEVER CARRIES A HAZARD');
const out = [
  'January 2023 — Present', '01/2023 - Now', '2019—2022', 'Jan 2020 - Ongoing',
].map(renderedDate).join(' | ');
t('  no en dash or em dash survives', !/[–—]/.test(out), out);
t('  no numeric MM/YYYY survives', !/\d{1,2}\/\d{4}/.test(out), out);
t('  no abbreviated month survives',
  !/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\s+\d{4}/.test(out), out);
t('  ongoing roles all read "Present"',
  !/(Current|Now|Ongoing|To date)/i.test(out), out);

console.log('\nTHE TWO HALVES AGREE ON WHAT "STILL THERE" MEANS');
// The bug this replaces: a line prettyDateRange could normalise was not
// recognised as a date by isDateLine, so it was never offered to it.
const src = fs.readFileSync(path.join(DIR, 'docx-generator.js'), 'utf8');
t('  the ongoing tokens are declared once and shared',
  /const ONGOING = /.test(src) && (src.match(/ONGOING \+/g) || []).length >= 3,
  'isDateLine and prettyDateRange can drift apart again');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
