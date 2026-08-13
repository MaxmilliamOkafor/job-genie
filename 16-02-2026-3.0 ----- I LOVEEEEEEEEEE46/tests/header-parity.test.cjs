// THE TWO FORMATS MUST PRINT THE SAME HEADER.
//
// The PDF renders from the structured record; the DOCX renders from the
// CV text. They are separate code paths that happen to describe the same
// person, so anything set in only one of them produces an application
// that looks different depending on which file the portal accepted.
//
// Two things were wrong at once.
//
// The first segment of the PDF contact line was the literal string
// 'Dublin, IE'. The job-adaptive location the popup computes already
// arrived as contact.location -- plumbed all the way through and then
// discarded -- so on every application outside Dublin the PDF claimed a
// different city from the DOCX. Nobody chose that behaviour.
//
// The trailing job location is deliberate: the header shows where the
// candidate is AND where the job is. But its de-duplication was a second
// hard-coded literal, /^Dublin,? IE$/, so the repeat was suppressed for
// exactly one city and every other candidate saw their location printed
// twice on the same line.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
global.performance = global.performance || { now: () => Date.now() };

let jspdf = null;
try { jspdf = require('jspdf'); } catch (e) { try { jspdf = require('/tmp/node_modules/jspdf'); } catch (e2) {} }
if (!jspdf) {
  console.log('SKIP header-parity: jspdf not installed');
  process.exit(0);
}
global.jspdf = jspdf;
let PDFParse = null;
try { ({ PDFParse } = require('pdf-parse')); } catch (e) { try { ({ PDFParse } = require('/tmp/node_modules/pdf-parse')); } catch (e2) {} }
if (!PDFParse) {
  console.log('SKIP header-parity: pdf-parse not installed');
  process.exit(0);
}

(() => {
  const f = path.join(DIR, 'professional-pdf-engine.js');
  const m = new Module(f, null); m.filename = f;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(f, 'utf8'), f);
})();
const PE = global.ProfessionalPDFEngine;

async function headerOf(city, jobLocation, jobTitle) {
  const r = await PE.generateCV(
    { firstName: 'Maxmilliam', lastName: 'Okafor', email: 'max@example.com', phone: '+353 874 261 508', city },
    { summary: 'Engineer.',
      experience: [{ title: 'SWE', company: 'Meta', startDate: '01/2023', endDate: 'Present', bullets: ['Did a thing.'] }],
      education: [{ degree: 'MSc', institution: 'Imperial', year: '2020' }] },
    {}, { title: jobTitle || 'Senior Backend Engineer', location: jobLocation });
  const b64 = r.base64 || r.pdfBase64 || r.pdf;
  if (!b64) return null;
  const parsed = await new PDFParse({ data: new Uint8Array(Buffer.from(b64, 'base64')) }).getText();
  return parsed.text;
}

(async () => {
  console.log('THE COMPUTED LOCATION IS USED, NOT A HARD-CODED CITY');
  const telAviv = await headerOf('Tel Aviv-Yafo, IL', 'Tel Aviv-Yafo, IL');
  t('  the adaptive location reaches the PDF', telAviv && /Tel Aviv-Yafo, IL/.test(telAviv),
    'the value is plumbed through and then discarded');
  t('  ...and the hard-coded Dublin does not override it',
    telAviv && !/Dublin/.test(telAviv),
    'the PDF claimed a different city from the DOCX: ' + (telAviv || '').split('\n')[2]);

  console.log('\nAND IT IS NOT PRINTED TWICE WHEN BOTH ARE THE SAME');
  const line = (txt) => (txt || '').split('\n').find((l) => /@/.test(l)) || '';
  t('  one location when candidate and job match',
    (line(telAviv).match(/Tel Aviv/g) || []).length === 1, line(telAviv));
  const dub = await headerOf('Dublin, IE', 'Dublin, IE');
  t('  ...for Dublin too, which used to be the only case handled',
    (line(dub).match(/Dublin/g) || []).length === 1, line(dub));

  console.log('\nBUT BOTH ARE SHOWN WHEN THEY GENUINELY DIFFER');
  // The header is meant to say where the candidate is and where the job
  // is. Suppressing that would lose real information.
  const munich = await headerOf('Dublin, IE', 'Munich, DE');
  t('  candidate location kept', /Dublin, IE/.test(line(munich)), line(munich));
  t('  job location kept', /Munich, DE/.test(line(munich)), line(munich));

  console.log('\nAND AN EMPTY PROFILE STILL PRODUCES A HEADER');
  const none = await headerOf('', 'Dublin, IE');
  t('  falls back rather than rendering an empty segment',
    /\S/.test(line(none)) && !/\|\s*\|/.test(line(none)), line(none));

  console.log('\nTHE TARGET TITLE IS IN BOTH FORMATS, NOT JUST ONE');
  t('  the PDF prints it under the name',
    /Senior Backend Engineer/.test(telAviv || ''), 'PDF renders from the structured record, '
      + 'so a title set only in the CV text never reaches it');
  const src = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');
  t('  ...and the extension sets it on the text the DOCX renders',
    /CV target title line set to/.test(src),
    'the DOCX renders the text, so it needs its own path');
  t('  ...idempotently, so prompt and extension cannot both add one',
    /alreadyThere/.test(src), 'a duplicated title line is worse than none');

  console.log('\nNEITHER HARD-CODED LITERAL SURVIVES');
  const pdfSrc = fs.readFileSync(path.join(DIR, 'professional-pdf-engine.js'), 'utf8');
  const code = pdfSrc.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  t('  no literal candidate location', !/candidateLocation\s*=\s*['"]Dublin/.test(code),
    'that is the line that made the PDF disagree with the DOCX');
  t('  no Dublin-only de-duplication', !/\^Dublin,\?\\s\*IE\$/.test(code),
    'every other city printed its location twice');

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
