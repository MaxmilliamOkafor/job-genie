// THE PARSER READ ONE SPELLING AND THE API ANSWERS IN THE OTHER.
//
// The ContactOut profile response, verbatim from its documentation, is
// camelCase throughout:
//
//   { "profile": { "email": "...", "workEmail": "...",
//                  "workEmailStatus": "Verified | Unverified",
//                  "fullName": "...", "linkedinUrl": "..." } }
//
// parseProfile read work_email, work_emails and full_name, and nothing
// else. So a response that carried a verified work address parsed to an
// empty list, and the lookup reported "no address found" for a profile
// that had just returned one -- while still spending the credit.
//
// Nothing from here can tell which spelling an account is on, and
// accepting both costs nothing. This file feeds the documented body in
// exactly as published.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
const file = path.join(DIR, 'contact-enrichment.js');
const m = new Module(file, null); m.filename = file;
m.paths = Module._nodeModulePaths(DIR);
m._compile(fs.readFileSync(file, 'utf8'), file);
const E = global.ContactEnrichment;
const CO = E.PROVIDERS.contactout;

// The documented response, trimmed to the fields the parser reads.
const DOC = {
  status_code: 200,
  profile: {
    email: '0getfisher@gmail.com',
    workEmail: 'work-email@obm-international.com',
    workEmailStatus: 'Verified',
    fullName: 'Bobbi Singh',
    headline: 'Manager, Business Operations & Marketing at OBM International',
    linkedinUrl: 'https://www.linkedin.com/in/bobbisingh',
    company: { name: 'OBM International', domain: 'obm.international' },
    location: 'Bermuda',
  },
};

console.log('THE DOCUMENTED PROFILE RESPONSE');
{
  const rows = CO.parseProfile(DOC);
  t('  it parses to something at all', rows.length > 0, JSON.stringify(rows));
  t('  the work address leads', rows[0] && rows[0].email === 'work-email@obm-international.com',
    JSON.stringify(rows.map((r) => r.email)));
  t('  the personal one is kept behind it, not dropped',
    rows.some((r) => r.email === '0getfisher@gmail.com'),
    JSON.stringify(rows.map((r) => r.email)));
  t('  the name comes through', rows[0] && rows[0].name === 'Bobbi Singh',
    JSON.stringify(rows[0] && rows[0].name));
  t('  and the title, from the headline',
    rows[0] && /Business Operations/.test(rows[0].title), JSON.stringify(rows[0] && rows[0].title));
  t('  and the company, from the nested object',
    rows[0] && rows[0].company === 'OBM International', JSON.stringify(rows[0] && rows[0].company));
}

console.log('\nVERIFIED MEANS THE WORK ADDRESS, AND ONLY IT');
{
  const rows = CO.parseProfile(DOC);
  const work = rows.find((r) => /obm-international/.test(r.email));
  const personal = rows.find((r) => /gmail/.test(r.email));
  t('  the work address is marked verified', !!work && work.verified === true,
    JSON.stringify(work));
  t('  the personal one is not, on the strength of that field',
    !!personal && personal.verified === false, JSON.stringify(personal));
}
{
  // "Unverified" contains "verified" as a substring. A naive test on the
  // status string marks an unverified address as good and sends to it.
  const un = JSON.parse(JSON.stringify(DOC));
  un.profile.workEmailStatus = 'Unverified';
  const rows = CO.parseProfile(un);
  t('  "Unverified" is not read as verified',
    rows.every((r) => r.verified === false), JSON.stringify(rows.map((r) => [r.email, r.verified])));
  // And the literal placeholder from the docs is not a claim either.
  const both = JSON.parse(JSON.stringify(DOC));
  both.profile.workEmailStatus = 'Verified | Unverified';
  t('  ...nor is the docs placeholder "Verified | Unverified"',
    CO.parseProfile(both).every((r) => r.verified === false),
    JSON.stringify(CO.parseProfile(both).map((r) => [r.email, r.verified])));
}

console.log('\nAND THE OLD SPELLING STILL WORKS');
{
  const snake = { profile: { work_email: 'a@b.com', full_name: 'A B',
    title: 'Recruiter', company: 'B Ltd', location: 'Dublin' } };
  const rows = CO.parseProfile(snake);
  t('  work_email is still read', rows.length === 1 && rows[0].email === 'a@b.com',
    JSON.stringify(rows));
  t('  full_name is still read', rows[0] && rows[0].name === 'A B', JSON.stringify(rows[0]));
  t('  with no status field, nothing is claimed verified',
    rows[0] && rows[0].verified === false, JSON.stringify(rows[0]));
}
{
  // The object form some plans return.
  const objs = { profile: { workEmail: [{ email: 'x@y.com', type: 'work' }], fullName: 'X Y' } };
  const rows = CO.parseProfile(objs);
  t('  a { email } object is unwrapped, not stringified',
    rows.length === 1 && rows[0].email === 'x@y.com', JSON.stringify(rows));
}

console.log('\nAND A SEARCH RESULT READS THE SAME WAY');
{
  const rows = CO.parse({ profiles: [{
    fullName: 'Bobbi Singh', jobTitle: 'Talent Acquisition Manager',
    company: { name: 'OBM International' },
    linkedinUrl: 'https://www.linkedin.com/in/bobbisingh',
    workEmail: 'work-email@obm-international.com',
  }] });
  t('  the name is read', rows[0] && rows[0].name === 'Bobbi Singh', JSON.stringify(rows[0]));
  t('  the title is read', rows[0] && /Talent Acquisition/.test(rows[0].title),
    JSON.stringify(rows[0] && rows[0].title));
  t('  the work address is read', rows[0] && /obm-international/.test(rows[0].email),
    JSON.stringify(rows[0] && rows[0].email));
  t('  and the profile slug survives for a follow-up lookup',
    rows[0] && rows[0].profile === 'bobbisingh', JSON.stringify(rows[0] && rows[0].profile));
}

console.log('\nAND AN EMPTY ANSWER IS STILL EMPTY');
{
  t('  no profile at all', CO.parseProfile({}).length === 0);
  t('  a profile with no address', CO.parseProfile({ profile: { fullName: 'A' } }).length === 0);
  t('  and it does not throw on null', CO.parseProfile(null).length === 0);
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
