// THE HEADLINE READ "GTM STRATEGY/OPERATIONS ASSOCIATE | DATADOG CAREERS".
//
// The browser tab's title, pipes and site furniture and all, printed
// under the candidate's name -- because the line under the name is the
// posting's title now, and the posting's title was scraped from the
// page rather than read.
//
// Page titles are "<role> | <company> Careers" or "<role> at <company>"
// almost universally, and the role is the FIRST segment. Only that
// segment is kept, and only when what follows looks like site
// furniture: "Analyst, Risk and Controls" is one title with a comma,
// and cutting a real title in half is worse than a tidy one left long.
//
// Also here: "Generated Documents wasn't showing" on a run that
// finished and attached both files. The reveal lived at the very end of
// ONE path, after the stats block, so the automation path (which
// returns earlier) never reached it.
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
const N = RA.normaliseJobTitle;

console.log('SITE FURNITURE IS CUT OFF THE TITLE');
for (const [raw, want] of [
  ['GTM Strategy/Operations Associate  |  Datadog Careers', 'GTM Strategy/Operations Associate'],
  ['Senior Data Analyst | Stripe Careers', 'Senior Data Analyst'],
  ['Business Analyst at Accenture', 'Business Analyst'],
  ['Software Engineer - Google Careers', 'Software Engineer'],
  ['Data Engineer (Remote) | Jobs at Meta', 'Data Engineer'],
  ['Product Manager · Spotify · Dublin', 'Product Manager'],
  ['Oracle EBS Business Analyst | Careers | Oracle', 'Oracle EBS Business Analyst'],
]) {
  t('  "' + raw.slice(0, 46) + '"', N(raw) === want, JSON.stringify(N(raw)));
}

console.log('\nBUT A REAL TITLE IS NEVER CUT IN HALF');
for (const keep of [
  'Oracle EBS Business Analyst',
  'Analyst, Risk and Controls',
  'Senior Software Engineer, Backend',
  'Data Analyst',
  'GTM Strategy/Operations Associate',
]) {
  t('  "' + keep + '" survives whole', N(keep) === keep, JSON.stringify(N(keep)));
}

console.log('\nAND A TITLE THAT IS ONLY FURNITURE YIELDS NOTHING');
for (const junk of ['Careers', 'Jobs', 'Job Description', 'Apply']) {
  t('  "' + junk + '" -> empty', N(junk) === '', JSON.stringify(N(junk)));
}

console.log('\nAND THE HEADLINE ON THE PAGE IS THE CLEAN TITLE');
{
  const cv = ['Maxmilliam Okafor', 'Software Engineer', 'Dublin, IE | a@b.com', '',
    'PROFESSIONAL SUMMARY', 'Analyst.',
    'PROFESSIONAL EXPERIENCE', 'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
    '- Rebuilt the reporting suite in SQL.',
    'TECHNICAL SKILLS', 'Programming: Python, SQL',
    'EDUCATION', 'Imperial College London'].join('\n');
  const o = RA.runRecruiterAudit({
    cvText: cv, jdText: 'GTM strategy role', jobKeywords: ['SQL'], experience: [],
    jdTitle: 'GTM Strategy/Operations Associate  |  Datadog Careers',
  });
  const line = o.cvText.split('\n').filter((l) => l.trim())[1];
  t('  no pipe reaches the line under the name', line.indexOf('|') === -1, line);
  t('  no company name either', !/Datadog/.test(line), line);
  t('  and the role itself is intact',
    line === 'GTM Strategy/Operations Associate', line);
}

console.log('\nAND THE MODEL\'S OWN COPY OF THE DIRTY TITLE IS SCRUBBED');
{
  // Cleaning the title where THIS code writes it is not enough: the
  // model is handed the same raw string and pastes it into its own
  // headline and its own "Re:" line. Every presence check then passes,
  // because the dirty string CONTAINS the clean one -- so the CV
  // carried the headline twice and the letter opened with the
  // furniture still attached.
  const RAW = 'GTM Strategy/Operations Associate  |  Datadog Careers';
  const cv = ['Maxmilliam Okafor', RAW,
    'Dublin, IE | +353 087 426 1508 | maxokafordev@gmail.com', '',
    'PROFESSIONAL SUMMARY', 'Analyst.',
    'PROFESSIONAL EXPERIENCE', 'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
    '- Rebuilt the reporting suite in SQL.',
    'TECHNICAL SKILLS', 'Programming: Python, SQL',
    'EDUCATION', 'Imperial College London'].join('\n');
  const cl = ['Maxmilliam Okafor', 'Dublin, IE', '',
    'Re: Application for ' + RAW, '', 'Dear Hiring Manager,', '', 'I am applying.'].join('\n');
  const o = RA.runRecruiterAudit({
    cvText: cv, coverLetterText: cl, jdText: 'GTM strategy role',
    jdTitle: RAW, jobKeywords: ['SQL'], experience: [],
  });
  const head = o.cvText.split('\n').filter((l) => l.trim());
  t('  the headline appears exactly once',
    head.filter((l) => /GTM Strategy\/Operations Associate/.test(l)).length === 1,
    JSON.stringify(head.slice(0, 4)));
  t('  ...clean', head[1] === 'GTM Strategy/Operations Associate', JSON.stringify(head[1]));
  t('  the contact line still follows it',
    /maxokafordev@gmail\.com/.test(head[2]), JSON.stringify(head[2]));
  t('  the letter\'s Re: line is cleaned in place',
    /^Re: Application for GTM Strategy\/Operations Associate$/m.test(o.coverLetterText),
    o.coverLetterText.split('\n').find((l) => /Re:/.test(l)));
  t('  and "Datadog Careers" is nowhere in either document',
    !/Datadog Careers/.test(o.cvText + o.coverLetterText),
    (o.cvText + o.coverLetterText).split('\n').filter((l) => /Datadog/.test(l)).join(' / '));
  t('  ...reported as a fix',
    o.report.fixes.some((f) => /Cleaned the job title/.test(f)),
    JSON.stringify(o.report.fixes.filter((f) => /title/i.test(f))));
}
{
  // A title that needs no cleaning must not be touched at all.
  const clean = RA.scrubRawTitle('Re: Oracle EBS Business Analyst', 'Oracle EBS Business Analyst');
  t('  a clean title scrubs nothing',
    clean.scrubbed === 0 && clean.text === 'Re: Oracle EBS Business Analyst', JSON.stringify(clean));
}

console.log('\nTHE DOCUMENTS PANEL IS REVEALED FROM EVERY PATH');
{
  const src = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');
  t('  a single reveal helper exists', /_revealDocuments\(\) \{/.test(src),
    'the reveal is still inlined per path');
  t('  it takes the class off before drawing anything',
    /_revealDocuments\(\) \{\s*\n\s*try \{\s*\n\s*document\.getElementById\('documentsCard'\)\?\.classList\.remove\('hidden'\);/.test(src),
    'a render error can still leave the card hidden');
  t('  and each renderer is isolated',
    /try \{ this\.updateDocumentDisplay\(\); \} catch/.test(src)
      && /try \{ this\.updatePreviewContent\(\); \} catch/.test(src),
    'one renderer throwing takes the other down');
  const calls = (src.match(/this\._revealDocuments\(\)/g) || []).length;
  t('  called from at least three places', calls >= 3, calls + ' call sites');
  t('  including the automation path, before the step-3 UI',
    /this\._revealDocuments\(\);\s*\n\s*\n\s*\/\/ Step 2 complete, Step 3 working/.test(src),
    'the automation path still returns before the reveal');
  t('  and on the empty-CV failure, so the panel is not left blank',
    /this\._revealDocuments\(\);\s*\n\s*throw new Error\('The tailoring finished but produced no CV text/.test(src),
    'a failed run leaves a hidden card and no explanation');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
