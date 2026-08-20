// A COVER LETTER IS FIRST-PERSON PROSE IN PARAGRAPHS.
//
// Both halves of that were being destroyed before the letter was sent.
//
// PRONOUNS. sanitiseContent defaults removePronouns to true -- a CV
// bullet convention, where "I" is implied. The four calls that sanitise
// each paragraph omitted the option, so every paragraph was stripped
// before the final call correctly turned it off. Letters went out
// reading "At Meta was Software Engineer" and "One thing am particularly
// proud of".
//
// On top of that, a "vary sentence openings" rule rewrote ". I <verb>"
// into ". This <verb>", ". My <verb>" or ". <verb>" -- and no branch of
// it produces valid English. "I think I could add value" became "This
// think I could add value". It fired on 60% of first-person sentences.
//
// PARAGRAPHS. Two separate transforms collapsed them: a sentence-variation
// pass rejoined the whole text with `join(' ')`, and finalCleanup ran
// `\s{2,}` -> ' ', where \s includes newlines. A four-paragraph letter
// arrived as one block.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
global.performance = global.performance || { now: () => Date.now() };
for (const f of ['content-quality-engine.js', 'recruiter-audit.js', 'cover-letter-generator.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const CLG = global.CoverLetterGenerator;
const CQE = global.ContentQualityEngine;

const CAND = {
  firstName: 'Maxmilliam', lastName: 'Okafor', email: 'max@example.com',
  phone: '+353 874 261 508', city: 'Dublin, IE', skills: ['Python', 'Kubernetes'],
  professional_experience: [
    { company: 'Meta', title: 'Software Engineer', dates: 'January 2023 - Present',
      bullets: ['Shipped a Llama-based moderation system in Python and PyTorch.'] },
    { company: 'Citigroup', title: 'Data Analyst', dates: 'August 2017 - March 2021',
      bullets: ['Built fraud models over the daily transaction feed.'] },
  ],
};
const JOB = { title: 'Senior Backend Engineer', company: 'Stripe',
  description: 'Python, Kubernetes, distributed systems, observability' };
const KW = ['Python', 'Kubernetes', 'observability', 'distributed systems', 'APIs', 'PostgreSQL', 'reliability'];
const letter = () => {
  const r = CLG.generate(CAND, JOB, KW);
  return (r && (r.text || r.coverLetter)) || String(r);
};

console.log('THE LETTER IS WRITTEN IN THE FIRST PERSON');
// Sample repeatedly: the templates and the humaniser are random, so a
// single generation can pass by luck.
let stripped = 0, mangled = 0, blocks = 0;
const RUNS = 40;
for (let i = 0; i < RUNS; i++) {
  const L = letter();
  // A verb stranded with no subject: "At Meta was", "One thing am".
  if (/\b(?:^|[.:,]\s+|\b(?:and|that|which|thing)\s+)(?:am|was|were|have|has|had)\s/i.test(L.replace(/\bI\s+/g, 'I_'))) mangled++;
  if (/\b(?:This|My)\s+(?:think|have|had|am|was|will|would|can|could|did)\b/.test(L)) mangled++;
  if (!/\bI\b/.test(L)) stripped++;
  if (!/\n\s*\n/.test(L)) blocks++;
}
t('  every letter uses "I"', stripped === 0, stripped + '/' + RUNS + ' had no first-person pronoun at all');
t('  no stranded verb or "This think"', mangled === 0, mangled + '/' + RUNS + ' contained broken grammar');

console.log('\nAND LAID OUT IN PARAGRAPHS');
t('  every letter has blank-line paragraph breaks', blocks === 0,
  blocks + '/' + RUNS + ' arrived as a single block');
const one = letter();
const paras = one.split(/\n\s*\n/).filter((p) => p.trim());
t('  between 4 and 7 blocks including salutation and sign-off',
  paras.length >= 4 && paras.length <= 7, String(paras.length) + ': ' + JSON.stringify(one.slice(0, 120)));

console.log('\nTHE SALUTATION AND SIGN-OFF KEEP THEIR COMMAS');
// fixPunctuation turned "Dear Hiring Manager," into "Dear Hiring
// Manager." and did the same to the sign-off.
const pun = CQE.sanitiseContent('Dear Hiring Manager,\n\nI came across the role.\n\nYours sincerely,\nMaxmilliam Okafor',
  { removePronouns: false });
t('  salutation', /Dear Hiring Manager,/.test(pun), pun);
t('  sign-off', /Yours sincerely,/.test(pun), pun);
t('  the blank line after the salutation survives', /Manager,\n\s*\nI came/.test(pun), JSON.stringify(pun));

console.log('\nAND THE SIGNATURE IS A NAME, NOT A SENTENCE');
// Every letter went out signed "Maxmilliam Okafor." The rule that makes
// sure a sentence ends in a full stop matched the last line, and the
// exemption list covered "Yours sincerely," but not the name beneath it.
t('  no full stop after the signature', /Yours sincerely,\nMaxmilliam Okafor$/.test(pun.trim()),
  JSON.stringify(pun.trim().slice(-40)));
{
  let dotted = 0;
  for (let i = 0; i < RUNS; i++) {
    const last = letter().trim().split('\n').pop().trim();
    if (/[.!?]$/.test(last)) dotted++;
  }
  t('  ...in a generated letter either', dotted === 0,
    dotted + '/' + RUNS + ' were signed with a full stop after the name');
}

console.log('\nEVERY SENTENCE HAS A MAIN CLAUSE');
// "A lot of that work involved Python, Kubernetes and observability.
// All of which show up in your job description too." The second half is
// a fragment, and it shipped in every letter with three overlapping
// keywords, which is most of them.
{
  let frags = 0;
  for (let i = 0; i < RUNS; i++) {
    if (/[.!?]\s+(?:All|Both|Each|Most|None)\s+of\s+which\b/i.test(letter())) frags++;
  }
  t('  no "All of which" left stranded as its own sentence', frags === 0,
    frags + '/' + RUNS + ' contained the fragment');
}

console.log('\nAND THE CLOSING OFFERS A CONVERSATION ONCE');
// Three passes each added one: the template, the keyword injection and
// the company-naming tail. A paragraph went out reading "I would be
// happy to chat about how my background fits the role. Thank you for
// reading this far. I appreciate your time. I am happy to talk through
// how I could help at Stripe." Four sentences, three the same gesture.
{
  let repeats = 0, named = 0, worst = '';
  for (let i = 0; i < RUNS; i++) {
    const L = letter();
    const closing = (L.split(/\n\s*\n/).slice(-2)[0] || '').trim();
    const offers = (closing.match(/\b(chat|talk|speak|discuss|conversation|more detail|go deeper)\b/gi) || []).length;
    if (offers > 1) { repeats++; worst = closing; }
    if (/Stripe/.test(closing)) named++;
    const thanks = (closing.match(/thank you|appreciate your time|thanks/gi) || []).length;
    if (thanks > 1) { repeats++; worst = closing; }
  }
  t('  one offer and one thank-you per closing', repeats === 0,
    repeats + '/' + RUNS + ': ' + JSON.stringify(worst));
  // Naming the company at the close is still worth doing -- just never
  // by adding a second offer. It is grafted onto "the role" where the
  // template gives it somewhere to go.
  t('  and the company is still named at the close most of the time',
    named >= RUNS / 2, named + '/' + RUNS);
}

console.log('\nDELETING A BANNED PHRASE MUST NOT STRAND THE VERB');
// "welcome the chance" is deleted outright, which turned "I would
// welcome the chance to talk" into "I would to talk" -- and the
// contraction pass then made it "I'd to talk".
const stranded = CQE.sanitiseContent('I would welcome the chance to talk about the role.', { removePronouns: false });
t('  no "would to" / "I\'d to"', !/\b(would|will|could|should)\s+to\b/i.test(stranded)
  && !/\bI'(d|ll)\s+to\b/i.test(stranded), stranded);

console.log('\nTHE LETTER ANSWERS THE THREE QUESTIONS');
const L = letter();
t('  names the exact role', /Senior Backend Engineer/.test(L), L.slice(0, 100));
t('  names the company more than once', (L.match(/Stripe/g) || []).length > 1,
  'a single mention, in the merge-field position, reads like a mail merge');
t('  cites evidence from more than one role',
  /Meta/.test(L) && /Citigroup/.test(L), 'one employer is one data point');
t('  names a requirement from the posting',
  /Python|Kubernetes|observability/i.test(L), L.slice(0, 120));
t('  reaches a page-worth of content', L.split(/\s+/).filter(Boolean).length >= 200,
  String(L.split(/\s+/).filter(Boolean).length) + ' words');
t('  and stays within one page', L.split(/\s+/).filter(Boolean).length <= 420,
  String(L.split(/\s+/).filter(Boolean).length) + ' words');

console.log('\nAND THE DEFAULT STAYS SAFE FOR CV TEXT');
// removePronouns is right for CV bullets, where "I" is implied. The bug
// was applying it to a letter, not the default itself.
const cvBullet = CQE.sanitiseContent('I designed the API and I shipped it.');
t('  a CV bullet still drops the pronoun', !/\bI\b/.test(cvBullet), cvBullet);

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
