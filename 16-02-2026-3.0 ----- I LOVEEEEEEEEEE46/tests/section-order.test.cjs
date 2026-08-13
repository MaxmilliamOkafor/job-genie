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

console.log('\nTHE DOCX ENFORCES IT ITSELF, WHATEVER ORDER THE TEXT ARRIVES IN');
// This is the part that matters in practice. The prompt lives in an edge
// function deployed separately, so for a long stretch the prompt was
// corrected and the documents kept coming out in the old order because the
// deploy had not happened. Reordering the text inside the generator removes
// that dependency: the layout is right on extension reload alone.
const os = require('os'), cp = require('child_process'), Module = require('module');
global.window = global;
const DGm = (() => {
  const f = path.join(DIR, 'docx-generator.js');
  const m = new Module(f, null); m.filename = f;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(f, 'utf8'), f);
  return m.exports;
})();
const DG = DGm.DocxGenerator || DGm;

// Exactly the order a real generated CV came out in: education 5th.
const WRONG_ORDER = ['Maxmilliam Okafor', 'Dublin | max@example.com', '',
  'PROFESSIONAL SUMMARY', 'Experienced engineer.', '',
  'CORE COMPETENCIES', 'Sales Engineering, Electrical Systems', '',
  'WORK EXPERIENCE', 'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Shipped a system.', '',
  'PROJECTS', '- A project.', '',
  'EDUCATION', 'MSc Artificial Intelligence', 'Imperial College London', '',
  'TECHNICAL PROFICIENCIES', 'Python, AWS, Kubernetes', '',
  'CERTIFICATIONS', '- AWS Certified Machine Learning'].join('\n');

function headingsOf(cvText) {
  const built = DG.fromCvText(cvText, {});
  if (!built || !built.success) return null;
  const tmp = path.join(os.tmpdir(), 'jg-order-' + Date.now() + '.docx');
  fs.writeFileSync(tmp, Buffer.from(built.base64, 'base64'));
  const xml = cp.execSync('python3 -c ' + JSON.stringify(
    'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
  ) + ' ' + JSON.stringify(tmp)).toString();
  fs.unlinkSync(tmp);
  return xml.split(/<w:p[ >]/).slice(1)
    .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('').trim())
    .filter((l) => l && l === l.toUpperCase() && l.length < 40 && /[A-Z]/.test(l));
}

const got = headingsOf(WRONG_ORDER);
t('  the document generates', !!got, 'generation failed');
if (got) {
  const want = ['PROFESSIONAL SUMMARY', 'CORE COMPETENCIES', 'PROFESSIONAL EXPERIENCE',
    'PROJECTS', 'TECHNICAL SKILLS', 'CERTIFICATIONS', 'EDUCATION'];
  t('  ' + got.join(' -> '), seq(got) === seq(want), 'expected ' + seq(want));
  t('  education is last however it arrived',
    got[got.length - 1] === 'EDUCATION', got.join(' -> '));
  t('  no section is lost or duplicated',
    new Set(got).size === got.length && got.length === want.length,
    got.join(' -> '));
}
console.log('\nAND A HEADING PRINTS ONCE, HOWEVER MANY INJECTORS ADDED ONE');
// This shipped. A CV went out with:
//
//   TECHNICAL PROFICIENCIES
//   langgraph, crewai, b2b, enterprise
//   TECHNICAL PROFICIENCIES
//   Python, TypeScript, React, ...
//
// Three separate passes can each append a skills section -- the
// tailoring edge function, the popup's post-sanitisation re-injection,
// and the model itself -- and each only guards against making a SECOND
// one. The popup's text-level dedupe merged one pair and stopped, so the
// third survived. A repeated heading is not only untidy: parsers that
// key sections by heading overwrite or drop one of the blocks, which can
// cost the entire skills section, the one an ATS scores most directly.
const TRIPLED = ['Maxmilliam Okafor', 'Dublin | max@example.com', '',
  'PROFESSIONAL SUMMARY', 'Experienced engineer.', '',
  'WORK EXPERIENCE', 'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Shipped a system.', '',
  'TECHNICAL PROFICIENCIES', 'langgraph, crewai', '',
  'TECHNICAL PROFICIENCIES', 'b2b, enterprise, python', '',
  'EDUCATION', 'MSc Artificial Intelligence', 'Imperial College London', '',
  'TECHNICAL PROFICIENCIES', 'Python, TypeScript, React', '',
  'CERTIFICATIONS', '- AWS Certified Machine Learning'].join('\n');
const tri = headingsOf(TRIPLED);
t('  the document generates', !!tri, 'generation failed');
if (tri) {
  t('  TECHNICAL SKILLS appears exactly once',
    tri.filter((h) => h === 'TECHNICAL SKILLS').length === 1, tri.join(' -> '));
  t('  no heading repeats at all', new Set(tri).size === tri.length, tri.join(' -> '));
}
// Merging must not lose the content that was under the extra headings --
// dropping the duplicate instead of absorbing it would silently delete
// keywords the ATS is scored on.
const body = (cvText) => {
  const built = DG.fromCvText(cvText, {});
  const tmp = path.join(os.tmpdir(), 'jg-body-' + Date.now() + '.docx');
  fs.writeFileSync(tmp, Buffer.from(built.base64, 'base64'));
  const xml = cp.execSync('python3 -c ' + JSON.stringify(
    'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
  ) + ' ' + JSON.stringify(tmp)).toString();
  fs.unlinkSync(tmp);
  return xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '');
};
const merged = body(TRIPLED);
for (const kw of ['langgraph', 'crewai', 'b2b', 'enterprise', 'TypeScript', 'React']) {
  t('  keeps ' + kw, merged.includes(kw), 'the merge dropped a keyword');
}
// "python" and "Python" are the same skill. Printing both is the tell
// that a machine assembled the list, so the cased spelling wins.
t('  merges python into Python rather than listing both',
  (merged.match(/\bPython\b/g) || []).length === 1 && !/\bpython\b/.test(merged),
  JSON.stringify(merged.match(/[Pp]ython/g)));

console.log('\nA HEADING WELDED TO ITS CONTENT IS STILL A HEADING');
// The model sometimes emits "CORE COMPETENCIES: LLM Implementation, ..."
// on one line. A section is recognised only when the whole line IS the
// heading, so that arrived as body text: no heading paragraph, the
// whole skills list in bold, nothing to rank. And an ATS splits a CV by
// finding a line that is just the heading, so a competencies section
// written that way is not a section at all and its keywords are never
// scored as skills.
const INLINE = ['Maxmilliam Okafor', 'Dublin | max@example.com', '',
  'PROFESSIONAL SUMMARY', 'Experienced engineer.', '',
  'CORE COMPETENCIES: LLM Implementation, AI Workflows, Real-Time Applications', '',
  'WORK EXPERIENCE', 'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Shipped a system.', '',
  'CERTIFICATIONS', '- Microsoft Certified: Azure AI Engineer Associate',
  'Live demo: https://example.github.io/signaldesk/', '',
  'EDUCATION', 'MSc Artificial Intelligence'].join('\n');
const inl = headingsOf(INLINE);
t('  the document generates', !!inl, 'generation failed');
if (inl) {
  t('  CORE COMPETENCIES becomes a heading of its own',
    inl.includes('CORE COMPETENCIES'), inl.join(' -> '));
  t('  ...and sits above PROFESSIONAL EXPERIENCE',
    inl.indexOf('CORE COMPETENCIES') < inl.indexOf('PROFESSIONAL EXPERIENCE'), inl.join(' -> '));
  t('  ...with the list no longer welded into the heading',
    !inl.some((h) => /CORE COMPETENCIES:/.test(h)), inl.join(' -> '));
}
// The split keys off known section names, not off "word followed by a
// colon", precisely so these survive intact.
const inlBody = (() => {
  const built = DG.fromCvText(INLINE, {});
  const tmp = path.join(os.tmpdir(), 'jg-inline-' + Date.now() + '.docx');
  fs.writeFileSync(tmp, Buffer.from(built.base64, 'base64'));
  const xml = cp.execSync('python3 -c ' + JSON.stringify(
    'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
  ) + ' ' + JSON.stringify(tmp)).toString();
  fs.unlinkSync(tmp);
  return xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '');
})();
t('  a certification title keeping its colon is untouched',
  /Microsoft Certified: Azure AI Engineer Associate/.test(inlBody),
  'splitting on any colon would decapitate this');
t('  a project link keeping its colon is untouched',
  /Live demo: https/.test(inlBody), 'the demo URL must stay on its label');
t('  the competencies themselves survive the split',
  /LLM Implementation/.test(inlBody) && /Real-Time Applications/.test(inlBody), inlBody.slice(0, 200));

// A document already in the right order must come through untouched.
const RIGHT = WRONG_ORDER.split('\n');
const already = headingsOf([].concat(RIGHT.slice(0, 18), RIGHT.slice(22), RIGHT.slice(18, 22)).join('\n'));
t('  text already in order is left alone', !!already && already[already.length - 1] === 'EDUCATION',
  already ? already.join(' -> ') : 'failed');

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
    ['TECHNICAL SKILLS', at('TECHNICAL SKILLS')],
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

console.log('\nTHE PRINTED HEADINGS ARE THE CONVENTIONAL ONES');
// The safest headings for a parser are the conventional ones, and the
// tailoring prompt lives in an edge function deployed separately -- so
// relying on the prompt alone means files keep coming out with the old
// heading until that deploy lands. Normalising in the renderer makes the
// document right on extension reload alone.
const SYNONYMS = ['Maxmilliam Okafor', 'Dublin | max@example.com', '',
  'SUMMARY', 'Experienced engineer.', '',
  'EMPLOYMENT', 'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Shipped a system.', '',
  'TECHNICAL PROFICIENCIES', 'Python, AWS', '',
  'EDUCATION', 'MSc Artificial Intelligence'].join('\n');
const canon = headingsOf(SYNONYMS);
t('  SUMMARY -> PROFESSIONAL SUMMARY', canon && canon.includes('PROFESSIONAL SUMMARY'), String(canon));
t('  EMPLOYMENT -> PROFESSIONAL EXPERIENCE', canon && canon.includes('PROFESSIONAL EXPERIENCE'), String(canon));
t('  TECHNICAL PROFICIENCIES -> TECHNICAL SKILLS', canon && canon.includes('TECHNICAL SKILLS'), String(canon));
t('  ...even though nothing needed reordering or merging',
  canon && canon.length === 4, String(canon));

// Renaming the experience heading must not switch off the treatment
// that depends on recognising it. EXPERIENCE_HEADERS listed WORK
// EXPERIENCE, EXPERIENCE and EMPLOYMENT but not PROFESSIONAL
// EXPERIENCE, so a CV using that wording silently lost its role/date
// layout -- dates no longer set against their role line. It is derived
// from SECTION_RANK now so the two cannot drift.
const withTabs = (cvText) => {
  const built = DG.fromCvText(cvText, {});
  const tmp = path.join(os.tmpdir(), 'jg-tab-' + Date.now() + '.docx');
  fs.writeFileSync(tmp, Buffer.from(built.base64, 'base64'));
  const xml = cp.execSync('python3 -c ' + JSON.stringify(
    'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8"))'
  ) + ' ' + JSON.stringify(tmp)).toString();
  fs.unlinkSync(tmp);
  return (xml.match(/<w:tab\/>/g) || []).length;
};
t('  the role/date treatment still runs after the rename',
  withTabs(SYNONYMS) > 0,
  'no tab stop in the document: the experience section was not recognised');
t('  ...and for every experience synonym',
  ['WORK EXPERIENCE', 'EXPERIENCE', 'EMPLOYMENT', 'PROFESSIONAL EXPERIENCE']
    .every((h) => withTabs(SYNONYMS.replace('EMPLOYMENT', h)) > 0),
  'one of the experience headings is not in EXPERIENCE_HEADERS');

console.log('\nEVERY PATH THAT BUILDS A DOCUMENT NAMES IT THE SAME WAY');
// The popup and the content script each generated documents and each
// built its own filename. The popup learned to include the target role;
// the content script's auto-flow kept First_Last_CV.docx. So the panel
// listed "..._Senior_Technical_Business_Analyst_CV.docx" while the file
// actually attached to the Greenhouse form was "Maxmilliam_Okafor_CV.docx".
//
// The confusion is the small half. The role in the name is what makes a
// CV left over from a DIFFERENT application visible at a glance --
// without it every file is called the same thing and a stale attachment
// cannot be spotted at all.
const base = DG.buildFileBase;
t('  the shared helper exists', typeof base === 'function',
  'two paths building names independently is how they drifted apart');
t('  role included', base('Maxmilliam', 'Okafor', 'Senior Technical Business Analyst')
  === 'Maxmilliam_Okafor_Senior_Technical_Business_Analyst', base('Maxmilliam', 'Okafor', 'Senior Technical Business Analyst'));
t('  parenthetical noise stripped',
  base('Max', 'Okafor', 'AI Engineer (Remote)') === 'Max_Okafor_AI_Engineer', base('Max', 'Okafor', 'AI Engineer (Remote)'));
t('  work-mode suffix stripped',
  base('Max', 'Okafor', 'Data Analyst - Hybrid') === 'Max_Okafor_Data_Analyst', base('Max', 'Okafor', 'Data Analyst - Hybrid'));
t('  long titles are cut, never mid-word',
  !/_$/.test(base('Max', 'Okafor', 'Senior Staff Machine Learning Engineer Ranking Platform'))
    && base('Max', 'Okafor', 'Senior Staff Machine Learning Engineer Ranking Platform').length <= 45,
  base('Max', 'Okafor', 'Senior Staff Machine Learning Engineer Ranking Platform'));
t('  no title falls back to the name alone',
  base('Max', 'Okafor', '') === 'Max_Okafor', base('Max', 'Okafor', ''));
t('  a missing name still yields something usable',
  base('', '', 'Engineer') === 'Applicant_Engineer', base('', '', 'Engineer'));

// Both call sites must use it, or they drift again.
const contentSrc = read('content.js');
t('  the content script uses the shared helper',
  /DocxGenerator\.buildFileBase\(p\.first_name, p\.last_name, jobTitleForName\)/.test(contentSrc),
  'the auto-flow built its own First_Last_CV.docx');
t('  ...from the detected job title',
  /jobTitleForName = \(jobInfo &&/.test(contentSrc), 'no title means no role in the name');
t('  ...and still works if the generator is missing',
  /typeof DocxGenerator !== 'undefined' && DocxGenerator\.buildFileBase/.test(contentSrc),
  'attaching nothing is worse than attaching a plainly named file');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
