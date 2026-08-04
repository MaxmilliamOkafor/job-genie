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

// ---- 15. every provider is declared coherently -------------------------
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
