// ONE FORM ON THE PAGE IS INVISIBLE TO HALF THE SEARCHES.
//
// An ATS dictionary matches one exact string; the human who searches
// the pile afterwards types whichever form they think in. A posting
// that writes "Anti-Money Laundering (AML)" will be searched both
// ways, and the vocabulary mirror makes the CV carry exactly ONE form
// -- the JD's canonical -- so every CV loses half the matches.
//
// THE POSTING DEFINES ITS OWN PAIRS. No curated acronym list to go
// stale or to pair "SQL" with an expansion nobody writes: a pair
// exists only where the JD itself prints the long form with the
// acronym in parentheses, and the acronym's letters must come from the
// phrase's initials. And nothing is claimed the CV does not already
// claim: a CV carrying NEITHER form is left alone; one carrying either
// gains the other beside it, once.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
for (const f of ['docx-generator.js', 'content-quality-engine.js', 'recruiter-audit.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const RA = global.RecruiterAudit;
const pair = RA.pairJdAcronyms;

const JD = 'We need experience with Anti-Money Laundering (AML) monitoring, '
  + 'Know Your Customer (KYC) checks and Natural Language Processing (NLP). '
  + 'You will use modern tools (SQL) in Data (AI) teams.';

console.log('THE CV GAINS THE FORM IT LACKS');
{
  const o = pair('Redesigned the anti money laundering alert scoring in Python.', JD);
  t('  a long form gains the acronym',
    /anti money laundering \(AML\) alert/.test(o.text), o.text);
  t('  ...keeping the CV\'s own spelling',
    o.text.indexOf('anti money laundering') !== -1, 'the CV\'s wording was replaced');
}
{
  const o = pair('Cut false AML alerts without missing genuine cases.', JD);
  t('  an acronym gains the long form',
    /Anti-Money Laundering \(AML\) alerts/.test(o.text), o.text);
}

console.log('\nAND NOTHING IS EVER CLAIMED FRESH');
{
  const o = pair('Built dashboards in Power BI for the reporting team.', JD);
  t('  a CV with neither form is untouched',
    o.text === 'Built dashboards in Power BI for the reporting team.' && o.paired.length === 0,
    JSON.stringify(o));
}
{
  const o = pair('Ran Know Your Customer (KYC) checks daily.', JD);
  t('  a CV already carrying both forms is untouched',
    o.text === 'Ran Know Your Customer (KYC) checks daily.', o.text);
}

console.log('\nJUNK PARENTHESES DEFINE NOTHING');
{
  const o = pair('Wrote SQL for the AI feature store.', JD);
  t('  "modern tools (SQL)" is not a pair -- initials do not match',
    o.text.indexOf('modern tools') === -1 && !/SQL \(/.test(o.text), o.text);
  t('  "Data (AI)" is not a pair either', !/Data \(AI\)/.test(o.text), o.text);
}

console.log('\nONCE, AT THE FIRST OCCURRENCE');
{
  const cv = 'Led NLP research. Shipped three NLP models to production.';
  const o = pair(cv, JD);
  t('  the first mention is paired',
    o.text.indexOf('Natural Language Processing (NLP) research') !== -1, o.text);
  t('  the second stays as written',
    o.text.indexOf('three NLP models') !== -1
      && (o.text.match(/Natural Language Processing/g) || []).length === 1, o.text);
}

console.log('\nAND THE FULL AUDIT CARRIES IT');
{
  const cv = ['Maxmilliam Okafor', 'Data Analyst', 'Dublin, IE | maxokafordev@gmail.com', '',
    'PROFESSIONAL SUMMARY', 'Analyst with five years in data analysis.',
    'PROFESSIONAL EXPERIENCE', 'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
    '- Cut false AML alerts without missing genuine cases.',
    'TECHNICAL SKILLS', 'SQL, Python, Power BI',
    'EDUCATION', 'Imperial College London'].join('\n');
  const o = RA.runRecruiterAudit({
    cvText: cv, jdText: JD, jdTitle: 'Data Analyst', jobKeywords: ['SQL'], experience: [],
  });
  t('  both forms reach the finished CV',
    /Anti-Money Laundering \(AML\)/i.test(o.cvText), o.cvText.split('\n').find((l) => /AML/.test(l)));
  t('  and the fix is reported',
    o.report.fixes.some((f) => /acronym/i.test(f)), JSON.stringify(o.report.fixes));
  const off = RA.runRecruiterAudit({
    cvText: cv, jdText: JD, jdTitle: 'Data Analyst', jobKeywords: ['SQL'], experience: [],
    flags: { acronymPairing: false },
  });
  t('  and the flag turns it off', !/Anti-Money Laundering/.test(off.cvText),
    'acronymPairing: false still paired');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
