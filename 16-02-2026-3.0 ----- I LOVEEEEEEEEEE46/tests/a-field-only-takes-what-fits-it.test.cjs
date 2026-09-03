// "MAXMILLIAM" IN THE EMAIL BOX, AND ONE LETTER WITH TWO SUBJECT LINES.
//
// A Greenhouse form came back with the first name in the Email field
// and the form's own validator saying "Please enter a valid email
// address", while Phone sat empty saying "Phone number is too short".
// Whatever mismatched the label -- and a form that stacks "Preferred
// First Name" directly above "Email" gives several ways to -- the WRITE
// was checkable and was not checked. A field states its own type in
// three places, and an email field can only hold an email. A blocked
// write leaves the box empty for the form to flag, which beats a wrong
// value the form accepts.
//
// And the same document carried:
//
//     Re: Application for Project Manager
//     Dear Hiring Manager,
//     Re: Project Manager - Enterprise Solutions
//
// The presence check compares the WHOLE cleaned title, so a letter
// opening "Re: Application for Project Manager" failed it against the
// posting "Project Manager - Enterprise Solutions" -- the shorter form
// is not the longer string -- and a second subject line was inserted
// below the salutation, where a subject line does not belong anyway.
// An existing subject line is upgraded in place now, keeping the
// model's own lead-in and gaining the full title.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
const load = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
};
for (const f of ['docx-generator.js', 'content-quality-engine.js', 'recruiter-audit.js']) load(f);
load('autofill-core.js');
const RA = global.RecruiterAudit;
const AC = global.AutofillCore;

console.log('A FIELD ONLY TAKES A VALUE THAT COULD BE RIGHT FOR IT');
{
  const el = (attrs) => Object.assign(
    { tagName: 'INPUT', getAttribute: (k) => attrs['@' + k] || null }, attrs);
  for (const [name, attrs, value, allowed] of [
    ['the reported bug: a first name into Email', { type: 'email', name: 'email' }, 'Maxmilliam', false],
    ['a real address into Email', { type: 'email', name: 'email' }, 'maxokafordev@gmail.com', true],
    ['a name into a name field', { type: 'text', name: 'preferred_name' }, 'Maxmilliam', true],
    ['a name into Phone', { type: 'tel', name: 'phone' }, 'Maxmilliam', false],
    ['an international number', { type: 'tel', name: 'phone' }, '+353 087 426 1508', true],
    ['a national number', { type: 'tel', name: 'phone' }, '0874261508', true],
    ['a single digit into Phone', { type: 'tel', name: 'phone' }, '7', false],
    ['a name into a LinkedIn field', { type: 'text', name: 'linkedin_url' }, 'Maxmilliam', false],
    ['a real URL', { type: 'text', name: 'linkedin_url' }, 'https://linkedin.com/in/maxokafor', true],
    ['an empty value is always allowed', { type: 'email', name: 'email' }, '', true],
  ]) {
    t('  ' + name, AC.valueFitsField(el(attrs), value) === allowed,
      'expected ' + (allowed ? 'allowed' : 'BLOCKED'));
  }
}
{
  // The type is read from name/id/autocomplete too, not only type=.
  const byAuto = { tagName: 'INPUT', type: 'text', name: 'q_12345',
    getAttribute: (k) => (k === 'autocomplete' ? 'email' : null) };
  t('  an autocomplete="email" field is recognised',
    AC.valueFitsField(byAuto, 'Maxmilliam') === false, 'the hint was ignored');
  const byId = { tagName: 'INPUT', type: 'text', name: '', id: 'candidate-email-input',
    getAttribute: () => null };
  t('  ...and so is an id containing "email"',
    AC.valueFitsField(byId, 'Maxmilliam') === false, 'the id was ignored');
  const plain = { tagName: 'INPUT', type: 'text', name: 'cover_letter', getAttribute: () => null };
  t('  a field with no type hint accepts anything',
    AC.valueFitsField(plain, 'any prose at all') === true, 'a plain field was blocked');
}
{
  // setValue must actually refuse, not just report.
  let written = null;
  const el = { tagName: 'INPUT', type: 'email', name: 'email',
    getAttribute: () => null, maxLength: -1,
    set value(v) { written = v; }, get value() { return written; },
    dispatchEvent: () => {} };
  AC.setValue(el, 'Maxmilliam');
  t('  setValue writes nothing at all when the value does not fit',
    written === null, JSON.stringify(written));
  AC.setValue(el, 'maxokafordev@gmail.com');
  t('  ...and writes normally when it does',
    written === 'maxokafordev@gmail.com', JSON.stringify(written));
}

console.log('\nA LETTER HAS EXACTLY ONE SUBJECT LINE');
const CV = ['Maxmilliam Okafor', 'Project Manager', 'Dublin, IE | a@b.com', '',
  'PROFESSIONAL SUMMARY', 'PM.',
  'PROFESSIONAL EXPERIENCE', 'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Built backend services in Python.',
  'TECHNICAL SKILLS', 'Programming: Python', 'EDUCATION', 'Imperial College London'].join('\n');
const letter = (subjectLines) => ['Maxmilliam Okafor', 'Dublin, IE | a@b.com',
  'Date: September 3, 2026', '', ...subjectLines, 'Dear Hiring Manager,', '',
  'I am excited to apply for the Project Manager position at Hermanson Company.', '',
  'Sincerely,', 'Maxmilliam Okafor'].join('\n');
const run = (cl, title) => RA.runRecruiterAudit({
  cvText: CV, coverLetterText: cl, jdText: 'Project Manager Enterprise Solutions',
  jdTitle: title || 'Project Manager - Enterprise Solutions', jobKeywords: [], experience: [],
});
const subjects = (o) => o.coverLetterText.split('\n').filter((l) => /^\s*(re|subject)\s*:/i.test(l));

{
  // The reported document: a shorter subject than the posting's title.
  const o = run(letter(['Re: Application for Project Manager', '']));
  t('  one subject line survives', subjects(o).length === 1, JSON.stringify(subjects(o)));
  t('  ...upgraded to the full title',
    subjects(o)[0] === 'Re: Application for Project Manager - Enterprise Solutions',
    JSON.stringify(subjects(o)[0]));
  t('  ...keeping the model\'s own lead-in',
    /Application for/.test(subjects(o)[0]), JSON.stringify(subjects(o)[0]));
  t('  and it sits ABOVE the salutation',
    o.coverLetterText.indexOf('Re:') < o.coverLetterText.indexOf('Dear Hiring Manager'),
    o.coverLetterText.split('\n').slice(0, 8).join(' / '));
}
{
  // Two already present: the later one goes.
  const o = run(letter(['Re: Application for Project Manager', '',
    'Subject: Project Manager - Enterprise Solutions', '']));
  t('  a letter that already had two ends with one',
    subjects(o).length === 1, JSON.stringify(subjects(o)));
}
{
  // A bare subject takes the fuller title with no invented lead-in.
  const o = run(letter(['Re: Project Manager', '']));
  t('  a bare subject line just gains the full title',
    subjects(o)[0] === 'Re: Project Manager - Enterprise Solutions',
    JSON.stringify(subjects(o)[0]));
}
{
  // None at all: one is inserted, above the salutation.
  const o = run(letter([]));
  t('  a letter with no subject line gets exactly one',
    subjects(o).length === 1, JSON.stringify(subjects(o)));
  t('  ...above the salutation',
    o.coverLetterText.indexOf('Re:') < o.coverLetterText.indexOf('Dear Hiring Manager'),
    o.coverLetterText.split('\n').slice(0, 8).join(' / '));
}
{
  // Already correct: nothing changes.
  const exact = letter(['Re: Project Manager - Enterprise Solutions', '']);
  const o = run(exact);
  t('  a correct subject line is left as it is',
    subjects(o).length === 1
      && subjects(o)[0] === 'Re: Project Manager - Enterprise Solutions',
    JSON.stringify(subjects(o)));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
