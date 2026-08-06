// Every shape of Easy Apply question, and specifically the Yes/No ones.
//
// A Yes/No control accepts exactly two answers, so the general field
// mapping ("city" -> Dublin) is not usable on one: no option matches, the
// field stays empty, and the flow stops on it as an unanswered required
// question. These assert the QUESTION-level answers, and above all their
// POLARITY -- "do you require sponsorship" and "are you authorised to
// work here" are opposites and both contain the word "work". A flipped
// answer is a false statement made to an employer in the user's name.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP easyapply-questions: jsdom not installed'); process.exit(0); }

let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
const loadCjs = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return m.exports;
};

// One DOM for the whole file: autofill-core is a singleton that returns
// the FIRST instance on a second load, so a second JSDOM would leave it
// bound to the first document and nothing would fill.
const FORM = `
<div id="modal">
  <div class="form-element"><label for="a">Are you legally authorized to work in Ireland?</label>
    <select id="a"><option value="">Select an option</option><option>Yes</option><option>No</option></select></div>
  <div class="form-element"><label for="b">Will you now or in the future require sponsorship?</label>
    <select id="b"><option value="">Select an option</option><option>Yes</option><option>No</option></select></div>
  <fieldset class="form-element"><legend>Are you able to reliably commute to this job's location?</legend>
    <label for="c1">Yes</label><input type="radio" id="c1" name="commute" value="yes">
    <label for="c2">No</label><input type="radio" id="c2" name="commute" value="no"></fieldset>
  <fieldset class="form-element"><legend>Have you previously worked for this company?</legend>
    <label for="d1">Yes</label><input type="radio" id="d1" name="prev" value="yes">
    <label for="d2">No</label><input type="radio" id="d2" name="prev" value="no"></fieldset>
  <div class="form-element"><label for="e">How many years of project management experience do you have?</label>
    <input id="e" type="text"></div>
  <div class="form-element"><label for="f">City</label><input id="f" type="text"></div>
  <div class="form-element"><label for="g">I agree to the processing of my personal data</label>
    <input id="g" type="checkbox"></div>
  <div class="form-element"><label for="h">Do you have experience with Power BI?</label>
    <select id="h"><option value="">Select an option</option><option>Yes</option><option>No</option></select></div>
  <div class="form-element"><label for="i">Do you have experience with SAP S/4HANA?</label>
    <select id="i"><option value="">Select an option</option><option>Yes</option><option>No</option></select></div>
</div>`;

const dom = new JSDOM('<!doctype html><html><body>' + FORM + '</body></html>');
// jsdom has no layout, so every element reports a zero-sized box and the
// visibility check would reject the entire form. Give them a real box.
dom.window.Element.prototype.getBoundingClientRect = function () {
  return { width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, x: 0, y: 0 };
};
global.window = dom.window;
global.document = dom.window.document;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
global.Event = dom.window.Event;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.CSS = dom.window.CSS;

const C = loadCjs('autofill-core.js');

const PROFILE = {
  first_name: 'Maxmilliam', last_name: 'Okafor',
  email: 'maxokafordev@gmail.com', phone: '+353 87 000 0000',
  city: 'Dublin', state: 'Leinster', country: 'Ireland',
  years: '6', degree: "Bachelor's", school: 'Trinity College Dublin',
  skills: ['Microsoft Dynamics 365', 'Azure DevOps', 'Power BI', 'Agile', 'Stakeholder management'],
  languages: 'English, French',
  current_title: 'Project Manager', current_company: 'Northbound',
};

// ---- 1. polarity: the pair that must never be flipped -----------------
const POLARITY = [
  ['Are you legally authorized to work in Ireland?', 'Yes'],
  ['Do you have the legal right to work in the United States?', 'Yes'],
  ['Are you eligible to work in the EU?', 'Yes'],
  ['Do you have permission to work in this country?', 'Yes'],

  ['Will you now or in the future require sponsorship for an employment visa?', 'No'],
  ['Do you require visa sponsorship?', 'No'],
  ['Do you now, or will you in the future, require sponsorship to work in Ireland?', 'No'],
  ['Will you require a work permit?', 'No'],

  // Same question asked the other way round -- the inversion.
  ['Are you able to work in Ireland without sponsorship?', 'Yes'],
  ['Can you work in the US without requiring visa sponsorship now or in the future?', 'Yes'],
];
console.log('POLARITY (sponsorship vs authorisation)');
for (const [q, want] of POLARITY) {
  const got = C.yesNoFor(q, PROFILE);
  t(want + '  <- ' + q, got === want, 'got "' + got + '"');
}

// ---- 2. the rest of the Yes/No surface --------------------------------
const YESNO = [
  // location / pattern -- "commute" used to resolve to the user's CITY
  ['Are you able to reliably commute to this job\'s location?', 'Yes'],
  ['Are you comfortable commuting to Dublin 2?', 'Yes'],
  ['Are you willing to relocate?', 'Yes'],
  ['Are you comfortable working in a hybrid environment, 3 days onsite?', 'Yes'],
  ['Are you comfortable working remotely?', 'Yes'],
  ['Are you willing to travel to the office weekly?', 'Yes'],

  // this employer specifically
  ['Have you previously worked for this company?', 'No'],
  ['Are you a current employee of Acme Corp?', 'No'],
  ['Have you ever been employed by our organisation?', 'No'],
  ['Are you related to anyone who works at this company?', 'No'],
  ['Do you know anyone who works here?', 'No'],
  ['Were you referred by a current employee?', 'No'],
  ['Are you currently employed?', 'Yes'],

  // standard screening
  ['Are you at least 18 years of age?', 'Yes'],
  ['Are you over 18?', 'Yes'],
  ['Have you ever been convicted of a felony?', 'No'],
  ['Do you have a criminal record?', 'No'],
  ['Do you consent to a background check?', 'Yes'],
  ['Do you agree to our terms and conditions?', 'Yes'],
  ['Do you acknowledge the privacy notice?', 'Yes'],
  ['Are you available to start within 4 weeks?', 'Yes'],
  ['Do you require any accommodations for the interview process?', 'No'],
  ['Do you have a valid driver\'s licence?', 'Yes'],

  // claims that ARE evidenced by the profile
  ['Do you have experience with Microsoft Dynamics 365?', 'Yes'],
  ['Do you have experience with Power BI?', 'Yes'],
  ['Are you proficient in Agile?', 'Yes'],
  ['Have you worked with Azure DevOps?', 'Yes'],
  ['Do you speak English?', 'Yes'],
  ['Do you have a bachelor\'s degree?', 'Yes'],
];
console.log('\nYES / NO SURFACE');
for (const [q, want] of YESNO) {
  const got = C.yesNoFor(q, PROFILE);
  t(want + '  <- ' + q, got === want, 'got "' + got + '"');
}

// ---- 3. claims the profile does NOT support ---------------------------
// Answering these "Yes" to be helpful would invent a credential. Blank is
// the correct answer: the flow then stops and asks.
console.log('\nUNEVIDENCED CLAIMS (must stay blank, not guess Yes)');
for (const q of [
  'Do you have experience with SAP S/4HANA?',
  'Are you proficient in Mandarin?',
  'Do you have experience with Kubernetes?',
  'Do you speak German?',
]) {
  const got = C.yesNoFor(q, PROFILE);
  t('blank  <- ' + q, got === '', 'claimed "' + got + '" with nothing in the profile to support it');
}

// ---- 4. profile overrides beat the defaults ---------------------------
console.log('\nPROFILE OVERRIDES');
const NEEDS_VISA = Object.assign({}, PROFILE, { sponsorship_required: true, work_authorized: false });
t('a user who DOES need sponsorship answers Yes',
  C.yesNoFor('Will you require visa sponsorship?', NEEDS_VISA) === 'Yes',
  C.yesNoFor('Will you require visa sponsorship?', NEEDS_VISA));
t('...and No to being already authorised',
  C.yesNoFor('Are you legally authorised to work here?', NEEDS_VISA) === 'No',
  C.yesNoFor('Are you legally authorised to work here?', NEEDS_VISA));
t('...and the inverted phrasing flips with them',
  C.yesNoFor('Can you work here without sponsorship?', NEEDS_VISA) === 'No',
  C.yesNoFor('Can you work here without sponsorship?', NEEDS_VISA));
t('someone unwilling to relocate answers No',
  C.yesNoFor('Are you willing to relocate?', Object.assign({}, PROFILE, { willing_to_relocate: false })) === 'No');
t('a returning employee answers Yes',
  C.yesNoFor('Have you previously worked for this company?', Object.assign({}, PROFILE, { worked_here_before: true })) === 'Yes');

// ---- 5. Yes/No option detection ---------------------------------------
console.log('\nYES/NO CONTROL DETECTION');
t('Yes + No is a Yes/No control', C.isYesNoOptions(['Yes', 'No']));
t('a placeholder does not count', C.isYesNoOptions(['Select an option', 'Yes', 'No']));
t('"Prefer not to say" makes it NOT a Yes/No control', !C.isYesNoOptions(['Yes', 'No', 'Prefer not to say']));
t('a country list is not a Yes/No control', !C.isYesNoOptions(['Ireland', 'France']));
t('an empty list is not a Yes/No control', !C.isYesNoOptions([]));

// ---- 6. end to end through fillContainer ------------------------------
// The real path: label resolution, control-type detection and the answer
// all together, on markup shaped the way LinkedIn shapes it.
console.log('\nEND TO END THROUGH fillContainer');
(async () => {
  await C.fillContainer(dom.window.document.getElementById('modal'), PROFILE, {});
  const g = (id) => dom.window.document.getElementById(id);
  t('authorisation dropdown -> Yes', g('a').value === 'Yes', g('a').value);
  t('sponsorship dropdown -> No (polarity held)', g('b').value === 'No', g('b').value);
  t('commute radio -> Yes (not the user\'s city)', g('c1').checked === true, 'yes=' + g('c1').checked + ' no=' + g('c2').checked);
  t('previously-worked-here radio -> No', g('d2').checked === true, 'yes=' + g('d1').checked + ' no=' + g('d2').checked);
  t('years of experience filled from the profile', g('e').value === '6', g('e').value);
  t('city still filled as a FIELD', g('f').value === 'Dublin', g('f').value);
  t('consent checkbox ticked', g('g').checked === true, String(g('g').checked));
  t('an evidenced skill -> Yes', g('h').value === 'Yes', g('h').value);
  t('an unevidenced skill stays unanswered', g('i').value === '', g('i').value);

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
