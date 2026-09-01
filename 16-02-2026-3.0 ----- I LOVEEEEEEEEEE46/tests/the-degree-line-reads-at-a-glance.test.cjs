// THE EDUCATION BLOCK, BORROWED FROM THE PAGE THE USER LIKED.
//
// A screenshot of a LaTeX CV showed why its education section reads
// well at first glance: the DEGREE is bold with the GRADE flush right,
// and the institution sits plain beneath. The eye gets the two facts
// it scans for -- what was studied, how well -- without reading the
// line.
//
// The DOCX the extension actually attaches rendered every education
// line plain, with the grade buried mid-line after a comma. Adopted:
//
//   - a degree line is bold, the way a company line is;
//   - a trailing grade ("..., Distinction", "..., First Class
//     Honours") moves to the right edge, bold, on the same right tab
//     stop every other right-aligned field already uses;
//   - the institution stays plain -- bolding both emphasises neither;
//   - when a DATE owns the right edge of a degree line, the grade
//     stays inline: two right-aligned runs on one tab stop would
//     overprint.
//
// AND PARSING IS UNCHANGED. The tab extracts between the two runs, so
// the text stream reads "MSc ... Distinction" in the same order the
// comma version did; bold is a run property every extractor discards.
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

const buildXml = (eduLines) => {
  const CV = ['Maxmilliam Okafor', 'Data Analyst',
    'Dublin, IE | maxokafordev@gmail.com', '',
    'PROFESSIONAL SUMMARY', 'Analyst with five years in data analysis.', '',
    'PROFESSIONAL EXPERIENCE', 'Citigroup', 'Data Analyst',
    'August 2017 - March 2021', '- Rebuilt the reporting suite in SQL.', '',
    'TECHNICAL SKILLS', 'Programming: Python, SQL', '',
    'EDUCATION', ...eduLines].join('\n');
  const built = G.fromCvText(CV, {});
  if (!built || !built.success) return null;
  const tmp = path.join(os.tmpdir(), 'jg-degree-' + Date.now() + Math.random() + '.docx');
  fs.writeFileSync(tmp, Buffer.from(built.base64, 'base64'));
  const xml = cp.execSync('python3 -c ' + JSON.stringify(
    'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
  ) + ' ' + JSON.stringify(tmp)).toString();
  fs.unlinkSync(tmp);
  return xml;
};

// Paragraph-level view: the runs of each paragraph, in order.
const parasOf = (xml) => [...String(xml).matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map((m) => {
  const runs = [...m[0].matchAll(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)].map((r) => ({
    txt: [...r[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join(''),
    bold: /<w:b\/>/.test(r[0]),
    tab: /<w:tab\/>/.test(r[0]),
  }));
  return { runs, text: runs.map((r) => r.txt).join('') };
});
const paraWith = (paras, needle) => paras.find((p) => p.text.indexOf(needle) !== -1);

const xml = buildXml([
  'MSc in Artificial Intelligence and Machine Learning, Distinction',
  'Imperial College London',
  'BSc in Computer Science, First Class Honours',
  'University of Derby',
]);
if (!xml) { console.log('  FAIL  the document did not build'); process.exit(1); }
const paras = parasOf(xml);

console.log('THE DEGREE IS BOLD WITH THE GRADE ON THE RIGHT EDGE');
{
  const msc = paraWith(paras, 'MSc in Artificial Intelligence');
  t('  the MSc paragraph renders', !!msc, 'no paragraph holds the degree');
  t('  the degree run is bold', !!msc && msc.runs[0].bold, JSON.stringify(msc && msc.runs));
  t('  a tab separates degree from grade', !!msc && msc.runs.some((r) => r.tab),
    'the grade is still mid-line after a comma');
  const grade = msc && msc.runs.find((r) => r.txt === 'Distinction');
  t('  "Distinction" is its own bold run', !!grade && grade.bold, JSON.stringify(msc && msc.runs));
  t('  and the comma between them is gone', !!msc && msc.text.indexOf(',') === -1,
    msc && msc.text);
}
{
  const bsc = paraWith(paras, 'BSc in Computer Science');
  const grade = bsc && bsc.runs.find((r) => r.txt === 'First Class Honours');
  t('  the second degree gets the same treatment',
    !!bsc && bsc.runs[0].bold && !!grade && grade.bold, JSON.stringify(bsc && bsc.runs));
}

console.log('\nAND THE INSTITUTION STAYS PLAIN');
{
  const uni = paraWith(paras, 'Imperial College London');
  t('  Imperial is not bold', !!uni && uni.runs.every((r) => !r.bold), JSON.stringify(uni && uni.runs));
  const derby = paraWith(paras, 'University of Derby');
  t('  Derby is not bold', !!derby && derby.runs.every((r) => !r.bold), JSON.stringify(derby && derby.runs));
}

console.log('\nPARSING SEES THE SAME TEXT IN THE SAME ORDER');
{
  const stream = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
  const a = stream.indexOf('MSc in Artificial Intelligence');
  const b = stream.indexOf('Distinction');
  const c = stream.indexOf('Imperial College London');
  t('  degree, then grade, then institution', a !== -1 && a < b && b < c,
    JSON.stringify({ a, b, c }));
  t('  the degree run ends in a space, so a dropped tab cannot weld them',
    / $/.test((paraWith(paras, 'MSc in Artificial')?.runs[0] || {}).txt || ''),
    'MachineLearningDistinction on any parser that drops <w:tab/>');
}

console.log('\nA DATE ON THE RIGHT EDGE WINS, AND THE GRADE STAYS INLINE');
{
  const paras2 = parasOf(buildXml([
    'BSc in Computer Science, First Class Honours',
    'University of Derby',
    '2017',
  ]) || '');
  const bsc = paraWith(paras2, 'BSc in Computer Science');
  t('  the degree line is still bold', !!bsc && bsc.runs[0].bold, JSON.stringify(bsc && bsc.runs));
  t('  and still carries its grade', !!bsc && bsc.text.indexOf('First Class Honours') !== -1,
    bsc && bsc.text);
}

console.log('\nA COMMA THAT IS NOT A GRADE IS LEFT ALONE');
{
  const paras3 = parasOf(buildXml([
    'MSc in Data, Systems and Modelling',
    'Imperial College London',
  ]) || '');
  const msc = paraWith(paras3, 'MSc in Data');
  t('  the degree title keeps its comma', !!msc && msc.text.indexOf('MSc in Data, Systems and Modelling') !== -1,
    msc && msc.text);
  t('  nothing was split to the right edge', !!msc && !msc.runs.some((r) => r.tab),
    JSON.stringify(msc && msc.runs));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
