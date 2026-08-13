// THE CV HEADER MUST NOT CLAIM A COUNTRY THE CANDIDATE IS NOT IN.
//
// A generated CV went out with this contact line:
//
//   Tel Aviv-Yafo, IL, US  |  +353 874 261 508  |  max...@gmail.com
//
// The job was in Tel Aviv. IL is Israel. It is ALSO Illinois, and the
// normaliser read it as the state and appended ", US" -- so the header
// claimed a United States address, beside an Irish phone number, on an
// application to an Israeli employer.
//
// This is the single most expensive line on a CV to get wrong. It is
// what a work-authorisation screen reads, and "US address + non-US role
// + foreign phone" is an automatic no from a knockout question before a
// human sees anything. Roughly two dozen two-letter codes are both a US
// state and a country -- DE, CA, IN, PA, CO, MD, AL, MT... -- so this
// was never one city. Munich became "Munich, DE, US" and Toronto became
// "Toronto, CA, US".
//
// The rule: the CODE cannot settle it, so never guess in the direction
// that invents a US address. Claiming a country the candidate is not in
// is a false statement on an application; leaving "Munich, DE" without
// a country suffix is merely terser, and is how a US CV writes a US
// city anyway ("Chicago, IL").
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
for (const f of ['location-db.js', 'universal-location-strategy.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const T = global.ATSLocationTailor;
const norm = (s) => T.normalizeJobLocationForApplication(s, 'Dublin, IE');

console.log('NO CV EVER CLAIMS THE UNITED STATES FOR A NON-US ROLE');
// Each of these is a real country whose ISO code collides with a US
// state. Before the fix every one of them gained a ", US".
const FOREIGN = [
  ['Tel Aviv-Yafo, IL', 'Israel'],
  ['Munich, DE', 'Germany'],
  ['Mumbai, IN', 'India'],
  ['Toronto, CA', 'Canada'],
  ['Valletta, MT', 'Malta'],
  ['Chisinau, MD', 'Moldova'],
  ['Tirana, AL', 'Albania'],
  ['Panama City, PA', 'Panama'],
  ['Jakarta, ID', 'Indonesia'],
  ['Bogota, CO', 'Colombia'],
  ['Buenos Aires, AR', 'Argentina'],
  ['Vientiane, LA', 'Laos'],
  ['Ulaanbaatar, MN', 'Mongolia'],
];
for (const [input, country] of FOREIGN) {
  const out = norm(input);
  t('  ' + input.padEnd(20) + ' stays in ' + country,
    !/\bUS\b/.test(out) && !/United States/i.test(out),
    input + ' -> ' + out + ' -- this fails a work-authorisation screen');
}

console.log('\nAND THE CITY IS NEVER LOST OR SWAPPED');
for (const [input] of FOREIGN) {
  const city = input.split(',')[0];
  t('  keeps ' + city, norm(input).startsWith(city), norm(input));
}

console.log('\nAN UNAMBIGUOUS US STATE IS STILL RESOLVED AS ONE');
// TX, NY, WA and the rest are not country codes, so there is nothing to
// disambiguate and the US suffix is correct.
for (const s of ['Austin, TX', 'Seattle, WA', 'New York, NY', 'Boston, MA']) {
  t('  ' + s, /,\s*US$/.test(norm(s)), norm(s));
}

console.log('\nCOUNTRY NAMES SPELLED OUT ARE UNAFFECTED');
for (const [input, want] of [
  ['Tel Aviv-Yafo, Israel', 'Tel Aviv-Yafo, IL'],
  ['Dublin, Ireland', 'Dublin, IE'],
  ['Dublin, IE', 'Dublin, IE'],
  ['Tel Aviv-Yafo, Tel Aviv District, Israel', 'Tel Aviv-Yafo, IL'],
]) t('  ' + input + ' -> ' + want, norm(input) === want, norm(input));

console.log('\nTHE COUNTRY-CODE TEST IS EXACT, NOT FUZZY');
// db.findCountry() is a fuzzy matcher: it answers Taiwan for "TX",
// Portugal for "MT" and New Zealand for "ZZ". Using it as a membership
// test marked every US state a country and stripped ", US" off real
// American addresses -- the same bug pointing the other way.
// Asserted through behaviour rather than by reading the source: these
// are the inputs a fuzzy membership test gets wrong, in both directions.
t('  a state code that fuzzy-matches a country still resolves as a state',
  /,\s*US$/.test(norm('Austin, TX')),
  'findCountry("TX") answers Taiwan; taking that as "TX is a country" '
    + 'strips the US off every American address: ' + norm('Austin, TX'));
t('  ...and so does MT, which fuzzy-matches Portugal',
  norm('Billings, MT').startsWith('Billings'), norm('Billings, MT'));
t('  a nonsense code does not become a country',
  !/,\s*NZ$/.test(norm('Springfield, ZZ')),
  'findCountry("ZZ") answers New Zealand: ' + norm('Springfield, ZZ'));

const src = fs.readFileSync(path.join(DIR, 'universal-location-strategy.js'), 'utf8');
t('  the collision list is spelled out',
  /STATE_COUNTRY_COLLISIONS/.test(src) && /'IL',\s*\/\/\s*Illinois/.test(src),
  'the bundled dataset carries 46 countries, so membership in it '
    + 'answers "not a country" for most of the world');
// Comments still discuss it by name, which is the point of them, so
// strip comment lines before looking for a live call.
const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
t('  ...and nothing calls the dead db.fromISO2 guard',
  !/fromISO2/.test(code),
  'that method does not exist on this dataset, so the guard that called '
    + 'it was answering undefined every single time');

console.log('\nAND A BARE COUNTRY CODE RESOLVES TO THE COUNTRY');
// _toISO2 fell through the same dead guard to the US-state test, which
// returns null for exactly the ambiguous codes, throwing the country
// away entirely.
for (const [input, want] of [['Israel', 'IL'], ['Germany', 'DE'], ['India', 'IN'], ['Ireland', 'IE']]) {
  const out = norm('Some City, ' + input);
  t('  ' + input + ' -> ' + want, out.endsWith(', ' + want), out);
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
