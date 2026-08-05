// jsdom is a dev-only dependency. Skip rather than fail when it is absent,
// so a fresh clone does not report a red test for a missing tool.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.log('SKIP jd-contact-sources: jsdom not installed (npm i -D jsdom to run)');
  process.exit(0);
}
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const dom=new JSDOM('<body></body>',{url:'https://jobs.lever.co/nortal/abc123'});
global.window=dom.window; global.document=dom.window.document;
const loadCjs=(f)=>{const fs=require('fs'),path=require('path'),Module=require('module');
  const file=path.join(__dirname,'..',f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
const S=loadCjs('jd-contact-sources.js');

// A realistic ATS page: mailto behind link text, JSON-LD for Google Jobs,
// and a LinkedIn-style hiring-team card.
document.body.innerHTML = `
  <script type="application/ld+json">${JSON.stringify({
    "@context":"https://schema.org","@type":"JobPosting","title":"Principal Data Scientist",
    "identifier":{"@type":"PropertyValue","value":"R-2291"},
    "hiringOrganization":{"@type":"Organization","name":"Nortal"},
    "applicationContact":{"@type":"ContactPoint","name":"Aoife Byrne","email":"aoife.byrne@nortal.com"}
  })}</script>
  <p>Questions about this role? <a href="mailto:talent@nortal.com?subject=Role">Get in touch</a></p>
  <p>For accessibility requests contact <a href="mailto:legal@nortal.com">legal</a></p>
  <p>Do not reply to <a href="mailto:noreply@lever.co">this</a></p>
  <div class="hirer-card__hirer-information">
    <a href="/in/leekelly">Lee Kelly</a> • 2nd
    <div class="hirer-card__hirer-job-title">Talent Acquisition Partner at Nortal</div>
  </div>`;

const h=S.harvest(document);
console.log('harvested:', JSON.stringify(h,null,1).slice(0,400));
t('mailto address found', h.emails.some(e=>e.email==='talent@nortal.com'), JSON.stringify(h.emails));
t('JSON-LD application contact found', h.emails.some(e=>e.email==='aoife.byrne@nortal.com'));
t('company from JSON-LD', h.org==='Nortal', h.org);
t('job id from JSON-LD', h.jobId==='R-2291', h.jobId);
t('LinkedIn poster name captured', h.names.some(n=>n.name==='Lee Kelly'), JSON.stringify(h.names));
t('JSON-LD contact name captured', h.names.some(n=>n.name==='Aoife Byrne'), JSON.stringify(h.names));

// Now the scorer: harvested sources must be ranked and filtered correctly.
global.chrome={runtime:{id:'x'},storage:{local:{get:(k,cb)=>cb({})}}};
const E=loadCjs('jd-contact-extractor.js');
const r=E.extract({ jdText:'Apply via the portal. Enquiries: hr@nortal.com', url:'https://jobs.lever.co/nortal/abc123',
                    ownEmail:'maxokafordev@gmail.com', pageSources:h });
console.log('\nchosen:', r.email, '| via', r.emailSource, '| name:', r.contactName, '| company:', r.company, '| jobId:', r.jobId);
t('a named human beats a shared inbox', r.email==='aoife.byrne@nortal.com', r.email+' ('+r.emailSource+')');
t('source is recorded', /json-ld|mailto/.test(r.emailSource), r.emailSource);
t('noreply@ still rejected', !r.allEmails.some(e=>/noreply/i.test(e)), JSON.stringify(r.allEmails));
t('legal@ still rejected', !r.allEmails.some(e=>/^legal@/i.test(e)), JSON.stringify(r.allEmails));
t('prose address still considered', r.allEmails.includes('hr@nortal.com'), JSON.stringify(r.allEmails));
// The bonus must separate equals without overturning the human/inbox order.
const rank=E.extract({jdText:'Contact talent@nortal.com',url:'x',ownEmail:'',
  pageSources:{emails:[{email:'talent@nortal.com',source:'mailto'}],names:[],org:'',jobId:''}});
t('mailto shared inbox beats the same address in prose only', rank.email==='talent@nortal.com');
t('company filled from JSON-LD', r.company==='Nortal', r.company);
t('job id filled from JSON-LD', r.jobId==='R-2291', r.jobId);
t('contact name filled', /Aoife Byrne|Lee Kelly/.test(r.contactName), r.contactName);

// No page sources at all -> behaves exactly as before
const r2=E.extract({ jdText:'Enquiries: hr@nortal.com', url:'x', ownEmail:'', pageSources:{emails:[],names:[],org:'',jobId:''} });
t('degrades to text-only cleanly', r2.email==='hr@nortal.com', r2.email);
t('never invents an address', E.extract({jdText:'No contact here.',url:'x',ownEmail:'',pageSources:{emails:[],names:[],org:'',jobId:''}}).email==='');

// ---- the poster's profile handle, for opt-in lookup -------------------
// The handle is not an address and is never turned into one here; it is
// what lets a user's own provider resolve THAT person instead of guessing
// at whoever the company search ranks first.
const poster=h.names.find(n=>n.name==='Lee Kelly');
t('the poster\'s profile handle is captured', poster&&poster.profile==='leekelly', JSON.stringify(poster));
t('the poster\'s title is captured', poster&&/Talent Acquisition/.test(poster.title||''), JSON.stringify(poster));
t('the handle reaches the extractor result',
  (r.sourceNames||[]).some(n=>n.profile==='leekelly'), JSON.stringify(r.sourceNames));
t('capturing a handle produces no address',
  !r.allEmails.some(e=>/leekelly/i.test(e)), JSON.stringify(r.allEmails));

// LinkedIn's opaque URN form is not a public handle and must not be stored
// as one: it would be looked up as a literal string and never resolve.
document.body.innerHTML =
  '<div class="hirer-card__hirer-information"><a href="/in/ACoAAB1234xyzQ">Dana Quinn</a></div>';
const urn=S.fromLinkedInPoster(document);
t('an opaque LinkedIn URN is not stored as a handle',
  urn.length===1&&!urn[0].profile, JSON.stringify(urn));
t('the name is still kept when the handle is unusable', urn[0]&&urn[0].name==='Dana Quinn', JSON.stringify(urn));

// ---- profile links in the posting body --------------------------------
// The hiring-team card is LinkedIn-only. Employers link a named recruiter
// from ATS postings too, and that handle is what a lookup needs.
document.body.innerHTML = `
  <nav class="global-nav"><a href="https://www.linkedin.com/in/sharewidget">Share</a></nav>
  <div class="job-body">
    <p>Questions? Reach out to
       <a href="https://www.linkedin.com/in/aoifebyrne">Aoife Byrne</a>.</p>
    <p>Our team: <a href="https://www.linkedin.com/in/leekelly?trk=x">LinkedIn</a></p>
  </div>
  <footer><a href="/in/footerperson">Follow us</a></footer>`;
const pl=S.fromProfileLinks(document);
const slugs=pl.map(x=>x.profile);
t('a recruiter linked from the posting body is captured', slugs.includes('aoifebyrne'), JSON.stringify(pl));
t('the linked name is kept when it reads like a name',
  pl.find(x=>x.profile==='aoifebyrne')?.name==='Aoife Byrne', JSON.stringify(pl));
t('a handle is kept even when the link text is not a name',
  slugs.includes('leekelly'), JSON.stringify(pl));
t('query strings are stripped from the handle', !slugs.some(x=>/[?&]/.test(x)), JSON.stringify(slugs));
t('navigation links are ignored', !slugs.includes('sharewidget'), JSON.stringify(slugs));
t('footer links are ignored', !slugs.includes('footerperson'), JSON.stringify(slugs));
t('no address is produced from a profile link', !JSON.stringify(pl).includes('@'), JSON.stringify(pl));

// The harvest keeps a nameless profile link, which the old name-only
// de-duplication discarded outright.
const h2=S.harvest(document);
t('harvest keeps profile links', h2.names.some(n=>n.profile==='aoifebyrne'), JSON.stringify(h2.names));
t('harvest keeps a handle with no name', h2.names.some(n=>n.profile==='leekelly'), JSON.stringify(h2.names));

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
