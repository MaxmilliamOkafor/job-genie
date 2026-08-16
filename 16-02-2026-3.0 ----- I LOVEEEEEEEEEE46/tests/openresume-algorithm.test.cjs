// THE PARSER'S OWN ALGORITHM, RUN OVER OUR OWN DOCUMENT.
//
// Every check we can make locally is a proxy for the real thing, except
// this one. OpenResume publishes its algorithm in full: how it groups
// text items into lines, how it decides a line is a section title, and
// the exact feature functions and regexes it scores each field with.
// That is reimplemented below and run over the document the generator
// actually produces.
//
// It is the difference between "we removed the letter spacing" and "a
// parser built to those published rules now finds the employment
// history". The first was already true when Work Experience came back
// empty; only the second is the thing being claimed.
//
// The rules, verbatim from the published description:
//
//   SECTION TITLE  the only text item in the line, bolded, ALL UPPERCASE
//                  (with a keyword fallback)
//   Name           /^[a-zA-Z\s\.]+$/          +3, bold +2, caps +2,
//                  @ -4, digit -4, comma -4, slash -4
//   Email          /\S+@\S+\.\S+/
//   Phone          /\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/
//   Location       /[A-Z][a-zA-Z\s]+, [A-Z]{2}/
//   Date           /(?:19|20)\d{2}/ or a month, season, or "Present"
//   School         contains College / University / School
//   Degree         contains Associate / Bachelor / Master
//   Job Title      contains a job-title keyword
//   Company        bolded, or matches neither job title nor date
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
  'Dublin, IE | +353: 0874261508 | maxokafordev@gmail.com | https://linkedin.com/in/maxokafor',
  '',
  'PROFESSIONAL SUMMARY',
  'Manufacturing engineering technician with a foundation in process optimisation.',
  '',
  'PROFESSIONAL EXPERIENCE',
  'Meta',
  'Senior Software Engineer\tJanuary 2023 - Present',
  '- Re-architected the data-ingestion layer in Python and SQL.',
  '',
  'Accenture',
  'Solutions Architect\tApril 2021 - July 2022',
  '- Led the migration of legacy applications to Kubernetes on Azure.',
  '',
  'TECHNICAL SKILLS',
  'Python, SQL, Kubernetes, Docker, Terraform',
  '',
  'EDUCATION',
  'Master of Science in Artificial Intelligence, Imperial College London',
].join('\n');

// ---- read the document back as (text, bold) items per line -----------
const built = global.DocxGenerator.fromCvText(CV, { name: 'Maxmilliam Okafor' });
const zip = Buffer.from(built.base64, 'base64').toString('latin1');
// The archive is read as latin1 to keep byte offsets intact, so the
// XML has to be decoded back to UTF-8 before it is text. Without
// this the bullet U+2022 arrives as two mojibake characters and a
// bullet count of zero, which reads as bullets being lost.
const docXml = Buffer.from(
  (zip.match(/<w:document[\s\S]*?<\/w:document>/) || [''])[0], 'latin1').toString('utf8');
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const lines = (docXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map((p) => {
  const runs = (p.match(/<w:r>[\s\S]*?<\/w:r>/g) || []).map((r) => ({
    str: unesc((r.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/) || ['', ''])[1]),
    bold: /<w:b\/>/.test(r),
  })).filter((r) => r.str !== '');
  return { items: runs, text: runs.map((r) => r.str).join('').replace(/\s+/g, ' ').trim() };
}).filter((l) => l.text);

// ---- step 3: group lines into sections -------------------------------
// Transcribed from the parser's source (group-lines-into-sections.ts),
// not from its prose description. Three of these conditions are absent
// from the write-up and all three can reject a heading on their own:
//
//   isFirstTwoLines           a heading in the first two lines is never
//                             a heading, so the name and contact block
//                             must come first
//   hasMoreThanOneItemInLine  a heading split into two text items is not
//                             a heading. Letter spacing splits it into
//                             one item PER LETTER
//   textHasAtMost2Words       the fallback only ever fires on a heading
//                             of two words or fewer
const SECTION_KEYWORDS = ['experience', 'education', 'project', 'skill', 'job',
  'course', 'extracurricular', 'objective', 'summary', 'award', 'honor'];
const isSectionTitle = (l, idx) => {
  if (idx < 2) return false;                       // isFirstTwoLines
  if (l.items.length !== 1) return false;          // hasMoreThanOneItemInLine
  const item = l.items[0];
  const caps = /[a-zA-Z]/.test(item.str) && item.str === item.str.toUpperCase();
  if (item.bold && caps) return true;              // the main heuristic
  // The fallback, all conditions required.
  const words = item.str.trim().split(/\s+/).filter((w) => w !== '&');
  if (words.length > 2) return false;
  if (!/^[a-zA-Z\s&]+$/.test(item.str)) return false;
  if (!/^[A-Z]/.test(item.str.trim())) return false;
  return SECTION_KEYWORDS.some((k) => item.str.toLowerCase().includes(k));
};
const sections = {};
let current = 'PROFILE';
sections[current] = [];
lines.forEach((l, idx) => {
  if (isSectionTitle(l, idx)) { current = l.text; sections[current] = []; return; }
  sections[current].push(l);
});

console.log('SECTIONS ARE FOUND  (this is what came back empty)');
{
  const names = Object.keys(sections);
  t('  more than just PROFILE exists', names.length > 1,
    'found only ' + JSON.stringify(names) + '. Every line grouped under PROFILE is the '
      + 'exact failure the letter-spaced headings caused.');
  for (const want of ['PROFESSIONAL EXPERIENCE', 'EDUCATION', 'TECHNICAL SKILLS']) {
    t('  ' + want, names.includes(want), 'sections found: ' + JSON.stringify(names));
  }
}

// ---- step 4: feature scoring -----------------------------------------
const RE = {
  name: /^[a-zA-Z\s.]+$/,
  email: /\S+@\S+\.\S+/,
  phone: /\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/,
  location: /[A-Z][a-zA-Z\s]+, [A-Z]{2}/,
  date: /(?:19|20)\d{2}|present|current/i,
  school: /College|University|School|Institute/i,
  degree: /Associate|Bachelor|Master|PhD|Doctorate|Diploma|MSc|BSc/i,
  title: /Engineer|Analyst|Manager|Architect|Developer|Intern|Technician|Consultant|Designer|Scientist|Director|Lead/i,
};
// Transcribed from extract-profile.ts. The write-up omits
// hasParenthesis (-4) and has4OrMoreWords (-2) on the name, and
// hasLetter (-4) on the phone -- that last one is why the phone has to
// sit in a text item of its own, with no label glued to it.
const scoreName = (l) => {
  let s = 0;
  if (RE.name.test(l.text)) s += 3; else return -99;   // required match
  if (l.items.some((i) => i.bold)) s += 2;
  if (/[a-zA-Z]/.test(l.text) && l.text === l.text.toUpperCase()) s += 2;
  if (l.text.includes('@')) s -= 4;
  if (/\d/.test(l.text)) s -= 4;
  if (/[()]/.test(l.text)) s -= 4;
  if (l.text.includes(',')) s -= 4;
  if (l.text.includes('/')) s -= 4;
  if (l.text.trim().split(/\s+/).length >= 4) s -= 2;
  return s;
};
// Phone is scored per TEXT ITEM, and any letter in the item is -4.
const scorePhoneItem = (str) => {
  let s = 0;
  if (RE.phone.test(str)) s += 4; else return -99;
  if (/[a-zA-Z]/.test(str)) s -= 4;
  return s;
};
const profile = sections.PROFILE || [];
const best = (fn) => profile.slice().sort((a, b) => fn(b) - fn(a))[0];

console.log('\nTHE PROFILE FIELDS EXTRACT');
{
  const name = best(scoreName);
  t('  name', name && /Maxmilliam Okafor/i.test(name.text), name ? name.text : '(none)');
  const email = profile.find((l) => RE.email.test(l.text));
  t('  email', !!email, 'no line matches the email rule');
  const phoneLine = profile.find((l) => RE.phone.test(l.text));
  const phone = phoneLine ? phoneLine.text.match(RE.phone)[0] : '';
  t('  phone', phone === '087 426 1508',
    'got ' + JSON.stringify(phone) + ' from ' + JSON.stringify(phoneLine ? phoneLine.text : '(none)'));
  const loc = profile.find((l) => RE.location.test(l.text));
  t('  location', !!loc, 'no line matches City, ST');

  // hasLetter is -4 on the phone, and it is scored PER TEXT ITEM. So the
  // number must sit in an item of its own with nothing lettered glued to
  // it. A "Phone:" label in the same run would halve the score to zero
  // and hand the field to any other item that happens to match. This is
  // the assertion that would have caught that, and it is why the label
  // was taken back off.
  const phoneItems = profile.flatMap((l) => l.items.map((i) => i.str))
    .filter((s) => RE.phone.test(s));
  t('  the phone is in a text item of its own', phoneItems.length > 0,
    'no item matches the phone rule');
  t('  with no letters glued to it',
    phoneItems.some((s) => !/[a-zA-Z]/.test(s) && scorePhoneItem(s) === 4),
    phoneItems.map((s) => JSON.stringify(s) + ' scores ' + scorePhoneItem(s)).join(', '));

  // AND IT MUST SURVIVE THE PDF EXPORT.
  //
  // From group-text-items-into-lines.ts: adjacent items merge when
  //
  //     distance = currentItem.x - leftItemXEnd
  //     if (distance <= typicalCharWidth) -> merge
  //
  // and the merge inserts a space when the left item ends in a colon.
  // The DOCX keeps the phone in a run of its own, but the extension
  // ships DOCX and the user exports it to PDF, where only PHYSICAL GAP
  // keeps items apart. A "Phone:" label beside the number would merge
  // into "Phone: +353: 0874261508", which has letters, and the phone
  // score drops from 4 to 0.
  //
  // That is why the label was taken back off, and why the separator
  // around each contact field is two spaces either side of the pipe:
  // wider than a typical character, so the fields stay separate items
  // through the export.
  const contact = profile.find((l) => l.items.some((i) => RE.phone.test(i.str)));
  const idx = contact ? contact.items.findIndex((i) => RE.phone.test(i.str)) : -1;
  t('  nothing lettered sits directly beside it',
    idx > 0 && !/[a-zA-Z]/.test(contact.items[idx - 1].str),
    'the item before the phone is '
      + JSON.stringify(idx > 0 ? contact.items[idx - 1].str : '(none)')
      + '; on PDF export it would merge into the number');
  t('  and the separator is wider than one character',
    idx > 0 && /^\s{2,}\S\s{2,}$/.test(contact.items[idx - 1].str),
    'separator ' + JSON.stringify(idx > 0 ? contact.items[idx - 1].str : '(none)')
      + ' may not exceed typicalCharWidth, so the fields merge on export');
}

console.log('\nTHE EMPLOYMENT HISTORY EXTRACTS  (company, title, dates)');
{
  const exp = sections['PROFESSIONAL EXPERIENCE'] || [];
  t('  the section has content', exp.length > 0, 'empty');
  const bullets = exp.filter((l) => /^[-*•]/.test(l.text));
  const nonBullets = exp.filter((l) => !/^[-*•]/.test(l.text));
  const dated = nonBullets.filter((l) => RE.date.test(l.text));
  const titled = nonBullets.filter((l) => RE.title.test(l.text));
  const companies = nonBullets.filter((l) => l.items.some((i) => i.bold)
    && !RE.title.test(l.text) && !RE.date.test(l.text));

  t('  both roles carry a date', dated.length >= 2,
    'dated lines: ' + JSON.stringify(dated.map((l) => l.text)));
  t('  both roles carry a job title', titled.length >= 2,
    'titled lines: ' + JSON.stringify(titled.map((l) => l.text)));
  t('  both companies are identifiable', companies.length >= 2,
    'company lines: ' + JSON.stringify(companies.map((l) => l.text)));
  t('  the bullets survive', bullets.length >= 2, 'bullets: ' + bullets.length);

  // The binding that matters: a parser ties a date to the NEAREST title.
  // On the proven document these share one line. Ours must at least keep
  // them adjacent, or the date binds to the wrong role.
  t('  every dated line also carries its title',
    dated.every((l) => RE.title.test(l.text)),
    'a date on its own line binds to whichever title is nearest, which is '
      + 'the wrong one at a page break: ' + JSON.stringify(dated.map((l) => l.text)));
}

console.log('\nEDUCATION EXTRACTS');
{
  const edu = sections.EDUCATION || [];
  t('  the section has content', edu.length > 0, 'empty');
  t('  a school is identifiable', edu.some((l) => RE.school.test(l.text)),
    JSON.stringify(edu.map((l) => l.text)));
  t('  a degree is identifiable', edu.some((l) => RE.degree.test(l.text)),
    JSON.stringify(edu.map((l) => l.text)));
}

console.log('\nSKILLS EXTRACT');
{
  const sk = sections['TECHNICAL SKILLS'] || [];
  t('  the section has content', sk.length > 0, 'empty');
  t('  and lists real technologies', sk.some((l) => /Python|Kubernetes/.test(l.text)),
    JSON.stringify(sk.map((l) => l.text)));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
