// THE SECTIONS ARE ORDERED FOR THE SIX SECOND SCAN.
//
// A recruiter reads top-down and stops early, so the sections that answer
// "can this person do THIS job" come before the ones that do not:
//
//   Summary -> Core Competencies -> Work Experience
//     -> Technical Proficiencies -> Certifications -> Education
//
// Education last is the point. Education above experience is the graduate
// convention and reads as early-career on a CV with years of history
// behind it. Putting it after the skills also stops the skills being split
// in two with education wedged between them: Core Competencies at the top
// for the scan, Proficiencies and Certifications together lower down.
//
// Section order does NOT affect ATS parsing -- parsers find sections by
// their headings, wherever they sit. This is entirely for the human, which
// is why it has to be identical in every renderer: the same application
// must not look different depending on which file the portal accepted.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const ORDER = ['summary', 'competencies', 'experience', 'skills', 'certifications', 'education'];
const seq = (arr) => arr.join(' -> ');

console.log('THE PDF ENGINE RENDERS IN THAT ORDER');
const pdf = read('professional-pdf-engine.js');
const calls = [...pdf.matchAll(/this\.render(Summary|CoreCompetencies|Experience|Skills|Certifications|Education)\(doc,/g)]
  .map((m) => m[1].toLowerCase().replace('corecompetencies', 'competencies'));
t('  every section is rendered', calls.length === 6, JSON.stringify(calls));
t('  ' + seq(calls), seq(calls) === seq(ORDER), 'expected ' + seq(ORDER));

console.log('\nAND THE PROMPT ASKS FOR THE SAME ORDER');
// The DOCX renders the tailored TEXT in whatever order it arrives, so for
// that format the prompt is the only thing deciding this.
let prompt = null;
try { prompt = read('../supabase/functions/tailor-application/index.ts'); } catch (e) {}
if (!prompt) {
  console.log('  SKIP  tailoring prompt not present in this checkout');
} else {
  const at = (label) => prompt.indexOf('    - ' + label);
  const spec = [
    ['CORE COMPETENCIES', at('CORE COMPETENCIES')],
    ['WORK EXPERIENCE', at('WORK EXPERIENCE')],
    ['TECHNICAL PROFICIENCIES', at('TECHNICAL PROFICIENCIES')],
    ['CERTIFICATIONS', at('CERTIFICATIONS')],
    ['EDUCATION', at('EDUCATION (LAST)')],
  ];
  for (const [label, idx] of spec) t('  the spec names ' + label, idx > 0, 'not found');
  const positions = spec.map(([, i]) => i);
  t('  ' + spec.map(([l]) => l.split(' ')[0]).join(' -> '),
    positions.every((v, i) => i === 0 || v > positions[i - 1]),
    'the spec lists them in a different order: ' + JSON.stringify(positions));
  t('  ...and says why education is last',
    /EDUCATION \(LAST\)[\s\S]{0,400}?graduate convention/.test(prompt),
    'without the reason it gets reordered back by the next edit');

  console.log('\n  THE JSON SCHEMA MUST NOT PULL THE OTHER WAY');
  // The model infers document order from the schema as much as from the
  // prose spec, so a schema listing education before skills contradicts it.
  const i = prompt.indexOf('"resumeStructured": {');
  const blk = prompt.slice(i, prompt.indexOf('"metricsWorthAdding"', i));
  const fields = [...blk.matchAll(/^\s{4}"(\w+)":/gm)].map((m) => m[1]);
  t('  ' + fields.join(' -> '),
    fields.indexOf('education') === fields.length - 1
      && fields.indexOf('skills') < fields.indexOf('education')
      && fields.indexOf('certifications') < fields.indexOf('education'),
    'the schema contradicts the written order');

  console.log('\n  AND THE SCHEMA EXAMPLE MUST STILL BE VALID JSON');
  // Reordering fields by hand is exactly how a trailing comma goes missing,
  // and a malformed example invites a malformed response.
  let ex = '{' + blk.replace(/\s+$/, '').replace(/,$/, '') + '}';
  ex = ex.replace(/"\$\{[^}]*\}"/g, '"X"').replace(/\$\{[^}]*\}/g, '"X"');
  let ok = true, err = '';
  try { JSON.parse(ex); } catch (e) { ok = false; err = e.message; }
  t('  the example parses', ok, err);
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
