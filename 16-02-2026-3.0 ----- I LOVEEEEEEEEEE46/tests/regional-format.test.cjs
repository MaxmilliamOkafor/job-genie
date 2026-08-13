// WHAT CHANGES BY COUNTRY, AND WHAT MUST NEVER CHANGE.
//
// Two claims are being tested, and they pull in opposite directions.
//
// The first is that page size, margins and paper are NOT why anything
// gets rejected. No ATS reads <w:pgSz>; every one of them reads the text
// stream. So the paper can switch freely -- and the structural things
// that DO break parsers (tables, text boxes, columns, headers, images)
// must be absent in every region, not just the default one.
//
// The second is that spelling genuinely matters, because a lot of ATS
// keyword scoring is literal substring matching. "optimisation" does not
// match a posting asking for "optimization". Same word, missed keyword.
//
// And one thing that must hold regardless of what any national
// convention expects: no photograph, no date of birth, no marital
// status, no nationality. Ever, for any country.
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
['regional-format.js', 'content-quality-engine.js', 'docx-generator.js'].forEach(load);
const RF = global.RegionalFormat;
const CQE = global.ContentQualityEngine;
const DG = global.DocxGenerator;

console.log('WHICH COUNTRY IS THIS POSTING IN');
const country = (s) => RF.detectCountry(s);
[
  ['Dublin, Ireland', 'IE'], ['London, UK', 'GB'], ['London, United Kingdom', 'GB'],
  ['New York, NY', 'US'], ['Austin, TX', 'US'], ['Seattle, Washington', 'US'],
  ['San Francisco, CA', 'US'], ['Remote - United States', 'US'],
  ['Toronto, ON', 'CA'], ['Vancouver, British Columbia', 'CA'],
  ['Berlin, Germany', 'DE'], ['Munich, Germany', 'DE'], ['Paris, France', 'FR'],
  ['Lagos, Nigeria', 'NG'], ['Cape Town, South Africa', 'ZA'], ['Nairobi, Kenya', 'KE'],
  ['Bengaluru, India', 'IN'], ['Sydney, Australia', 'AU'], ['Singapore', 'SG'],
  ['Tokyo, Japan', 'JP'], ['Mexico City, Mexico', 'MX'], ['São Paulo, Brazil', 'BR'],
  ['Hybrid (Dublin, Ireland)', 'IE'], ['Remote (Berlin, Germany)', 'DE'],
  ['Greater London, United Kingdom Area', 'GB'],
].forEach(([input, want]) => {
  const got = country(input);
  t('  ' + input.padEnd(34) + ' -> ' + want, got === want, 'got ' + got);
});

console.log('\nAND WHEN IT SAYS NOTHING, IT SAYS NOTHING');
// Guessing a country from no evidence would silently reprint the CV in
// another language variant. Null is the correct answer.
[' ', 'Remote', 'Hybrid', 'Fully remote', 'Anywhere'].forEach((s) => {
  t('  "' + s + '" yields no country', country(s) === null, String(country(s)));
});

console.log('\nPAPER FOLLOWS THE COUNTRY');
const region = (loc, fb) => RF.resolveRegion(loc, fb);
t('  a US posting is US Letter', region('Austin, TX').page === 'LETTER', region('Austin, TX').page);
t('  a Canadian posting is US Letter', region('Toronto, ON').page === 'LETTER', region('Toronto, ON').page);
t('  an Irish posting is A4', region('Dublin, Ireland').page === 'A4', region('Dublin, Ireland').page);
t('  a German posting is A4', region('Berlin, Germany').page === 'A4', region('Berlin, Germany').page);
t('  a Nigerian posting is A4', region('Lagos, Nigeria').page === 'A4', region('Lagos, Nigeria').page);
t('  an Australian posting is A4', region('Sydney, Australia').page === 'A4', region('Sydney, Australia').page);
// Brazil is the case that proves paper and spelling are separate axes.
t('  Brazil is A4 but American English',
  region('Sao Paulo, Brazil').page === 'A4' && region('Sao Paulo, Brazil').spelling === 'US',
  JSON.stringify(region('Sao Paulo, Brazil')));
t('  no country falls back to the candidate\'s own',
  region('Remote', 'Dublin, Ireland').page === 'A4'
    && region('Remote', 'Dublin, Ireland').source === 'candidate',
  JSON.stringify(region('Remote', 'Dublin, Ireland')));
t('  no evidence at all defaults to A4 and UK',
  region('', '').page === 'A4' && region('', '').spelling === 'UK',
  JSON.stringify(region('', '')));

console.log('\nSPELLING FOLLOWS THE COUNTRY');
t('  a US posting wants American English', region('Austin, TX').spelling === 'US', '');
t('  a UK posting wants British English', region('London, UK').spelling === 'UK', '');
t('  an Irish posting wants British English', region('Dublin, Ireland').spelling === 'UK', '');
t('  a German posting wants British English', region('Berlin, Germany').spelling === 'UK', '');
t('  an Indian posting wants British English', region('Bengaluru, India').spelling === 'UK', '');

console.log('\nAND THE WORDS ACTUALLY CHANGE');
// The whole point: a Chicago posting asking for "optimization" has to
// find "optimization" in the CV.
const BULLET = 'Optimised the pipeline and analysed the behaviour of the data centre, prioritising fraud modelling.';
const us = CQE.sanitiseCVBlock(BULLET, 'US');
const uk = CQE.sanitiseCVBlock(BULLET, 'UK');
t('  "optimised" becomes "optimized" for a US posting', /optimized/i.test(us), us);
t('  "analysed" becomes "analyzed"', /analyzed/i.test(us), us);
t('  "behaviour" becomes "behavior"', /behavior\b/i.test(us), us);
t('  "centre" becomes "center"', /center\b/i.test(us), us);
t('  "prioritising" becomes "prioritizing"', /prioritizing/i.test(us), us);
t('  "modelling" becomes "modeling"', /\bmodeling\b/i.test(us), us);
t('  and the UK version keeps every one of them',
  /optimised/i.test(uk) && /analysed/i.test(uk) && /behaviour/i.test(uk)
    && /centre/i.test(uk) && /prioritising/i.test(uk),
  uk);
t('  the two really differ', us !== uk, 'the region flag did nothing');
t('  UK is still the default with no argument',
  CQE.sanitiseCVBlock(BULLET) === uk, 'the default changed');

console.log('\nBUT IT IS NOT A BLIND -ISE -> -IZE SWEEP');
// These are spelt -ise in American English too. A regex fallback gets
// them wrong; a curated map cannot.
const SAFE = 'Advise and supervise the team, applying expertise across the enterprise to advertise, revise, devise and comprise a precise franchise.';
const safeUS = CQE.sanitiseCVBlock(SAFE, 'US');
['advise', 'supervise', 'expertise', 'enterprise', 'advertise', 'revise',
 'devise', 'comprise', 'precise', 'franchise'].forEach((w) => {
  t('  "' + w + '" survives American conversion',
    new RegExp('\\b' + w, 'i').test(safeUS) && !new RegExp(w.replace(/ise$/, 'ize'), 'i').test(safeUS),
    safeUS);
});

console.log('\nAND IT DOES NOT INVENT PADDING');
// 'utilize' -> 'use' is a word-quality rule. Inverted it would turn
// every "use" into "utilize", which is the exact padding the engine
// exists to strip.
const USES = 'Used SQL to build the model and use Python daily.';
t('  "use" does not become "utilize" in American English',
  !/utiliz/i.test(CQE.sanitiseCVBlock(USES, 'US')), CQE.sanitiseCVBlock(USES, 'US'));
t('  "utilised" is still stripped for a US posting',
  !/utiliz|utilis/i.test(CQE.sanitiseCVBlock('Utilised Python to utilise the API.', 'US')),
  CQE.sanitiseCVBlock('Utilised Python to utilise the API.', 'US'));

console.log('\nAND PROPER NOUNS ARE NOT RESPELT');
// An employer or certification name has to survive verbatim -- it is
// checked against a reference and a background check.
const NAMES = 'Reported to the World Health Organisation and the Irish Defence Forces.';
const namesUS = CQE.sanitiseCVBlock(NAMES, 'US');
t('  "World Health Organisation" keeps its name',
  /World Health Organisation/.test(namesUS), namesUS);
t('  "Irish Defence Forces" keeps its name',
  /Irish Defence Forces/.test(namesUS), namesUS);

console.log('\nTHE PAGE SIZE REACHES THE ACTUAL FILE');
const CV = ['Maxmilliam Okafor', 'Dublin, Ireland | max@example.com', '',
  'PROFESSIONAL SUMMARY', 'Data analyst.', '',
  'PROFESSIONAL EXPERIENCE', 'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
  '- Built models in Python.', ''].join('\n');
const xmlOf = (opts) => {
  const r = DG.fromCvText(CV, opts);
  if (!r.success) return 'GENERATION FAILED: ' + r.error;
  return Buffer.from(r.base64, 'base64').toString('latin1');
};
const a4 = xmlOf({ jobLocation: 'Dublin, Ireland' });
const letter = xmlOf({ jobLocation: 'Austin, TX' });
t('  an Irish posting writes A4 twips', /w:w="11906" w:h="16838"/.test(a4), 'no A4 pgSz found');
t('  a US posting writes Letter twips', /w:w="12240" w:h="15840"/.test(letter), 'no Letter pgSz found');
t('  and no location still writes A4', /w:w="11906"/.test(xmlOf({})), 'default is not A4');
t('  an explicit region object wins',
  /w:w="12240"/.test(xmlOf({ region: RF.resolveRegion('Toronto, ON') })), 'region ignored');

console.log('\nAND THE PARSER-BREAKING STRUCTURES ARE ABSENT IN EVERY REGION');
// This is the guarantee that actually matters. Page size cannot cause a
// rejection; a table, a text box, a column or an image can.
[['A4', a4], ['US Letter', letter]].forEach(([label, xml]) => {
  t('  ' + label + ': no tables', !/<w:tbl[ >]/.test(xml), 'a table would break parsing');
  t('  ' + label + ': no text boxes', !/<w:txbxContent|<v:textbox/.test(xml), 'text boxes are invisible to parsers');
  t('  ' + label + ': no multi-column layout', !/<w:cols[^>]*w:num="[2-9]"/.test(xml), 'columns interleave text');
  t('  ' + label + ': no headers or footers', !/<w:hdr[ >]|<w:ftr[ >]|footerReference|headerReference/.test(xml), 'header/footer text is routinely dropped');
  t('  ' + label + ': no images', !/<w:drawing|<w:pict|<a:blip|image\/(png|jpeg)/.test(xml), 'an image is unparseable, and a photo is one');
  t('  ' + label + ': no field codes', !/<w:fldChar|<w:instrText/.test(xml), 'field codes parse as their code, not their text');
  t('  ' + label + ': the text is still there', /Citigroup/.test(xml) && /Data Analyst/.test(xml), 'content went missing');
});

console.log('\nAND NO REGION EVER ASKS FOR A PHOTO');
// Some European conventions still expect a photograph, date of birth and
// marital status. They are omitted everywhere: they are illegal to
// consider in the US and UK, they trigger anti-bias screening, and a
// photo is an image -- the single most reliable way to break a parser.
['Berlin, Germany', 'Paris, France', 'Vienna, Austria', 'Zurich, Switzerland',
 'Tokyo, Japan', 'Beijing, China', 'Lagos, Nigeria', 'Dublin, Ireland',
 'Austin, TX', 'London, UK', '', 'Remote'].forEach((loc) => {
  const r = RF.resolveRegion(loc);
  const ok = r.includePhoto === false && r.includeDateOfBirth === false
    && r.includeMaritalStatus === false && r.includeNationality === false;
  t('  ' + (loc || '(no location)').padEnd(22) + ' asks for none of them', ok, JSON.stringify(r));
});
t('  and the generator emits no image part for a German posting',
  !/<w:drawing|<a:blip|image\/(png|jpeg)/.test(xmlOf({ jobLocation: 'Berlin, Germany' })),
  'an image part appeared');

console.log('\nTHE DOCUMENT IS CALLED A RESUME IN NORTH AMERICA');
t('  US says Resume', region('Austin, TX').documentWord === 'Resume', '');
t('  Canada says Resume', region('Toronto, ON').documentWord === 'Resume', '');
t('  everywhere else says CV', region('Dublin, Ireland').documentWord === 'CV', '');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
