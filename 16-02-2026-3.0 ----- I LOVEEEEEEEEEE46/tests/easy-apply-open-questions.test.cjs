// THE FLOW STOPPED ON "WHY DO YOU WANT TO WORK HERE?"
//
// runAutoFlow refuses to advance past a required question the profile
// cannot answer (linkedin-autofill.js:982):
//
//     const missing = unansweredRequired(modal);
//     if (missing.length) return done('needs-you', ...);
//
// That rule is correct and this must not weaken it. answerFor returns ''
// for a question about a skill the profile does not evidence, on purpose:
// answering to be helpful would invent a credential and tell an employer
// something untrue in the user's name.
//
// But employers add their OWN questions to Easy Apply, and the commonest
// of them is some form of "why do you want this job". Nothing in
// answerFor matched it, so it fell through to '' and the flow stopped --
// on a question that asserts no credential, has no factual answer to get
// wrong, and that the user had already answered in the cover letter
// sitting in their profile. That is not protection, it is just a stop.
//
// Two rules, and the boundary between them is the whole point:
//
//   MOTIVATION  ("why us", "what interests you", "what makes you a good
//   fit") is answered from prose the user wrote themselves.
//
//   CLAIM  ("describe your experience with Kubernetes", "how many years
//   of Python") is NOT. Pasting a cover letter that never mentions
//   Kubernetes does not answer that question, it just fills the box.
//   These still return '' and the flow still stops, exactly as before.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
const file = path.join(DIR, 'autofill-core.js');
global.window = global;
const m = new Module(file, null); m.filename = file;
m.paths = Module._nodeModulePaths(DIR);
m._compile(fs.readFileSync(file, 'utf8'), file);
const C = global.AutofillCore;

const PROFILE = {
  first_name: 'Maxmilliam', last_name: 'Okafor',
  summary: 'Software engineer working across data platforms and applied AI.',
  cover_letter: 'I have spent the last four years building data platforms, and the '
    + 'part I keep coming back to is making a messy pipeline legible to the people who '
    + 'depend on it. That is the work described in this posting, which is why I applied.',
  skills: ['Python', 'SQL', 'Airflow'],
};

console.log('MOTIVATION QUESTIONS ARE ANSWERED FROM THE USER\'S OWN PROSE');
{
  const asks = [
    'Why do you want to work at Stripe?',
    'Why do you want this role?',
    'Why are you interested in this position?',
    'Why should you be considered for this role?',
    'Why us?',
    'What interests you about this role?',
    'What attracts you to our company?',
    'What motivates you to apply?',
    'What excites you about this opportunity?',
    'What makes you a good fit for this team?',
    'Why do you think you are the right fit?',
    'Please describe your interest in this role.',
    'Tell us why you applied.',
  ];
  for (const q of asks) {
    const a = C.answerFor(q, PROFILE);
    t('  ' + q, a === PROFILE.cover_letter, 'got ' + JSON.stringify(a).slice(0, 90));
  }
}

console.log('\nBUT A CLAIM ABOUT WHAT THE USER HAS DONE IS STILL LEFT UNANSWERED');
// If any of these start returning the cover letter, the extension has
// begun answering credential questions with marketing prose.
{
  const claims = [
    'Describe your experience with Kubernetes.',
    'How many years of experience do you have with Python?',
    'How many years of Java?',
    'Rate your proficiency in Rust.',
    'What level of experience do you have with Terraform?',
    'Do you hold a current PMP certification?',
    'Do you have a valid CDL licence?',
    'What are your salary expectations?',
    'What is your notice period?',
    'What is your earliest available start date?',
  ];
  for (const q of claims) {
    const a = C.answerFor(q, PROFILE);
    t('  ' + q, a !== PROFILE.cover_letter && a !== PROFILE.summary,
      'answered a claim question with prose: ' + JSON.stringify(a).slice(0, 90));
  }
}

console.log('\nAND THE MOTIVATION TEST ITSELF DRAWS THE LINE IN THE RIGHT PLACE');
{
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
  t('  "why do you want to work here" is motivation',
    C._isMotivationQuestion(norm('Why do you want to work here?')), 'not matched');
  t('  "what is your experience with Docker" is not',
    !C._isMotivationQuestion(norm('What is your experience with Docker?')), 'matched as motivation');
  t('  "what is your interest in Kubernetes" is not, because it names a tool',
    !C._isMotivationQuestion(norm('What is your interest in Kubernetes?')),
    '"interest in" must be anchored to the job, not left open to swallow a skill');
  t('  but "your interest in this role" still is',
    C._isMotivationQuestion(norm('What is your interest in this role?')), 'not matched');
  t('  "how many years have you worked in this field" is not',
    !C._isMotivationQuestion(norm('How many years have you worked in this field?')), 'matched');
}

console.log('\nAND IT FALLS BACK, THEN GIVES UP HONESTLY');
{
  const noCover = Object.assign({}, PROFILE, { cover_letter: '' });
  t('  no cover letter -> the summary is used',
    C.answerFor('Why do you want this role?', noCover) === PROFILE.summary,
    'the summary is the next best thing the user actually wrote');
  const empty = { first_name: 'A' };
  t('  nothing written at all -> still empty, so the flow still stops',
    C.answerFor('Why do you want this role?', empty) === '',
    'with nothing of the user\'s to say, inventing an answer is the only alternative');
  t('  a per-posting cover letter wins over the stored one',
    C.answerFor('Why do you want this role?', PROFILE, { coverLetter: 'TAILORED' }) === 'TAILORED',
    'the letter written for THIS posting is the better answer');
}

console.log('\nAND NONE OF THE EXISTING ANSWERS MOVED');
// The new rule sits immediately before the final '', so anything that
// matched before must still match first.
{
  t('  first name', C.answerFor('First name', PROFILE) === 'Maxmilliam', 'regressed');
  t('  cover letter field', C.answerFor('Cover letter', PROFILE) === PROFILE.cover_letter, 'regressed');
  t('  about yourself', C.answerFor('Tell us about yourself', PROFILE) === PROFILE.summary, 'regressed');
  t('  skills', /Python/.test(C.answerFor('Skills', PROFILE)), 'regressed');
  t('  referral name stays empty',
    C.answerFor('Name of referring employee', PROFILE) === '', 'regressed');
  t('  consent', C.answerFor('I agree to the terms', PROFILE) === 'Yes', 'regressed');
}

console.log('\nA LENGTH LIMIT IS RESPECTED, BECAUSE THE SITE ENFORCES IT AND WE DID NOT');
// maxlength constrains typing, not assignment. The native setter wrote
// the full string, the site's validator rejected it, and the step would
// not advance with the box visibly full.
{
  const el = (max) => ({ maxLength: max, tagName: 'TEXTAREA' });
  const long = PROFILE.cover_letter;
  t('  no attribute (-1) leaves the value alone',
    C._clampToMaxLength(el(-1), long) === long, 'clamped when it should not');
  t('  a limit longer than the text leaves it alone',
    C._clampToMaxLength(el(5000), long) === long, 'clamped when it should not');
  const c = C._clampToMaxLength(el(120), long);
  t('  a real limit is never exceeded', c.length <= 120, 'length ' + c.length);
  // 120 falls inside the first sentence, so there is no sentence end to
  // stop at and the word boundary is the correct outcome.
  t('  with no sentence end available it stops at a word',
    c.length <= 120 && long.startsWith(c) && /\s/.test(long.charAt(c.length)), JSON.stringify(c));
  const c200 = C._clampToMaxLength(el(200), long);
  t('  and it prefers a sentence end when one is in range',
    c200.length <= 200 && /[.!?]$/.test(c200), JSON.stringify(c200));
  const src = 'Supercalifragilistic expialidocious wordage here and more';
  const c2 = C._clampToMaxLength(el(40), src);
  t('  never mid-word',
    c2.length <= 40 && src.startsWith(c2) && /\s/.test(src.charAt(c2.length)),
    JSON.stringify(c2));
  t('  a value with no space at all is still cut to the limit',
    C._clampToMaxLength(el(10), 'x'.repeat(50)) === 'x'.repeat(10), 'overflowed');
  t('  an element with no maxLength property at all is safe',
    C._clampToMaxLength({}, 'abc') === 'abc', 'threw or clamped');
  t('  null value does not throw', C._clampToMaxLength(el(10), null) === '', 'threw');
}

console.log('\nAND setValue ACTUALLY APPLIES IT');
// The clamp is worthless if setValue does not call it.
{
  const SRC = fs.readFileSync(file, 'utf8');
  const body = SRC.slice(SRC.indexOf('function setValue(el, value)'));
  const end = body.indexOf('\n  }');
  const fn = body.slice(0, end > 0 ? end : 400);
  t('  setValue clamps before writing', /_clampToMaxLength\(el, value\)/.test(fn), fn.slice(0, 200));
  t('  and writes the clamped value, not the original',
    !/desc\.set\.call\(el, value\)/.test(fn) && /desc\.set\.call\(el, clamped\)/.test(fn),
    'the native setter still receives the unclamped string');
  t('  including the catch path',
    !/\bel\.value = value\b/.test(fn), 'the fallback assignment bypasses the clamp');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
