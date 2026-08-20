// THE SKILLS SECTION IS SCANNED, NOT READ.
//
// Merging the two skills sections fixed the parsing and produced this,
// verbatim, on a real generated CV for a support role:
//
//   TECHNICAL SKILLS
//   Customer Support, Cybersecurity Solutions, Technical Problem-Solving,
//   Team Collaboration, Training and Mentoring, Windows and macOS
//   Support, collaborative mindset, discipline, customer-centric
//   mentality, Python, Java, TypeScript, C++, SQL, Node.js, React, AWS,
//   Azure, Google Cloud Platform, Kubernetes, Docker, Terraform, Machine
//   Learning, Deep Learning, PyTorch, TensorFlow, NLP, Apache Spark,
//   Airflow, Kafka, Snowflake, ETL, CI/CD, Jenkins, GitHub Actions,
//   Cybersecurity, Bash, macOS, Coaching
//
// Thirty-eight terms, and a recruiter filling a support role has to read
// all of them to find out whether the two that matter are there. Three
// of them are not skills at all, and two are listed twice.
//
// Labelled groups are read by jumping to the label. An ATS is
// indifferent: "Programming Languages: Python, Java" carries the same
// terms behind the same comma delimiter it already parses.
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

const LIVE = 'Customer Support, Cybersecurity Solutions, Technical Problem-Solving, '
  + 'Team Collaboration, Training and Mentoring, Windows and macOS Support, '
  + 'collaborative mindset, discipline, customer-centric mentality, Python, Java, '
  + 'TypeScript, C++, SQL, Node.js, React, AWS, Azure, Google Cloud Platform, '
  + 'Kubernetes, Docker, Terraform, Machine Learning, Deep Learning, PyTorch, '
  + 'TensorFlow, NLP, Apache Spark, Airflow, Kafka, Snowflake, ETL, CI/CD, Jenkins, '
  + 'GitHub Actions, Cybersecurity, Bash, macOS, Coaching';

const cvWith = (skills) => ['Maxmilliam Okafor', 'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Engineer.', '',
  'TECHNICAL SKILLS', skills, '',
  'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer', 'January 2023 - Present', '- Did work.', '',
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

const run = (skills, kw) => RA.runRecruiterAudit({
  cvText: cvWith(skills), jdText: (kw || []).join(' '),
  jdTitle: 'Product Support Specialist', jobKeywords: kw || [],
});

console.log('THE LIVE CV, GROUPED');
const out = run(LIVE, ['Customer Support', 'Windows', 'macOS', 'Cybersecurity', 'Troubleshooting']);
const body = sectionOf(out.cvText);
console.log(body.map((l) => '    ' + l).join('\n'));

t('  every line carries a label', body.every((l) => /^[A-Z][A-Za-z &/]{1,28}: \S/.test(l)),
  JSON.stringify(body));
t('  the competencies group leads, where a recruiter scans',
  /^Core Competencies:/.test(body[0]), JSON.stringify(body[0]));
t('  the groups the posting asked for come next',
  /^(Support|Security)/.test(body[1] || ''), JSON.stringify(body.slice(0, 3)));
t('  it is reported as a fix', out.report.fixes.some((f) => /Grouped the skills/.test(f)),
  JSON.stringify(out.report.fixes));

console.log('\nAND NOT ONE TERM IS LOST TO IT');
const recovered = body.join(', ').split(/\s*,\s*/)
  .map((s) => s.replace(/^[A-Z][A-Za-z &/]{1,28}:\s*/, '').trim());
for (const term of ['Customer Support', 'Technical Problem-Solving', 'Team Collaboration',
  'Training and Mentoring', 'Windows and macOS Support', 'Python', 'Java', 'TypeScript',
  'C++', 'SQL', 'Node.js', 'React', 'AWS', 'Azure', 'Google Cloud Platform', 'Kubernetes',
  'Docker', 'Terraform', 'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow',
  'NLP', 'Apache Spark', 'Airflow', 'Kafka', 'Snowflake', 'ETL', 'CI/CD', 'Jenkins',
  'GitHub Actions', 'Bash', 'Coaching']) {
  t('  keeps ' + term, recovered.includes(term), JSON.stringify(recovered));
}

console.log('\nWHAT WAS NEVER A SKILL DOES NOT GET A LABEL, IT GOES');
// The exact-match list caught "entrepreneurial mindset" and missed
// "collaborative mindset". A shape catches both.
for (const junk of ['collaborative mindset', 'discipline', 'customer-centric mentality']) {
  t('  "' + junk + '" is gone', !new RegExp(junk, 'i').test(out.cvText), 'still listed');
}

console.log('\nAND A TERM SPELLED OUT INSIDE ANOTHER IS NOT A SECOND TERM');
// "Cybersecurity" inside "Cybersecurity Solutions", "macOS" inside
// "Windows and macOS Support". Dropping the shorter loses no keyword:
// its text is still on the page, inside the longer one.
t('  "Cybersecurity" is not listed twice',
  (out.cvText.match(/Cybersecurity/g) || []).length === 1,
  JSON.stringify(out.cvText.match(/[^,\n]*Cybersecurity[^,\n]*/g)));
t('  ...but the text is still there for a substring match',
  /Cybersecurity/.test(out.cvText), 'the keyword was lost outright');
t('  "macOS" is not listed twice',
  (out.cvText.match(/macOS/g) || []).length === 1,
  JSON.stringify(out.cvText.match(/[^,\n]*macOS[^,\n]*/g)));

console.log('\nIT WILL NOT INVENT A TAXONOMY IT DOES NOT HAVE');
// The groups are recognised by name. A CV whose terms it does not know
// is left exactly as it was found -- labelling is an improvement only
// when the labels are right.
{
  const nurse = 'Patient Assessment, Medication Administration, Wound Care, IV Therapy, '
    + 'Triage, Care Planning, Infection Control, Phlebotomy, Vital Signs Monitoring, '
    + 'Electronic Health Records';
  const r = run(nurse, ['Triage']);
  const b = sectionOf(r.cvText);
  t('  a nursing CV keeps its single list', b.length === 1, JSON.stringify(b));
  t('  ...with every term intact',
    nurse.split(', ').every((s) => b[0].includes(s)), JSON.stringify(b));
}
{
  // Too short to be worth grouping.
  const r = run('Python, SQL, Excel', ['Python']);
  t('  a short list is left alone', sectionOf(r.cvText).length === 1,
    JSON.stringify(sectionOf(r.cvText)));
}

console.log('\nTHE LABEL PRINTS BOLD, AND THE SECTION STILL PARSES');
{
  const built = DG.fromCvText(out.cvText, { name: 'cv' });
  t('  the docx generates', built.success === true, built.error);
  const tmp = path.join(os.tmpdir(), 'jg-grp-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'd.docx'), Buffer.from(built.base64, 'base64'));
  cp.execSync('cd ' + tmp + ' && unzip -qo d.docx');
  const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });

  const paras = (xml.match(/<w:p>[\s\S]*?<\/w:p>/g) || []);
  const textOf = (p) => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
    .map((x) => x.replace(/<[^>]+>/g, '')).join('').replace(/&amp;/g, '&').trim();

  const groupParas = paras.filter((p) => /^[A-Z][A-Za-z &/]{1,28}: \S/.test(textOf(p)));
  t('  every group is one paragraph', groupParas.length === body.length,
    groupParas.length + ' of ' + body.length);
  t('  the label is bold and the terms are not',
    groupParas.every((p) => {
      const runs = p.match(/<w:r>[\s\S]*?<\/w:r>/g) || [];
      return runs.length === 2 && /<w:b\/>/.test(runs[0]) && !/<w:b\/>/.test(runs[1]);
    }), 'a label did not render as its own bold run');
  t('  no group was split onto two lines',
    !paras.some((p) => /^[A-Z][A-Za-z &/]{1,28}:$/.test(textOf(p))),
    'a label was emitted as a heading of its own');
  // The heading a parser looks for is still the only one.
  const heads = paras.map(textOf).filter((l) => /^[A-Z][A-Z &/]{3,}$/.test(l));
  t('  exactly one heading contains the word "skill"',
    heads.filter((h) => /SKILL/.test(h)).length === 1, JSON.stringify(heads));
}

console.log('\nAND RUNNING IT AGAIN CHANGES NOTHING');
// The generator normalises sections again on its way to the file. If
// this were not idempotent the preview and the attachment would differ.
t('  the generator finds nothing left to do',
  DG.normalizeSections(out.cvText) === out.cvText, 'preview and file will disagree');
{
  const twice = RA.runRecruiterAudit({
    cvText: out.cvText, jdText: 'customer support',
    jdTitle: 'Product Support Specialist', jobKeywords: ['Customer Support'],
  });
  t('  and a second audit does not re-group what is grouped',
    sectionOf(twice.cvText).length === body.length,
    JSON.stringify(sectionOf(twice.cvText)));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
