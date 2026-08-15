// THE WHOLE CV PARSED AS ONE SECTION CALLED "PROFILE".
//
// The generated CV was run through the OpenResume parser and through
// Workday's own autofillWithResume. Both returned the same thing:
//
//     Work Experience   Company -   Job Title -   Date -   Descriptions -
//     Education         School  -   Degree    -   Date -
//     Skills            Descriptions -
//
// Empty. Not wrong, empty. All 90 lines of the document were grouped
// under PROFILE because NO SECTION HEADING WAS FOUND.
//
// The reason is in the extracted text layer:
//
//     P R O F ES S I O NA L S U M M A RY
//     CO R E CO M P ET ENCI ES
//     P R O F ES S I O NA L EXP ER I ENCE
//     T ECH NI CA L S K I LLS
//     ED U CAT I O N
//
// Headings were written with letter spacing: `spacing: 24` in the docx
// run properties, `letter-spacing: 0.5px` in the PDF stylesheets. The
// renderer inserts that space BETWEEN GLYPHS, so the word stops being a
// word in the text layer. Every ATS finds a section by keyword-matching
// its heading, and none of those strings match "PROFESSIONAL EXPERIENCE".
//
// So the tracking that made the page look designed cost the entire
// employment history, at every employer using a parser. It outranks
// every keyword and scoring question in this codebase, because a parser
// that finds no jobs has nothing left to score.
//
// The name kept spacing: 4, a fifth of the heading value, and parsed
// correctly as "Maxmilliam Okafor". That is the evidence for where the
// line sits, so this asserts the heading value specifically.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

console.log('THE DOCX HEADING CARRIES NO LETTER SPACING');
{
  const src = read('docx-generator.js');
  // The heading run, isolated: from the SECTION_HEADERS branch to the
  // end of the paragraph() call it emits.
  // Anchored on the run itself. SECTION_HEADERS is also tested by a
  // section-reordering pass that writes no runs at all, and anchoring on
  // that gave an empty slice which asserted nothing.
  const i = src.indexOf('run(upper');
  t('  the heading run exists', i > -1, 'run not found');
  const runCall = src.slice(i, src.indexOf(')', src.indexOf('}', i)));
  t('  the heading run sets no spacing', !/spacing:\s*\d/.test(runCall),
    JSON.stringify(runCall.slice(0, 160)));
  t('  and it is still bold caps navy, which cost nothing',
    /bold:\s*true/.test(runCall) && /caps:\s*true/.test(runCall) && /C\.NAVY/.test(runCall),
    'the fix must not strip the styling that parses fine: ' + runCall.slice(0, 160));
}

console.log('\nAND NEITHER DOES THE PDF STYLESHEET');
for (const f of ['cv-formatter-perfect.js', 'cv-formatter-perfect-enhanced.js']) {
  const src = read(f);
  t('  ' + f + ' has no letter-spacing rule', !/letter-spacing:\s*[0-9]/.test(src),
    (src.match(/.*letter-spacing:.*/) || [''])[0]);
}

console.log('\nAND NO GENERATOR REINTRODUCES IT ANYWHERE');
// Whichever renderer produces the file, the text layer has to survive.
{
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js'));
  const offenders = [];
  for (const f of files) {
    // Comments describe the old value on purpose, so they are stripped
    // before the sweep: the first run of this flagged its own changelog.
    const src = read(f)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    // A non-zero letter-spacing in CSS, or a non-zero w:spacing in a run.
    if (/letter-spacing:\s*(?!0)[0-9.]+(px|pt|em)/.test(src)) offenders.push(f + ' (css)');
    const m = src.match(/spacing:\s*(\d+)/g) || [];
    for (const hit of m) {
      const v = Number(hit.replace(/\D/g, ''));
      // 4 is the name, measured to parse correctly. Anything approaching
      // the old heading value of 24 does not.
      if (v > 8) offenders.push(f + ' (' + hit + ')');
    }
  }
  t('  nothing sets tracking wide enough to split a word',
    offenders.length === 0, offenders.join(', '));
}

console.log('\nAND A HEADING STILL SURVIVES A ROUND TRIP THROUGH THE TEXT LAYER');
// The actual failure, reproduced: this is what a parser does with the
// heading, and what it must now get back.
{
  const spacedOut = (s, tracking) => tracking > 8 ? s.split('').join(' ') : s;
  const HEADINGS = ['PROFESSIONAL EXPERIENCE', 'TECHNICAL SKILLS', 'EDUCATION'];
  const KNOWN = ['PROFESSIONAL EXPERIENCE', 'WORK EXPERIENCE', 'TECHNICAL SKILLS',
    'SKILLS', 'EDUCATION', 'CERTIFICATIONS', 'PROJECTS'];
  const found = (h) => KNOWN.includes(h.replace(/\s+/g, ' ').trim());
  for (const h of HEADINGS) {
    t('  "' + h + '" at the old tracking was lost',
      !found(spacedOut(h, 24)), 'the reproduction is wrong if this passes');
    t('  "' + h + '" at the new tracking is found',
      found(spacedOut(h, 0)), 'still unparseable');
  }
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
