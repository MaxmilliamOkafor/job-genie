// ONE PAGE.
//
// A recruiter working through a stack decides whether to read a CV
// before they decide what it says, and a second page is where a lot of
// that decision gets made.
//
// Two mechanisms, in that order. The GENERATOR squeezes spacing and the
// type scale, loosest profile first, and never touches content. If that
// is not enough the AUDIT drops bullets, but only where relevance to the
// posting is known, never below two per role, and never the sole mention
// of a posting keyword.
//
// The thing these tests exist to pin is that ONE component decides
// whether it fits. The audit carried its own line-count heuristic in a
// first version and the two disagreed badly: on a CV the generator would
// have fitted at full size, the heuristic cut 22 bullets to 8 and then
// still reported that it did not fit. The audit now asks the generator,
// which measures the XML it actually emitted, so the two cannot drift.
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
// The generator loads FIRST: the audit looks it up to decide whether a
// CV fits, and without it the audit correctly does nothing.
const DG = load('docx-generator.js');
load('content-quality-engine.js');
load('recruiter-audit.js');
const RA = global.RecruiterAudit;

const BULLET = '- Delivered a substantial piece of platform work involving Kafka, '
  + 'Kubernetes and MLflow across several teams, item ';
const role = (co, ti, da, n) => [co, ti, da]
  .concat(Array.from({ length: n }, (_, i) => BULLET + (i + 1) + '.'))
  .concat(['']);

const HEAD = ['Maxmilliam Okafor',
  'Dublin, Ireland | +353 087 426 1508 | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY',
  'Experienced software engineer building streaming and ML platforms at scale.', '',
  'PROFESSIONAL EXPERIENCE'];
const TAIL = ['TECHNICAL SKILLS', 'Python, SQL, Kafka, Airflow, AWS, Kubernetes', '',
  'EDUCATION', 'Imperial College London', '2022'];

const cvWith = (counts) => HEAD
  .concat(role('Meta', 'Software Engineer', 'January 2023 - Present', counts[0]))
  .concat(role('SolimHealth', 'AI Product Manager', 'August 2022 - December 2022', counts[1]))
  .concat(role('Accenture', 'Solutions Architect', 'April 2021 - July 2022', counts[2]))
  .concat(role('Citigroup', 'Data Analyst', 'August 2017 - March 2021', counts[3]))
  .concat(TAIL).join('\n');

const audit = (text, keywords) => RA.runRecruiterAudit({
  cvText: text, jdText: 'kafka kubernetes', jdTitle: 'Software Engineer',
  jobKeywords: keywords || ['Kafka', 'Kubernetes', 'MLflow'],
});
const bullets = (s) => (String(s).match(/^\s*[-•*]\s+\S/gm) || []).length;
const perRole = (s) => {
  const out = {};
  let cur = null;
  for (const l of String(s).split('\n')) {
    const tr = l.trim();
    if (/^(Meta|SolimHealth|Accenture|Citigroup)$/.test(tr)) { cur = tr; out[cur] = 0; }
    else if (cur && /^\s*[-•*]\s+\S/.test(l)) out[cur]++;
  }
  return out;
};

console.log('THE GENERATOR TIGHTENS BEFORE ANYTHING IS DROPPED');
{
  const small = cvWith([2, 2, 1, 1]);
  const m = DG.measureCv(small);
  t('  a short CV is left at full size', m.density === 'comfortable' && m.fitsOnePage,
    JSON.stringify(m));
  const out = audit(small);
  t('  and nothing is trimmed from it', bullets(out.cvText) === bullets(small),
    bullets(small) + ' -> ' + bullets(out.cvText));
  t('  no fit-to-page fix is reported',
    !out.report.fixes.some((f) => /Fitted to one page/.test(f)),
    JSON.stringify(out.report.fixes));
}
{
  // The middle case is the one that matters: content the generator can
  // fit by tightening alone must NOT lose a bullet to do it.
  const mid = cvWith([4, 3, 3, 2]);
  const before = bullets(mid);
  const out = audit(mid);
  const m = DG.measureCv(out.cvText);
  t('  a CV that fits once tightened keeps every bullet',
    bullets(out.cvText) === before, before + ' -> ' + bullets(out.cvText));
  t('  and it does fit', m.fitsOnePage, JSON.stringify(m));
}

console.log('\nWHEN TYPOGRAPHY IS NOT ENOUGH, THE LEAST RELEVANT GO');
{
  const big = cvWith([6, 6, 5, 5]);
  t('  the oversized CV genuinely does not fit at any density',
    !DG.measureCv(big).fitsOnePage, JSON.stringify(DG.measureCv(big)));

  const out = audit(big);
  const m = DG.measureCv(out.cvText);
  t('  after the audit it fits', m.fitsOnePage, JSON.stringify(m));
  t('  and the report agrees with the generator', out.report.onePage === m.fitsOnePage,
    'report.onePage=' + out.report.onePage + ' generator=' + m.fitsOnePage);
  t('  the drop is reported as a fix',
    out.report.fixes.some((f) => /Fitted to one page/.test(f)),
    JSON.stringify(out.report.fixes));

  const pr = perRole(out.cvText);
  t('  every role survives', Object.keys(pr).length === 4, JSON.stringify(pr));
  t('  none is taken below two bullets',
    Object.values(pr).every((n) => n >= 2), JSON.stringify(pr));
  // The levelling rule. Taking strictly oldest-first left the newest role
  // at six and the second-newest at two, which reads as though the second
  // job barely happened.
  const counts = Object.values(pr);
  t('  and the page is levelled, not stripped from the bottom',
    Math.max.apply(null, counts) - Math.min.apply(null, counts) <= 1,
    JSON.stringify(pr));
}

console.log('\nWHAT IT WILL NOT DO TO GET THERE');
{
  // A keyword that appears in exactly one bullet, in the oldest role --
  // the first place a bottom-up trim would take from.
  const big = cvWith([6, 6, 5, 5])
    .replace('Data Analyst\nAugust 2017 - March 2021\n' + BULLET + '1.',
             'Data Analyst\nAugust 2017 - March 2021\n- Owned the Snowflake migration end to end.');
  const out = audit(big, ['Kafka', 'Snowflake']);
  t('  the sole mention of a posting keyword is kept',
    /Snowflake migration end to end/.test(out.cvText),
    'a missed keyword costs more than a second page');
}
{
  const big = cvWith([6, 6, 5, 5]);
  const out = audit(big);
  t('  education is not touched',
    /EDUCATION[\s\S]*Imperial College London/.test(out.cvText), 'education lost');
  t('  skills are not touched',
    /TECHNICAL SKILLS[\s\S]*Python/.test(out.cvText), 'skills lost');
  t('  every employer, title and date survives',
    ['Meta', 'SolimHealth', 'Accenture', 'Citigroup', 'Software Engineer',
      'Solutions Architect', 'January 2023 - Present', 'August 2017 - March 2021']
      .every((s) => out.cvText.indexOf(s) !== -1),
    'a role record was damaged');
}

console.log('\nTHE TYPE SCALE DESCENDS');
// Body copy used to be tied with the company and the title at 10.5pt, so
// a parser weighting relative font size for header detection got a flat
// signal and a recruiter scanning had nothing to land on.
{
  const built = DG.fromCvText(cvWith([3, 3, 2, 2]), { name: 'cv' });
  t('  the docx generates', built.success === true, built.error);
  const xml = Buffer.from(built.base64, 'base64').toString('latin1');
  const paras = xml.match(/<w:p>[\s\S]*?<\/w:p>/g) || [];
  // The size of the RUN carrying the text, not the first size in the
  // paragraph. A bullet paragraph opens with a navy marker set one step
  // above the body, so reading the paragraph's first w:sz reports the
  // marker and every line looks the same size.
  const szOf = (needle) => {
    const p = paras.filter((x) => x.indexOf(needle) !== -1)[0] || '';
    const runs = p.match(/<w:r>[\s\S]*?<\/w:r>/g) || [];
    for (const r of runs) {
      if (r.indexOf(needle) === -1) continue;
      const m = /<w:sz w:val="(\d+)"\/>/.exec(r);
      if (m) return parseInt(m[1], 10);
    }
    return 0;
  };
  const company = szOf('Meta');
  const heading = szOf('PROFESSIONAL EXPERIENCE');
  const body = szOf('Delivered a substantial');
  t('  the company line is not the same size as the body',
    company > body, 'company=' + company + ' body=' + body);
  t('  the section heading is above the body',
    heading > body, 'heading=' + heading + ' body=' + body);
}

console.log('\nAND NOTHING BREAKS WITHOUT THE GENERATOR PRESENT');
// Loaded on its own, the audit has no way to measure a page. Doing
// nothing is the right answer, not guessing.
{
  const saved = global.DocxGenerator;
  delete global.DocxGenerator;
  try {
    const big = cvWith([6, 6, 5, 5]);
    const out = audit(big);
    t('  no bullets are dropped when nothing can measure',
      !out.report.fixes.some((f) => /Fitted to one page/.test(f)),
      JSON.stringify(out.report.fixes));
  } finally {
    global.DocxGenerator = saved;
  }
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
