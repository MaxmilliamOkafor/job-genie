// The same published address has to be found on EVERY ATS, not just the
// one it was first tested on. Each case uses that platform's real
// description container, with the address typed into the body -- no
// mailto, no JSON-LD -- and an EMPTY job description, so only the page
// harvest can succeed.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP ats-embedded-email: jsdom not installed'); process.exit(0); }
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const loadCjs=(f)=>{const fs=require('fs'),path=require('path'),Module=require('module');
  const file=path.join(__dirname,'..',f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
const dom=new JSDOM('<body></body>',{url:'https://example.test/job/1'});
global.window=dom.window; global.document=dom.window.document;
global.chrome={runtime:{id:'x'},storage:{local:{get:(k,cb)=>cb({})}}};
const S=loadCjs('jd-contact-sources.js');
const E=loadCjs('jd-contact-extractor.js');

const BODY = '<p>About the role.</p><p>Questions? Email careers@acmehq.com for details.</p>';

// Real container markup per platform, wrapped in the page furniture each
// one actually renders around it.
const PLATFORMS = [
  ['Greenhouse',     '<div id="content"><div class="job__description">'+BODY+'</div></div>'],
  ['Lever',          '<div class="posting-page"><div data-qa="job-description">'+BODY+'</div></div>'],
  ['Workday',        '<div data-automation-id="jobPostingDescription">'+BODY+'</div>'],
  ['Ashby',          '<div class="ashby-job-posting-content">'+BODY+'</div>'],
  ['SmartRecruiters','<div id="st-jobDescription">'+BODY+'</div>'],
  ['iCIMS',          '<div class="iCIMS_JobContent">'+BODY+'</div>'],
  ['Taleo',          '<div id="requisitionDescriptionInterface">'+BODY+'</div>'],
  ['Workable',       '<div data-ui="job-description">'+BODY+'</div>'],
  ['Teamtailor',     '<div data-controller="careersite--job"><div class="block-body">'+BODY+'</div></div>'],
  ['Jobvite',        '<div class="jv-job-detail-description">'+BODY+'</div>'],
  ['BambooHR',       '<div id="jobDescriptionText">'+BODY+'</div>'],
  ['Indeed',         '<div id="jobDescriptionText">'+BODY+'</div>'],
  ['SuccessFactors', '<div class="jobDescription">'+BODY+'</div>'],
  ['Personio',       '<div id="job-description">'+BODY+'</div>'],
  ['Recruitee',      '<div class="job-description">'+BODY+'</div>'],
  ['JazzHR',         '<div id="job-description">'+BODY+'</div>'],
  ['Breezy',         '<div class="position">'+BODY+'</div>'],
  ['Eightfold',      '<div class="jobDescription-body">'+BODY+'</div>'],
  ['Avature',        '<div class="job-details">'+BODY+'</div>'],
  ['Wellfound',      '<div class="styles_JobDescription__x1">'+BODY+'</div>'],
  ['Otta',           '<div data-testid="job-description-section">'+BODY+'</div>'],
  ['LinkedIn',       '<div class="jobs-description__content">'+BODY+'</div>'],
  ['Rippling',       '<div class="job-description">'+BODY+'</div>'],
  ['Pinpoint',       '<div class="job-description">'+BODY+'</div>'],
  ['Dover',          '<div class="job-description">'+BODY+'</div>'],
  ['Occupop',        '<div class="job-description">'+BODY+'</div>'],
  ['schema.org only','<div itemprop="description">'+BODY+'</div>'],
  ['unknown ATS',    '<main>'+BODY+'</main>'],
  ['no container',   BODY],
];

const CHROME =
  '<nav class="global-nav"><a href="/">Home</a> support@ats-vendor.test</nav>'
  +'<header role="banner">careers@ats-vendor.test</header>';
const FOOTER =
  '<footer role="contentinfo">Powered by the ATS. legal@ats-vendor.test</footer>'
  +'<div class="similar-jobs"><p>Other roles: recruiting@someothercompany.test</p></div>'
  +'<div class="cookie-banner">privacy@ats-vendor.test</div>';

for (const [name, html] of PLATFORMS) {
  document.body.innerHTML = CHROME + html + FOOTER;
  const h = S.harvest(document);
  t(name + ': the published address is found',
    h.emails.some(e => e.email === 'careers@acmehq.com'),
    JSON.stringify(h.emails.map(e => e.email)));

  // With NO job description text at all, the page harvest is the only
  // thing that can produce a recipient.
  const r = E.extract({ jdText:'', url:'https://example.test/job/1',
                        ownEmail:'maxokafordev@gmail.com', pageSources:h });
  t(name + ': it becomes the recipient with an empty description',
    r.email === 'careers@acmehq.com', r.email + '  all=' + JSON.stringify(r.allEmails));

  // A different company's address from a "similar jobs" strip must never
  // be used -- that would email a stranger about the wrong role.
  t(name + ': another company from "similar jobs" is never picked',
    !r.allEmails.some(e => /someothercompany/.test(e)), JSON.stringify(r.allEmails));
}

// ---- the description container wins over the wider page ---------------
// When the posting names a contact AND the page chrome carries one, the
// posting's must win regardless of document order.
document.body.innerHTML =
  '<div class="page"><p>General enquiries: hello@portal.test</p>'
  + '<div id="content"><p>Role questions: careers@acmehq.com</p></div></div>';
let h = S.harvest(document);
let r = E.extract({ jdText:'', url:'x', ownEmail:'', pageSources:h });
t('the address inside the description container is preferred',
  r.email === 'careers@acmehq.com', r.email + '  all=' + JSON.stringify(r.allEmails));

// ---- ATS vendor boilerplate is never a recipient ----------------------
for (const vendor of ['greenhouse.io','lever.co','workday.com','ashbyhq.com',
                      'smartrecruiters.com','linkedin.com','indeed.com']) {
  document.body.innerHTML = '<div id="content"><p>Contact support@' + vendor + '</p></div>';
  h = S.harvest(document);
  r = E.extract({ jdText:'', url:'x', ownEmail:'', pageSources:h });
  t('an address at ' + vendor + ' is never used', r.email === '', r.email);
}

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
