// Coverage is a correctness property, not documentation: a contact source
// that is not registered on a site simply never runs there, silently.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'  >> '+x));};
const path=require('path');
const DIR=path.join(__dirname,'..');
const m=JSON.parse(require('fs').readFileSync(path.join(DIR,'manifest.json'),'utf8'));

const hostsFor=(file)=>{
  const out=new Set();
  for(const cs of m.content_scripts){
    if(!(cs.js||[]).includes(file)) continue;
    for(const mt of cs.matches) out.add(mt.replace(/^https?:\/\//,'').replace('*.','').split('/')[0]);
  }
  return out;
};
const srcHosts=hostsFor('jd-contact-sources.js');
const extHosts=hostsFor('jd-contact-extractor.js');

const ATS={'greenhouse.io':'Greenhouse','lever.co':'Lever','myworkdayjobs.com':'Workday',
 'smartrecruiters.com':'SmartRecruiters','icims.com':'iCIMS','taleo.net':'Taleo',
 'workable.com':'Workable','teamtailor.com':'Teamtailor','ashbyhq.com':'Ashby',
 'bullhornstaffing.com':'Bullhorn','jobvite.com':'Jobvite','recruitee.com':'Recruitee',
 'personio.de':'Personio','breezy.hr':'BreezyHR','jazzhr.com':'JazzHR',
 'successfactors.com':'SuccessFactors','oraclecloud.com':'Oracle','eightfold.ai':'Eightfold',
 'pinpointhq.com':'Pinpoint','occupop.com':'Occupop','rippling.com':'Rippling',
 'dover.com':'Dover','wellfound.com':'Wellfound','otta.com':'Otta'};
for(const [d,n] of Object.entries(ATS)) t('contact sources run on '+n, srcHosts.has(d), d+' not registered');
// LinkedIn is the only site with a hiring-team card; the extractor there
// would be pointless without it.
t('contact sources run on LinkedIn (hiring-team card)', srcHosts.has('linkedin.com'), 'fromLinkedInPoster would never fire');
t('contact sources run on Indeed', srcHosts.has('indeed.com'));
t('sources load wherever the extractor loads', [...extHosts].every(h=>srcHosts.has(h)), 'extractor without its sources on: '+[...extHosts].filter(h=>!srcHosts.has(h)).slice(0,5));

// ---- the contact chain is actually wired, end to end ------------------
// Each of these was, at some point, a module that existed and never ran.
const fs=require('fs');
const read=(f)=>fs.readFileSync(path.join(DIR,f),'utf8');
const popupJs=read('popup.js');
const popupHtml=read('popup.html');
const war=(m.web_accessible_resources||[]).flatMap(r=>r.resources||[]);

// jd-contact-sources reads the JOB page. Run from the popup it would read
// the POPUP's document, which publishes no employer contacts -- so the
// harvest has to be injected into the tab and passed in as pageSources.
t('page sources are harvested from the job tab, not the popup',
  /followupHarvestPageSources/.test(popupJs)&&/pageSources:\s*await this\.followupHarvestPageSources\(\)/.test(popupJs),
  'extractor would harvest the popup document');
t('the harvest reads every frame (embedded ATS postings)',
  /followupHarvestPageSources[\s\S]{0,1600}allFrames:\s*true/.test(popupJs), 'top frame only');
t('jd-contact-sources is injectable at runtime',
  war.includes('jd-contact-sources.js'), 'not in web_accessible_resources');

// Enrichment is opt-in, last-resort, and must be loaded to be callable.
t('contact-enrichment is loaded by the popup',
  /<script src="contact-enrichment\.js">/.test(popupHtml), 'module would be undefined at runtime');
t('contact-enrichment is packaged', war.includes('contact-enrichment.js'), 'not in web_accessible_resources');
t('the enrichment settings card exists', /id="enrichProvider"/.test(popupHtml)&&/id="enrichApiKey"/.test(popupHtml));
t('every enrichment control has a handler',
  ['enrichEnabledToggle','enrichProvider','enrichSaveBtn','enrichTestBtn','enrichClearBtn','enrichGetKeyBtn']
    .every(id=>new RegExp("getElementById\\('"+id+"'\\)\\?\\.addEventListener").test(popupJs)),
  'a decorative control would silently do nothing');
t('the enrichment UI is restored on open', /this\.enrichInitUI\(\)/.test(popupJs), 'settings would look unset');

// The ordering rule: enrichment is consulted only after the posting, its
// structured data and the careers page have all come back empty.
t('enrichment runs only after the careers-page fallback',
  popupJs.indexOf('followupFindCareersAddress()')<popupJs.indexOf('async followupEnrich()')
  &&/followupFindCareersAddress\(\)\s*\{[\s\S]{0,2200}this\.followupEnrich\(\)/.test(popupJs),
  'enrichment must not pre-empt a published address');
t('a looked-up address never overwrites one already found',
  /followupEnrich\(\)[\s\S]{0,3000}if\s*\(toEl\s*&&\s*!toEl\.value\)/.test(popupJs), 'would clobber a published address');
t('a looked-up address is labelled as not published',
  /Looked up \(not published\)/.test(popupJs), 'user could not tell the difference');

// Every provider host the module calls must be permitted, or the fetch is
// blocked by CORS and the failure looks like "no match".
const hosts=(m.host_permissions||[]).join(' ');
const enrich=read('contact-enrichment.js');
const apiHosts=[...new Set((enrich.match(/https:\/\/api\.[a-z0-9.]+/g)||[]))];
for(const h of apiHosts) t('host permission for '+h, hosts.includes(h.replace('https://','')), h+' not permitted');
t('at least one provider host is declared', apiHosts.length>0);

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
