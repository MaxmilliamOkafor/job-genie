// THE SKILLS LIST MUST NOT ADVERTISE THAT A MACHINE WROTE IT.
//
// A real generated CV listed this under TECHNICAL PROFICIENCIES:
//
//   langgraph, crewai, b2b, enterprise
//
// Two separate problems, and they pull in opposite directions, so the
// fix has to be careful about which one it is solving.
//
// CASING is free to fix. Keyword matching is case-insensitive, so
// correcting "langgraph" to "LangGraph" cannot cost a single point of
// match score. All it changes is the human read, where a lowercase tool
// name sitting beside "Python, TypeScript" is the clearest tell on the
// page that the line was assembled rather than written.
//
// REMOVING WORDS is not free. Those terms were injected deliberately,
// because the posting contained them and the extension is trying to
// raise the keyword score. Stripping one buys tidiness and costs score.
// So the line is drawn at whether a person could plausibly claim it:
// nobody is "proficient in B2B", but recruiters really do search saas
// and fintech as domain terms, and the posting really did ask for them.
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

const skillsLine = (list) => {
  const cv = ['Maxmilliam Okafor', '', 'TECHNICAL PROFICIENCIES', list, '', 'EDUCATION', 'MSc AI'].join('\n');
  const out = RA.runRecruiterAudit({ cvText: cv, jdText: 'Python and Kubernetes for our b2b saas platform', jdTitle: 'Engineer' });
  return (out.cvText.split('\n').find((l) => l.includes('Python')) || '');
};
const line = skillsLine('langgraph, crewai, b2b, enterprise, saas, fintech, Python, '
  + 'Kubernetes, stakeholders, fast-paced, e-commerce, remote, delivery');

console.log('WORDS NOBODY CAN BE PROFICIENT IN ARE REMOVED');
// "stakeholders" and "delivery" used to be on this list and were taken
// off deliberately. They read oddly in a proficiencies list, but a
// posting can name them as required competencies, and dropping a word
// the JD asked for costs an exact keyword match -- the precise way a
// candidate loses to someone who listed it. See jd-exact-keyword.
for (const junk of ['b2b', 'enterprise', 'fast-paced', 'remote', 'full-time']) {
  t('  drops ' + junk, !new RegExp('(^|,\\s*)' + junk.replace('-', '\\-') + '\\s*(,|$)', 'i').test(line),
    'a recruiter reading this knows a machine built the list: ' + line);
}

console.log('\nBUT DOMAIN TERMS RECRUITERS SEARCH ARE KEPT');
// Removing these would cost real keyword score to buy a little
// tidiness. The posting asked for them.
for (const kw of ['saas', 'fintech', 'e-commerce']) {
  t('  keeps ' + kw, new RegExp(kw.replace('-', '\\-'), 'i').test(line),
    'the JD asked for this and recruiters search it: ' + line);
}
t('  and the actual skills are untouched',
  /Python/.test(line) && /Kubernetes/.test(line), line);

console.log('\nTOOL NAMES ARE CASED THE WAY THEIR OWNERS WRITE THEM');
// Free to fix: matching is case-insensitive, so this costs no score.
t('  langgraph -> LangGraph', /LangGraph/.test(line), line);
t('  crewai -> CrewAI', /CrewAI/.test(line), line);
t('  saas -> SaaS', /SaaS/.test(line), line);
t('  no all-lowercase tool name survives',
  !/(^|,\s)(langgraph|crewai|langchain|llamaindex|mlflow|pytorch|kubernetes)(,|$)/.test(line), line);

console.log('\nAND THE CASING MAP DOES NOT "CORRECT" NAMES THAT ARE ALREADY RIGHT');
// dbt and pgvector are lowercase by their own convention. Title-casing
// them would be a different kind of wrong.
const low = skillsLine('dbt, pgvector, Python');
t('  dbt stays dbt', /\bdbt\b/.test(low) && !/\bDbt\b/.test(low), low);
t('  pgvector stays pgvector', /\bpgvector\b/.test(low) && !/\bPgvector\b/.test(low), low);

console.log('\nTHE VERBS THAT READ AS MACHINE-WRITTEN ARE REPLACED, NOT LEFT');
// The tailoring prompt bans these, but a prompt ban depends on the model
// obeying it AND the edge function being deployed. Neither holds for text
// that came from the user's own profile, and neither holds before a
// deploy. This is the layer that builds the document.
const bullets = (lines, jd) => {
  const cv = ['Maxmilliam Okafor', '', 'PROFESSIONAL EXPERIENCE', 'Meta, Engineer',
    'January 2023 - Present'].concat(lines.map((b) => '- ' + b))
    .concat(['', 'EDUCATION', 'MSc AI']).join('\n');
  const out = RA.runRecruiterAudit({ cvText: cv, jdText: jd || 'Python', jdTitle: 'Engineer' });
  return out.cvText.split('\n').filter((l) => /^-/.test(l.trim())).map((l) => l.trim());
};
const verbs = bullets([
  'Spearheaded the migration of legacy services.',
  'Leveraged Python to synergise cross-functional workflows.',
  'Orchestrated the release process and championed testing.',
]);
t('  spearheaded -> led', /^- Led /.test(verbs[0]), verbs[0]);
t('  leveraged -> used', /^- Used /.test(verbs[1]), verbs[1]);
t('  synergise -> combine', /combine/i.test(verbs[1]) && !/synergi/i.test(verbs[1]), verbs[1]);
t('  orchestrated -> directed, championed -> led',
  /directed/i.test(verbs[2]) && !/championed/i.test(verbs[2]), verbs[2]);
t('  the sentences stay grammatical',
  verbs.every((b) => /^- [A-Z]/.test(b) && !/\s{2,}/.test(b)), JSON.stringify(verbs));

console.log('\nA STRIPPED ADJECTIVE MUST NOT LEAVE BROKEN ENGLISH');
// "Dynamic and results-driven professional" used to become "Dynamic and
// professional" -- removing one adjective from a pair strands the
// conjunction. A recruiter reads that as a typo, which is worse than the
// buzzword was.
const summaryOf = (text) => {
  const cv = ['Maxmilliam Okafor', '', 'PROFESSIONAL SUMMARY', text, '',
    'EDUCATION', 'MSc AI'].join('\n');
  return RA.runRecruiterAudit({ cvText: cv, jdText: 'Python', jdTitle: 'Engineer' })
    .cvText.split('\n')[3];
};
const purged = summaryOf('Dynamic and results-driven professional with a proven track record '
  + 'of leveraging innovative technology to deliver high-impact solutions in fast-paced environments.');
t('  no dangling conjunction', !/\b(and|or)\s+(and|or)\b/i.test(purged)
  && !/^\s*(and|or|but)\b/i.test(purged), purged);
t('  starts with a capital', /^[A-Z]/.test(purged.trim()), purged);
t('  no double spaces left behind', !/\s{2,}/.test(purged), JSON.stringify(purged));
for (const w of ['results-driven', 'dynamic', 'leveraging', 'fast-paced', 'high-impact'])
  t('  ' + w + ' is gone', !new RegExp(w, 'i').test(purged), purged);

console.log('\nAND LEGITIMATE TECHNICAL LANGUAGE IS NOT TOUCHED');
// The words above are filler when they describe the candidate and real
// terms when they describe the work. Deleting them blindly costs meaning.
const keep = [
  'Delivered Microsoft Dynamics 365 F&O across four regions.',
  'Built a dynamic pricing engine in Python.',
  'Designed dynamic programming solutions for route optimisation.',
  'Reduced high-impact incidents by tracking p95 latency.',
  'Used PyTorch and Hugging Face Transformers for model training.',
];
const kept = bullets(keep);
keep.forEach((orig, i) => t('  keeps ' + JSON.stringify(orig.slice(0, 42)),
  kept[i] === '- ' + orig, kept[i]));

console.log('\n"TRACK RECORD" NEVER APPEARS, IN ANY FORM');
// Asked for explicitly, and it kept coming back because the system was
// MANUFACTURING it, not merely failing to remove it:
//
//   the prompt listed "track record" as the APPROVED replacement for
//   "proven track record"; the prompt's own example summary opened
//   "Strong track record in designing scalable solutions", and models
//   copy examples; two client-side maps rewrote "proven track record"
//   into it; and three hard-coded fallback paragraphs contained it.
//
// Stripping the qualifier and keeping the phrase was never going to
// work. It is banned outright now, at every layer.
const TRACK = [
  'Track record in implementing AI-driven solutions that optimise workflows.',
  'Experienced engineer with a proven track record of delivering cloud platforms.',
  'Strong track record in designing scalable solutions that cut costs.',
  'A track record of success across four regions.',
  'My track record speaks for itself.',
  'Demonstrated track record with Kubernetes and Azure.',
  'Consistent track record for shipping on time.',
  'Professional with track record of delivering high-impact solutions.',
  'I have a long track record in backend engineering.',
];
for (const sentence of TRACK) {
  const got = summaryOf(sentence);
  t('  gone from ' + JSON.stringify(sentence.slice(0, 40)),
    !/track\s*record/i.test(got), got);
  // Removing it must not wreck the sentence around it.
  t('    ...and the sentence still reads',
    /^[A-Z]/.test(got.trim()) && !/\s{2,}/.test(got)
      && !/\b(with|of|in|for|and|a|an)\s*[.,]/i.test(got)
      && !/[a-z][A-Z]/.test(got.replace(/\b[A-Z][a-z]*[A-Z]\w*/g, '')),
    JSON.stringify(got));
}
// The preposition has to be re-chosen, not dropped: "record of
// delivering" -> "experience delivering" is right, but the same rule
// applied to "record with Kubernetes" gives "experience Kubernetes".
t('  a gerund keeps no preposition',
  /experience delivering/i.test(summaryOf('A proven track record of delivering cloud platforms.')),
  summaryOf('A proven track record of delivering cloud platforms.'));
t('  a noun keeps one',
  /experience with Kubernetes/i.test(summaryOf('Demonstrated track record with Kubernetes and Azure.')),
  summaryOf('Demonstrated track record with Kubernetes and Azure.'));

console.log('\nAND NOTHING IN THE CODEBASE PRODUCES IT');
// Detection lists and replacement PATTERNS may name it; no string the
// generators emit may contain it.
const EMITTERS = ['openresume-generator.js', 'universal-keyword-strategy.js', 'resume-builder.js'];
for (const file of EMITTERS) {
  let src = '';
  try { src = fs.readFileSync(path.join(DIR, file), 'utf8'); } catch (e) { continue; }
  const code = src.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  t('  ' + file + ' emits none', !/track\s+record/i.test(code),
    'a hard-coded fallback paragraph still contains it');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
