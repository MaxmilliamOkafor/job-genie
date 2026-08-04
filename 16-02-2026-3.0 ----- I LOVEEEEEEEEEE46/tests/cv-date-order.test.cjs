let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
global.window=global; global.chrome={runtime:{id:'x'},storage:{local:{get:(k,cb)=>cb({})}}};
const path=require('path'),fs=require('fs'),Module=require('module');
const load=(f)=>{const file=path.join(__dirname,'..',f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
const RA=load('recruiter-audit.js');
const mk=(roles)=>['PROFESSIONAL SUMMARY','Engineer.','','WORK EXPERIENCE','']
  .concat(...roles.map(([c,t,d])=>[c,t,d,'- Did work.','']))
  .concat(['EDUCATION','UCD']).join('\n');

const CV=mk([['Meta','Software Engineer','01/2023 - Present'],
             ['SolimHealth','AI Product Manager (Contract, part-time)','02/2024 - 07/2025'],
             ['Accenture','Solutions Architect','04/2021 - 12/2022'],
             ['Citigroup','Data Analyst','08/2017 - 03/2021']]);
const r=RA.sortExperienceByStartDate(CV);
t('reports it sorted', r.sorted===true && r.roles===4, JSON.stringify(r).slice(0,120));
const order=r.text.split('\n').filter(l=>/^(Meta|SolimHealth|Accenture|Citigroup)$/.test(l.trim()));
t('strict start-date descending', JSON.stringify(order)===JSON.stringify(['SolimHealth','Meta','Accenture','Citigroup']), JSON.stringify(order));
t('no date value altered', ['01/2023 - Present','02/2024 - 07/2025','04/2021 - 12/2022','08/2017 - 03/2021'].every(d=>r.text.includes(d)));
t('every bullet retained', (r.text.match(/- Did work\./g)||[]).length===4);
t('EDUCATION still separated from the last role', /- Did work\.\n\nEDUCATION/.test(r.text), JSON.stringify(r.text.slice(-60)));
t('summary untouched above the section', r.text.startsWith('PROFESSIONAL SUMMARY\nEngineer.'));

// Already correct -> left alone entirely
const ok=mk([['B','T','05/2024 - Present'],['A','T','01/2020 - 04/2024']]);
const r2=RA.sortExperienceByStartDate(ok);
t('already-ordered CV is not rewritten', r2.sorted===false && r2.text===ok, r2.reason);
// Month-name dates
const mn=mk([['Old','T','January 2020 - March 2022'],['New','T','April 2022 - Present']]);
const r3=RA.sortExperienceByStartDate(mn);
t('handles Month YYYY dates', r3.sorted===true && r3.text.indexOf('New')<r3.text.indexOf('Old'), r3.reason);
// No experience section / single role -> safe no-ops
t('no experience section is a no-op', RA.sortExperienceByStartDate('SUMMARY\nx').sorted===false);
t('single role is a no-op', RA.sortExperienceByStartDate(mk([['A','T','01/2020 - Present']])).sorted===false);
t('empty input is a no-op', RA.sortExperienceByStartDate('').sorted===false);
// The sorter is now ON by default: no toggle, and a no-op when correct.
const src=require('fs').readFileSync(path.join(__dirname,'..','recruiter-audit.js'),'utf8');
t('sorting defaults ON', /strictDateOrder: flags\.strictDateOrder !== false/.test(src), 'still opt-in');
const html=require('fs').readFileSync(path.join(__dirname,'..','popup.html'),'utf8');
t('no UI toggle remains', !/strictDateOrderToggle/.test(html), 'toggle still in popup.html');

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
