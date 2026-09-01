// EACH ROLE CARRIES WHERE IT HAPPENED, WITHOUT COSTING A LINE.
//
// Workday's "Apply with Resume" has a Location field on every
// work-experience block, and it is not the only ATS that maps one. With
// nothing in the CV to fill it, the field arrives empty and gets typed by
// hand, once per role, on every application.
//
// The obvious fix -- give the location its own line -- costs a line per
// role. Right-aligned inside the role header, it costs nothing, and the
// header is two lines. The RENDERED pairing follows the user's
// reference template (company + dates right, title + location right):
//
//   Meta                       January 2023 - Present
//   Software Engineer                 Dublin, Ireland
//
// In the CV TEXT the audit still attaches the location to the company
// line, tab-separated -- the renderer is what moves it beside the
// title. Both pairs stay separate text items on a right tab stop and
// land in separate fields rather than welding into one string.
//
// Nothing is invented. A location is attached only when the profile
// records one for a company the CV already names.
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
  return (m.exports && m.exports.DocxGenerator) || m.exports;
};
const DG = load('docx-generator.js');
load('content-quality-engine.js');
load('recruiter-audit.js');
const RA = global.RecruiterAudit;

const CV = ['Maxmilliam Okafor', 'Dublin, Ireland | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Engineer.', '',
  'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Built streaming pipelines on Kafka.', '',
  'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
  '- Built risk models.', '',
  'EDUCATION', 'Imperial College London'].join('\n');

const audit = (experience) => RA.runRecruiterAudit({
  cvText: CV, jdText: 'engineer', jdTitle: 'Software Engineer',
  jobKeywords: ['Kafka'], experience,
});

console.log('THE LOCATION LANDS ON THE COMPANY LINE');
{
  const out = audit([{ company: 'Meta', location: 'Dublin, Ireland' },
    { company: 'Citigroup', location: 'London, UK' }]);
  t('  the company line carries its location, tab-separated',
    /^Meta\tDublin, Ireland$/m.test(out.cvText), JSON.stringify(out.cvText.slice(0, 400)));
  t('  and so does the older role',
    /^Citigroup\tLondon, UK$/m.test(out.cvText), 'second role missed');
  t('  the title line is untouched',
    /^Software Engineer$/m.test(out.cvText), 'the location landed on the title');
  t('  it is reported as a fix',
    out.report.fixes.some((f) => /location to 2 role/.test(f)),
    JSON.stringify(out.report.fixes));
}

console.log('\nNOTHING IS INVENTED');
{
  const out = audit([{ company: 'Meta' }]);
  t('  a role the profile cannot place gets no location',
    !/Meta\t/.test(out.cvText), 'a location appeared from nowhere');
}
{
  const out = audit([{ company: 'Google', location: 'Zurich, Switzerland' }]);
  t('  a company the CV never names contributes nothing',
    !/Zurich/.test(out.cvText), 'another employer\'s city was attached');
}
{
  const out = audit([]);
  t('  no profile experience means no change', !/\t/.test(
    out.cvText.split('PROFESSIONAL EXPERIENCE')[1] || ''), 'a tab appeared unbidden');
}

console.log('\nA FREE-TEXT BOX PRODUCES FREE TEXT');
// Company and location are joined with a TAB, so what a person types
// into the profile can break the encoding. Neither failure below is
// visible until an ATS reads it back wrong.
{
  const tabbed = audit([{ company: 'Meta', location: 'Dublin\tIreland' }]);
  const co = tabbed.cvText.split('\n').filter((l) => l.indexOf('Meta') === 0)[0] || '';
  t('  a tab inside the location does not make a third field',
    (co.match(/\t/g) || []).length === 1, JSON.stringify(co));
  t('  and nothing is lost to it', /Dublin Ireland/.test(co), JSON.stringify(co));
}
{
  const nl = audit([{ company: 'Meta', location: 'Dublin\nIreland' }]);
  const co = nl.cvText.split('\n').filter((l) => l.indexOf('Meta') === 0)[0] || '';
  t('  a newline does not silently truncate the country',
    /Dublin Ireland/.test(co), JSON.stringify(co));
}
{
  const messy = audit([{ company: 'Meta', location: '  Dublin,   Ireland  ' }]);
  t('  stray whitespace is tidied',
    /^Meta\tDublin, Ireland$/m.test(messy.cvText),
    JSON.stringify(messy.cvText.split('\n').filter((l) => l.indexOf('Meta') === 0)[0]));
}
{
  // A location long enough to wrap pushes the right-aligned text off its
  // tab stop and back over the company name.
  const long = audit([{ company: 'Meta', location: 'X'.repeat(200) }]);
  const co = long.cvText.split('\n').filter((l) => l.indexOf('Meta') === 0)[0] || '';
  t('  an absurd location is capped', co.length <= 'Meta\t'.length + 60,
    'length ' + co.length);
}

console.log('\nA COMPANY LINE THAT ALREADY SWALLOWED ITS LOCATION IS RE-DELIMITED');
// A live parse returned Company = "Meta, Dublin, Ireland". Once the
// profile carried locations the tailoring model wrote them into the
// company line comma-joined, and a comma is not a delimiter a parser acts
// on: the whole string lands in the Company field, so matching an
// employer named "Meta" fails -- the same failure as "Meta (formerly
// Facebook Inc)" and "Meta, Software Engineer" before it.
{
  const mk = (co) => ['Max', 'a@b.com', '', 'PROFESSIONAL EXPERIENCE',
    co, 'Software Engineer', 'January 2023 - Present', '- Did work.', '',
    'EDUCATION', 'Imperial College London'].join('\n');
  const run = (co) => RA.runRecruiterAudit({ cvText: mk(co), jdText: 'x',
    jdTitle: 'Software Engineer', jobKeywords: [] }).cvText;

  for (const [inp, company, place] of [
    ['Meta, Dublin, Ireland', 'Meta', 'Dublin, Ireland'],
    ['SolimHealth, Dallas, Texas, United States', 'SolimHealth', 'Dallas, Texas, United States'],
    ['Accenture, London, United Kingdom', 'Accenture', 'London, United Kingdom'],
    ['Deloitte, Dublin', 'Deloitte', 'Dublin'],
  ]) {
    const got = run(inp).split('\n').filter((l) => l.indexOf(company) === 0)[0] || '';
    t('  "' + inp + '" splits', got === company + '\t' + place, JSON.stringify(got));
  }
}

console.log('\nBUT A COMMA THAT IS PART OF THE NAME IS NOT A LOCATION');
// Discarding half a real employer name is worse than the bug being fixed.
{
  const mk = (co) => ['Max', 'a@b.com', '', 'PROFESSIONAL EXPERIENCE',
    co, 'Software Engineer', 'January 2023 - Present', '- Did work.', '',
    'EDUCATION', 'Imperial College London'].join('\n');
  const run = (co) => RA.runRecruiterAudit({ cvText: mk(co), jdText: 'x',
    jdTitle: 'Software Engineer', jobKeywords: [] }).cvText;
  for (const keep of ['Booz Allen Hamilton, Inc.', 'Marks, Spencer and Co', 'Acme, Ltd']) {
    const got = run(keep).split('\n').filter((l) => l.indexOf(keep.split(',')[0]) === 0)[0] || '';
    t('  "' + keep + '" is left whole', got === keep, JSON.stringify(got));
  }
}

console.log('\nAND THE ROLE HEADER IS TWO LINES, NOT THREE');
{
  const out = audit([{ company: 'Meta', location: 'Dublin, Ireland' }]);
  const built = DG.fromCvText(out.cvText, { name: 'cv' });
  t('  the docx generates', built.success === true, built.error);

  const tmp = path.join(os.tmpdir(), 'jg-loc-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'd.docx'), Buffer.from(built.base64, 'base64'));
  cp.execSync('cd ' + tmp + ' && unzip -qo d.docx');
  const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });

  const paras = xml.match(/<w:p>[\s\S]*?<\/w:p>/g) || [];
  const textOf = (p) => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
    .map((x) => x.replace(/<[^>]+>/g, '')).join('');

  const coPara = paras.filter((p) => /Meta/.test(textOf(p)) && /January 2023/.test(textOf(p)))[0];
  t('  company and dates are ONE paragraph', !!coPara,
    'they were emitted as two lines, which is the cost this avoids');
  t('  separated by a tab, so they stay two text items',
    !!coPara && /<w:tab\/>/.test(coPara), 'welded into one string');
  t('  with a right tab stop',
    !!coPara && /w:val="right"/.test(coPara), 'not right-aligned');
  const titlePara = paras.filter((p) => /Software Engineer/.test(textOf(p)) && /Dublin/.test(textOf(p)))[0];
  t('  title and location are ONE paragraph too', !!titlePara,
    'the location did not move down beside the title');
  t('  ...tab-separated on a right stop',
    !!titlePara && /<w:tab\/>/.test(titlePara) && /w:val="right"/.test(titlePara),
    'welded or not right-aligned');

  // The whole header: company+dates, then title+location. Two paragraphs.
  const header = paras.filter((p) => {
    const x = textOf(p);
    return /Meta|Software Engineer/.test(x) && !/PROFESSIONAL/.test(x);
  });
  const roleHeader = header.filter((p) => /Dublin|January 2023/.test(textOf(p)));
  t('  the role header is exactly two paragraphs', roleHeader.length === 2,
    'got ' + roleHeader.length + ': ' + JSON.stringify(roleHeader.map(textOf)));
  t('  and no location sits on a line of its own',
    !paras.some((p) => textOf(p).trim() === 'Dublin, Ireland'),
    'a bare location paragraph costs the line this design saves');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
