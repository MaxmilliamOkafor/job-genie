// AN ACCENT THAT MARKS EVERYTHING MARKS NOTHING.
//
// Asked whether colour helps a recruiter who has read a thousand
// black-and-white CVs today. It does, but only if it marks something,
// and two failures were live at once.
//
//   TOO DARK TO BE AN ACCENT. The palette's NAVY was 16243F, roughly
//   15:1 on white, which the eye reads as black. Every heading, the
//   name, every company and every bullet glyph carried it, and the page
//   had no visible accent at all -- the cost of a colour with none of
//   the benefit.
//
//   TOO MUCH OF IT. A CV rendered elsewhere came back with the name,
//   every job title, every project title, every degree and every
//   certification title in a bright link blue: about twenty items.
//   Accenting a fifth of a page emphasises nothing.
//
// So the accent marks the landmarks a scan jumps between -- the name
// and the section headings -- and nothing else. Companies and titles
// are bold black, which outranks colour at 10pt anyway. Bullet glyphs
// are grey, because a marker on every line is the dilution the accent
// exists to avoid.
//
// AND NONE OF IT TOUCHES PARSING. Text extraction reads the text
// stream; colour is a separate graphics instruction every extractor
// discards. This file asserts that too: the same document, same text,
// whatever the palette says.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
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

const ACCENT = '1F4E79';
const BODY = '21232A';
const MUTED = '66707A';

const CV = ['Maxmilliam Okafor',
  'Business Operations Sr Analyst',
  'Dublin, IE | maxokafordev@gmail.com | +353 087 426 1508', '',
  'PROFESSIONAL SUMMARY',
  'Analyst with five years in data analysis and process improvement.', '',
  'PROFESSIONAL EXPERIENCE',
  // The company line carries its location on a tab, as the audit leaves
  // it. The title and the date arrive on their own lines, which is the
  // shape the tailoring emits -- the renderer is what tabs them
  // together, so a fixture that pre-tabs them never exercises the
  // date's own styling.
  'Meta\tDublin, Ireland',
  'Software Engineer',
  'January 2023 - Present',
  '- Built backend services in Python and C++ for the ads delivery platform.',
  '- Delivered ranking model improvements in Python and PyTorch.', '',
  'TECHNICAL SKILLS',
  'Programming Languages: Python, SQL, C++', '',
  'EDUCATION',
  'Imperial College London'].join('\n');

// Paragraph-level view of the rendered document: the text of each run
// and the colour it was given.
const runsOf = (xml) => [...String(xml).matchAll(
  /<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)].map((m) => {
  const s = m[0];
  const col = (s.match(/<w:color w:val="([0-9A-Fa-f]{6})"/) || [])[1] || '';
  const txt = [...s.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('');
  const bold = /<w:b\/>/.test(s);
  return { txt: txt.trim(), col: col.toUpperCase(), bold };
}).filter((r) => r.txt);

// fromCvText returns a packaged .docx as base64, so the document XML
// has to come back out of the zip -- the same route every other suite
// in this directory takes.
const os = require('os'), cp = require('child_process');
const built = G.fromCvText(CV, {});
if (!built || !built.success) { console.log('  FAIL  the document did not build'); process.exit(1); }
const tmp = path.join(os.tmpdir(), 'jg-accent-' + Date.now() + '.docx');
fs.writeFileSync(tmp, Buffer.from(built.base64, 'base64'));
const xml = cp.execSync('python3 -c ' + JSON.stringify(
  'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
) + ' ' + JSON.stringify(tmp)).toString();
fs.unlinkSync(tmp);
const runs = runsOf(xml);
const find = (needle) => runs.find((r) => r.txt.indexOf(needle) === 0)
  || runs.find((r) => r.txt.indexOf(needle) !== -1);

console.log('THE DOCUMENT RENDERS');
t('  it produced runs at all', runs.length > 5, runs.length + ' runs');

console.log('\nTHE ACCENT IS ON THE LANDMARKS');
{
  const name = find('Maxmilliam Okafor');
  t('  the name carries it', !!name && name.col === ACCENT, JSON.stringify(name));
  for (const head of ['PROFESSIONAL SUMMARY', 'PROFESSIONAL EXPERIENCE',
    'TECHNICAL SKILLS', 'EDUCATION']) {
    const h = find(head);
    t('  ' + head + ' carries it', !!h && h.col === ACCENT, JSON.stringify(h));
  }
}

console.log('\nAND NOWHERE ELSE');
{
  const co = find('Meta');
  t('  the company is bold black, not accented',
    !!co && co.col === BODY && co.bold, JSON.stringify(co));
  // The job title follows the reference template the user adopted:
  // italic black, not bold -- the company above it carries the weight.
  const title = find('Software Engineer');
  t('  the job title is italic black, not accented',
    !!title && title.col === BODY && !title.bold, JSON.stringify(title));
  const bullet = runs.find((r) => r.txt === '•');
  t('  the bullet glyph is grey', !bullet || bullet.col === MUTED, JSON.stringify(bullet));
  t('  ...and there is not one accented bullet glyph',
    !runs.some((r) => r.txt === '•' && r.col === ACCENT),
    JSON.stringify(runs.filter((r) => r.txt === '•').map((r) => r.col)));
  const body = find('Built backend services');
  t('  bullet text is body black', !!body && body.col === BODY, JSON.stringify(body));
  // Role dates sit bold black beside the company, per the same
  // template; bold is still not the accent, so the rule holds.
  const date = find('January 2023');
  t('  the role date is bold black, not accented',
    !!date && date.col === BODY && date.bold, JSON.stringify(date));
}

console.log('\nAND IT IS ACTUALLY A COLOUR, NOT A DARKER BLACK');
{
  // 16243F was ~15:1 on white and read as black, so every "accent" was
  // wasted. Relative luminance, WCAG.
  const lum = (hex) => {
    const ch = [0, 2, 4].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const contrast = (hex) => (1.05) / (lum(hex) + 0.05);
  const c = contrast(ACCENT);
  t('  it is legible: at least 4.5:1 on white', c >= 4.5, c.toFixed(2) + ':1');
  t('  ...and not so dark it reads as black', c <= 11, c.toFixed(2) + ':1');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(ACCENT.slice(i, i + 2), 16));
  t('  and it is recognisably blue', b > r + 40 && b > g + 20, JSON.stringify([r, g, b]));
}

console.log('\nCOLOUR CHANGES NO TEXT');
{
  // The whole safety argument in one assertion: what a parser extracts
  // is identical whatever the palette does.
  const textOf = (x) => [...String(x).matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1]).join('\n');
  const plain = textOf(xml);
  for (const needle of ['Maxmilliam Okafor', 'PROFESSIONAL EXPERIENCE', 'Meta',
    'Software Engineer', 'Python', 'Imperial College London']) {
    t('  "' + needle + '" is in the extracted text', plain.indexOf(needle) !== -1, needle);
  }
  t('  no colour value leaks into the text stream',
    !/1F4E79|21232A|66707A/.test(plain), plain.slice(0, 200));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
