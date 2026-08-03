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
  <div class="hirer-card__hirer-information"><a href="/in/leekelly">Lee Kelly</a> • 2nd</div>`;

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
console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
