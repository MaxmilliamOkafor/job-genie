// THE STANDARD ATS CHECKLIST, ASSERTED AGAINST A REAL GENERATED FILE.
//
// Every other suite here reads source code. This one BUILDS A .DOCX and
// inspects what came out, because the failure that cost the entire
// employment history was invisible in the source: `spacing: 24` looks
// like styling and only reveals itself in the text layer, as
//
//     P R O F ES S I O NA L EXP ER I ENCE
//
// The generator stores its XML uncompressed (ZIP method 0), so the parts
// can be read straight out of the base64 with no inflate step.
//
// The checklist below is the one used to decide whether a CV is safe for
// Workday, Greenhouse, iCIMS, Taleo and Lever. Each item is asserted
// against the document, not against an intention to comply with it.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
for (const f of ['content-quality-engine.js', 'recruiter-audit.js', 'docx-generator.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}

const CV = [
  'Maxmilliam Okafor',
  'Manufacturing Engineering Technician',
  'Surrey, CA | +353 874 261 508 | maxokafordev@gmail.com',
  'https://linkedin.com/in/maxokafor | https://github.com/MaxmilliamOkafor',
  '',
  'PROFESSIONAL SUMMARY',
  'Manufacturing engineering technician with a foundation in process optimisation.',
  '',
  'PROFESSIONAL EXPERIENCE',
  'Meta',
  'Software Engineer\tJanuary 2023 - Present',
  '- Re-architected the data-ingestion layer in Python and SQL.',
  '- Mentored junior engineers through pairing and design reviews.',
  '',
  'Accenture',
  'Solutions Architect\tApril 2021 - July 2022',
  '- Led the migration of legacy client applications to Kubernetes on Azure.',
  '',
  'TECHNICAL SKILLS',
  'Python, SQL, Kubernetes, Docker, Terraform',
  '',
  'CERTIFICATIONS',
  '- AWS Certified Solutions Architect',
  '',
  'EDUCATION',
  'Master of Science in Artificial Intelligence, Imperial College London',
].join('\n');

const built = global.DocxGenerator.fromCvText(CV, { name: 'Maxmilliam Okafor' });
t('the document builds at all', !!(built && built.success && built.base64), JSON.stringify(built).slice(0, 200));
const zip = Buffer.from(built.base64, 'base64').toString('latin1');
// document.xml is the body part; the parts are stored, so it is present verbatim.
const docXml = (zip.match(/<w:document[\s\S]*?<\/w:document>/) || [''])[0];
t('document.xml is readable from the archive', docXml.length > 500, 'len=' + docXml.length);

// The text layer: what a parser sees after the markup is removed. Each
// <w:p> is a line, each <w:t> a text item within it.
const lines = (docXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map((p) =>
  (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
    .map((x) => x.replace(/<[^>]+>/g, ''))
    .join('')
    .replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
).filter((s) => s.trim());
const text = lines.join('\n');

console.log('\n1. SECTION HEADINGS SURVIVE AS WORDS  (the failure that lost everything)');
for (const h of ['PROFESSIONAL SUMMARY', 'PROFESSIONAL EXPERIENCE', 'TECHNICAL SKILLS',
  'CERTIFICATIONS', 'EDUCATION']) {
  t('  "' + h + '" is one unbroken heading',
    lines.some((l) => l.replace(/\s+/g, ' ').trim() === h),
    'nearest: ' + JSON.stringify(lines.filter((l) => l.replace(/\s/g, '').includes(h.replace(/\s/g, '')))[0] || '(absent)'));
}
t('  and no line is letter-spaced', !lines.some((l) => /(?:[A-Z] ){4,}[A-Z]/.test(l)),
  JSON.stringify(lines.find((l) => /(?:[A-Z] ){4,}[A-Z]/.test(l)) || ''));

console.log('\n2. ORDER IS NAME, CONTACT, EXPERIENCE, EDUCATION');
{
  const at = (s) => text.indexOf(s);
  t('  name first', at('Maxmilliam Okafor') === 0 || at('Maxmilliam Okafor') < at('Surrey'), 'name=' + at('Maxmilliam Okafor'));
  t('  contact before experience', at('maxokafordev@gmail.com') < at('PROFESSIONAL EXPERIENCE'), 'out of order');
  t('  experience before education', at('PROFESSIONAL EXPERIENCE') < at('EDUCATION'), 'out of order');
  t('  no content is missing',
    ['Meta', 'Accenture', 'Software Engineer', 'Solutions Architect',
      'Imperial College London', 'Kubernetes'].every((s) => text.includes(s)),
    'lost content from the document');
}

console.log('\n3. SINGLE COLUMN, NO TABLES, TEXT BOXES OR IMAGES');
{
  t('  no table', !/<w:tbl>/.test(docXml), 'a table splits the reading order');
  t('  no multi-column section', !/<w:cols[^>]*w:num="[2-9]"/.test(docXml), 'columns interleave on extraction');
  t('  no text box', !/<w:txbxContent|<w:framePr/.test(docXml), 'text boxes are skipped by parsers');
  t('  no image or drawing', !/<w:drawing|<w:pict/.test(docXml), 'graphics carry no text');
}

console.log('\n4. CONTACT DETAILS ARE IN THE BODY, WITH PLAIN-TEXT LABELS');
{
  t('  no header part', !/<w:hdr[\s>]/.test(zip), 'contact in a header is invisible to most parsers');
  t('  no footer part', !/<w:ftr[\s>]/.test(zip), 'same');
  t('  the contact line is in the body', text.includes('maxokafordev@gmail.com'), 'absent');
  // The checklist item that the real CV failed: OpenResume returned an
  // empty Phone because a bare +353 number matches no US-shaped regex.
  t('  the phone carries a "Phone:" label', /Phone:\s*\+?\d/.test(text),
    JSON.stringify(lines.find((l) => /\+353|Phone/.test(l)) || '(no phone line)'));
  t('  the email carries an "Email:" label', /Email:\s*\S+@/.test(text),
    JSON.stringify(lines.find((l) => /@/.test(l)) || '(no email line)'));
}

console.log('\n5. A STANDARD FONT');
{
  const fonts = [...new Set((docXml.match(/w:ascii="([^"]+)"/g) || []).map((s) => s.slice(9, -1)))];
  const SAFE = ['Arial', 'Calibri', 'Garamond', 'Georgia', 'Helvetica', 'Times New Roman'];
  t('  every font is on the ATS-safe list', fonts.every((f) => SAFE.includes(f)), fonts.join(', '));
}

console.log('\n6. DATES ARE CONSISTENT AND DASH-SEPARATED');
{
  const dates = lines.filter((l) => /\b(19|20)\d{2}\b/.test(l) && /Present|20\d{2}\s*[-]/.test(l));
  t('  date ranges are present', dates.length >= 2, JSON.stringify(dates));
  t('  every range uses a hyphen, never a comma',
    dates.every((d) => /\d\s*-\s*(Present|\w)/.test(d)) && !dates.some((d) => /\d,\s*(Present|\w+\s+\d{4})/.test(d)),
    JSON.stringify(dates));
  t('  and no en or em dash reaches the file', !/[–—]/.test(text),
    JSON.stringify((text.match(/.{0,20}[–—].{0,20}/) || [''])[0]));
}

console.log('\n7. A ROLE IS NOT SPLIT ACROSS A PAGE BREAK');
{
  const keepNext = (docXml.match(/<w:keepNext\/>/g) || []).length;
  t('  headings and company lines are held with what follows', keepNext >= 2,
    'keepNext count=' + keepNext);
}

console.log('\n8. THE TEXT LAYER READS CLEANLY  (the plain-text test)');
{
  t('  no two words are glued together across a line',
    !/[a-z][A-Z][a-z]{3,}/.test(text.replace(/[A-Z][a-z]+[A-Z][A-Za-z]*/g, '')),
    JSON.stringify((text.match(/\w*[a-z][A-Z]\w*/) || [''])[0]));
  // A hyphen BETWEEN TWO DATES is a range, not a stranded bullet. The
  // first version of this flagged "January 2023 - Present" and would
  // have had the date separator removed to satisfy it, which is the
  // fault this suite exists to catch.
  const stranded = /\S\s+[*•]\s+[A-Z]|[a-z.]\s+-\s+[A-Z][a-z]{3,}/;
  t('  no bullet is stranded mid-line', !stranded.test(text),
    JSON.stringify((text.match(new RegExp('.{0,30}(?:' + stranded.source + ').{0,20}')) || [''])[0]));
  t('  every bullet starts its own line',
    lines.filter((l) => /[-*•]/.test(l)).every((l) => /^\s*[-*•]/.test(l) || !/^\s*\S+\s+[-*•]/.test(l)),
    JSON.stringify(lines.find((l) => /^\s*\S+\s+[-*•]\s/.test(l)) || ''));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
