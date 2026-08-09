// THE PERSON WHO OWNS *THIS* REQUISITION.
//
// Asked for: the specific decision maker for this listing -- right role,
// right company, right country/region -- not whoever happens to sit on
// the hiring team, and not restricted to "hiring manager" either, since
// a recruiter is usually the one reading applications.
//
// A title alone answers none of that. Any employer large enough to have
// a talent team has several recruiters, and they divide the work by
// DISCIPLINE: the sales recruiter will not read an application for a
// platform engineer. The same applies twice over to place -- "Dublin,
// Ireland" and "Dublin, Ohio" are different hiring markets -- and to the
// employer itself, since providers match on a company NAME, which
// happily returns someone who left two years ago.
//
// These assert the ordering that follows from that, on the real scorer.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
global.chrome = { storage: { local: { get: (k, cb) => { cb && cb({}); return Promise.resolve({}); },
  set: (o, cb) => { cb && cb(); return Promise.resolve(); } } } };
const file = path.join(DIR, 'contact-enrichment.js');
const mod = new Module(file, null);
mod.filename = file; mod.paths = Module._nodeModulePaths(DIR);
mod._compile(fs.readFileSync(file, 'utf8'), file);
const E = global.ContactEnrichment;

// ---- reading a discipline off a title --------------------------------
console.log('WHAT DISCIPLINE IS THIS?');
for (const [text, want] of [
  ['Senior Platform Engineer', 'engineering'],
  ['Machine Learning Engineer', 'data'],
  ['Microsoft Dynamics 365 Project Manager', 'delivery'],
  ['Account Executive', 'sales'],
  ['Staff Nurse', 'healthcare'],
  ['Financial Controller', 'finance'],
  ['Zookeeper', ''],
]) t('  ' + JSON.stringify(text) + ' -> ' + JSON.stringify(want),
  E.disciplineOf(text) === want, 'got ' + JSON.stringify(E.disciplineOf(text)));

console.log('\nWHAT DOES A RECRUITER COVER?');
// The question is not what KIND of job the recruiter has -- it is which
// discipline they hire FOR, which the title states obliquely.
for (const [text, want] of [
  ['Technical Recruiter', 'engineering'],
  ['Sales Recruiter', 'sales'],
  ['Clinical Talent Acquisition Partner', 'healthcare'],
  ['Recruiter', ''],                       // generic: no claim either way
  ['Talent Acquisition Partner', ''],
  ['Head of Engineering', ''],             // not a recruiter at all
]) t('  ' + JSON.stringify(text) + ' -> ' + JSON.stringify(want),
  E.recruiterCovers(text) === want, 'got ' + JSON.stringify(E.recruiterCovers(text)));

// ---- the ordering that matters ---------------------------------------
const ENG = { company: 'Nortal', title: 'Senior Platform Engineer', location: 'Dublin, Ireland' };
const q = { company: 'Nortal', location: 'Dublin, Ireland' };
const S = (p, ctx) => E.scoreCandidate(p, q, ctx || ENG);

console.log('\nTHE RIGHT DISCIPLINE, NOT JUST THE RIGHT KIND OF TITLE');
const techRec = S({ title: 'Technical Recruiter', company: 'Nortal', location: 'Dublin, Ireland' });
const salesRec = S({ title: 'Sales Recruiter', company: 'Nortal', location: 'Dublin, Ireland' });
const genericRec = S({ title: 'Recruiter', company: 'Nortal', location: 'Dublin, Ireland' });
t('  the technical recruiter beats the sales recruiter', techRec > salesRec, techRec + ' vs ' + salesRec);
t('  ...and beats a generic recruiter', techRec > genericRec, techRec + ' vs ' + genericRec);
t('  ...and the sales recruiter falls BELOW generic', salesRec < genericRec,
  'a recruiter for the wrong discipline is worse than an unspecified one: ' + salesRec + ' vs ' + genericRec);

console.log('\n  ...AND THE SAME LOGIC INVERTS FOR A SALES ROLE');
// The bug this replaces: "Sales Recruiter" was penalised unconditionally,
// so on a sales vacancy the exactly-right person was pushed to the bottom.
const SALES = { company: 'Nortal', title: 'Enterprise Account Executive', location: 'Dublin, Ireland' };
const salesRecOnSales = E.scoreCandidate({ title: 'Sales Recruiter', company: 'Nortal', location: 'Dublin, Ireland' }, q, SALES);
const techRecOnSales = E.scoreCandidate({ title: 'Technical Recruiter', company: 'Nortal', location: 'Dublin, Ireland' }, q, SALES);
t('  on a sales job the sales recruiter wins', salesRecOnSales > techRecOnSales,
  salesRecOnSales + ' vs ' + techRecOnSales);
t('  ...and is not punished for the word "sales"', salesRecOnSales > 0, String(salesRecOnSales));

console.log('\nHIRING MANAGERS COUNT TOO, BUT ONLY THEIR OWN FUNCTION');
const engMgr = S({ title: 'Engineering Manager', company: 'Nortal', location: 'Dublin, Ireland' });
const finMgr = S({ title: 'Finance Director', company: 'Nortal', location: 'Dublin, Ireland' });
t('  the engineering manager scores as a real target', engMgr > 0, String(engMgr));
t('  ...and outranks the finance director', engMgr > finMgr, engMgr + ' vs ' + finMgr);

console.log('\nTHE RIGHT COUNTRY, NOT JUST THE RIGHT CITY NAME');
const dublinIE = S({ title: 'Technical Recruiter', company: 'Nortal', location: 'Dublin, Ireland' });
const dublinOH = S({ title: 'Technical Recruiter', company: 'Nortal', location: 'Dublin, Ohio, United States' });
const bangalore = S({ title: 'Technical Recruiter', company: 'Nortal', location: 'Bangalore, India' });
t('  Dublin Ireland beats Dublin Ohio', dublinIE > dublinOH, dublinIE + ' vs ' + dublinOH);
t('  ...and beats another country entirely', dublinIE > bangalore, dublinIE + ' vs ' + bangalore);
t('  "Dublin, IE" is the same place as "Dublin, Ireland"',
  S({ title: 'Technical Recruiter', company: 'Nortal', location: 'Dublin, IE' }) === dublinIE);
t('  an unknown location is not punished like a wrong one',
  S({ title: 'Technical Recruiter', company: 'Nortal' }) > bangalore,
  'no location is uncertainty; a different country is evidence');

console.log('\nTHE RIGHT COMPANY');
const atNortal = S({ title: 'Technical Recruiter', company: 'Nortal', location: 'Dublin, Ireland' });
const atOther = S({ title: 'Technical Recruiter', company: 'Accenture', location: 'Dublin, Ireland' });
const noCompany = S({ title: 'Technical Recruiter', location: 'Dublin, Ireland' });
t('  someone at the employer outranks someone elsewhere', atNortal > atOther, atNortal + ' vs ' + atOther);
t('  a different employer is pushed below unknown', atOther < noCompany,
  'a demonstrably wrong company is worse than an unstated one: ' + atOther + ' vs ' + noCompany);
t('  a legal suffix is not a different company',
  S({ title: 'Technical Recruiter', company: 'Nortal Ltd.', location: 'Dublin, Ireland' }) === atNortal);
t('  nor is a country subsidiary',
  S({ title: 'Technical Recruiter', company: 'Nortal Ireland', location: 'Dublin, Ireland' }) === atNortal);

console.log('\nEVERYTHING TOGETHER: THE ONE PERSON THIS LISTING BELONGS TO');
const field = [
  { who: 'Technical Recruiter, Nortal, Dublin IE', p: { title: 'Technical Recruiter', company: 'Nortal', location: 'Dublin, Ireland' } },
  { who: 'Technical Recruiter, Nortal, Bangalore', p: { title: 'Technical Recruiter', company: 'Nortal', location: 'Bangalore, India' } },
  { who: 'Sales Recruiter, Nortal, Dublin IE', p: { title: 'Sales Recruiter', company: 'Nortal', location: 'Dublin, Ireland' } },
  { who: 'HR Manager, Nortal, Dublin IE', p: { title: 'HR Manager', company: 'Nortal', location: 'Dublin, Ireland' } },
  { who: 'Technical Recruiter, ANOTHER CO, Dublin IE', p: { title: 'Technical Recruiter', company: 'Accenture', location: 'Dublin, Ireland' } },
  { who: 'Engineering Manager, Nortal, Dublin IE', p: { title: 'Engineering Manager', company: 'Nortal', location: 'Dublin, Ireland' } },
];
const ranked = field.map((f) => Object.assign({}, f, { score: S(f.p) }))
  .sort((a, b) => b.score - a.score);
for (const r of ranked) console.log('    ' + String(r.score).padStart(4) + '  ' + r.who);
t('  the technical recruiter at the employer in the right country wins',
  /Technical Recruiter, Nortal, Dublin IE/.test(ranked[0].who), ranked[0].who);
t('  the same title at another company does not',
  !/ANOTHER CO/.test(ranked[0].who));
t('  nor the same title in another country',
  !/Bangalore/.test(ranked[0].who));
// Writing to a perfectly-titled recruiter at the WRONG employer is a cold
// approach to a stranger about a job they do not hire for. Everyone
// actually at the company must outrank them, however imperfect.
const wrongCo = ranked.findIndex((r) => /ANOTHER CO/.test(r.who));
t('  the wrong employer ranks last, below every insider',
  wrongCo === ranked.length - 1,
  'wrong-company candidate sits at position ' + (wrongCo + 1) + ' of ' + ranked.length);

console.log('\nTHE SEARCH ASKS FOR THAT PERSON FIRST');
const queries = E.buildQueries(ENG);
t('  the first query names the discipline',
  queries.length && queries[0].titles.some((x) => /Technical|Engineering/i.test(x)),
  JSON.stringify(queries[0] && queries[0].titles));
t('  generic recruiter tiers still follow as fallback',
  queries.some((x) => x.titles.some((y) => /^Recruiter$/i.test(y))));
t('  the hiring manager for the function is asked for too',
  queries.some((x) => x.titles.some((y) => /Engineering/i.test(y))));
t('  a sales vacancy leads with sales recruiters',
  E.buildQueries(SALES)[0].titles.some((x) => /Sales|Commercial|GTM/i.test(x)),
  JSON.stringify(E.buildQueries(SALES)[0].titles));
t('  still nothing without a company to scope it to',
  E.buildQueries({ title: 'Senior Platform Engineer', location: 'Dublin' }).length === 0);

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
