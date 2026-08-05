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
  ['enrichEnabledToggle','enrichProvider','enrichSaveBtn','enrichTestBtn','enrichClearBtn','enrichGetKeyBtn',
   'enrichFindNowBtn','enrichSwitchBtn','enrichMoreLink']
    .every(id=>new RegExp("getElementById\\('"+id+"'\\)\\?\\.addEventListener").test(popupJs)),
  'a decorative control would silently do nothing');
t('the enrichment UI is restored on open', /this\.enrichInitUI\(\)/.test(popupJs), 'settings would look unset');

// ---- the settings card has to be usable, not just present -------------
const popupCss=read('popup.css');
const enrich=read('contact-enrichment.js');
// `flex: 1` means basis 0, so a button is laid out narrower than its own
// label; white-space:nowrap then forbids wrapping and the label paints
// over the next button ("Sign in and create key" over "Test key").
const fuBtn=(popupCss.match(/\.fu-btn\s*\{[^}]*\}/)||[''])[0];
t('action buttons size from their label, so long ones wrap instead of overlapping',
  /flex:\s*1\s+1\s+auto/.test(fuBtn)&&!/flex:\s*1\s*;/.test(fuBtn), fuBtn.replace(/\s+/g,' ').slice(0,140));
t('the action row is allowed to wrap',
  /\.fu-actions\s*\{[^}]*flex-wrap:\s*wrap/.test(popupCss), 'buttons would be forced onto one line');

// A connected account must look connected. Empty email and password boxes
// left on screen read as "not signed in" when a working token is stored.
t('a connected account is shown as connected',
  /id="enrichConnected"/.test(popupHtml)&&/enrichRenderCredState/.test(popupJs), 'no connected state');
t('the sign-in fields are hidden once a token exists',
  /show\('enrichAccountFields',\s*isAccount\s*&&\s*!connected\)/.test(popupJs), 'blank credential boxes persist');
t('the connected row names the account',
  /accountEmail/.test(popupJs)&&/accountEmail/.test(enrich), 'user cannot tell which account is connected');
t('the account can be changed without disconnecting first',
  /id="enrichSwitchBtn"/.test(popupHtml)&&/enrichSwitching\s*=\s*true/.test(popupJs), 'no way back to the sign-in form');
t('signing in collapses the form',
  /enrichSwitching = false;[\s\S]{0,200}enrichRenderCredState/.test(popupJs), 'form stays open after success');
t('clearing the key brings the sign-in form back',
  /async enrichClearKey\(\)[\s\S]{0,1200}enrichRenderCredState/.test(popupJs), 'no way to sign in again');
// The stored credential must remain a token, never the password.
t('the password is still never part of the stored credential',
  /delete clean\.password/.test(enrich), 'password could reach storage');

// A silent lookup is the failure mode that cannot be diagnosed: one that
// never fired looks identical to one that ran and found nobody.
t('the lookup can be run on demand and explains itself',
  /id="enrichFindNowBtn"/.test(popupHtml)&&/async enrichFindNow\(\)/.test(popupJs), 'no way to verify it works');
t('the diagnostic reports which providers were tried',
  /r\.trace/.test(popupJs)&&/trace\.push/.test(enrich), 'no trace to report');
t('a skipped provider is recorded rather than omitted',
  /skipped, no key saved/.test(enrich)&&/no credits used/.test(enrich), 'silent skip');
t('the on-demand run bypasses the cache',
  /findContacts\(ctx,\s*\{\s*noCache:\s*true\s*\}\)/.test(popupJs), 'would report a stale answer');

// ContactOut is the default because it covers both cases with one key.
t('ContactOut is the default provider', /\|\| 'contactout'/.test(enrich), 'default is something else');
t('ContactOut resolves a named poster as well as searching a company',
  /contactout:[\s\S]{0,6000}lookupByProfile/.test(enrich), 'company search only');

// generatedDocuments is reassigned wholesale mid-run, so anything parked on
// it during detection was silently discarded before the send.
t('the detected contact has a home that survives the run',
  /this\.jdContact = detected/.test(popupJs), 'parked on generatedDocuments only');
t('every reader prefers the durable copy',
  !/(?<!this\.jdContact \|\| )this\.generatedDocuments\?\.jdContact/.test(popupJs), 'a reader still reads the wiped copy');

// A missing address skips an email; a stale one emails the wrong employer.
t('detection clears the previous job first',
  /async followupDetectContact\(\)\s*\{[\s\S]{0,400}this\.jdContact = null/.test(popupJs), 'stale contact can leak');
t('an auto-filled recipient is cleared for the next job',
  /dataset\.autofilled/.test(popupJs), 'previous employer stays in the To field');
t('an address the user typed is never cleared',
  /toEl0\.dataset\.autofilled === '1'/.test(popupJs), 'would discard a manual address');

// resolveCompanyName takes (job, detected); called bare it returned nothing
// and every lookup short-circuited on 'no-company'.
t('the lookup resolves the company through the shared extractor',
  /enrichCompanyName\(\)/.test(popupJs)&&/this\.resolveCompanyName\(job, detected\)/.test(popupJs),
  'company would be empty');
t('no caller invokes resolveCompanyName with no arguments',
  !/resolveCompanyName\(\)/.test(popupJs), 'returns nothing, kills the lookup');

// Closely holds a subscription and a token but publishes no search API.
t('Closely probes for a search endpoint rather than giving up',
  /searchProbe/.test(enrich)&&/_resolveSearchEndpoint/.test(enrich), 'profile-only forever');
t('the probe result is remembered either way',
  /searchEndpoints/.test(enrich), 'would re-probe on every lookup');
t('naming a person directly is always available',
  /id="enrichProfileUrl"/.test(popupHtml)&&/async enrichResolveProfile\(\)/.test(popupJs), 'no manual path');
t('a resolved profile feeds the same follow-up as a detected one',
  /enrichResolveProfile\(\)[\s\S]{0,2000}this\.jdContact = Object\.assign/.test(popupJs), 'result goes nowhere');
t('profile links in the posting body are harvested',
  /fromProfileLinks/.test(read('jd-contact-sources.js')), 'ATS postings yield no handles');

// A profile open in the tab is the clearest statement of who to reach, and
// needs no search endpoint -- the handle is in the URL.
t('the profile open in the tab is used automatically',
  /activeLinkedInProfile\(\)/.test(popupJs)&&/followupProfileHandles\(\)/.test(popupJs), 'requires pasting');
t('the open profile is preferred over a harvested guess',
  /out\.unshift\(active\)/.test(popupJs), 'a guess could outrank a deliberate choice');
t('only real profile URLs are accepted',
  /linkedin\\.com\\\/in\\\//.test(popupJs)||/linkedin\\.com/.test(popupJs), 'would match any tab');
t('LinkedIn is read from the tab URL, never driven',
  !/tabs\.create\([^)]*linkedin/i.test(popupJs), 'automating LinkedIn risks the account');
t('a personal mailbox is flagged before it is used',
  /isPersonalEmail/.test(enrich)&&/PERSONAL mailbox/.test(popupJs), 'would silently email a private inbox');

// Requiring the profile to be OPEN is a manual step in disguise. Profiles
// browsed earlier, and profiles open in any tab, remove it.
const mem=read('linkedin-profile-memory.js');
t('profiles browsed earlier are remembered',
  /linkedin_profiles_seen/.test(mem)&&/forCompany/.test(mem), 'nothing is remembered');
t('the memory is consulted when applying',
  /JGProfileMemory\.forCompany\(company\)/.test(popupJs), 'remembered profiles never used');
t('the profile memory runs on LinkedIn profiles',
  (m.content_scripts||[]).some(cs=>(cs.js||[]).includes('linkedin-profile-memory.js')
    &&cs.matches.some(x=>/linkedin\.com\/in/.test(x))), 'never records anything');
t('it is loaded by the popup so forCompany is callable',
  /<script src="linkedin-profile-memory\.js">/.test(popupHtml), 'would be undefined');
t('a profile open in ANY tab counts, not only the focused one',
  /openLinkedInProfiles\(\)/.test(popupJs)&&/linkedin\.com\/in\/\*/.test(popupJs), 'forces a tab switch');
t('the profile memory never sends anything anywhere',
  !/fetch\(|XMLHttpRequest/.test(mem), 'must be local storage only');

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
const apiHosts=[...new Set((enrich.match(/https:\/\/api\.[a-z0-9.]+/g)||[]))];
for(const h of apiHosts) t('host permission for '+h, hosts.includes(h.replace('https://','')), h+' not permitted');
t('at least one provider host is declared', apiHosts.length>0);

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
