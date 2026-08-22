// THE SKILLS SECTION OPENED WITH PYTORCH ON A BUSINESS OPERATIONS CV.
//
// The grouping worked. What it grouped by was wrong. On a Senior
// Business Operations Analyst posting, the generated section led with
// deep learning frameworks and container orchestration, and SQL and
// Power BI -- the two tools the posting actually named -- sat on the
// unlabelled "Additional:" line underneath.
//
// THREE SEPARATE FAULTS, each enough on its own:
//
//   1. RELEVANCE WAS MEASURED ON LETTERS. The test was a two-way
//      indexOf, so a one or two letter skill matched almost every
//      keyword on the page: "R" is inside "reporting", "C" is inside
//      "customer support", "Go" is inside "Django". With every group
//      scoring hits, relevance was noise and the order fell through to
//      taxonomy order, which is alphabet-of-engineering order and has
//      nothing to do with the job.
//
//   2. THE GROUP THAT LOST ITS LABEL WAS THE SMALLEST ONE. When there
//      are more groups than lines, something has to go down to
//      "Additional:". Picking the smallest picks the specialist group
//      -- which on a business posting is the relevant one, because the
//      relevant terms are few and the irrelevant ones are many.
//
//   3. AN ANCHORED PATTERN LOSES A QUALIFIED TERM. Every pattern in the
//      taxonomy is ^...$, which is what stops "Customer Support" being
//      read as a programming language. It also means "Advanced SQL",
//      "Power BI Dashboards" and "Python (pandas)" match nothing at all.
//
// What a recruiter does with a skills section is decide in about a
// second whether this CV is for the job in front of them. Leading it
// with the wrong discipline answers that question no.
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
load('docx-generator.js');
load('content-quality-engine.js');
load('recruiter-audit.js');
const RA = global.RecruiterAudit;

const cvWith = (skills) => ['Maxmilliam Okafor', 'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Analyst.', '',
  'TECHNICAL SKILLS', skills, '',
  'PROFESSIONAL EXPERIENCE',
  'Meta', 'Business Operations Analyst', 'January 2023 - Present', '- Did work.', '',
  'EDUCATION', 'Imperial College London'].join('\n');

const sectionOf = (cvText) => {
  const lines = cvText.split('\n');
  const at = lines.findIndex((l) => /^TECHNICAL SKILLS$/i.test(l.trim()));
  const body = [];
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) { if (body.length) break; continue; }
    if (/^[A-Z][A-Z &/]{3,}$/.test(l)) break;
    body.push(l);
  }
  return body;
};

const run = (skills, kw, title) => sectionOf(RA.runRecruiterAudit({
  cvText: cvWith(skills), jdText: (kw || []).join(' '),
  jdTitle: title || 'Senior Business Operations Analyst', jobKeywords: kw || [],
}).cvText);

const labelled = (body, term) => {
  const line = body.find((l) => new RegExp('(?:^|[:,]\\s)'
    + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:,|$)', 'i').test(l));
  return line ? line.split(':')[0] : null;
};

// The list as it went out, with the ML tooling the candidate genuinely
// has and the business tooling the posting genuinely asked for.
const BIZ = 'Stakeholder Management, Process Improvement, Cross-Functional Collaboration, '
  + 'SQL, Power BI, Excel, Tableau, Python, R, Data Analysis, Forecasting, '
  + 'PyTorch, TensorFlow, Deep Learning, Machine Learning, NLP, Computer Vision, '
  + 'Kubernetes, Docker, Terraform, AWS, CI/CD, Jenkins, Microservices, '
  + 'Distributed Systems, PostgreSQL, MongoDB, Snowflake, dbt, Airflow';
const JD = ['SQL', 'Power BI', 'Excel', 'Forecasting', 'Stakeholder Management',
  'Data Analysis', 'Process Improvement'];

console.log('THE POSTING THAT WAS REPORTED');
const body = run(BIZ, JD);
console.log(body.map((l) => '    ' + l).join('\n'));
{
  t('  the section is still grouped at all', body.length > 1
    && body.every((l) => /^[A-Z][A-Za-z &/]{1,28}: \S/.test(l)), JSON.stringify(body));
  t('  the tailored competencies still lead', /^Core Competencies:/.test(body[0]),
    JSON.stringify(body[0]));

  // The whole complaint, in one line each.
  t('  SQL keeps a label rather than falling to Additional',
    labelled(body, 'SQL') !== null && labelled(body, 'SQL') !== 'Additional',
    String(labelled(body, 'SQL')));
  t('  Power BI keeps a label too',
    labelled(body, 'Power BI') !== null && labelled(body, 'Power BI') !== 'Additional',
    String(labelled(body, 'Power BI')));

  // WHAT "OPENS THE SECTION" MEANS, EXACTLY. A group is a whole line
  // and a line holds a dozen terms, so a line is not disqualified by
  // carrying PyTorch somewhere along it -- the candidate does have
  // PyTorch and it belongs on the CV. What matters is the first thing
  // read after the label, which is what a one second scan gets.
  const first = (body[1] || '');
  const opener = first.replace(/^[^:]*:\s*/, '').split(/\s*,\s*/).slice(0, 2).join(', ');
  t('  the section does not open on deep learning',
    !/PyTorch|TensorFlow|Deep Learning|Computer Vision/.test(opener), first);
  t('  ...nor on container orchestration', !/Kubernetes|Terraform/.test(opener), first);

  // And the positive form of the same claim: whatever leads, it is a
  // group carrying something the posting named, led by that term.
  const asked = JD.map((k) => k.toLowerCase());
  t('  the first labelled group after the competencies is one the posting asked for',
    asked.some((k) => first.toLowerCase().indexOf(k) !== -1), first);
  t('  ...and it opens on the asked-for term itself',
    asked.some((k) => opener.toLowerCase().indexOf(k) !== -1), opener);

  const flat = body.join(' | ');
  t('  Power BI is named before PyTorch on the page',
    flat.indexOf('Power BI') < flat.indexOf('PyTorch'), flat);
  t('  and before Kubernetes', flat.indexOf('Power BI') < flat.indexOf('Kubernetes'), flat);
  t('  Excel and Forecasting are not left on the unlabelled line',
    labelled(body, 'Excel') !== 'Additional' && labelled(body, 'Forecasting') !== 'Additional',
    JSON.stringify([labelled(body, 'Excel'), labelled(body, 'Forecasting')]));
}

console.log('\nA QUALIFIED TERM IS STILL THE SAME TERM');
{
  const QUAL = 'Stakeholder Management, Process Improvement, Advanced SQL, '
    + 'Power BI Dashboards, Python (pandas), Expert Excel, Data Analysis, '
    + 'Forecasting, PyTorch, TensorFlow, Kubernetes, Docker, AWS, PostgreSQL, '
    + 'Machine Learning, Airflow, Snowflake, Jenkins';
  const b = run(QUAL, JD);
  for (const term of ['Advanced SQL', 'Power BI Dashboards', 'Python (pandas)']) {
    const got = labelled(b, term);
    t('  "' + term + '" is classified, not dumped in Additional',
      got !== null && got !== 'Additional', String(got) + ' :: ' + JSON.stringify(b));
  }
  t('  ...and prints exactly as the CV wrote it, qualifier and all',
    /Advanced SQL/.test(b.join(' ')) && /Power BI Dashboards/.test(b.join(' ')),
    JSON.stringify(b));
}

console.log('\nRELEVANCE IS MEASURED ON WORDS, NOT ON LETTERS');
{
  // "R" and "C" are real skills and real substrings of ordinary English.
  // Under the old two-way indexOf both matched "reporting" and
  // "customer support", so Programming Languages scored against a
  // posting that never mentioned a language.
  const LETTERS = 'Stakeholder Management, Process Improvement, R, C, Go, '
    + 'Customer Support, Troubleshooting, Jira, Zendesk, Salesforce, ServiceNow, '
    + 'Active Directory, Office 365, Windows Support, macOS Support, Reporting, '
    + 'Documentation, SLA Management, Escalation Management, Ticketing Systems';
  const b = run(LETTERS, ['Customer Support', 'Troubleshooting', 'Zendesk',
    'Escalation Management', 'Reporting'], 'Product Support Specialist');
  const first = (b[1] || '');
  t('  a support posting does not lead on programming languages',
    !/^Programming Languages/.test(first), first + ' :: ' + JSON.stringify(b));
  t('  it leads on the support tooling it named',
    /Zendesk|Customer Support|Troubleshooting/.test(first), first);
}

console.log('\nAND THE ASKED-FOR TERM LEADS ITS OWN LINE');
{
  // A labelled line is read left to right and abandoned early. Eighth
  // on the line is past where a scan reaches.
  const b = run(BIZ, JD);
  const line = b.find((l) => /^(?:Data|Databases)/.test(l)) || '';
  const terms = line.replace(/^[^:]*:\s*/, '').split(/\s*,\s*/);
  const at = (s) => terms.findIndex((x) => x.toLowerCase() === s.toLowerCase());
  t('  Power BI is ahead of PyTorch on its own line',
    at('Power BI') !== -1 && (at('PyTorch') === -1 || at('Power BI') < at('PyTorch')),
    line);
  t('  ...and Data Analysis ahead of Computer Vision',
    at('Data Analysis') === -1 || at('Computer Vision') === -1
      || at('Data Analysis') < at('Computer Vision'), line);
}

console.log('\nWITH NO POSTING TO GO ON, NOTHING IS REORDERED ON A GUESS');
{
  const b = run(BIZ, []);
  t('  it still groups', b.length > 1 && /^Core Competencies:/.test(b[0]), JSON.stringify(b));
  // Nothing to rank against, so the fixed taxonomy order stands and the
  // groups come out in the same order every time. An unranked section
  // is not a licence to shuffle.
  const seq = ['Programming Languages', 'Cloud & DevOps', 'Data & AI', 'Databases'];
  const at = seq.map((s) => b.findIndex((l) => l.indexOf(s + ':') === 0));
  t('  and falls back to taxonomy order rather than an arbitrary one',
    at.every((i) => i > 0) && at.every((v, i) => i === 0 || at[i - 1] < v),
    JSON.stringify(b));
}

console.log('\nAND NOT ONE TERM IS LOST TO ANY OF IT');
{
  const b = run(BIZ, JD);
  const recovered = b.join(', ').replace(/^[A-Z][A-Za-z &/]{1,28}: /gm, '')
    .split(/\s*,\s*/).map((s) => s.replace(/^[A-Z][A-Za-z &/]{1,28}:\s*/, '').trim())
    .filter(Boolean).map((s) => s.toLowerCase());
  const missing = BIZ.split(/\s*,\s*/).map((s) => s.trim().toLowerCase())
    .filter((s) => !recovered.some((r) => r === s || r.indexOf(s) !== -1));
  t('  every term the CV listed survives the grouping', missing.length === 0,
    JSON.stringify(missing));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
