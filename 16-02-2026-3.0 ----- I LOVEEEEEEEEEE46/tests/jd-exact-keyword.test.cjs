// THE CV CARRIES THE POSTING'S EXACT WORDING.
//
// Losing to a candidate who "had all the keywords" is usually not about
// what you have done. It is about which STRING is on the page. A
// recruiter searching Greenhouse for "Machine Learning" does not find a
// CV that says "ML", and an ATS scoring exact phrase overlap does not
// either.
//
// mirrorJdVocabulary exists to prevent exactly that: when the posting
// and the CV use different names for the same thing, the CV adopts the
// posting's name. It was doing the opposite.
//
//   const canonical = _findCanonicalForJd(jdLower, group)
//   ...
//   if (jdLower.includes(term)) return term;
//
// Two faults compounding. `includes` is a substring test, so a posting
// mentioning "MLOps" contains "ml" and "ml" was selected -- rewriting
// every "Machine Learning" in the CV to "ML". "PostgreSQL" contains
// "postgres". "REST APIs" contains "rest api". And because the synonym
// groups are ordered shortest-first and the first hit won, the
// abbreviation beat the full term even when the posting spelled it out.
//
// It then substituted the lowercase group term, which is where "rest
// API" came from.
//
// Measured on a 26-skill posting the candidate fully evidenced: four
// exact-match keywords destroyed -- Machine Learning, REST APIs,
// PostgreSQL, and one stripped by an over-broad filter. Every one of
// them a skill actually held, lost to the function meant to preserve it.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
(() => {
  const f = path.join(DIR, 'recruiter-audit.js');
  const m = new Module(f, null); m.filename = f;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(f, 'utf8'), f);
})();
const RA = global.RecruiterAudit;

// THE WHOLE SECTION, NOT THE FIRST LINE OF IT.
//
// This took the first line matching a skill name, which was the whole
// section back when the section was one comma list. It is labelled
// groups now, so that read "Programming Languages: Python" and reported
// the other twenty-five keywords as lost when every one of them was on
// the page, one line further down.
const skillsLine = (cvSkills, jd) => {
  const cv = ['Maxmilliam Okafor', '', 'TECHNICAL SKILLS', cvSkills, '', 'EDUCATION', 'MSc AI'].join('\n');
  const out = RA.runRecruiterAudit({ cvText: cv, jdText: jd, jdTitle: 'Engineer' });
  const lines = out.cvText.split('\n');
  const at = lines.findIndex((l) => /^\s*TECHNICAL SKILLS\s*$/i.test(l));
  if (at === -1) return '';
  const body = [];
  for (let i = at + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { if (body.length) break; continue; }
    if (/^[A-Z][A-Z &/]{3,}\s*:?\s*$/.test(t)) break;
    body.push(t);
  }
  return body.join(', ');
};

console.log('NOT ONE EVIDENCED KEYWORD IS LOST');
// Every term here is one the candidate holds and the posting asks for.
// Any drop is a match handed to somebody else.
const JD_SKILLS = ['Python', 'Kubernetes', 'Docker', 'Terraform', 'AWS', 'Azure', 'CI/CD',
  'Machine Learning', 'MLOps', 'Distributed Systems', 'REST APIs', 'Microservices',
  'Observability', 'System Design', 'Data Pipelines', 'Apache Kafka', 'PostgreSQL',
  'Stakeholder Management', 'Cloud Security', 'Cloud Architecture', 'Delivery',
  'Quality Assurance', 'Agile', 'Scrum', 'Technical Leadership', 'Cost Optimisation'];
const full = skillsLine(JD_SKILLS.join(', '), JD_SKILLS.join(' '));
const missing = JD_SKILLS.filter((k) =>
  !new RegExp('\\b' + k.replace(/[+/]/g, '\\$&') + '\\b', 'i').test(full));
t('  all ' + JD_SKILLS.length + ' survive verbatim', missing.length === 0,
  'lost: ' + JSON.stringify(missing) + '\n              got: ' + full);

console.log('\nAN ABBREVIATION IN THE CV ADOPTS THE POSTING\'S FULL TERM');
const adopted = skillsLine('ML, Postgres, K8s, Python',
  'We need Machine Learning, PostgreSQL and Kubernetes');
for (const [short, long] of [['ML', 'Machine Learning'], ['Postgres', 'PostgreSQL'], ['K8s', 'Kubernetes']]) {
  t('  ' + short + ' -> ' + long, new RegExp('\\b' + long + '\\b').test(adopted), adopted);
}

console.log('\nAND THE REVERSE, WHEN THE POSTING USES THE SHORT FORM');
// Mirroring means following the posting, not always preferring length.
const shortened = skillsLine('Machine Learning, PostgreSQL, Python', 'We need ML and Postgres experience');
t('  Machine Learning -> ML', /\bML\b/.test(shortened) && !/Machine Learning/.test(shortened), shortened);
t('  PostgreSQL -> Postgres', /\bPostgres\b/.test(shortened) && !/PostgreSQL/.test(shortened), shortened);

console.log('\nA LONGER WORD CONTAINING THE ABBREVIATION IS NOT A MATCH');
// The substring bug in one line: MLOps is not a mention of ML.
const mlops = skillsLine('Machine Learning, Python', 'We need MLOps and Python');
t('  MLOps does not rewrite Machine Learning', /Machine Learning/.test(mlops), mlops);
const pg = skillsLine('PostgreSQL, Python', 'We use PostgreSQL heavily');
t('  PostgreSQL is not collapsed to Postgres', /PostgreSQL/.test(pg), pg);

console.log('\nA CAPITALISED REQUIREMENT HEADING DOES NOT SHOUT ON THE CV');
const caps = skillsLine('ML, Python', 'REQUIRED: MACHINE LEARNING and Python');
t('  MACHINE LEARNING -> Machine Learning',
  /Machine Learning/.test(caps) && !/MACHINE LEARNING/.test(caps), caps);

console.log('\nWORDS A POSTING CAN LEGITIMATELY REQUIRE ARE NOT STRIPPED');
// An earlier draft of the skills filter removed these. They read oddly
// in a proficiencies list, but a posting can name them as competencies,
// and dropping a required word costs an exact match.
const req = skillsLine('Delivery, Quality, Strategy, Business, Stakeholders, Python',
  'Requires Delivery, Quality, Strategy, Business, Stakeholders and Python');
for (const w of ['Delivery', 'Quality', 'Strategy', 'Business', 'Stakeholders']) {
  t('  keeps ' + w, new RegExp('\\b' + w + '\\b', 'i').test(req), req);
}

console.log('\nBUT WHAT NOBODY CAN BE PROFICIENT IN STILL GOES');
const junk = skillsLine('b2b, enterprise, fast-paced, remote, full-time, Python', 'b2b enterprise Python');
for (const w of ['b2b', 'enterprise', 'fast-paced', 'remote', 'full-time']) {
  t('  drops ' + w, !new RegExp('(^|,\\s*)' + w.replace('-', '\\-') + '\\s*(,|$)', 'i').test(junk), junk);
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
