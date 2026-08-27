// EVERY APPLICATION ON EARTH GOT THE SAME TWO ANSWERS.
//
//   DEFAULTS = { authorized: 'Yes', sponsorship: 'No', ... }
//
// Returned for every posting in every country. For an applicant living
// in Ireland that is true of Ireland, the EEA and the UK -- the Common
// Travel Area -- and false of the United States, Brazil, Canada, and
// everywhere else.
//
// It fails in the direction that LOOKS like success. A blanket "yes,
// authorised" and "no, no sponsorship needed" clears the knockout
// filter, so the application reaches a human, and the first screening
// call establishes that the form said something untrue. That does not
// read as a form-filling bug to a recruiter. It ends the conversation,
// and at that employer it ends the next one too.
//
// The question almost always names the country it is asking about, so
// no extra plumbing is needed to know which one. When it names one,
// answer for THAT country. When it does not, the posting is local and
// the old default is right.
//
// Nothing here guesses in the applicant's favour: a country the profile
// does not claim is answered honestly, which may cost the application,
// which is the correct outcome for a job they cannot lawfully take.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
{
  const file = path.join(DIR, 'autofill-core.js');
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const A = global.AutofillCore;
const IE = { country: 'Ireland' };

console.log('AN APPLICANT IN IRELAND, ASKED ABOUT EACH COUNTRY');
for (const [country, want] of [
  ['Ireland', 'Yes'],
  ['the United Kingdom', 'Yes'],     // Common Travel Area
  ['Germany', 'Yes'],                // EEA
  ['the Netherlands', 'Yes'],
  ['the United States', 'No'],
  ['Canada', 'No'],
  ['Brazil', 'No'],
  ['Australia', 'No'],
  ['Singapore', 'No'],
]) {
  const q = 'Are you legally authorised to work in ' + country + '?';
  t('  ' + country.padEnd(20) + ' -> ' + want, A.yesNoFor(q, IE) === want,
    A.yesNoFor(q, IE));
}

console.log('\nSPONSORSHIP IS THE SAME FACT ASKED BACKWARDS');
for (const [q, want] of [
  ['Will you now or in the future require sponsorship to work in the United States?', 'Yes'],
  ['Will you now or in the future require sponsorship to work in Ireland?', 'No'],
  ['Do you require visa sponsorship for employment in Canada?', 'Yes'],
  ['Can you work in the United States without sponsorship?', 'No'],
  ['Are you able to work in Ireland without sponsorship?', 'Yes'],
  ['Do you NOT require sponsorship to work in Brazil?', 'No'],
]) {
  t('  ' + (A.yesNoFor(q, IE) === want ? '' : '') + '"' + q.slice(0, 62) + '" -> ' + want,
    A.yesNoFor(q, IE) === want, A.yesNoFor(q, IE));
}
{
  // The two phrasings must never contradict each other on one form.
  const pos = A.yesNoFor('Do you require sponsorship to work in the United States?', IE);
  const neg = A.yesNoFor('Can you work in the United States without sponsorship?', IE);
  t('  the positive and inverted forms agree', pos === 'Yes' && neg === 'No',
    JSON.stringify([pos, neg]));
}

console.log('\nA QUESTION THAT NAMES NO COUNTRY IS LOCAL, AND UNCHANGED');
for (const q of ['Are you legally authorised to work?', 'Do you have the right to work?',
  'Are you eligible to work for this employer?']) {
  t('  "' + q + '" -> Yes', A.yesNoFor(q, IE) === 'Yes', A.yesNoFor(q, IE));
}

console.log('\nAND THE PROFILE CAN SAY SO EXPLICITLY');
{
  // A visa, a second citizenship, a green card: facts this code cannot
  // derive and must not override.
  const dual = { country: 'Ireland', work_authorized_countries: ['IE', 'US', 'GB'] };
  t('  a stated US authorisation is honoured',
    A.yesNoFor('Are you legally authorised to work in the United States?', dual) === 'Yes',
    A.yesNoFor('Are you legally authorised to work in the United States?', dual));
  t('  ...and does not leak to countries it does not list',
    A.yesNoFor('Are you legally authorised to work in Canada?', dual) === 'No',
    A.yesNoFor('Are you legally authorised to work in Canada?', dual));
  t('  ...and it removes the sponsorship claim there too',
    A.yesNoFor('Do you require sponsorship to work in the United States?', dual) === 'No',
    A.yesNoFor('Do you require sponsorship to work in the United States?', dual));
}
{
  const us = { country: 'United States' };
  t('  a US applicant is authorised in the US',
    A.yesNoFor('Are you legally authorised to work in the United States?', us) === 'Yes',
    A.yesNoFor('Are you legally authorised to work in the United States?', us));
  t('  ...and not automatically in the EEA',
    A.yesNoFor('Are you legally authorised to work in Germany?', us) === 'No',
    A.yesNoFor('Are you legally authorised to work in Germany?', us));
}
{
  const uk = { country: 'United Kingdom' };
  t('  the Common Travel Area runs both ways',
    A.yesNoFor('Are you legally authorised to work in Ireland?', uk) === 'Yes',
    A.yesNoFor('Are you legally authorised to work in Ireland?', uk));
}

console.log('\nAND NOTHING IS GUESSED FROM NOTHING');
{
  const blank = {};
  t('  an empty profile falls back rather than inventing a country',
    A.yesNoFor('Are you legally authorised to work in the United States?', blank) === 'Yes',
    'it answered from a country it does not know');
  t('  countryInQuestion returns nothing when none is named',
    A.countryInQuestion('Are you legally authorised to work?') === '',
    A.countryInQuestion('Are you legally authorised to work?'));
  t('  ...and does not throw on rubbish', A.countryInQuestion(null) === '');
  t('  authorisedCountries is empty for an unknown home',
    A.authorisedCountries({ country: 'Wakanda' }).length === 0,
    JSON.stringify(A.authorisedCountries({ country: 'Wakanda' })));
}

console.log('\nAND THE OTHER ANSWER PATH AGREES WITH THIS ONE');
{
  // answerFor and yesNoFor are reached by different field types on the
  // same form. They disagreeing is how one page says both things.
  for (const q of ['Are you legally authorised to work in the United States?',
    'Do you require sponsorship to work in the United States?']) {
    const a = A.answerFor(q, IE);
    const y = A.yesNoFor(q, IE);
    t('  "' + q.slice(0, 52) + '" agrees', a === y, JSON.stringify([a, y]));
  }
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
