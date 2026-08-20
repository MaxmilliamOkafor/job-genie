// MOST ATS DO NOT AUTOFILL FROM A CV, AND THAT CHANGES THE JOB.
//
// A live audit of ten platforms on 2026-08-20 found three that parse an
// uploaded CV into the form. The other seven attach the file and leave
// every field blank, or put the upload behind a sign-in.
//
// All ten were being treated identically. On the seven that do not
// parse, the user sees an attached file, an empty form, and no way to
// tell whether that is the site behaving normally or this extension
// failing -- which is the worst kind of silence, because it looks like a
// bug in the thing they are trusting with an application.
//
// Three different jobs:
//
//   full/partial   the parse lands in the DOM, so it can be read back
//                  and CHECKED against the profile
//   none           nothing to verify; fill the form from the profile
//   gated          say there is a wall, rather than appearing to hang
//
// And "unknown" is a fourth answer, not a synonym for any of them.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
(() => {
  const file = path.join(DIR, 'ats-platforms.js');
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
})();
const AP = global.ATSPlatforms;

console.log('WHAT EACH PLATFORM DOES, AS OBSERVED');
for (const [key, mode] of [
  ['workable', 'full'],
  ['greenhouse', 'none'],
  ['teamtailor', 'none'],
  ['recruitee', 'none'],
  ['breezy', 'none'],
  ['pinpoint', 'none'],
  ['workday', 'gated'],
  ['icims', 'gated'],
  ['smartrecruiters', 'exists-untested'],
]) {
  t('  ' + key + ' is ' + mode, AP.autofillCapability(key).mode === mode,
    AP.autofillCapability(key).mode);
}

console.log('\nAND WHAT NOBODY HAS WATCHED IS NOT CLAIMED');
for (const key of ['bamboohr', 'taleo', 'jazzhr', 'jobvite', 'successfactors', 'dover']) {
  const cap = AP.autofillCapability(key);
  t('  ' + key + ' is unknown, not assumed', cap.mode === 'unknown' && cap.verified === false,
    JSON.stringify(cap));
}
t('  SmartRecruiters is marked unverified despite having a mode',
  AP.autofillCapability('smartrecruiters').verified === false,
  'it advertises autofill; nobody has seen it work from here');
t('  an unknown key does not throw', AP.autofillCapability('nope').mode === 'unknown');
t('  ...nor does a null one', AP.autofillCapability(null).mode === 'unknown');

console.log('\nTHE TWO QUESTIONS A CALLER ACTUALLY ASKS');
{
  t('  only the parsing platforms answer parsesCv',
    ['workable'].every((k) => AP.autofillCapability(k).parsesCv)
      && ['greenhouse', 'teamtailor', 'workday', 'smartrecruiters']
        .every((k) => !AP.autofillCapability(k).parsesCv),
    JSON.stringify(['workable', 'greenhouse', 'workday'].map((k) => [k, AP.autofillCapability(k).parsesCv])));
  t('  only the gated ones answer blocked',
    ['workday', 'icims'].every((k) => AP.autofillCapability(k).blocked)
      && ['workable', 'greenhouse'].every((k) => !AP.autofillCapability(k).blocked),
    JSON.stringify(['workday', 'icims', 'workable'].map((k) => [k, AP.autofillCapability(k).blocked])));
  // exists-untested must not read as either, or it gets treated as one.
  const sr = AP.autofillCapability('smartrecruiters');
  t('  an untested platform is neither parsing nor blocked',
    !sr.parsesCv && !sr.blocked, JSON.stringify(sr));
}

console.log('\nTHE DETAIL THAT SAVES THE USER TYPING');
{
  t('  Workable records the trigger, which is not the Resume field',
    /Import resume from/.test(AP.autofillCapability('workable').trigger),
    AP.autofillCapability('workable').trigger);
  t('  Teamtailor records that its phone box defaults to Sweden',
    AP.autofillCapability('teamtailor').phoneCountryDefault === '+46',
    AP.autofillCapability('teamtailor').phoneCountryDefault);
  t('  Recruitee, to Australia',
    AP.autofillCapability('recruitee').phoneCountryDefault === '+61',
    AP.autofillCapability('recruitee').phoneCountryDefault);
  t('  Workday and iCIMS record which wall it is',
    AP.autofillCapability('workday').gate === 'account-creation'
      && AP.autofillCapability('icims').gate === 'email-and-consent',
    JSON.stringify([AP.autofillCapability('workday').gate, AP.autofillCapability('icims').gate]));
}

console.log('\nAND THE ATTACH FLOW SAYS SO OUT LOUD');
{
  const src = fs.readFileSync(path.join(DIR, 'content.js'), 'utf8');
  t('  the attach reply carries the capability',
    /type === 'cv' \? describeAutofill\(\) : \{\}/.test(src),
    'the attach reply is identical on all ten platforms');
  t('  the description is built from the map, not hardcoded',
    /AP\.autofillCapability\(key\)/.test(src), 'a second copy of the platform knowledge');
  for (const [mode, phrase] of [
    ['full', 'reads the CV into the form'],
    ['none', 'does not read the CV into the form'],
    ['gated', 'only offers autofill after'],
    ['exists-untested', 'nobody has watched it work'],
  ]) {
    t('  ' + mode + ' has its own wording', src.includes(phrase),
      'no distinct message for ' + mode);
  }
  t('  and an unknown platform is described as nothing at all',
    /if \(note\) console\.log/.test(src), 'unknown would emit an empty claim');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
