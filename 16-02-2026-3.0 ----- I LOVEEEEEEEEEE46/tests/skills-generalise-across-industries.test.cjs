// THE OTHER SUITE PROVES TOO LITTLE.
//
// skills-are-read-not-looked-up asserts seventeen specific terms against
// a posting written to contain them. That is close to circular: it shows
// the extractor handles the fixture it was built against, not postings
// in general. The seventeen were only ever an example of what one
// scanner reported for one JD; what has to hold is that ANY posting
// yields its own skills.
//
// So this runs the extractor over nursing, finance and warehouse
// postings, none of which it was tuned against, and asserts PROPERTIES
// rather than a list of expected answers. A property cannot be satisfied
// by tuning for a fixture.
//
// Writing these found two real faults immediately: "ideally SAP EWM" and
// "complete clinical documentation", an adverb and a verb the extractor
// should never have taken. Neither was visible on the manufacturing
// posting.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
const file = path.join(DIR, 'jd-skill-extractor.js');
const m = new Module(file, null); m.filename = file;
m.paths = Module._nodeModulePaths(DIR);
m._compile(fs.readFileSync(file, 'utf8'), file);
const X = global.JDSkillExtractor;
const N = X._norm;

const DOMAINS = ['manufacturing', 'nurse', 'accountant', 'warehouse'];
const load = (d) => fs.readFileSync(path.join(DIR, 'tests/fixtures/jd-' + d + '.txt'), 'utf8');

console.log('PROPERTIES THAT MUST HOLD ON ANY POSTING');
for (const d of DOMAINS) {
  const jd = load(d);
  const hard = X.extractHardSkills(jd);
  const soft = X.extractSoftSkills(jd);
  // Flattened past all punctuation and inflection. _norm keeps '.', so a
  // term that ends a sentence ("cannulation.", "VLOOKUP.") failed a
  // space-padded search, and the JD's "initiatives" does not pad-match
  // "initiative". The property being tested is that nothing was
  // FABRICATED, so substring containment is the right strictness.
  const flatten = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const flat = flatten(jd);

  // 1. Nothing is invented. It reads the posting; a term that is not in
  //    the posting is a fabrication, and fabrication is the one thing
  //    this must never do.
  const ghosts = hard.concat(soft).filter((s) => flat.indexOf(flatten(s)) === -1);
  t('  ' + d + ': every term appears in the posting', ghosts.length === 0,
    'not in the JD: ' + ghosts.join(', '));

  // 2. No candidate opens with a verb, adverb or quantity. This is the
  //    difference between a skill and a slice of a sentence.
  const LEADERS = /^(carry|carries|lead|leads|support|supports|drive|drives|maintain|maintains|present|presents|produce|produces|ensure|ensures|complete|completes|deliver|delivers|administer|escalate|liaise|ideally|preferably|accurate|accurately|safely|using|use|the|a|an|and|or|of|in|on|for|with|to|one|two|three|four|five|several|many|multiple|strong|excellent|good|proven|demonstrated|experience|knowledge|ability|able)\b/i;
  const fragments = hard.filter((s) => LEADERS.test(s));
  t('  ' + d + ': no term opens with a verb, adverb or quantity',
    fragments.length === 0, fragments.join(', '));

  // 3. Nothing trails off into a stop word either.
  const trailing = hard.filter((s) => /\b(the|a|an|and|or|of|in|on|for|with|to|is|are)$/i.test(s));
  t('  ' + d + ': no term trails off mid-phrase', trailing.length === 0, trailing.join(', '));

  // 4. The posting actually yields multi-word skills. Single words alone
  //    would mean the extractor had collapsed to what the old
  //    whitespace-splitting path already did.
  const multi = hard.filter((s) => s.trim().split(/\s+/).length > 1);
  t('  ' + d + ': multi-word skills are found', multi.length >= 4,
    'only ' + multi.length + ': ' + hard.join(' | '));

  // 5. It returns a usable number: enough to tailor with, not so many
  //    that the skills section becomes a keyword dump.
  t('  ' + d + ': the count is usable', hard.length >= 8 && hard.length <= 40,
    hard.length + ' terms');
}

console.log('\nAND EACH DOMAIN YIELDS ITS OWN VOCABULARY');
// Spot checks chosen because they are unarguably skills in their field
// and could not have been tuned for: the extractor has never seen these
// postings and none of these words is in any list it carries.
{
  const has = (d, term) => X.extractHardSkills(load(d)).some((s) => N(s) === N(term));
  const cases = [
    ['nurse', 'venepuncture'], ['nurse', 'cannulation'],
    ['nurse', 'infection control'], ['nurse', 'patient assessment'],
    ['accountant', 'VLOOKUP'], ['accountant', 'bank reconciliation'],
    ['accountant', 'variance analysis'], ['accountant', 'IFRS 16'],
    ['warehouse', 'stock control'], ['warehouse', 'pallet trucks'],
    ['warehouse', 'inventory management'], ['warehouse', 'manual handling'],
  ];
  for (const [d, term] of cases) {
    t('  ' + d + ' -> ' + term, has(d, term),
      X.extractHardSkills(load(d)).join(' | '));
  }
}

console.log('\nAND ONE INDUSTRY NEVER LEAKS INTO ANOTHER');
// The closed lists are software vocabulary. If those terms appear on a
// nursing posting the matching is too loose, which is exactly the fault
// that put "r" in a manufacturing skills section.
{
  for (const d of ['nurse', 'accountant', 'warehouse']) {
    const hard = X.extractHardSkills(load(d)).map(N);
    const leaked = ['python', 'kubernetes', 'javascript', 'docker', 'react']
      .filter((k) => hard.includes(k));
    t('  ' + d + ' carries no software vocabulary', leaked.length === 0, leaked.join(', '));
  }
}

console.log('\nAND SOFT SKILLS STAY SOFT, IN EVERY FIELD');
// Soft skills are the one genuinely bounded vocabulary, so the same few
// should surface everywhere they are asked for, and never as hard.
{
  for (const [d, term] of [['nurse', 'communication skills'], ['nurse', 'consistent'],
    ['accountant', 'attention to detail'], ['warehouse', 'follow instructions'],
    ['warehouse', 'punctual']]) {
    const soft = X.extractSoftSkills(load(d)).map(N);
    t('  ' + d + ' -> ' + term, soft.includes(N(term)), X.extractSoftSkills(load(d)).join(' | '));
  }
  for (const d of DOMAINS) {
    const hard = new Set(X.extractHardSkills(load(d)).map(N));
    const soft = X.extractSoftSkills(load(d)).map(N);
    const both = soft.filter((s) => hard.has(s));
    t('  ' + d + ': nothing is classified as both', both.length === 0, both.join(', '));
  }
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
