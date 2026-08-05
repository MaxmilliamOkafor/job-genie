// Remembering profiles you browsed is what removes the manual step: the
// handle is known before the application starts, so nothing has to be
// opened or pasted at tailoring time.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP profile-memory: jsdom not installed'); process.exit(0); }
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};

let STORE={};
global.chrome={runtime:{id:'x'},storage:{local:{
  get:(k,cb)=>{const o={};(Array.isArray(k)?k:[k]).forEach(x=>{if(x in STORE)o[x]=STORE[x];});cb(o);},
  set:(o,cb)=>{Object.assign(STORE,o);cb&&cb();},
  remove:(k,cb)=>{(Array.isArray(k)?k:[k]).forEach(x=>delete STORE[x]);cb&&cb();},
}}};
const dom=new JSDOM('<body><h1>Aoife Byrne</h1><div class="top-card-layout__headline">Technical Recruiter at Some Employer</div></body>',
  {url:'https://www.linkedin.com/in/aoifebyrne/'});
global.window=dom.window; global.document=dom.window.document; global.location=dom.window.location;
const loadCjs=(f)=>{const fs=require('fs'),path=require('path'),Module=require('module');
  const file=path.join(__dirname,'..',f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
const M=loadCjs('linkedin-profile-memory.js');

(async () => {
const p=M.readProfile();
t('the handle comes from the URL', p&&p.handle==='aoifebyrne', JSON.stringify(p));
t('the name is read from the page', p&&p.name==='Aoife Byrne', JSON.stringify(p));
t('the headline is read, which is what matches an employer later',
  p&&/Technical Recruiter at Some Employer/.test(p.headline), JSON.stringify(p));

M.remember(p);
await new Promise(r=>setTimeout(r,10));
t('the profile is stored', !!(STORE['linkedin_profiles_seen']||{}).aoifebyrne, JSON.stringify(STORE));

// The point: applying to that employer finds the handle with no tab open.
let hits=await M.forCompany('Some Employer');
t('a browsed recruiter is found by employer name', hits.length===1&&hits[0].handle==='aoifebyrne', JSON.stringify(hits));
t('matching is case-insensitive', (await M.forCompany('SOME EMPLOYER')).length===1);
t('a different employer matches nobody', (await M.forCompany('Another Co')).length===0);
t('no company means no guess', (await M.forCompany('')).length===0);

// Ranking: a recruiter at the company beats an unrelated employee there.
STORE['linkedin_profiles_seen']={
  rec:{handle:'rec',headline:'Technical Recruiter at Some Employer',at:Date.now()},
  eng:{handle:'eng',headline:'Backend Engineer at Some Employer',at:Date.now()},
  sales:{handle:'sales',headline:'Account Executive at Some Employer',at:Date.now()},
};
hits=await M.forCompany('Some Employer');
t('the recruiter ranks first', hits[0].handle==='rec', JSON.stringify(hits.map(h=>h.handle)));
t('a sales title ranks below an engineer', hits.findIndex(h=>h.handle==='sales')>hits.findIndex(h=>h.handle==='eng'),
  JSON.stringify(hits.map(h=>h.handle)));

// A recruiter looked at a year ago has almost certainly moved on.
STORE['linkedin_profiles_seen']={old:{handle:'old',headline:'Recruiter at Some Employer',at:Date.now()-200*24*3600*1000}};
t('a stale profile is not offered', (await M.forCompany('Some Employer')).length===0);

// Re-visiting must not duplicate, and must not lose earlier detail.
STORE={};
M.remember({handle:'x',name:'A B',headline:'Recruiter at Some Employer',at:Date.now()});
await new Promise(r=>setTimeout(r,10));
M.remember({handle:'x',name:'',headline:'',at:Date.now()});
await new Promise(r=>setTimeout(r,10));
const rec=(STORE['linkedin_profiles_seen']||{}).x;
t('re-visiting updates rather than duplicates', Object.keys(STORE['linkedin_profiles_seen']).length===1);
t('a later visit that renders late keeps the earlier detail',
  rec&&rec.name==='A B'&&/Recruiter/.test(rec.headline), JSON.stringify(rec));

// An opaque URN is not a public handle.
const dom2=new JSDOM('<body><h1>Dana Quinn</h1></body>',{url:'https://www.linkedin.com/in/ACoAAB1234xyzQ/'});
global.document=dom2.window.document; global.location=dom2.window.location;
const M2=loadCjs('linkedin-profile-memory.js');
t('an opaque URN is not remembered as a handle', M2.currentHandle()==='', M2.currentHandle());

t('nothing is ever sent anywhere',
  !/fetch\(|XMLHttpRequest/.test(require('fs').readFileSync(require('path').join(__dirname,'..','linkedin-profile-memory.js'),'utf8')),
  'this module must be storage-only');

await M.forget();
t('everything can be forgotten', !STORE['linkedin_profiles_seen']);

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
})();
