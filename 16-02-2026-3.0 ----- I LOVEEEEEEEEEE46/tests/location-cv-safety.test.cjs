const M=require('../universal-location-strategy.js');
const L=(v)=>M.normalizeJobLocationForApplication(v,'Dublin, IE');
let BAD=0;
const rows=[];
const check=(input, expect, note)=>{
  let out; try{ out=L(input); }catch(e){ out='THREW: '+e.message; }
  const ok = typeof expect==='function' ? expect(out) : out===expect;
  if(!ok) BAD++;
  rows.push([ok?'ok ':'BAD', JSON.stringify(input), out, note||'']);
};
const HOME='Dublin, IE';
// --- regions / territories must never appear as an address
['Latin America','EMEA','APAC','North America','Global','Worldwide','Multiple Locations','Various Locations','Middle East','Asia-Pacific','Nordics','Benelux','DACH']
  .forEach(r=>check(r,HOME,'region'));
check('Latin America, US',HOME,'region+country');
check('EMEA - Remote',HOME,'region+remote');
// --- remote handling
check('Remote',HOME,'bare remote');
check('Fully Remote',HOME,'remote variant');
check('Remote - Dublin', o=>/Dublin/i.test(o),'remote+city');
check('Dublin (Remote)', o=>/Dublin/i.test(o) && !/remote/i.test(o),'city+remote suffix');
check('Remote (US)', o=>!/remote/i.test(o),'remote+country');
// --- real cities worldwide
[['Berlin','DE'],['Paris','FR'],['Madrid','ES'],['Amsterdam','NL'],['Toronto','CA'],['Sydney','AU'],
 ['Singapore','SG'],['Tokyo','JP'],['Bangalore','IN'],['São Paulo','BR'],['Zürich','CH'],
 ['New York','US'],['San Francisco','US'],['Austin','US'],['London','GB'],['Dublin','IE']]
 .forEach(([c])=>check(c, o=>new RegExp(c.split(' ')[0].replace(/[^\w]/g,'.'),'i').test(o), 'city keeps its name'));
// Anglicised exonyms are CORRECT: ATS parsers index the English form.
check('München', o=>/Munich/i.test(o) && /DE/.test(o), 'exonym is expected');
check('Köln', o=>/Cologne|K.ln/i.test(o), 'exonym or original');
// --- more real-world shapes
check('New York, NY, United States', o=>/New York/i.test(o), 'city, state, country');
check('London, England, United Kingdom', o=>/London/i.test(o), 'city, region, country');
check('Dublin, OH', o=>/Dublin/i.test(o), 'US Dublin must not crash');
check('Greater Dublin Area', o=>/Dublin/i.test(o), 'metro phrasing');
check('Dublin, County Dublin, Ireland', o=>/Dublin/i.test(o), 'linkedin triple');
check('Cork, Ireland', o=>/Cork/i.test(o), 'second Irish city');
check('Remote, Ireland', o=>!/remote/i.test(o), 'remote+country');
check('Hybrid (2 days onsite) - Berlin', o=>/Berlin/i.test(o)&&!/hybrid|onsite/i.test(o), 'parenthetical detail');
check('Amsterdam / Rotterdam', o=>/Amsterdam|Rotterdam/i.test(o), 'either-or');
check('Berlin, Germany (Remote OK)', o=>/Berlin/i.test(o)&&!/remote/i.test(o), 'remote note');
check('  Berlin  ', o=>/Berlin/i.test(o), 'whitespace padding');
check('BERLIN', o=>/Berlin/i.test(o), 'all caps');
check('x'.repeat(500), o=>typeof o==='string'&&o.length<200, 'absurd length does not blow up');
check('123456', HOME, 'digits only');
check('!!!', HOME, 'punctuation only');
// --- the historic Austin/Austria bug
check('Austin', o=>/Austin/i.test(o) && !/Vienna|Austria/i.test(o),'must NOT become Vienna');
check('Austin, TX', o=>/Austin/i.test(o),'US city+state');
check('Toronto, ON', o=>/Toronto/i.test(o),'CA city+province');
// --- never emit "Remote" into a CV
['Remote - Berlin','Berlin, Remote','Hybrid - Paris','Paris (Hybrid)','On-site - Madrid','WFH - London']
  .forEach(v=>check(v, o=>!/remote|hybrid|wfh|on-?site/i.test(o), 'no work-mode word in output'));
// --- junk / empty
check('',HOME,'empty'); check('   ',HOME,'whitespace'); check(null,HOME,'null'); check(undefined,HOME,'undefined');
check('N/A',HOME,'n/a'); check('TBD',HOME,'tbd'); check('-',HOME,'dash');
// --- never leak a placeholder or a broken string
['Unknown','null','undefined','{city}','[Location]']
  .forEach(v=>check(v, o=>!/unknown|null|undefined|\{|\[/i.test(o), 'placeholder rejected'));
console.log('input'.padEnd(26)+'output');
rows.forEach(r=>{ if(r[0]==='BAD') console.log('  BAD  '+r[1].padEnd(26)+'-> '+JSON.stringify(r[2])+'   ('+r[3]+')'); });
console.log('\n'+(rows.length-BAD)+'/'+rows.length+' ok, '+BAD+' FAILING');
