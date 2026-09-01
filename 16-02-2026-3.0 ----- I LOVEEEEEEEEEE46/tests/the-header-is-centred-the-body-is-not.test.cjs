// THE HEADER IS CENTRED. THE BODY IS NOT. ON REQUEST.
//
// Alignment is a paragraph property (<w:jc>) that the text stream
// never carries, so this is the rare formatting request with zero
// parsing cost either way: an extractor reads the centred header in
// exactly the order it read the left-aligned one. What was declined
// from the same request: the FontAwesome envelope/phone/LinkedIn
// icons, whose glyphs extract as private-use characters glued against
// the email and phone tokens.
//
// The body stays left-aligned. A centred header over a left body is
// the convention the reader expects; a centred body is unreadable.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const os = require('os'), cp = require('child_process');
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
const G = global.DocxGenerator || DG;

const CV = ['Maxmilliam Okafor', 'Data Analyst',
  'Dublin, IE | maxokafordev@gmail.com | +353 087 426 1508', '',
  'PROFESSIONAL SUMMARY', 'Analyst with five years in data analysis.', '',
  'PROFESSIONAL EXPERIENCE', 'Citigroup', 'Data Analyst',
  'August 2017 - March 2021', '- Rebuilt the reporting suite in SQL.', '',
  'TECHNICAL SKILLS', 'Programming: Python, SQL', '',
  'EDUCATION', 'Imperial College London'].join('\n');

const built = G.fromCvText(CV, {});
if (!built || !built.success) { console.log('  FAIL  the document did not build'); process.exit(1); }
const tmp = path.join(os.tmpdir(), 'jg-centre-' + Date.now() + '.docx');
fs.writeFileSync(tmp, Buffer.from(built.base64, 'base64'));
const xml = cp.execSync('python3 -c ' + JSON.stringify(
  'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
) + ' ' + JSON.stringify(tmp)).toString();
fs.unlinkSync(tmp);

const paras = [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map((m) => ({
  xml: m[0],
  text: [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join(''),
  centred: /<w:jc w:val="center"\/>/.test(m[0]),
}));
const holding = (needle) => paras.find((p) => p.text.indexOf(needle) !== -1);

console.log('THE THREE HEADER LINES ARE CENTRED');
for (const line of ['Maxmilliam Okafor', 'Data Analyst', 'maxokafordev@gmail.com']) {
  const p = holding(line);
  t('  "' + line + '"', !!p && p.centred, JSON.stringify(p && { text: p.text.slice(0, 60), centred: p.centred }));
}

console.log('\nAND NOTHING BELOW THE RULE IS');
for (const line of ['PROFESSIONAL SUMMARY', 'Citigroup', 'Rebuilt the reporting suite',
  'Programming', 'Imperial College London']) {
  // "Data Analyst" appears in the header AND as the job title; the ones
  // checked here are unambiguous body lines.
  const p = paras.filter((x) => x.text.indexOf(line) !== -1).pop();
  t('  "' + line + '" stays left', !!p && !p.centred,
    JSON.stringify(p && { text: p.text.slice(0, 60), centred: p.centred }));
}

console.log('\nAND NO ICON GLYPH SNUCK IN BESIDE THE CONTACT TOKENS');
{
  // FontAwesome extracts from U+E000-F8FF; the header must be plain text.
  t('  no private-use characters anywhere', !/[-]/.test(xml),
    'an icon glyph is in the text stream');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
