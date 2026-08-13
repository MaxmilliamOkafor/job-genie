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

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
