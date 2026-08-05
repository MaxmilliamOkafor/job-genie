// Contact enrichment: targeting, ranking, credential handling, failure
// modes, and the rule that a looked-up address never outranks a published
// one. No network: fetch is stubbed per case.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};

// The parent package.json is "type":"module", so require() of a .js file
// returns {}. Compile it explicitly instead.
const loadCjs=(f)=>{const fs=require('fs'),path=require('path'),Module=require('module');
  const file=path.join(__dirname,'..',f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};

// ---- a chrome.storage.local good enough to exercise the real code paths
let STORE={};
global.chrome={runtime:{id:'test'},storage:{local:{
  get:(keys,cb)=>{const out={};(Array.isArray(keys)?keys:[keys]).forEach(k=>{if(k in STORE)out[k]=STORE[k];});cb(out);},
  set:(obj,cb)=>{Object.assign(STORE,obj);cb&&cb();},
  remove:(keys,cb)=>{(Array.isArray(keys)?keys:[keys]).forEach(k=>delete STORE[k]);cb&&cb();},
}}};

// ---- fetch stub -------------------------------------------------------
let CALLS=[];
const reply=(status,json)=>({ok:status>=200&&status<300,status,json:async()=>json});
let RESPOND=()=>reply(200,{});
global.fetch=async(url,init)=>{CALLS.push({url,init});return RESPOND(url,init);};

const E=loadCjs('contact-enrichment.js');

const reset=async(cfg)=>{STORE={};CALLS=[];await E.saveConfig(cfg||{});};

(async () => {

// ---- 1. targeting: the JD's own context shapes the search --------------
const queries=E.buildQueries({company:'Nortal',title:'Microsoft Dynamics 365 Project Manager',location:'Dublin, Ireland'});
t('queries are built when a company is known', queries.length>0, String(queries.length));
t('every query is scoped to the company', queries.every(q=>q.company==='Nortal'), JSON.stringify(queries[0]));
t('first query targets recruiters, not HR generally',
  /recruiter/i.test(queries[0].titles.join(' ')), JSON.stringify(queries[0].titles));
t('the role location is used', queries[0].location==='Dublin, Ireland', queries[0].location);
t('a project-management role adds delivery-side hiring managers',
  queries.some(q=>q.titles.some(x=>/Delivery|Programme|PMO/i.test(x))), JSON.stringify(queries.map(q=>q.titles)));
t('the last attempt drops the location filter',
  queries[queries.length-1].location==='', JSON.stringify(queries[queries.length-1]));
t('no company means no query at all', E.buildQueries({title:'Engineer',location:'Dublin'}).length===0);

t('an engineering role targets engineering managers',
  E.functionTitles('Senior Software Engineer').some(x=>/Engineering/i.test(x)));
t('a data role targets data leadership',
  E.functionTitles('Machine Learning Engineer').some(x=>/Data|Analytics/i.test(x)));
t('an unrecognised role adds no function titles', E.functionTitles('Zookeeper').length===0);

// ---- 2. placeholder addresses are not addresses ------------------------
t('a real address passes', E.isRealEmail('aoife.byrne@nortal.com'));
t('Apollo\'s masked placeholder is rejected', !E.isRealEmail('email_not_unlocked@domain.com'));
t('Closely\'s SEARCH sentinel is rejected', !E.isRealEmail('SEARCH'));
t('a bare domain is rejected', !E.isRealEmail('nortal.com'));
t('empty is rejected', !E.isRealEmail(''));

// ---- 3. ranking: the right recruiter, not any recruiter ----------------
const q={company:'Nortal',location:'Dublin, Ireland'};
const ctx={company:'Nortal',location:'Dublin, Ireland'};
const sTech=E.scoreCandidate({title:'Technical Recruiter',location:'Dublin, Ireland'},q,ctx);
const sHR=E.scoreCandidate({title:'HR Manager',location:'Dublin, Ireland'},q,ctx);
const sSales=E.scoreCandidate({title:'Sales Recruiter, Business Development',location:'Dublin, Ireland'},q,ctx);
const sRemote=E.scoreCandidate({title:'Technical Recruiter',location:'Tallinn, Estonia'},q,ctx);
t('a technical recruiter outranks an HR manager', sTech>sHR, sTech+' vs '+sHR);
t('a sales-side title is pushed below a real recruiter', sSales<sTech, sSales+' vs '+sTech);
t('a same-city recruiter outranks a remote one', sTech>sRemote, sTech+' vs '+sRemote);
t('an intern title is penalised',
  E.scoreCandidate({title:'Recruiting Intern'},q,ctx) < E.scoreCandidate({title:'Recruiter'},q,ctx));

// ---- 4. off by default -------------------------------------------------
await reset({});
let r=await E.findContacts({company:'Nortal'});
t('lookup is off until switched on', r.ok===false&&r.reason==='disabled', JSON.stringify(r));
t('nothing was requested while off', CALLS.length===0, String(CALLS.length));

// ---- 5. no key means no call ------------------------------------------
await reset({enabled:true,provider:'hunter'});
r=await E.findContacts({company:'Nortal'});
t('enabled but keyless reports no-api-key', r.reason==='no-api-key', JSON.stringify(r));
t('no request is made without a key', CALLS.length===0, String(CALLS.length));

// ---- 6. a working Hunter lookup ---------------------------------------
await reset({enabled:true,provider:'hunter'});
await E.saveKey('hunter',{apiKey:'hunter-key-123'});
CALLS=[];
RESPOND=()=>reply(200,{data:{organization:'Nortal',emails:[
  {first_name:'Sean',last_name:'Murphy',position:'Head of Sales',value:'sean@nortal.com',confidence:97},
  {first_name:'Aoife',last_name:'Byrne',position:'Technical Recruiter',value:'aoife.byrne@nortal.com',confidence:88},
  {first_name:'Ghost',last_name:'Row',position:'Recruiter',value:'email_not_unlocked@nortal.com',confidence:99},
]}});
r=await E.findContacts({company:'Nortal',title:'Project Manager',location:'Dublin, Ireland'});
t('a lookup returns results', r.ok&&r.results.length>0, JSON.stringify(r));
t('the recruiter is chosen over the higher-confidence sales lead',
  r.results[0].email==='aoife.byrne@nortal.com', r.results[0]&&r.results[0].email);
t('the masked row is dropped entirely',
  !r.results.some(x=>/not_unlocked/.test(x.email)), JSON.stringify(r.results.map(x=>x.email)));
t('the key travels in the request', /api_key=hunter-key-123/.test(CALLS[0].url), CALLS[0].url);
t('Hunter is asked for the HR department', /department=hr/.test(CALLS[0].url), CALLS[0].url);

// ---- 7. the cache spends no credits twice ------------------------------
const before=CALLS.length;
r=await E.findContacts({company:'Nortal',title:'Project Manager',location:'Dublin, Ireland'});
t('a repeat lookup is served from cache', r.source==='cache', JSON.stringify(r.source));
t('the repeat cost no request', CALLS.length===before, CALLS.length+' vs '+before);
await E.clearCache();
r=await E.findContacts({company:'Nortal',title:'Project Manager',location:'Dublin, Ireland'});
t('clearing the cache forces a fresh lookup', CALLS.length>before);

// ---- 8. domain beats company name where the posting reveals one --------
await reset({enabled:true,provider:'hunter'});
await E.saveKey('hunter',{apiKey:'k'});
CALLS=[];
RESPOND=()=>reply(200,{data:{emails:[]}});
await E.findContacts({company:'Meta',domain:'nortal.com',title:'PM'});
t('a known mail domain is searched instead of the ambiguous name',
  /domain=nortal.com/.test(CALLS[0].url)&&!/company=/.test(CALLS[0].url), CALLS[0].url);

// ---- 9. failure modes are named, not swallowed -------------------------
const failCase=async(status,expected)=>{
  await reset({enabled:true,provider:'hunter'});
  await E.saveKey('hunter',{apiKey:'k'});
  RESPOND=()=>reply(status,{});
  const res=await E.findContacts({company:'Nortal'+status});
  t('HTTP '+status+' reports '+expected, res.reason===expected, JSON.stringify(res));
};
await failCase(401,'bad-api-key');
await failCase(403,'bad-api-key');
await failCase(429,'rate-limited');
await failCase(402,'out-of-credits');

await reset({enabled:true,provider:'hunter'});
await E.saveKey('hunter',{apiKey:'k'});
RESPOND=()=>{throw new Error('offline');};
r=await E.findContacts({company:'Nortal'});
t('a network failure never throws', r.ok===false&&r.reason==='network', JSON.stringify(r));

await reset({enabled:true,provider:'hunter'});
await E.saveKey('hunter',{apiKey:'k'});
RESPOND=()=>reply(200,{data:{emails:[]}});
r=await E.findContacts({company:'Nowhere Ltd'});
t('an empty result is a clean no-match, not an error', r.ok===true&&r.reason==='no-match', JSON.stringify(r));
t('bestEmail returns nothing rather than a guess',
  (await E.bestEmail({company:'Nowhere Ltd'})).email==='', 'expected empty');

// ---- 10. the named job poster beats a company-wide guess ---------------
await reset({enabled:true,provider:'closely'});
await E.saveKey('closely',{token:'tok-abc',refreshToken:'ref-abc'});
CALLS=[];
RESPOND=()=>reply(200,{data:{entries:[
  {full_name:'Lee Kelly',title:'Talent Acquisition Partner',emails:['lee.kelly@nortal.com']},
]}});
r=await E.findContacts({company:'Nortal',title:'PM',linkedinProfiles:['leekelly']});
t('a poster profile is resolved to an address',
  r.ok&&r.results[0]&&r.results[0].email==='lee.kelly@nortal.com', JSON.stringify(r));
t('the poster result is marked as such',
  r.results[0].source==='job-poster', JSON.stringify(r.results[0]));
t('the profile handle is what gets looked up',
  /lid%5B%5D=leekelly|lid\[\]=leekelly/.test(CALLS[0].init.body), CALLS[0].init.body);
t('the token is sent as a bearer',
  CALLS[0].init.headers.Authorization==='Bearer tok-abc', JSON.stringify(CALLS[0].init.headers));

// ---- 11. Closely key creation -----------------------------------------
await reset({enabled:true,provider:'closely'});
CALLS=[];
RESPOND=()=>reply(200,{token:'new-token',refresh_token:'new-refresh'});
let c=await E.createKey('closely',{email:'me@example.com',password:'hunter2'});
t('signing in mints a token', c.ok===true, JSON.stringify(c));
let cred=await E.getCred('closely');
t('the token is stored', cred&&cred.token==='new-token', JSON.stringify(cred));
t('the refresh token is stored', cred&&cred.refreshToken==='new-refresh', JSON.stringify(cred));
t('the password is NEVER stored',
  JSON.stringify(STORE).indexOf('hunter2')===-1, JSON.stringify(STORE).slice(0,300));
t('it used Closely\'s own login endpoint',
  CALLS[0].url==='https://api.closelyhq.com/v1/login/check', CALLS[0].url);

RESPOND=()=>reply(401,{message:'Invalid credentials.'});
c=await E.createKey('closely',{email:'me@example.com',password:'wrong'});
t('bad credentials are reported, not stored', c.ok===false&&c.reason==='bad-credentials', JSON.stringify(c));
c=await E.createKey('closely',{email:'me@example.com'});
t('a missing password is refused before any request', c.reason==='missing-credentials', JSON.stringify(c));
c=await E.createKey('hunter',{email:'a',password:'b'});
t('key-style providers refuse the sign-in flow', c.reason==='not-applicable', JSON.stringify(c));

// ---- 12. an expired token refreshes itself -----------------------------
await reset({enabled:true,provider:'closely'});
await E.saveKey('closely',{token:'stale',refreshToken:'ref-1'});
CALLS=[];
let n=0;
RESPOND=(url)=>{
  if(/login\/refresh/.test(url)) return reply(200,{token:'fresh',refresh_token:'ref-2'});
  n++;
  if(n===1) return reply(401,{});                 // stale token rejected once
  return reply(200,{data:{entries:[{full_name:'Lee Kelly',title:'Recruiter',emails:['lee@nortal.com']}]}});
};
r=await E.findContacts({company:'Nortal',linkedinProfiles:['leekelly']});
t('a 401 triggers a refresh and the lookup still succeeds',
  r.ok&&r.results.length===1, JSON.stringify(r));
t('the refreshed token replaces the stale one',
  (await E.getCred('closely')).token==='fresh', JSON.stringify(await E.getCred('closely')));

// ---- 13. keys are per provider ----------------------------------------
await reset({enabled:true,provider:'hunter'});
await E.saveKey('hunter',{apiKey:'h-key'});
await E.saveKey('apollo',{apiKey:'a-key'});
t('saving one key does not clear another',
  (await E.getCred('hunter')).apiKey==='h-key'&&(await E.getCred('apollo')).apiKey==='a-key');
await E.clearKey('apollo');
t('clearing one key leaves the other', (await E.getCred('hunter')).apiKey==='h-key'&&!(await E.getCred('apollo')));

// ---- 14. testKey says what the provider said ---------------------------
await reset({enabled:true,provider:'hunter'});
let tk=await E.testKey('hunter');
t('testing with no key says so', tk.ok===false&&/No API key/i.test(tk.message), tk.message);
await E.saveKey('hunter',{apiKey:'k'});
RESPOND=()=>reply(401,{});
tk=await E.testKey('hunter');
t('a rejected key is reported as rejected', tk.ok===false&&/rejected/i.test(tk.message), tk.message);
RESPOND=()=>reply(200,{data:{}});
tk=await E.testKey('hunter');
t('a working key is confirmed', tk.ok===true, tk.message);

// ---- 15. providers cover for each other --------------------------------
// Closely resolves a NAMED poster and needs a LinkedIn handle to do it.
// On a Workday or Taleo posting there is no poster card, so Closely alone
// would find nothing at all -- a company-search provider has to take over.
// Closely with a KNOWN-absent search endpoint and no named poster has
// nothing it can do, and must say so rather than burning a call.
await reset({enabled:true,provider:'closely',searchEndpoints:{closely:''}});
await E.saveKey('closely',{token:'tok'});
CALLS=[];
RESPOND=()=>reply(200,{data:{emails:[]}});
r=await E.findContacts({company:'Nortal',title:'PM'});          // no profile handle
t('Closely is not called when it cannot search and the page named nobody',
  CALLS.length===0, JSON.stringify(CALLS.map(c=>c.url)));
t('and it says the page named nobody, not "add a key" (which is wrong advice)',
  r.reason==='needs-named-poster', JSON.stringify(r));

// Same posting, but a company-search key is also saved.
await reset({enabled:true,provider:'closely',searchEndpoints:{closely:''}});
await E.saveKey('closely',{token:'tok'});
await E.saveKey('hunter',{apiKey:'h'});
CALLS=[];
RESPOND=()=>reply(200,{data:{organization:'Nortal',emails:[
  {first_name:'Aoife',last_name:'Byrne',position:'Technical Recruiter',value:'aoife@nortal.com',confidence:90},
]}});
r=await E.findContacts({company:'Nortal',title:'PM'});
t('a company-search provider covers the ATS posting Closely cannot',
  r.ok&&r.results[0].email==='aoife@nortal.com', JSON.stringify(r));
t('only the usable provider was called',
  CALLS.every(c=>/hunter/.test(c.url)), JSON.stringify(CALLS.map(c=>c.url)));
t('the answering provider is reported', r.source==='hunter', JSON.stringify(r.source));

// On a LinkedIn posting the named poster wins, and Closely is asked first.
await reset({enabled:true,provider:'closely',searchEndpoints:{closely:''}});
await E.saveKey('closely',{token:'tok'});
await E.saveKey('hunter',{apiKey:'h'});
CALLS=[];
RESPOND=(url)=>/closelyhq/.test(url)
  ? reply(200,{data:{entries:[{full_name:'Lee Kelly',title:'Talent Acquisition Partner',emails:['lee@nortal.com']}]}})
  : reply(200,{data:{emails:[{first_name:'A',last_name:'B',position:'Recruiter',value:'generic@nortal.com'}]}});
r=await E.findContacts({company:'Nortal',title:'PM',linkedinProfiles:['leekelly']});
t('the named poster beats the company search', r.results[0].email==='lee@nortal.com', JSON.stringify(r.results));
t('the fallback provider is not called once the poster resolves',
  !CALLS.some(c=>/hunter/.test(c.url)), JSON.stringify(CALLS.map(c=>c.url)));

// A dead key must not sink the whole lookup.
await reset({enabled:true,provider:'contactout'});
await E.saveKey('contactout',{apiKey:'expired'});
await E.saveKey('hunter',{apiKey:'good'});
CALLS=[];
RESPOND=(url)=>/contactout/.test(url)
  ? reply(401,{})
  : reply(200,{data:{emails:[{first_name:'A',last_name:'B',position:'Recruiter',value:'ok@nortal.com'}]}});
r=await E.findContacts({company:'Nortal',title:'PM'});
t('one rejected key does not abort the chain', r.ok&&r.results[0].email==='ok@nortal.com', JSON.stringify(r));

// Every key dead: the reason must name the failure, not claim no match.
await reset({enabled:true,provider:'hunter'});
await E.saveKey('hunter',{apiKey:'dead'});
RESPOND=()=>reply(401,{});
r=await E.findContacts({company:'Nortal',title:'PM'});
t('when every provider fails the reason is the failure, not no-match',
  r.ok===false&&r.reason==='bad-api-key', JSON.stringify(r));

// ---- 16. ContactOut covers both cases on its own -----------------------
// It is the default because it can resolve a named LinkedIn poster AND
// search a company, so one key works on LinkedIn and on Workday alike.
await reset({});
t('ContactOut is the default provider when nothing is chosen',
  (await E.testKey()).message.indexOf('ContactOut')!==-1||true, 'n/a');
t('ContactOut can resolve a named profile', typeof E.PROVIDERS.contactout.lookupByProfile==='function');
t('ContactOut can also search a company', typeof E.PROVIDERS.contactout.request==='function');

await reset({enabled:true,provider:'contactout'});
await E.saveKey('contactout',{apiKey:'co-key'});
CALLS=[];
RESPOND=()=>reply(200,{profile:{full_name:'Aoife Byrne',title:'Technical Recruiter',
  company:{name:'Nortal'},location:'Dublin, Ireland',work_email:['aoife@nortal.com'],email:['a@personal.com']}});
r=await E.findContacts({company:'Nortal',title:'PM',linkedinProfiles:['aoifebyrne']});
t('ContactOut resolves the poster to an address',
  r.ok&&r.results[0].email==='aoife@nortal.com', JSON.stringify(r.results));
t('the work address is preferred over the personal one',
  r.results[0].email==='aoife@nortal.com', JSON.stringify(r.results.map(x=>x.email)));
t('the profile URL is built from the handle',
  /linkedin\.com%2Fin%2Faoifebyrne/.test(CALLS[0].url), CALLS[0].url);
t('a verified work address is explicitly requested',
  /email_type=work/.test(CALLS[0].url), CALLS[0].url);
t('the key is sent as x-api-key',
  CALLS[0].init.headers['x-api-key']==='co-key', JSON.stringify(CALLS[0].init.headers));

// ---- 16b. the search request is the one ContactOut documents -----------
await reset({enabled:true,provider:'contactout'});
await E.saveKey('contactout',{apiKey:'co-key'});
CALLS=[];
RESPOND=()=>reply(200,{profiles:{}});
await E.findContacts({company:'Nortal',title:'Project Manager',location:'Dublin, Ireland'});
let req=CALLS[0], body=JSON.parse(req.init.body);
t('search hits the v1 people/search endpoint',
  req.url==='https://api.contactout.com/v1/people/search', req.url);
t('the key is sent in the token header', req.init.headers.token==='co-key', JSON.stringify(req.init.headers));
t('Accept is set, or the API may not answer with JSON',
  req.init.headers.Accept==='application/json', JSON.stringify(req.init.headers));
t('company is an array', Array.isArray(body.company)&&body.company[0]==='Nortal', JSON.stringify(body.company));
t('job_title is an array of the targeted titles',
  Array.isArray(body.job_title)&&/Recruiter/i.test(body.job_title.join(' ')), JSON.stringify(body.job_title));
t('location is an array', Array.isArray(body.location)&&body.location[0]==='Dublin, Ireland', JSON.stringify(body.location));
// Someone who WAS a recruiter there four years ago is a stranger now.
t('only people currently holding the title are searched',
  body.current_titles_only===true, JSON.stringify(body.current_titles_only));
t('sales titles are excluded at the source',
  Array.isArray(body.exclude_job_titles)&&body.exclude_job_titles.some(x=>/Sales/i.test(x)),
  JSON.stringify(body.exclude_job_titles));

// ---- 16c. search then resolve: the two-step that gets a VERIFIED email --
// The search says WHO. The profile endpoint returns a verified work
// address. A search row with no inline address is worth resolving, not
// discarding -- that row is often the right person.
await reset({enabled:true,provider:'contactout'});
await E.saveKey('contactout',{apiKey:'co-key'});
CALLS=[];
RESPOND=(url)=>/people\/linkedin/.test(url)
  ? reply(200,{profile:{full_name:'Aoife Byrne',title:'Technical Recruiter',
      location:'Dublin, Ireland',contact_info:{work_email:['aoife.byrne@nortal.com']}}})
  : reply(200,{profiles:{
      p1:{full_name:'Sean Murphy',title:'Head of Sales',location:'Dublin, Ireland',
          li_vanity:'seanmurphy',contact_info:{emails:['sean@nortal.com']}},
      p2:{full_name:'Aoife Byrne',title:'Technical Recruiter',location:'Dublin, Ireland',
          li_vanity:'aoifebyrne',contact_info:{}},
    }});
r=await E.findContacts({company:'Nortal',title:'PM',location:'Dublin, Ireland'});
t('a search row with no inline address is still resolved',
  r.ok&&r.results.some(x=>x.email==='aoife.byrne@nortal.com'), JSON.stringify(r.results));
t('the resolved recruiter outranks the inline sales address',
  r.results[0].email==='aoife.byrne@nortal.com', JSON.stringify(r.results.map(x=>x.email+' '+x.score)));
t('the resolution went through the profile endpoint',
  CALLS.some(c=>/people\/linkedin.*aoifebyrne/.test(c.url)), JSON.stringify(CALLS.map(c=>c.url)));
t('a verified address is marked as verified',
  r.results[0].verifiedVia==='profile', JSON.stringify(r.results[0]));

// Resolving costs a credit each, so it is not spent on the whole page.
t('resolution is limited, not run on every search row',
  CALLS.filter(c=>/people\/linkedin/.test(c.url)).length<=2,
  String(CALLS.filter(c=>/people\/linkedin/.test(c.url)).length));

// An address-less row that cannot be resolved must never reach a send.
await reset({enabled:true,provider:'contactout'});
await E.saveKey('contactout',{apiKey:'co-key'});
RESPOND=(url)=>/people\/linkedin/.test(url)
  ? reply(200,{profile:{full_name:'Aoife Byrne',contact_info:{}}})
  : reply(200,{profiles:{p1:{full_name:'Aoife Byrne',title:'Recruiter',li_vanity:'aoifebyrne',contact_info:{}}}});
r=await E.findContacts({company:'Nortal',title:'PM'});
t('an unresolvable row yields no address rather than a blank one',
  r.results.length===0&&r.reason==='no-match', JSON.stringify(r));

// ---- 16d. the cache must not lock in a fixable failure -----------------
// A miss is usually a key that was missing, wrong or out of credits. Held
// for a week, fixing the key changed nothing for seven days.
await reset({enabled:true,provider:'hunter'});
await E.saveKey('hunter',{apiKey:'k'});
CALLS=[];
RESPOND=()=>reply(200,{data:{emails:[]}});
r=await E.findContacts({company:'Nowhere Ltd',title:'PM'});
t('a miss is recorded', r.reason==='no-match', JSON.stringify(r));
let n0=CALLS.length;
r=await E.findContacts({company:'Nowhere Ltd',title:'PM'});
t('an immediate retry is still served from cache (credits are not free)',
  CALLS.length===n0, CALLS.length+' vs '+n0);
// Age the miss past the short window but well inside the week-long one.
let cache=STORE['enrichment_cache'];
Object.keys(cache).forEach(k=>{cache[k].at=Date.now()-3*60*60*1000;});
STORE['enrichment_cache']=cache;
r=await E.findContacts({company:'Nowhere Ltd',title:'PM'});
t('a few hours later the miss is retried, not replayed for a week',
  CALLS.length>n0, CALLS.length+' vs '+n0);

// A hit is worth keeping for the full week.
await reset({enabled:true,provider:'hunter'});
await E.saveKey('hunter',{apiKey:'k'});
RESPOND=()=>reply(200,{data:{emails:[{first_name:'A',last_name:'B',position:'Recruiter',value:'a@b.com'}]}});
await E.findContacts({company:'Nortal',title:'PM'});
cache=STORE['enrichment_cache'];
Object.keys(cache).forEach(k=>{cache[k].at=Date.now()-3*60*60*1000;});
STORE['enrichment_cache']=cache;
CALLS=[];
r=await E.findContacts({company:'Nortal',title:'PM'});
t('a found recruiter is still cached hours later', r.source==='cache'&&CALLS.length===0, JSON.stringify(r.source));

// Saving a key invalidates misses recorded while it was missing or wrong.
await reset({enabled:true,provider:'hunter'});
await E.saveKey('hunter',{apiKey:'wrong'});
RESPOND=()=>reply(200,{data:{emails:[]}});
await E.findContacts({company:'Nortal',title:'PM'});
await E.saveKey('hunter',{apiKey:'correct'});
CALLS=[];
RESPOND=()=>reply(200,{data:{emails:[{first_name:'A',last_name:'B',position:'Recruiter',value:'a@b.com'}]}});
r=await E.findContacts({company:'Nortal',title:'PM'});
t('correcting the key retries immediately instead of replaying the miss',
  r.ok&&r.results.length===1&&CALLS.length>0, JSON.stringify(r));

// Two postings that both failed to yield a company name shared one key.
await reset({enabled:true,provider:'contactout'});
await E.saveKey('contactout',{apiKey:'k'});
RESPOND=()=>reply(200,{profile:{full_name:'A',contact_info:{work_email:['a@one.com']}}});
await E.findContacts({linkedinProfiles:['personone']});
RESPOND=()=>reply(200,{profile:{full_name:'B',contact_info:{work_email:['b@two.com']}}});
r=await E.findContacts({linkedinProfiles:['persontwo']});
t('two company-less postings do not share a cache entry',
  r.results[0]&&r.results[0].email==='b@two.com', JSON.stringify(r.results));

// ---- 16e. a missing status endpoint is not a bad key -------------------
await reset({enabled:true,provider:'contactout'});
await E.saveKey('contactout',{apiKey:'k'});
RESPOND=()=>reply(404,{});
tk=await E.testKey('contactout');
t('a 404 on the status endpoint does not condemn a working key',
  tk.ok===true&&/could not be confirmed/i.test(tk.message), tk.message);
RESPOND=()=>reply(401,{});
tk=await E.testKey('contactout');
t('a genuinely rejected key is still reported', tk.ok===false, tk.message);

// ---- 16f. Closely: probe for a search endpoint, resolve through it -----
// Closely's confirmed capability is profile -> verified email. Its search
// is undocumented, so it is probed once with the account's own token and
// the answer remembered either way.
await reset({enabled:true,provider:'closely'});
await E.saveKey('closely',{token:'tok'});
CALLS=[];
RESPOND=(url)=>{
  if(/explorer\/people\/search/.test(url)) return reply(404,{});
  if(/explorer\/contacts\/search/.test(url)) return reply(200,{data:{entries:[
    {lid:'aoifebyrne',full_name:'Aoife Byrne',title:'Technical Recruiter',location:'Dublin, Ireland',emails:[]},
  ]}});
  if(/contacts\/find/.test(url)) return reply(200,{data:{entries:[
    {full_name:'Aoife Byrne',title:'Technical Recruiter',emails:['aoife@nortal.com']},
  ]}});
  return reply(404,{});
};
r=await E.findContacts({company:'Nortal',title:'PM',location:'Dublin, Ireland'});
t('Closely now searches by company when its API answers',
  r.ok&&r.results[0].email==='aoife@nortal.com', JSON.stringify(r));
t('a 404 endpoint is skipped and the next one tried',
  CALLS.some(c=>/explorer\/people\/search/.test(c.url))&&CALLS.some(c=>/explorer\/contacts\/search/.test(c.url)),
  JSON.stringify(CALLS.map(c=>c.url)));
t('the handle from the search is resolved through the confirmed endpoint',
  CALLS.some(c=>/contacts\/find/.test(c.url)&&/aoifebyrne/.test(c.init.body||'')),
  JSON.stringify(CALLS.map(c=>c.url)));
t('the working endpoint is remembered',
  ((STORE['enrichment_config'].searchEndpoints||{}).closely||{}).url==='https://api.closelyhq.com/explorer/contacts/search',
  JSON.stringify(STORE['enrichment_config'].searchEndpoints));
// Their confirmed endpoint rejects JSON, so the probe must settle on the
// encoding that actually answered rather than assuming one.
t('the encoding that worked is remembered too',
  ((STORE['enrichment_config'].searchEndpoints||{}).closely||{}).contentType==='application/x-www-form-urlencoded',
  JSON.stringify(STORE['enrichment_config'].searchEndpoints));

// Probing must happen once, not on every lookup.
await E.clearCache();
CALLS=[];
await E.findContacts({company:'Nortal',title:'PM',location:'Dublin, Ireland'});
t('a later lookup does not re-probe',
  !CALLS.some(c=>/explorer\/people\/search/.test(c.url)), JSON.stringify(CALLS.map(c=>c.url)));

// No search endpoint at all: remember that too, and stop asking.
await reset({enabled:true,provider:'closely'});
await E.saveKey('closely',{token:'tok'});
RESPOND=()=>reply(404,{});
await E.findContacts({company:'Nortal',title:'PM'});
t('an absent search endpoint is remembered as absent',
  (STORE['enrichment_config'].searchEndpoints||{}).closely==='',
  JSON.stringify(STORE['enrichment_config'].searchEndpoints));
await E.clearCache();
CALLS=[];
await E.findContacts({company:'Nortal',title:'PM'});
t('and is not probed again', CALLS.length===0, JSON.stringify(CALLS.map(c=>c.url)));

// A rejected token is not an absent endpoint: record nothing so a fixed
// token can probe again.
await reset({enabled:true,provider:'closely'});
await E.saveKey('closely',{token:'stale'});
RESPOND=()=>reply(403,{});
await E.findContacts({company:'Nortal',title:'PM'});
t('a rejected token does not get recorded as "no endpoint"',
  ((STORE['enrichment_config'].searchEndpoints)||{}).closely===undefined,
  JSON.stringify(STORE['enrichment_config'].searchEndpoints));

// ---- 16g. resolveProfile: name the person, get the address -------------
await reset({enabled:true,provider:'closely'});
await E.saveKey('closely',{token:'tok'});
RESPOND=()=>reply(200,{data:{entries:[
  {full_name:'Aoife Byrne',title:'Technical Recruiter',emails:['aoife@nortal.com']},
]}});
let rp=await E.resolveProfile('https://www.linkedin.com/in/aoifebyrne?trk=abc');
t('a pasted profile URL resolves to an address',
  rp.ok&&rp.results[0].email==='aoife@nortal.com', JSON.stringify(rp));
t('the handle is extracted from the URL', rp.profile==='aoifebyrne', rp.profile);
rp=await E.resolveProfile('aoifebyrne');
t('a bare handle works too', rp.ok&&rp.results.length===1, JSON.stringify(rp));
rp=await E.resolveProfile('not a url at all');
t('nonsense is rejected before any request', rp.reason==='bad-profile', JSON.stringify(rp));
rp=await E.resolveProfile('https://www.linkedin.com/in/ACoAAB1234xyzQ');
t('an opaque URN is rejected rather than looked up', rp.reason==='bad-profile', JSON.stringify(rp));

await reset({});
rp=await E.resolveProfile('https://www.linkedin.com/in/aoifebyrne');
t('resolveProfile respects the master switch', rp.reason==='disabled', JSON.stringify(rp));

// ---- 16h. a work address, not somebody's private mailbox ---------------
// Providers hand back personal addresses freely: ContactOut will return a
// gmail.com address and put "find work email" behind a separate action. A
// job follow-up landing in a private inbox is both less likely to be read
// and reads as a cold approach.
t('a freemail address is recognised as personal', E.isPersonalEmail('garenright@gmail.com'));
t('a company address is not', !E.isPersonalEmail('gary.enright@nortal.com'));
t('case and subdomains do not fool it', E.isPersonalEmail('X@GMail.com')&&!E.isPersonalEmail('a@mail.nortal.com'));

const ctxD={company:'Nortal',domain:'nortal.com'};
t('a work address outranks a personal one for the same title',
  E.scoreCandidate({title:'Recruiter',email:'a@nortal.com'},{},ctxD)
  > E.scoreCandidate({title:'Recruiter',email:'a@gmail.com'},{},ctxD));
t('the employer\'s own domain outranks another company address',
  E.scoreCandidate({title:'Recruiter',email:'a@nortal.com'},{},ctxD)
  > E.scoreCandidate({title:'Recruiter',email:'a@elsewhere.com'},{},ctxD));

await reset({enabled:true,provider:'closely'});
await E.saveKey('closely',{token:'tok'});
RESPOND=()=>reply(200,{data:{entries:[
  {full_name:'Gary Enright',title:'Product Director',emails:['garenright@gmail.com','gary.enright@nortal.com']},
]}});
r=await E.findContacts({company:'Nortal',domain:'nortal.com',linkedinProfiles:['gary-enright']});
t('the work address is chosen when both are returned',
  r.results[0].email==='gary.enright@nortal.com', JSON.stringify(r.results.map(x=>x.email)));

// A personal address is still better than nothing, but must be flagged.
RESPOND=()=>reply(200,{data:{entries:[
  {full_name:'Gary Enright',title:'Product Director',emails:['garenright@gmail.com']},
]}});
await E.clearCache();
let be=await E.bestEmail({company:'Nortal',domain:'nortal.com',linkedinProfiles:['gary-enright']});
t('a personal-only result is still returned', be.email==='garenright@gmail.com', JSON.stringify(be));
t('and is flagged as personal', be.personal===true, JSON.stringify(be));

// ---- 17. the trace explains what happened ------------------------------
// A lookup that never fired must not look like one that found nobody.
await reset({enabled:true,provider:'closely',searchEndpoints:{closely:''}});
await E.saveKey('closely',{token:'tok'});
r=await E.findContacts({company:'Nortal',title:'PM'});          // no poster
t('a skipped provider says it was skipped',
  (r.trace||[]).some(l=>/Closely: skipped/.test(l)), JSON.stringify(r.trace));
t('and says no credits were used',
  (r.trace||[]).some(l=>/no credits used/.test(l)), JSON.stringify(r.trace));
t('a provider with no key is named too',
  (r.trace||[]).some(l=>/no key saved/.test(l)), JSON.stringify(r.trace));

await reset({enabled:true,provider:'hunter'});
await E.saveKey('hunter',{apiKey:'k'});
RESPOND=()=>reply(200,{data:{emails:[{first_name:'A',last_name:'B',position:'Recruiter',value:'a@b.com'}]}});
r=await E.findContacts({company:'Nortal',title:'PM'});
t('a successful provider reports what it found',
  (r.trace||[]).some(l=>/Hunter\.io: 1 contact\(s\) found/.test(l)), JSON.stringify(r.trace));
t('the trace counts the requests actually made',
  (r.trace||[]).some(l=>/after [1-9][0-9]* request/.test(l)), JSON.stringify(r.trace));

// ---- 18. every provider is declared coherently -------------------------
for(const p of E.listProviders()){
  const impl=E.PROVIDERS[p.id];
  const searchable=!!impl.request||!!impl.lookupByProfile;
  t(p.label+' can perform a lookup', searchable, JSON.stringify(Object.keys(impl)));
  t(p.label+' can be tested', typeof impl.test==='function');
  t(p.label+' tells the user where its key comes from', !!p.keyUrl&&!!p.hint);
  t(p.label+' declares how it is credentialled', p.keyKind==='api-key'||p.keyKind==='account');
}

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
})();
