// THE CV SAID THE CANDIDATE LIVES IN "BRASIL, IE".
//
// Reported against a real Greenhouse posting
// (job-boards.greenhouse.io/hotmartcareersbr/jobs/4951783101) whose
// location field reads:
//
//   BRASIL, SÃO PAULO; BRASIL,BELO HORIZONTE
//
// Two faults, either of which alone produces a header naming a place
// that does not exist, on an application to a country the candidate is
// not in. Neither announces itself: an unresolvable location silently
// falls back to the profile's, so the CV just says somewhere else.
//
//   COUNTRY FIRST. Every rule in the normaliser assumes "City,
//   Country", because that is how a CV writes it. Job boards do not
//   agree. Read in the assumed order, "BRASIL, SÃO PAULO" is a city
//   called Brasil in a country called São Paulo; São Paulo is not a
//   country, so the country fell back to the profile's -- Ireland --
//   and the two halves were glued into "Brasil, IE".
//
//   ACCENTS. The bundled city dataset stores names unaccented, so "Sao
//   Paulo" resolved and "São Paulo" did not. The accented spelling is
//   the one job boards publish. Every accented city on earth was
//   affected: Zürich, Malmö, Kraków, Düsseldorf, Bogotá, Montréal.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
for (const f of ['city-dataset.js', 'location-db.js', 'universal-location-strategy.js']) {
  try {
    const file = path.join(DIR, f);
    const m = new Module(file, null); m.filename = file;
    m.paths = Module._nodeModulePaths(DIR);
    m._compile(fs.readFileSync(file, 'utf8'), file);
  } catch (e) { /* the dataset files are optional */ }
}
const L = global.ATSLocationTailor;
const norm = (raw) => L.normalizeJobLocationForApplication(raw, 'Dublin, IE');

console.log('THE POSTING THAT WAS REPORTED');
t('  the exact string resolves to the first office',
  norm('BRASIL, SÃO PAULO; BRASIL,BELO HORIZONTE') === 'São Paulo, BR',
  norm('BRASIL, SÃO PAULO; BRASIL,BELO HORIZONTE'));
t('  and never to a country that is not in it',
  !/\bIE\b/.test(norm('BRASIL, SÃO PAULO; BRASIL,BELO HORIZONTE')),
  'the profile country was glued onto a foreign city');

console.log('\nCOUNTRY FIRST IS SWAPPED');
for (const [raw, want] of [
  ['BRASIL, SÃO PAULO', 'São Paulo, BR'],
  ['Brasil, Belo Horizonte', 'Belo Horizonte, BR'],
  ['Ireland, Dublin', 'Dublin, IE'],
  ['Germany, Berlin', 'Berlin, DE'],
]) {
  t('  "' + raw + '" -> ' + want, norm(raw) === want, norm(raw));
}

console.log('\nAND CITY FIRST IS LEFT ALONE');
// The swap must be narrow. It fires only when the first part really is a
// country AND the second really is a city, so the ordinary case and the
// ambiguous ones are untouched.
for (const [raw, want] of [
  ['São Paulo, Brasil', 'São Paulo, BR'],
  ['Dublin, Ireland', 'Dublin, IE'],
  ['Cork, IE', 'Cork, IE'],
  ['London, United Kingdom', 'London, GB'],
  ['Berlin, Germany', 'Berlin, DE'],
]) {
  t('  "' + raw + '" -> ' + want, norm(raw) === want, norm(raw));
}

console.log('\nACCENTED CITIES RESOLVE');
for (const [city, country] of [
  ['São Paulo', 'Brazil'],
  ['SÃO PAULO', 'Brazil'],
  ['Zürich', 'Switzerland'],
  ['Malmö', 'Sweden'],
  ['Kraków', 'Poland'],
  ['Düsseldorf', 'Germany'],
  ['Bogotá', 'Colombia'],
  ['Montréal', 'Canada'],
]) {
  t('  ' + city + ' is in ' + country, L.inferCountryFromCity(city) === country,
    JSON.stringify(L.inferCountryFromCity(city)));
}
t('  and the accent survives onto the CV',
  norm('Zürich, Switzerland') === 'Zürich, CH', norm('Zürich, Switzerland'));

console.log('\nSEVERAL OFFICES: THE FIRST ONE');
for (const [raw, want] of [
  ['Dublin, Ireland; Cork, Ireland', 'Dublin, IE'],
  ['Berlin, Germany | Munich, Germany', 'Berlin, DE'],
]) {
  t('  "' + raw + '" -> ' + want, norm(raw) === want, norm(raw));
}

console.log('\nAND NOTHING ELSE MOVED');
// The rules this sits between are the ones that keep a fabricated
// location off the CV in the first place.
for (const [raw, want] of [
  ['Remote', 'Dublin, IE'],
  ['', 'Dublin, IE'],
  ['TBD', 'Dublin, IE'],
  ['Anywhere', 'Dublin, IE'],
]) {
  t('  "' + raw + '" falls back to the profile', norm(raw) === want, norm(raw));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
