// EVERY FIXTURE IN THIS PROJECT WAS MISSING A LINE THAT EVERY REAL CV HAS.
//
// Chasing a reported bullet cap against the user's own generated
// document, rather than against a fixture, turned up two faults that no
// existing suite could see. Both come from the same place: the test CVs
// were written as
//
//   Meta
//   Software Engineer
//   January 2023 - Present
//
// and a real one, including every one this extension produces, is
//
//   Meta
//   Dublin, Ireland          <- the location line
//   Software Engineer
//   January 2023 - Present
//
// THE SUMMARY CLAMP DELETED THE REST OF THE CV. clampSummary reads from
// the summary heading to "the next blank line or section header", and
// its list of section headers did not contain PROFESSIONAL EXPERIENCE
// -- the heading the renderer canonicalises everything to. On a
// document with no blank line after the summary paragraph, which is
// what the tailoring model emits, the summary block became the whole
// rest of the file and the 360 character clamp deleted the experience,
// the skills, the projects and the education. It then reported itself
// as the fix "summary clamped to 360 chars".
//
// THE BULLET ACCOUNTING NEVER SAW A SINGLE ROLE. Both bullet passes
// identified a role as "a company line whose NEXT line is a title". On
// a real CV the next line is the location, so no role was recognised --
// and worse, the location line itself was followed by a title, so
// "Dublin, Ireland" registered as the employer and collected every
// bullet in the block.
//
// The lesson is the fixtures, not the regexes. This file feeds the
// passes the shape that actually ships.
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
};
load('docx-generator.js');
load('content-quality-engine.js');
load('recruiter-audit.js');
const RA = global.RecruiterAudit;

// A real generated CV: locations on their own line, and NOT ONE BLANK
// LINE between a section and the next heading.
const REAL = [
  'Maxmilliam Okafor',
  'Business Operations Sr Analyst',
  'Dublin, IE | +353 087 426 1508 | maxokafordev@gmail.com',
  '',
  'PROFESSIONAL SUMMARY',
  'Experienced Business Analyst with over 5 years of expertise in data analysis, '
    + 'process optimisation and project management. Ability to develop and optimise SQL '
    + 'queries and create impactful dashboards in Power BI, facilitating data-driven '
    + 'decision-making across teams.',
  'PROFESSIONAL EXPERIENCE',
  'Meta',
  'Dublin, Ireland',
  'Software Engineer',
  'January 2023 - Present',
  '- Developed and optimised backend services in Python and C++ for the ads delivery '
    + 'platform, serving billions of requests daily.',
  '- Delivered ranking model improvements in Python and PyTorch, achieving a revenue '
    + 'increase sustained over a four-week live test.',
  'Citigroup',
  'London, United Kingdom',
  'Data Analyst',
  'August 2017 - March 2021',
  '- Rebuilt the credit risk reporting suite in SQL and Python for a consumer lending '
    + 'portfolio, standardising exposure figures for risk and finance.',
  'TECHNICAL SKILLS',
  'SQL, Power BI, Excel, Python, Tableau, Airflow, Snowflake, dbt, Data Analysis',
  'EDUCATION',
  'Imperial College London',
].join('\n');

const PROFILE = [
  { company: 'Meta',
    bullets: [
      'Build and own backend services written in Python and C++ for the ads delivery '
        + 'platform, which serves billions of requests daily, and cut response times by '
        + 'running downstream calls in parallel rather than in sequence.',
      'Deliver ranking model improvements in Python and PyTorch, including new inputs '
        + 'derived from advertiser bid history, which produced a revenue increase that '
        + 'held across a four week live test.',
      'Hold primary on call responsibility for two critical services. Authored the '
        + 'incident response documentation the team now uses, and led the review that '
        + 'resolved a failure which had recurred monthly for over a year.',
    ] },
  { company: 'Citigroup',
    bullets: [
      'Rebuilt the credit risk reporting suite in SQL and Python for a GBP 2.6bn '
        + 'consumer lending portfolio, replacing four conflicting sources with a single '
        + 'agreed set of exposure figures used daily by risk and finance.',
      'Trained 24 analysts across the London and Belfast offices in SQL and Power BI, '
        + 'reducing turnaround on routine data requests to same day.',
    ] },
];

const out = RA.runRecruiterAudit({
  cvText: REAL, jdText: 'business operations analyst SQL Power BI',
  jdTitle: 'Business Operations Sr Analyst',
  jobKeywords: ['SQL', 'Power BI', 'Excel', 'Data Analysis'],
  experience: PROFILE,
});

console.log('THE CV STILL HAS A CV IN IT');
for (const head of ['PROFESSIONAL SUMMARY', 'PROFESSIONAL EXPERIENCE',
  'TECHNICAL SKILLS', 'EDUCATION']) {
  t('  ' + head + ' survives the audit',
    out.cvText.indexOf(head) !== -1, JSON.stringify(out.cvText.slice(0, 400)));
}
t('  and so do the employers', /Meta/.test(out.cvText) && /Citigroup/.test(out.cvText),
  out.cvText);
t('  the audit does not claim it clamped a summary it had not found',
  !out.report.fixes.some((f) => /clamped/.test(f))
    || out.cvText.indexOf('PROFESSIONAL EXPERIENCE') !== -1,
  JSON.stringify(out.report.fixes));

console.log('\nAND THE CLAMP STILL WORKS WHERE IT SHOULD');
{
  const longSummary = ['NAME', '', 'PROFESSIONAL SUMMARY',
    ('Seasoned professional with deep expertise in operations and analytics. ').repeat(9),
    'PROFESSIONAL EXPERIENCE', 'Meta', 'Dublin, Ireland', 'Engineer',
    'January 2023 - Present', '- Did the work.'].join('\n');
  const o = RA.runRecruiterAudit({ cvText: longSummary, jdText: 'ops', jdTitle: 'Analyst',
    jobKeywords: ['SQL'], experience: [] });
  const body = o.cvText.split('\n')[o.cvText.split('\n')
    .findIndex((l) => l.trim() === 'PROFESSIONAL SUMMARY') + 1];
  t('  an over-long summary is still clamped', body.length <= 400, body.length + ' chars');
  t('  ...and the experience below it is still there',
    /PROFESSIONAL EXPERIENCE/.test(o.cvText) && /Did the work/.test(o.cvText), o.cvText);
}

console.log('\nTHE ROLES ARE FOUND THROUGH THE LOCATION LINE');
{
  const w = out.report.warnings.find((x) => /^profile-bullets-/.test(x.kind));
  t('  the bullet accounting sees the roles at all', !!w, 'no accounting ran');
  t('  ...and files them under the employer, not the city',
    !!w && w.roles.every((r) => /Meta|Citigroup/.test(r.company)),
    JSON.stringify(w && w.roles.map((r) => r.company)));
  t('  ...and never under "Dublin"',
    !!w && !w.roles.some((r) => /Dublin|London/.test(r.company)),
    JSON.stringify(w && w.roles.map((r) => r.company)));
}

console.log('\nAND EVERY PROFILE BULLET REACHES THE PAGE');
{
  const bullets = out.cvText.split('\n').filter((l) => /^\s*[-•*]/.test(l));
  t('  five in the profile, five on the CV', bullets.length === 5,
    bullets.length + ': ' + JSON.stringify(bullets.map((b) => b.slice(0, 50))));
  t('  the one the tailoring dropped is back',
    bullets.some((b) => /on call responsibility/.test(b)), JSON.stringify(bullets));
  t('  ...and the one it dropped from the older role too',
    bullets.some((b) => /Trained 24 analysts/.test(b)), JSON.stringify(bullets));
}

console.log('\nA COMPRESSION IS NOT A DIFFERENT BULLET');
{
  // The match test used to run one way only, so a heavily compressed
  // rewrite scored 0.33 against its own source and the restore printed
  // BOTH of them. Every bullet here has a rewrite on the CV; nothing
  // may be duplicated.
  const bullets = out.cvText.split('\n').filter((l) => /^\s*[-•*]/.test(l))
    .map((b) => b.replace(/^\s*[-•*]\s*/, ''));
  const dupes = bullets.filter((b, i) => bullets.some((o, j) =>
    j !== i && o.slice(0, 60) === b.slice(0, 60)));
  t('  no bullet appears twice', dupes.length === 0, JSON.stringify(dupes));
  t('  the compressed rewrite is what prints, not the source',
    bullets.some((b) => /billions of requests daily/.test(b))
      && !bullets.some((b) => /running downstream calls in parallel/.test(b)),
    JSON.stringify(bullets.map((b) => b.slice(0, 60))));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
