// THE YEARS-OF-EXPERIENCE ANSWER IS A KNOCKOUT ANSWER.
//
// Of everything on an application form, this is the field most likely to
// end the application on its own. It was answered with a constant: the
// profile's `years` if set, otherwise a hard-coded '5'. Three faults,
// each sufficient on its own:
//
//   1. A THRESHOLD IS A YES/NO QUESTION. "Do you have 5+ years of
//      experience?" is a two-option dropdown. Writing "5" into it either
//      fails validation or leaves the field unset, and an unset required
//      screening field scores as "requirement not met".
//
//   2. THE CONSTANT WAS ANSWERED FOR EVERY SKILL. "Years of Kubernetes?"
//      and "Years of Salesforce?" both got 5, whether or not the
//      candidate had ever touched either. That is a false statement on
//      an application, and it is grounds for withdrawing an offer after
//      the fact.
//
//   3. '5' WAS INVENTED when the profile said nothing. A candidate with
//      nine years was filtered out of senior roles; one with two was
//      filtered out for overclaiming.
//
// The employment history is on the profile, so the answer is computed
// from it -- and where it cannot be computed, the field is left for the
// human rather than guessed.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
(() => {
  const f = path.join(DIR, 'autofill-core.js');
  const m = new Module(f, null); m.filename = f;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(f, 'utf8'), f);
})();
const AC = global.AutofillCore;

// A real history: overlapping contract, a gap, and a current role.
const P = {
  skills: ['Python', 'Kubernetes', 'AWS', 'Docker', 'Google Cloud Platform'],
  professional_experience: [
    { company: 'Meta', dates: 'January 2023 - Present' },
    { company: 'SolimHealth', dates: 'August 2022 - December 2022' },
    { company: 'Accenture', dates: 'April 2021 - July 2022' },
    { company: 'Citigroup', dates: 'August 2017 - March 2021' },
  ],
};
const ans = (q, prof) => AC.answerFor(q, prof === undefined ? P : prof, {});
const thisYear = new Date().getFullYear();
const expected = String((thisYear - 2023) + 1 + 4);   // merged spans, not summed

console.log('A "HOW MANY" QUESTION GETS THE REAL TOTAL');
t('  computed from the employment dates', ans('How many years of experience do you have?') === expected,
  ans('How many years of experience do you have?') + ' (expected ' + expected + ')');
t('  ...and it is not the old hard-coded 5',
  ans('How many years of experience do you have?') !== '5',
  'a constant here is a knockout answer in both directions');
t('  overlapping roles are merged, not summed',
  Number(ans('Total years of experience')) < 12,
  'a contract held alongside a full-time job is not two careers: '
    + ans('Total years of experience'));

console.log('\nA THRESHOLD QUESTION GETS YES OR NO, NEVER A NUMBER');
for (const [q, want] of [
  ['Do you have 5+ years of experience?', 'Yes'],
  ['Do you have 10+ years of experience?', 'No'],
  ['Do you have at least 3 years of experience?', 'Yes'],
  ['Minimum of 15 years experience required - do you have this?', 'No'],
]) t('  ' + q + ' -> ' + want, ans(q) === want, ans(q));
t('  no threshold answer is ever a bare number',
  !/^\d+$/.test(ans('Do you have 5+ years of experience?')),
  'a number written into a Yes/No dropdown leaves the field unset, '
    + 'and an unset required screening field scores as "not met"');

console.log('\nA NAMED SKILL IS ONLY CLAIMED WHEN THE PROFILE EVIDENCES IT');
for (const q of ['Years of experience with Kubernetes',
  'Years of experience with Google Cloud',
  'Do you have 5+ years of experience with Python?']) {
  t('  answers ' + JSON.stringify(q.slice(0, 46)), ans(q) !== '', 'the profile lists this skill');
}
for (const q of ['How many years of experience in Salesforce?',
  'Years of experience with COBOL',
  'Do you have 5+ years of experience with Salesforce?']) {
  t('  declines ' + JSON.stringify(q.slice(0, 46)), ans(q) === '',
    'claiming years of a skill the profile never mentions is a false '
      + 'answer to a scored question: got ' + JSON.stringify(ans(q)));
}

console.log('\nWITH NOTHING TO COMPUTE FROM, IT ASKS RATHER THAN GUESSES');
for (const q of ['How many years of experience do you have?',
  'Do you have 5+ years of experience?']) {
  t('  blank for ' + JSON.stringify(q.slice(0, 40)), ans(q, {}) === '',
    'inventing a number is a knockout answer: ' + JSON.stringify(ans(q, {})));
}
t('  an explicit profile figure is still honoured',
  ans('How many years of experience do you have?', { years: 6 }) === '6',
  'the user overriding this must win');

console.log('\nAND THE CONSTANT IS GONE FROM THE DEFAULTS');
t('  DEFAULTS carries no years value', !AC.DEFAULTS.years,
  'a default here is invented data on a scored field');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
