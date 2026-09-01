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

console.log('\nTHE HEADER IS A THREE-STEP HIERARCHY');
{
  // Name above headline above contact, by SIZE -- the makeover's whole
  // point. Sizes are run properties (<w:sz>), invisible to extraction.
  const szOf = (needle) => {
    const p = holding(needle);
    const m = p && p.xml.match(/<w:sz w:val="(\d+)"\/>/);
    return m ? +m[1] : 0;
  };
  const name = szOf('Maxmilliam Okafor');
  const headline = szOf('Data Analyst');
  const contact = szOf('maxokafordev@gmail.com');
  t('  the name is the largest thing in the header', name > headline,
    JSON.stringify({ name, headline }));
  t('  the role line is bigger than the contact line', headline > contact,
    JSON.stringify({ headline, contact }));
  const hp = holding('Data Analyst');
  t('  and the role line is bold', !!hp && /<w:b\/>/.test(hp.xml), hp && hp.xml.slice(0, 200));
}

console.log('\n"EU CITIZEN" IS BOLD INSIDE THE SKILLS LINE');
{
  // Rebuild with the real Languages & Citizenship line: the claim a
  // screener hunts for must be visible at first glance, and must still
  // extract as the same characters in the same order.
  const CV2 = CV.replace('Programming: Python, SQL',
    'Languages & Citizenship: English (native), French (native) - EU Citizen\nProgramming: Python, SQL');
  const b2 = G.fromCvText(CV2, {});
  const tmp2 = path.join(os.tmpdir(), 'jg-centre2-' + Date.now() + '.docx');
  fs.writeFileSync(tmp2, Buffer.from(b2.base64, 'base64'));
  const xml2 = cp.execSync('python3 -c ' + JSON.stringify(
    'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
  ) + ' ' + JSON.stringify(tmp2)).toString();
  fs.unlinkSync(tmp2);
  const runs2 = [...xml2.matchAll(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)].map((m) => ({
    txt: [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join(''),
    bold: /<w:b\/>/.test(m[0]),
  }));
  const eu = runs2.find((r) => r.txt === 'EU Citizen');
  t('  "EU Citizen" is its own bold run', !!eu && eu.bold, JSON.stringify(eu));
  const french = runs2.find((r) => r.txt.indexOf('French (native)') !== -1);
  t('  the items around it stay plain', !!french && !french.bold, JSON.stringify(french));
  const stream = [...xml2.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
  t('  and the line extracts character-for-character',
    stream.indexOf('English (native), French (native) - EU Citizen') !== -1,
    'the bolding split changed the extracted text');
}

console.log('\nAND NO ICON GLYPH SNUCK IN BESIDE THE CONTACT TOKENS');
{
  // FontAwesome extracts from U+E000-F8FF; the header must be plain text.
  t('  no private-use characters anywhere', !/[-]/.test(xml),
    'an icon glyph is in the text stream');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
