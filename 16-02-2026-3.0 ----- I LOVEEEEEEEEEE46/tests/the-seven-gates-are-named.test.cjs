// WHICH WALL DID I HIT?
//
// Thirty-four warning kinds tell you what is wrong with a CV. None of
// them tells you which of the seven screening gates actually stopped
// the application -- and that is the only question worth answering,
// because the gates are sequential and failing the first makes the
// other six irrelevant.
//
//   1 ATS PARSING          can the software read it at all
//   2 HARD QUALIFICATIONS  does it satisfy the stated requirements
//   3 KEYWORD MATCH        coverage of the posting's own terms
//   4 SEMANTIC EVIDENCE    is the claim PROVEN in the work history
//   5 DISCOVERABILITY      does it surface in a recruiter search
//   6 RECRUITER SKIM       does it survive ten seconds of a human
//   7 MANAGER EVIDENCE     ownership, results, measurable impact
//
// Gate 4 is the one most tools never check: a keyword listed under
// skills and never demonstrated in a bullet is a claim without proof,
// and a hiring manager reads it exactly that way.
//
// DELIBERATELY NO AGGREGATE SCORE. Jobscan says 71 and Resume Worded
// says 55 for the same CV against the same posting, and neither is
// what Workday computes. A named gate with its reason is actionable; a
// number is something to optimise for.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
for (const f of ['docx-generator.js', 'content-quality-engine.js', 'recruiter-audit.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const RA = global.RecruiterAudit;

const KW = ['SQL', 'Python', 'Power BI', 'Tableau', 'forecasting'];
const JD = 'Data Analyst with SQL, Python, Power BI, Tableau and forecasting.';
const strong = ['Maxmilliam Okafor', 'Data Analyst',
  'Dublin, IE | +353 087 426 1508 | maxokafordev@gmail.com | linkedin.com/in/maxokafor', '',
  'PROFESSIONAL SUMMARY', 'Data Analyst with five years in credit risk analytics.',
  'PROFESSIONAL EXPERIENCE', 'Citigroup\tLondon, United Kingdom', 'Data Analyst',
  'August 2017 - March 2021',
  '- Rebuilt the credit risk reporting suite in SQL and Python for a GBP 2.6bn portfolio.',
  '- Replaced a 40 tab Excel pack with Power BI and Tableau, cutting the cycle to three days.',
  '- Built the forecasting model that set the monthly provision, tested over four years of data.',
  '- Trained 24 analysts across two offices, cutting turnaround to same day.',
  'TECHNICAL SKILLS', 'Programming: SQL, Python, Power BI, Tableau',
  'EDUCATION', 'MSc Machine Learning, Distinction', 'Imperial College London'].join('\n');

const run = (cv, jd, kws, title) => RA.runRecruiterAudit({
  cvText: cv, jdText: jd === undefined ? JD : jd, jdTitle: title === undefined ? 'Data Analyst' : title,
  jobKeywords: kws === undefined ? KW : kws,
  experience: [{ company: 'Citigroup', location: 'London, United Kingdom' }],
});
const gate = (o, id) => (o.report.filters || []).find((f) => f.id === id) || {};

console.log('ALL SEVEN GATES ARE REPORTED, EVERY TIME');
{
  const o = run(strong);
  t('  seven of them', (o.report.filters || []).length === 7,
    JSON.stringify((o.report.filters || []).map((f) => f.id)));
  for (const id of ['ats-parsing', 'hard-qualifications', 'keyword-match', 'semantic-evidence',
    'discoverability', 'recruiter-skim', 'manager-evidence']) {
    t('  ' + id + ' is named', !!gate(o, id).name, JSON.stringify(o.report.filters));
  }
  t('  and every gate carries a status',
    (o.report.filters || []).every((f) => ['pass', 'weak', 'fail'].indexOf(f.status) !== -1),
    JSON.stringify((o.report.filters || []).map((f) => f.status)));
}

console.log('\nA STRONG CV CLEARS THE GATES THAT MATTER');
{
  const o = run(strong);
  for (const id of ['ats-parsing', 'keyword-match', 'semantic-evidence', 'discoverability']) {
    t('  ' + id + ' passes', gate(o, id).status === 'pass',
      JSON.stringify(gate(o, id).reasons));
  }
  t('  no gate is blocking',
    !o.report.warnings.some((w) => w.kind === 'filters-blocking'),
    JSON.stringify((o.report.warnings.find((w) => w.kind === 'filters-blocking') || {}).note));
}

console.log('\nAND EACH GATE FAILS FOR ITS OWN REASON');
{
  // 1. PARSING: no experience heading the software can find.
  //
  // Scored DIRECTLY, because the pipeline repairs this before the
  // gates run -- ensureExperienceHeading inserts the heading, so a
  // full audit can never fail here. That is the right behaviour and it
  // is why the gate must be exercised on unrepaired input.
  const noHead = strong.replace('PROFESSIONAL EXPERIENCE', 'WHERE I HAVE BEEN');
  const direct = RA.scoreSevenFilters({
    cvText: noHead, jdText: JD, jdTitle: 'Data Analyst', jobKeywords: KW, warnings: [],
  });
  const g = direct.find((f) => f.id === 'ats-parsing');
  t('  parsing fails with no recognisable experience heading',
    g.status === 'fail', JSON.stringify(g));
  t('  ...and the pipeline repairs it before it can bite',
    gate(run(noHead), 'ats-parsing').status === 'pass',
    JSON.stringify(gate(run(noHead), 'ats-parsing')));
}
{
  // 3. KEYWORDS: the posting asks for things the page never says.
  const o = run(strong, 'Kubernetes, Terraform, Go, Kafka and Rust.',
    ['Kubernetes', 'Terraform', 'Go', 'Kafka', 'Rust']);
  t('  keyword match fails on low coverage', gate(o, 'keyword-match').status === 'fail',
    JSON.stringify(gate(o, 'keyword-match')));
  t('  ...and says how many were found',
    /^\d+ of \d+ posting terms present$/.test(gate(o, 'keyword-match').note || ''),
    JSON.stringify(gate(o, 'keyword-match').note));
}
{
  // 4. SEMANTIC EVIDENCE: every term is in the skills line and none is
  //    in the work. The gate nobody else checks.
  const listed = ['Maxmilliam Okafor', 'Data Analyst',
    'Dublin, IE | +353 087 426 1508 | maxokafordev@gmail.com | linkedin.com/in/maxokafor', '',
    'PROFESSIONAL SUMMARY', 'Analyst.',
    'PROFESSIONAL EXPERIENCE', 'Citigroup\tLondon, United Kingdom', 'Data Analyst',
    'August 2017 - March 2021',
    '- Produced the monthly management pack for the lending committee.',
    '- Supported the quarterly audit across four teams.',
    'TECHNICAL SKILLS', 'Programming: SQL, Python, Power BI, Tableau, forecasting',
    'EDUCATION', 'MSc Machine Learning', 'Imperial College London'].join('\n');
  const o = run(listed);
  t('  semantic evidence fails when the terms live only in the skills list',
    gate(o, 'semantic-evidence').status === 'fail', JSON.stringify(gate(o, 'semantic-evidence')));
  t('  ...while keyword match still passes, which is the whole point',
    gate(o, 'keyword-match').status === 'pass', JSON.stringify(gate(o, 'keyword-match')));
}
{
  // 5. DISCOVERABILITY: the target role is nowhere near the top.
  // Scored directly, for the same reason as gate 1: ensureHeadline
  // writes the target role into the header, so the full pipeline
  // always satisfies this gate.
  const direct = RA.scoreSevenFilters({
    cvText: strong, jdText: JD, jdTitle: 'Revenue Operations Manager',
    jobKeywords: KW, warnings: [],
  });
  const g = direct.find((f) => f.id === 'discoverability');
  t('  discoverability fails when the target role is not in the header',
    g.status === 'fail', JSON.stringify(g));
  t('  ...and the pipeline puts it there, so the real run passes',
    gate(run(strong, JD, KW, 'Revenue Operations Manager'), 'discoverability').status === 'pass',
    JSON.stringify(gate(run(strong, JD, KW, 'Revenue Operations Manager'), 'discoverability')));
}
{
  // 7. MANAGER EVIDENCE: real work, no numbers anywhere.
  const vague = strong
    .replace(/- Rebuilt[^\n]*/, '- Rebuilt the credit risk reporting suite in SQL and Python.')
    .replace(/- Replaced[^\n]*/, '- Replaced the Excel pack with Power BI and Tableau.')
    .replace(/- Built[^\n]*/, '- Built the forecasting model that set the provision.')
    .replace(/- Trained[^\n]*/, '- Trained analysts in the reporting tools.');
  t('  manager evidence drops when nothing is measured',
    gate(run(vague), 'manager-evidence').status !== 'pass',
    JSON.stringify(gate(run(vague), 'manager-evidence')));
}

console.log('\nA BLOCKED APPLICATION SAYS SO IN ONE LINE');
{
  const o = run(strong, 'Kubernetes and Terraform.', ['Kubernetes', 'Terraform'],
    'Platform Engineer');
  const w = o.report.warnings.find((x) => x.kind === 'filters-blocking');
  t('  the blocking warning fires', !!w, JSON.stringify(o.report.filters));
  t('  ...naming the gates', !!w && w.samples.length >= 1, JSON.stringify(w && w.samples));
  t('  ...with the reason for each', !!w && /\(/.test(w.note), JSON.stringify(w && w.note));
}

console.log('\nAND THERE IS STILL NO AGGREGATE NUMBER TO GAME');
{
  const o = run(strong);
  t('  no overall score on the report',
    typeof o.report.score === 'undefined' && typeof o.report.atsScore === 'undefined'
      && typeof o.report.total === 'undefined',
    'an aggregate appeared');
  t('  and no per-gate number either, only a verdict',
    (o.report.filters || []).every((f) => typeof f.score === 'undefined'),
    JSON.stringify((o.report.filters || []).map((f) => f.score)));
}

console.log('\nAND NOTHING COVERT IS EVER WRITTEN');
{
  // The obvious way to "beat" a parser is white text, a hidden keyword
  // block, or a zero-size font. All three are detected by the same
  // parsers they are meant to fool, and the candidate is not screened
  // out but blacklisted. This asserts the generator never emits them.
  const G = global.DocxGenerator;
  const built = G.fromCvText(strong, {});
  const os = require('os'), cp = require('child_process');
  const tmp = path.join(os.tmpdir(), 'jg-covert-' + Date.now() + '.docx');
  fs.writeFileSync(tmp, Buffer.from(built.base64, 'base64'));
  const xml = cp.execSync('python3 -c ' + JSON.stringify(
    'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
  ) + ' ' + JSON.stringify(tmp)).toString();
  fs.unlinkSync(tmp);
  t('  no white or near-white text', !/<w:color w:val="(FFFFFF|FEFEFE|FDFDFD)"/i.test(xml),
    'invisible text is on the page');
  t('  no zero or hairline font size', !/<w:sz w:val="([0-4]|[0-9])"\/>/.test(xml),
    'text sized to be unreadable');
  t('  no vanish or hidden run property', !/<w:vanish\/>/.test(xml), 'hidden runs present');
  t('  and every rendered word is in the visible text stream',
    xml.indexOf('Rebuilt the credit risk reporting suite') !== -1, 'content missing from the stream');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
