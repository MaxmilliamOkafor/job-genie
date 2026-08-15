// "..., WITH ISO 9001."
//
// Read off the real generated CV by a parser:
//
//   "Implemented full-stack observability with the ELK Stack, Prometheus
//    and Grafana, enabling early-warning alerting and cutting mean time
//    to resolution substantially, with iso 9001."
//
//   "Built and maintained CI/CD pipelines with Azure DevOps and GitHub
//    Actions, enabling automated deployments across staging,
//    using as9100."
//
// ISO 9001 is a quality management standard, AS9100 its aerospace
// equivalent. Neither has anything to do with observability or a
// deployment pipeline. They were appended to reach a keyword, and every
// part of the seam shows: a trailing clause with no verb, hanging off a
// sentence that had already finished, in lower case.
//
// A recruiter in that industry reads it as someone who has never worked
// to the standard, which is worse than not matching the keyword at all.
//
// Narrow on purpose. A standard NAMED INSIDE a sentence is real work and
// must survive untouched; only the trailing bolt-on goes.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
for (const f of ['content-quality-engine.js', 'recruiter-audit.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const S = global.RecruiterAudit.stripBoltedStandards;

console.log('THE BOLT-ON GOES');
{
  const cases = [
    ['- Cut mean time to resolution substantially, with iso 9001.', /resolution substantially\.$/],
    ['- Enabled automated deployments across staging, using as9100.', /across staging\.$/],
    ['- Shipped the release, including ISO 13485.', /the release\.$/],
    ['- Ran the line, per ASTM D638.', /the line\.$/],
    ['- Kept the plant running, and NFPA 70.', /plant running\.$/],
  ];
  for (const [line, want] of cases) {
    const r = S(line);
    t('  ' + line.slice(0, 52), want.test(r.text.trim()) && r.removed === 1,
      JSON.stringify(r.text) + ' removed=' + r.removed);
  }
}

console.log('\nBUT A STANDARD INSIDE THE SENTENCE IS REAL WORK AND STAYS');
{
  const keep = [
    '- Audited the assembly line against iso 9001 before release and closed every finding.',
    '- Wrote the AS9100 quality manual for a 40-person plant.',
    '- Held the ISO 13485 certification through two surveillance audits.',
  ];
  for (const line of keep) {
    const r = S(line);
    t('  ' + line.slice(0, 52), r.removed === 0 && /\d/.test(r.text),
      JSON.stringify(r.text) + ' removed=' + r.removed);
  }
}

console.log('\nAND WHAT STAYS IS WRITTEN PROPERLY');
// Lower case is itself the tell that a term was pasted rather than written.
{
  const r = S('- Audited the line against iso 9001 and as9100 before release.');
  t('  iso 9001 -> ISO 9001', /ISO 9001/.test(r.text), r.text);
  t('  as9100 -> AS9100', /AS9100/.test(r.text), r.text);
  t('  and it is counted as a fix', r.recased >= 2, 'recased=' + r.recased);
  const already = S('- Audited against ISO 9001 before release.');
  t('  correct casing is not recounted', already.recased === 0, 'recased=' + already.recased);
}

console.log('\nAND NOTHING ELSE IS TOUCHED');
{
  const line = '- Designed a real-time analytics pipeline in Python with Apache Kafka and Spark, '
    + 'replacing next-day batch reporting.';
  t('  a bullet with no standard is unchanged', S(line).text === line, S(line).text);
  // A skills list legitimately ends in a bare term, so only bullets are
  // eligible for the bolt-on rule.
  const skills = 'Quality Assurance, Lean Manufacturing, ISO 9001';
  t('  a skills line keeps its trailing standard', S(skills).text === skills, S(skills).text);
  const heading = 'TECHNICAL SKILLS';
  t('  a heading is untouched', S(heading).text === heading, S(heading).text);
  t('  empty input is safe', S('').text === '' && S(null).text === '', 'threw or mangled');
}

console.log('\nAND IT RUNS ON THE REAL DOCUMENT, BOTH OF THEM');
{
  const SRC = fs.readFileSync(path.join(DIR, 'recruiter-audit.js'), 'utf8');
  t('  the CV goes through it', /outCV = bolt\.text/.test(SRC), 'not applied to the CV');
  t('  and so does the cover letter',
    /outCL = stripBoltedStandards\(outCL\)\.text/.test(SRC), 'not applied to the cover letter');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
