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
console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
