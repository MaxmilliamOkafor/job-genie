// Detection, selectors and registration are all worthless if isSupportedHost
// says no: the page is never recognised, "Job found!" never appears, and
// nothing downstream runs. That gate kept its own hostname list, which had
// drifted from everything else.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP recognition-gate: jsdom not installed'); process.exit(0); }
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const fs=require('fs'),path=require('path');
const DIR=path.join(__dirname,'..');
const loadCjs=(f)=>{const Module=require('module');
  const file=path.join(DIR,f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
const AP=loadCjs('ats-platforms.js');
const contentJs=fs.readFileSync(path.join(DIR,'content.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(DIR,'manifest.json'),'utf8'));

// ---- the gate must consult the shared map ----------------------------
t('the recognition gate reads ats-platforms, not its own list',
  /const isSupportedHost[\s\S]{0,1600}AP\.detect\(normalizedHost/.test(contentJs),
  'a platform absent from the local list would never be recognised');
t('and it does so BEFORE falling back to the static list',
  contentJs.indexOf('AP.detect(normalizedHost') < contentJs.indexOf('ATS_ONLY_HOSTS.some('),
  'the stale list would win');
t('a failure to load the map falls through rather than throwing',
  /AP\.detect\(normalizedHost[\s\S]{0,200}catch \(e\)/.test(contentJs));

// ats-platforms must be loaded before content.js, or AP is undefined at
// exactly the moment the gate runs.
for (const cs of manifest.content_scripts) {
  if (!cs.js.includes('content.js')) continue;
  t('ats-platforms.js loads before content.js',
    cs.js.indexOf('ats-platforms.js') >= 0 && cs.js.indexOf('ats-platforms.js') < cs.js.indexOf('content.js'),
    JSON.stringify(cs.js.slice(0, 3)));
}

// ---- every supported platform must pass the gate ---------------------
// Lever and Ashby are the proof: both had selectors, registration and
// detection, and were absent from the gate's own list with a comment
// saying they were excluded on purpose.
const HOSTS = {
  greenhouse:'boards.greenhouse.io', workday:'acme.wd1.myworkdayjobs.com',
  smartrecruiters:'jobs.smartrecruiters.com', workable:'apply.workable.com', icims:'careers.icims.com', taleo:'acme.taleo.net', teamtailor:'acme.teamtailor.com',
  bamboohr:'acme.bamboohr.com', recruitee:'acme.recruitee.com', jazzhr:'acme.applytojob.com',
  jobvite:'jobs.jobvite.com', successfactors:'career5.successfactors.eu', personio:'acme.jobs.personio.de',
  eightfold:'acme.eightfold.ai', avature:'acme.avature.net', cornerstone:'acme.csod.com',
  brassring:'acme.brassring.com', ultipro:'acme.ultipro.com', adp:'workforcenow.adp.com',
  breezy:'acme.breezy.hr', dover:'app.dover.io',
  pinpoint:'acme.pinpointhq.com', zohorecruit:'acme.zohorecruit.com', occupop:'acme.occupop.com',
  bullhorn:'acme.bullhornstaffing.com', oracle:'acme.oraclecloud.com', dayforce:'acme.dayforcehcm.com',
  freshteam:'acme.freshteam.com', gusto:'jobs.gusto.com', paylocity:'recruiting.paylocity.com',
  comeet:'www.comeet.co', polymer:'jobs.polymer.co', linkedin:'www.linkedin.com',
};
for (const [id, host] of Object.entries(HOSTS)) {
  const label = (AP.list().find(p => p.id === id) || {}).label || id;
  t(label + ' is recognised as an ATS', AP.detect(host, 'https://'+host+'/jobs/1') === id,
    AP.detect(host, 'https://'+host+'/jobs/1') || '(not recognised)');
}
t('every declared platform has a host that resolves back to it',
  AP.list().every(p => Object.prototype.hasOwnProperty.call(HOSTS, p.id)),
  'untested: ' + AP.list().filter(p => !HOSTS[p.id]).map(p => p.id).join(', '));

// The list the gate falls back to said dayforce.com; the real host is
// dayforcehcm.com, so Dayforce would have been missed either way.
t('Dayforce resolves on its REAL host', AP.detect('acme.dayforcehcm.com','')==='dayforce');
t('the stale exclusion note is gone', !/EXCLUDES Lever and Ashby/.test(contentJs));

// ---- and the excluded four must still not be ------------------------
for (const host of ['www.indeed.com','www.glassdoor.com','wellfound.com','otta.com',
                    'jobs.lever.co','jobs.ashbyhq.com','ats.rippling.com','acme.rippling-ats.com']) {
  t(host + ' is not treated as a supported ATS', AP.detect(host,'https://'+host+'/x')==='' , AP.detect(host,''));
}

// ---- every host a platform claims must actually load scripts ---------
// Detection knowing a host is not the same as anything running on it. A
// vendor's alternate domain that resolves but has no content-script match
// is the same "supported but dead" shape as the recognition gate itself.
const covers=(patterns, host)=>patterns.some(p=>{
  const h=p.replace(/^https?:\/\//,'').split('/')[0];
  if(h==='<all_urls>') return true;
  const base=h.replace(/^\*\./,'');
  return host===base || host.endsWith('.'+base);
});
const patternsFor=(file)=>{
  const out=[];
  for(const cs of manifest.content_scripts) if((cs.js||[]).includes(file)) out.push(...cs.matches);
  return out;
};
const mainPats=patternsFor('content.js');
const srcPats=patternsFor('jd-contact-sources.js');

for (const p of AP.list()) {
  for (const h of p.host) {
    if (h.indexOf('/') !== -1) continue;
    // A host entry with no dot-separated TLD can never label-match, so it
    // is dead weight pretending to be coverage.
    t(p.label+': "'+h+'" is a matchable host', /\.[a-z]{2,}$/i.test(h), 'no TLD - can never match');
    const probe = /^(jobs|app|recruiting|ats)\./.test(h) ? h : 'careers.'+h;
    // Contact extraction is what finds the address to email, so it has to
    // reach every domain a platform claims.
    t(p.label+': contact sources load on '+h, covers(srcPats, probe), 'no address would ever be found here');
    // LinkedIn deliberately uses its own path rather than the heavy engine.
    if (p.id !== 'linkedin') {
      t(p.label+': job detection loads on '+h, covers(mainPats, probe), 'the page would never be recognised');
    }
  }
}

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
