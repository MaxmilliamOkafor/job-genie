// A BUSINESS ANALYST APPLICATION WENT OUT HEADLINED "SOFTWARE ENGINEER".
//
// The truthfulness rule held -- the posting's title was not a held
// title, so it was replaced by one the history contains -- but the
// replacement took the FIRST title on the page, the most recent role,
// with no look at the posting. "Data Analyst" sat three roles down
// sharing a word with "Business Analyst", and the one line a screener
// reads for relevance led with the least relevant true thing instead.
//
// Among the titles the history genuinely contains, the one closest to
// the posting's title leads. No overlap at all -> most recent, as
// before. Truth picks the candidates; relevance picks among them.
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

// His real history's shape: four roles, four different titles.
const cvWith = (headline) => ['Maxmilliam Okafor', headline,
  'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Analyst with years across data and product.',
  'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer', 'January 2023 - Present', '- Built services.',
  'SolimHealth', 'AI Product Manager', 'August 2022 - December 2022', '- Shipped the product.',
  'Accenture', 'Solutions Architect', 'April 2021 - July 2022', '- Architected the migration.',
  'Citigroup', 'Data Analyst', 'August 2017 - March 2021', '- Rebuilt the reporting suite.',
  'TECHNICAL SKILLS', 'Programming: Python, SQL',
  'EDUCATION', 'Imperial College London'].join('\n');

const headlineOf = (jdTitle, startHeadline) => {
  const o = RA.runRecruiterAudit({
    cvText: cvWith(startHeadline), jdText: 'role', jdTitle,
    jobKeywords: [], experience: [],
  });
  return o.cvText.split('\n').filter((l) => l.trim())[1];
};

console.log('THE CLOSEST HELD TITLE LEADS');
{
  t('  Business Analyst posting -> Data Analyst, not Software Engineer',
    headlineOf('Business Analyst', 'Business Analyst') === 'Data Analyst',
    headlineOf('Business Analyst', 'Business Analyst'));
  t('  Platform Architect posting -> Solutions Architect',
    headlineOf('Platform Architect', 'Platform Architect') === 'Solutions Architect',
    headlineOf('Platform Architect', 'Platform Architect'));
  t('  Product Manager posting -> AI Product Manager',
    headlineOf('Senior Product Manager', 'Senior Product Manager') === 'AI Product Manager',
    headlineOf('Senior Product Manager', 'Senior Product Manager'));
}

console.log('\nTRUTH STILL PICKS THE CANDIDATES');
{
  t('  a held title verbatim in the history is kept as the posting wrote it',
    headlineOf('Data Analyst', 'Data Analyst') === 'Data Analyst', headlineOf('Data Analyst', 'Data Analyst'));
  t('  no word overlap at all -> the most recent held title',
    headlineOf('Marketing Director', 'Marketing Director') === 'Software Engineer',
    headlineOf('Marketing Director', 'Marketing Director'));
  const kept = headlineOf('Business Analyst', 'Solutions Architect');
  t('  a headline already held is never churned', kept === 'Solutions Architect', kept);
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
