// "Compatible" has to mean the same thing on every ATS: the job is read,
// the description is complete, the requisition ID is found, and a published
// address becomes a recipient. Platform knowledge lives in one module so
// detection, contact harvesting and ID parsing cannot disagree.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP ats-platform-parity: jsdom not installed'); process.exit(0); }
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const fs=require('fs'),path=require('path');
const DIR=path.join(__dirname,'..');
const loadCjs=(f)=>{const Module=require('module');
  const file=path.join(DIR,f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
const dom=new JSDOM('<body></body>',{url:'https://example.test/'});
global.window=dom.window; global.document=dom.window.document;
global.chrome={runtime:{id:'x'},storage:{local:{get:(k,cb)=>cb({})}}};
const AP=loadCjs('ats-platforms.js');
global.ATSPlatforms=AP; global.window.ATSPlatforms=AP;
const S=loadCjs('jd-contact-sources.js');
const E=loadCjs('jd-contact-extractor.js');

// The four the user excluded. Everything else must be complete.
const EXCLUDED=['indeed','glassdoor','wellfound','otta'];
const ids=AP.list().map(p=>p.id);
t('no excluded platform is claimed as supported',
  !ids.some(id=>EXCLUDED.includes(id)), ids.filter(id=>EXCLUDED.includes(id)).join(','));
t('every remaining ATS is described', ids.length>=28, ids.length+' platforms');

// ---- every entry must be complete ------------------------------------
for (const {id,label} of AP.list()) {
  const p=AP.PLATFORMS[id];
  for (const field of ['title','company','location','description']) {
    t(label+': has '+field+' selectors',
      Array.isArray(p[field]) && p[field].length>0, JSON.stringify(p[field]));
  }
  t(label+': identifies itself from a hostname',
    Array.isArray(p.host) && p.host.length>0 && p.host.every(h=>typeof h==='string'&&h.length>3));
  t(label+': knows where the apply control is', Array.isArray(p.apply)&&p.apply.length>0);
  // Selectors must be usable, not just present: an invalid one throws and
  // takes the whole read down.
  for (const field of ['title','company','location','description']) {
    let ok=true;
    for (const sel of AP.selectorsFor(id, field)) {
      try { document.querySelectorAll(sel); } catch (e) { ok=false; break; }
    }
    t(label+': every '+field+' selector is valid CSS', ok, 'an invalid selector throws at read time');
  }
  // Generic fallbacks are always appended, so an unknown page still reads.
  t(label+': falls back to generic selectors too',
    AP.selectorsFor(id,'description').length > (p.description||[]).length);
}

// ---- hostname detection ----------------------------------------------
for (const [host, expect] of [
  ['job-boards.greenhouse.io','greenhouse'], ['boards.greenhouse.io','greenhouse'],
  ['jobs.lever.co','lever'], ['acme.wd1.myworkdayjobs.com','workday'],
  ['careers.smartrecruiters.com','smartrecruiters'], ['apply.workable.com','workable'],
  ['jobs.ashbyhq.com','ashby'], ['careers-acme.icims.com','icims'],
  ['acme.taleo.net','taleo'], ['acme.teamtailor.com','teamtailor'],
  ['acme.bamboohr.com','bamboohr'], ['acme.recruitee.com','recruitee'],
  ['acme.applytojob.com','jazzhr'], ['jobs.jobvite.com','jobvite'],
  ['career5.successfactors.eu','successfactors'], ['acme.jobs.personio.de','personio'],
  ['acme.eightfold.ai','eightfold'], ['acme.avature.net','avature'],
  ['acme.csod.com','cornerstone'], ['acme.brassring.com','brassring'],
  ['acme.ultipro.com','ultipro'], ['acme.breezy.hr','breezy'],
  ['ats.rippling.com','rippling'], ['acme.pinpointhq.com','pinpoint'],
  ['acme.zohorecruit.com','zohorecruit'], ['acme.occupop.com','occupop'],
  ['acme.bullhornstaffing.com','bullhorn'], ['acme.oraclecloud.com','oracle'],
  ['www.linkedin.com','linkedin'],
]) t('detects '+expect+' from '+host, AP.detect(host,'https://'+host+'/x')===expect, AP.detect(host,''));

t('an unknown host is not mis-attributed', AP.detect('careers.some-startup.com','')==='' );

// ---- requisition IDs --------------------------------------------------
for (const [url, expect] of [
  ['https://job-boards.greenhouse.io/array/jobs/5477345004','5477345004'],
  ['https://jobs.lever.co/acme/1a2b3c4d-5e6f-7890-abcd-ef1234567890','1a2b3c4d-5e6f-7890-abcd-ef1234567890'],
  ['https://acme.wd1.myworkdayjobs.com/en-US/careers/job/Dublin/PM_R-12345','R-12345'],
  ['https://jobs.ashbyhq.com/acme/1a2b3c4d-5e6f-7890-abcd-ef1234567890','1a2b3c4d-5e6f-7890-abcd-ef1234567890'],
  ['https://careers-acme.icims.com/jobs/12345/pm/job','12345'],
  ['https://acme.teamtailor.com/jobs/123456-project-manager','123456'],
  ['https://career5.successfactors.eu/careers?jobId=98765','98765'],
]) t('reads the requisition ID from a '+new URL(url).hostname.split('.').slice(-2).join('.')+' URL',
     AP.jobIdFromUrl(url)===expect, AP.jobIdFromUrl(url));
t('a URL with no ID yields none', AP.jobIdFromUrl('https://careers.acme.com/roles')==='' );

// ---- the modules agree with each other -------------------------------
const srcFile=fs.readFileSync(path.join(DIR,'jd-contact-sources.js'),'utf8');
const extFile=fs.readFileSync(path.join(DIR,'jd-contact-extractor.js'),'utf8');
const contentFile=fs.readFileSync(path.join(DIR,'content.js'),'utf8');
t('the job detector reads platforms from the shared module',
  /ATSPlatforms/.test(contentFile) && /AP\.selectorsFor/.test(contentFile), 'content.js has its own list again');
t('contact harvesting shares the same description containers',
  /allDescriptionSelectors/.test(srcFile), 'the two would drift apart');
t('requisition IDs come from the shared module',
  /AP\.jobIdFromUrl/.test(extFile), 'the extractor would know fewer platforms');
t('the four-platform selector map is gone',
  !/const platformSelectors = \{/.test(contentFile), 'the old partial map is still there');

// The description containers used for harvesting must cover every
// platform, or an address in the body goes unseen on that ATS.
const all=AP.allDescriptionSelectors();
for (const {id,label} of AP.list()) {
  t(label+': its description container is harvestable',
    (AP.PLATFORMS[id].description||[]).every(sel=>all.includes(sel)),
    'contact harvesting would miss this platform');
}

// ---- alternate domains of platforms already "supported" --------------
// The dangerous gap: the platform reads as done while half its tenants are
// on a domain nothing is registered for.
const manifest=JSON.parse(fs.readFileSync(path.join(DIR,'manifest.json'),'utf8'));
const registered=JSON.stringify(manifest.content_scripts)+JSON.stringify(manifest.host_permissions);
for (const [host, platform] of [
  ['acme.myworkdaysite.com','workday'],      // Workday's OTHER tenant domain
  ['careers.icims.eu','icims'],              // EU tenants
  ['career5.sapsf.eu','successfactors'],
  ['acme.rippling-ats.com','rippling'],
  ['acme.theresumator.com','jazzhr'],        // JazzHR's legacy domain
  ['app.dover.io','dover'],
]) {
  t(host+' resolves to '+platform, AP.detect(host,'https://'+host+'/x')===platform,
    AP.detect(host,'https://'+host+'/x'));
  const dom=host.split('.').slice(-2).join('.');
  t(host+' is registered in the manifest', registered.includes(dom), dom+' not permitted');
}

// ---- platforms that had no entry at all -------------------------------
for (const [host, platform, label] of [
  ['acme.dayforcehcm.com','dayforce','Ceridian Dayforce'],
  ['acme.freshteam.com','freshteam','Freshteam'],
  ['jobs.gusto.com','gusto','Gusto'],
  ['recruiting.paylocity.com','paylocity','Paylocity'],
  ['www.comeet.co','comeet','Comeet'],
  ['jobs.polymer.co','polymer','Polymer'],
]) {
  t(label+' is detected', AP.detect(host,'https://'+host+'/x')===platform);
  t(label+' has complete selectors',
    ['title','company','location','description'].every(f=>(AP.PLATFORMS[platform][f]||[]).length>0));
  const dom=host.split('.').slice(-2).join('.');
  t(label+' is registered in the manifest', registered.includes(dom), dom+' not permitted');
}

// The four excluded stay excluded even after this expansion.
for (const excluded of ['indeed','glassdoor','wellfound','otta']) {
  t(excluded+' is still not claimed as a platform',
    !AP.list().some(p=>p.id===excluded), 'was added by mistake');
}

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
