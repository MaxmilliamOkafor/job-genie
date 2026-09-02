// TWENTY-THREE ITEMS UNDER "SOFT SKILLS", MOST OF THEM NOT SKILLS.
//
// Shipped verbatim on a generated CV:
//
//   Soft Skills: Communication, Problem-solving, Collaboration,
//   Training, Communication Skills, oracle e-business suite (EBS),
//   requirements gathering, solution design, functional testing,
//   configuration, iprocurement, purchasing, contract lifecycle
//   management, 10+ years experience, oracle certifications, oracle
//   cloud, oracle apex, business analysis, process improvement, oracle
//   cloud development, project costing, federal financials,
//   myoraclesupport
//
// A duration. A credential class. A support portal. A duplicate of an
// item three places to its left. Eighteen hard and domain skills under
// a soft-skills label, all lower case beside "Python, Java". Every one
// a posting phrase that reached the page unread.
//
// Four rules now, and the third is the one that matters most: a real
// skill under the wrong label is MOVED, not dropped. Losing
// "requirements gathering" from a business-analyst CV to tidy a label
// would trade one fault for a worse one.
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

const THE_LINE = 'Soft Skills: Communication, Problem-solving, Collaboration, Training, '
  + 'Communication Skills, oracle e-business suite (EBS), requirements gathering, '
  + 'solution design, functional testing, configuration, iprocurement, purchasing, '
  + 'contract lifecycle management, 10+ years experience, oracle certifications, '
  + 'oracle cloud, oracle apex, business analysis, process improvement, '
  + 'oracle cloud development, project costing, federal financials, myoraclesupport';

const cvWith = (skillsLines) => ['Maxmilliam Okafor', 'Oracle EBS Business Analyst',
  'Dublin, IE | maxokafordev@gmail.com', '',
  'TECHNICAL SKILLS', ...skillsLines, '',
  'EDUCATION', 'Imperial College London'].join('\n');

const out = RA.sanitiseSkillsSection(cvWith([
  'Languages & Citizenship: English (native), French (native) - EU Citizen',
  'Programming: Python, Java, TypeScript, C++, SQL',
  'Cloud & DevOps: AWS, Azure, Google Cloud Platform, Kubernetes, Docker, Terraform',
  THE_LINE,
]));
const lineFor = (label) => out.text.split('\n').find((l) => l.indexOf(label + ':') === 0) || '';

console.log('WHAT IS NOT A SKILL IS GONE');
for (const junk of ['10+ years experience', 'oracle certifications', 'myoraclesupport']) {
  t('  "' + junk + '" is dropped', out.text.toLowerCase().indexOf(junk.toLowerCase()) === -1,
    out.text.split('\n').find((l) => l.toLowerCase().indexOf(junk.toLowerCase()) !== -1));
}
t('  and a near-duplicate goes with it',
  out.text.indexOf('Communication Skills') === -1 && /\bCommunication\b/.test(out.text),
  lineFor('Soft Skills'));

console.log('\nSOFT SKILLS ARE THE ONLY THING LEFT UNDER "SOFT SKILLS"');
{
  const soft = lineFor('Soft Skills');
  t('  the genuine four remain',
    ['Communication', 'Problem-solving', 'Collaboration', 'Training']
      .every((s) => soft.indexOf(s) !== -1), soft);
  for (const wrong of ['oracle', 'requirements gathering', 'purchasing', 'apex']) {
    t('  "' + wrong + '" is no longer under it',
      soft.toLowerCase().indexOf(wrong) === -1, soft);
  }
}

console.log('\nBUT THE REAL SKILLS ARE MOVED, NOT LOST');
{
  const dom = lineFor('Domain Expertise');
  t('  a Domain Expertise line exists', !!dom, out.text);
  for (const kept of ['Requirements Gathering', 'Solution Design', 'Functional Testing',
    'Business Analysis']) {
    t('  "' + kept + '" survives there', dom.indexOf(kept) !== -1, dom);
  }
  t('  and the count is reported as moved, not dropped', out.moved >= 8,
    JSON.stringify({ moved: out.moved, dropped: out.dropped }));
}

console.log('\nAND LOWER-CASE ITEMS ARE CASED LIKE THE REST OF THE PAGE');
{
  t('  "oracle e-business suite (EBS)" -> "Oracle E-Business Suite (EBS)"',
    out.text.indexOf('Oracle E-Business Suite (EBS)') !== -1,
    out.text.split('\n').find((l) => /E-Business/i.test(l)));
  t('  "iprocurement" -> "iProcurement"', out.text.indexOf('iProcurement') !== -1,
    out.text.split('\n').find((l) => /procurement/i.test(l)));
  t('  and a human\'s own casing is never overwritten',
    /Python, Java, TypeScript, C\+\+, SQL/.test(out.text)
      && /Google Cloud Platform/.test(out.text), lineFor('Programming'));
}

console.log('\nAND NO GROUP RUNS PAST THE POINT ANYONE READS');
{
  for (const line of out.text.split('\n')) {
    if (line.indexOf(':') === -1 || /@|Citizenship/.test(line)) continue;
    const n = line.split(':')[1].split(',').length;
    t('  "' + line.split(':')[0] + '" holds ' + n + ' items', n <= 10, line);
  }
}

console.log('\nA CLEAN SECTION IS LEFT EXACTLY AS IT IS');
{
  const clean = cvWith([
    'Programming: Python, SQL, Java',
    'Cloud & DevOps: AWS, Docker, Terraform',
    'Soft Skills: Communication, Stakeholder Management, Mentoring',
  ]);
  const o = RA.sanitiseSkillsSection(clean);
  t('  nothing is dropped or moved', o.dropped === 0 && o.moved === 0,
    JSON.stringify({ dropped: o.dropped, moved: o.moved, samples: o.samples }));
  t('  and the text is byte-identical', o.text === clean, 'a clean section was rewritten');
}

console.log('\nAND THE CITIZENSHIP LINE IS NEVER TREATED AS A SKILL LIST');
{
  const o = RA.sanitiseSkillsSection(cvWith([
    'Languages & Citizenship: English (native), French (native), Spanish (advanced), '
      + 'German (advanced) - EU Citizen',
    'Programming: Python, SQL',
  ]));
  t('  it survives whole',
    /Languages & Citizenship: English \(native\), French \(native\), Spanish \(advanced\), German \(advanced\) - EU Citizen/.test(o.text),
    o.text.split('\n').find((l) => /Citizenship/.test(l)));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
