// THE POSTING AS THE PLATFORM'S OWN API RETURNS IT.
//
// A selector describes where the text sits in today's markup, and markup
// gets redesigned. That is not hypothetical here: Greenhouse's #content
// led our description list and matches nothing on the current
// job-boards.greenhouse.io, so every Greenhouse posting was being read
// by a fallback selector -- one of which is the whole page including the
// application form.
//
// Two endpoints were verified live on 2026-08-20, are unauthenticated,
// and return the posting as data. Only those two are here. Lever has one
// too but Lever is deliberately absent from the platform map, and
// Recruitee's single-offer shape was never confirmed -- inventing it
// would put a guess in a file whose entries are supposed to be true.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
(() => {
  const file = path.join(DIR, 'ats-platforms.js');
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
})();
const AP = global.ATSPlatforms;

console.log('THE URL IS DERIVED FROM THE PAGE, NOT GUESSED');
for (const [key, page, want] of [
  ['greenhouse', 'https://job-boards.greenhouse.io/anthropic/jobs/4020567008',
    'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/4020567008?content=true'],
  ['greenhouse', 'https://boards.greenhouse.io/stripe/jobs/1234567',
    'https://boards-api.greenhouse.io/v1/boards/stripe/jobs/1234567?content=true'],
  // The language segment is optional, and the two shapes must derive the
  // same endpoint or half of Workday silently misses.
  ['workday', 'https://nvidia.wd5.myworkdayjobs.com/en-US/Careers/job/Ireland-Dublin/Engineer_JR1',
    'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/Careers/job/Ireland-Dublin/Engineer_JR1'],
  ['workday', 'https://nvidia.wd5.myworkdayjobs.com/Careers/job/Ireland-Dublin/Engineer_JR1',
    'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/Careers/job/Ireland-Dublin/Engineer_JR1'],
]) {
  const req = AP.apiRequestFor(key, page);
  t('  ' + key + ': ' + page.slice(8, 48), !!req && req.url === want,
    req ? req.url : '(no request built)');
}

console.log('\nAND NOT BUILT AT ALL WHEN THE PAGE IS NOT A POSTING');
for (const [key, page] of [
  ['greenhouse', 'https://job-boards.greenhouse.io/anthropic'],
  ['workday', 'https://nvidia.wd5.myworkdayjobs.com/en-US/Careers/search'],
  ['workday', 'https://nvidia.wd5.myworkdayjobs.com/'],
  ['icims', 'https://careers-x.icims.com/jobs/1234/analyst/job'],
  ['teamtailor', 'https://x.teamtailor.com/jobs/1234-engineer'],
]) {
  t('  ' + key + ' ' + page.slice(8, 52), AP.apiRequestFor(key, page) === null,
    JSON.stringify(AP.apiRequestFor(key, page)));
}
t('  a malformed URL does not throw', AP.apiRequestFor('greenhouse', 'not a url') === null);
t('  an unknown platform has no API', AP.apiRequestFor('bamboohr', 'https://x.bamboohr.com/jobs/1') === null);

console.log('\nTHE RESPONSE IS MAPPED INTO THE SHAPE THE EXTRACTOR USES');
{
  const map = AP.apiRequestFor('greenhouse', 'https://job-boards.greenhouse.io/a/jobs/1234').map;
  const got = AP.fromApiResponse({
    title: 'Product Support Specialist',
    content: '<p>We are hiring a support specialist to look after our customers.</p>'
      + '<ul><li>Windows and macOS support</li><li>Zendesk and escalation management</li></ul>',
    location: { name: 'Dublin, Ireland' },
    company_name: 'Acme',
    requisition_id: 'R-1',
  }, map);
  t('  title', got.title === 'Product Support Specialist', got.title);
  t('  company', got.company === 'Acme', got.company);
  t('  location, unwrapped from its object', got.location === 'Dublin, Ireland', got.location);
  t('  requisition id', got.jobId === 'R-1', got.jobId);
  t('  the HTML description becomes readable text',
    /Windows and macOS support/.test(got.description) && !/<li>/.test(got.description),
    JSON.stringify(got.description));
  t('  ...with the list items still separated',
    /customers\.\s+Windows/.test(got.description), JSON.stringify(got.description));
}
{
  const map = AP.apiRequestFor('workday', 'https://n.wd5.myworkdayjobs.com/en-US/C/job/a/b_JR1').map;
  const got = AP.fromApiResponse({
    jobPostingInfo: {
      title: 'Engineer',
      jobDescription: '<p>' + 'Build and run the platform. '.repeat(4) + '</p>',
      location: 'Dublin', jobReqId: 'JR1', includeResumeParsing: true,
    },
    hiringOrganization: { name: 'NVIDIA' },
  }, map);
  t('  workday: nested paths are read', got.title === 'Engineer' && got.company === 'NVIDIA',
    JSON.stringify([got.title, got.company]));
  // The flag that says whether this tenant will parse the CV at all --
  // worth knowing before the user makes an account, since making the
  // account is the cost.
  t('  the per-tenant resume-parsing flag survives', got.resumeParsingEnabled === true,
    String(got.resumeParsingEnabled));
}

console.log('\nA RESPONSE THAT SAYS NOTHING IS NOT PREFERRED OVER THE PAGE');
{
  const map = AP.apiRequestFor('greenhouse', 'https://job-boards.greenhouse.io/a/jobs/1234').map;
  t('  an empty body', AP.fromApiResponse({}, map).found === false);
  t('  a null body', AP.fromApiResponse(null, map).found === false);
  t('  a one-line description', AP.fromApiResponse({ content: '<p>Apply here.</p>' }, map).found === false,
    'a stub would replace a full page description');
  t('  ...and the flag defaults to unknown, not false',
    AP.fromApiResponse({ content: '<p>' + 'x '.repeat(60) + '</p>' }, map).resumeParsingEnabled === null,
    'absent is not the same as disabled');
}

console.log('\nTHE FETCH HOP EXISTS, AND IS NOT AN OPEN PROXY');
// The service worker holds <all_urls>. A handler that fetches whatever
// it is handed would let any page reachable by a content script use
// those permissions.
{
  const bg = fs.readFileSync(path.join(DIR, 'background.js'), 'utf8');
  t('  the handler exists', /message\.action === 'JD_API_FETCH'/.test(bg),
    'content.js asks for a fetch nobody answers');
  t('  it allow-lists the two endpoints',
    /boards-api\\\.greenhouse\\\.io/.test(bg) && /myworkdayjobs\\\.com\\\/wday\\\/cxs/.test(bg),
    'no allow-list: any URL a content script names would be fetched');
  t('  it refuses anything else', /url not allowed/.test(bg), 'no rejection path');
  t('  it times out', /AbortController/.test(bg) && /6000/.test(bg), 'a hung fetch would hang the extractor');
  t('  it sends no cookies', /credentials: 'omit'/.test(bg), 'an authenticated fetch is a different thing');
  t('  and caps the response', /response too large/.test(bg), 'unbounded body into the extractor');

  const content = fs.readFileSync(path.join(DIR, 'content.js'), 'utf8');
  t('  the extractor asks for it', /action: 'JD_API_FETCH'/.test(content), 'the handler is unreachable');
  t('  ...before falling back to selectors',
    content.indexOf('const viaApi = await jdFromPlatformApi()') !== -1, 'the API step is never run');
  t('  ...and only prefers it when it says more',
    /viaApi\.description\.length > \(info\.description \|\| ''\)\.length/.test(content),
    'a thin API response would overwrite a full page read');
  t('  the extractor has its own timeout too',
    /setTimeout\(\(\) => done\(null\), 7000\)/.test(content),
    'a service worker that never answers would hang the page');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
