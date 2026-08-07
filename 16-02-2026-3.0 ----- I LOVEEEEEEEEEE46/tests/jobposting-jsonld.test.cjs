// schema.org JobPosting is what makes a platform nobody wrote selectors
// for read as well as Greenhouse does: it carries the title, the FULL
// description, the company and the location as structured data. Most ATS
// and nearly every large employer's careers site emit it for Google Jobs.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP jobposting-jsonld: jsdom not installed'); process.exit(0); }
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const fs=require('fs'),path=require('path');
const DIR=path.join(__dirname,'..');
const loadCjs=(f)=>{const Module=require('module');
  const file=path.join(DIR,f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
const dom=new JSDOM('<body></body>',{url:'https://careers.someemployer.com/jobs/1'});
global.window=dom.window; global.document=dom.window.document;
const AP=loadCjs('ats-platforms.js');

const ld=(o)=>'<script type="application/ld+json">'+JSON.stringify(o)+'</script>';

// A realistic posting from a company's own careers site -- no recognised
// ATS, no useful CSS hooks, which is the case this exists for.
document.body.innerHTML = ld({
  '@context':'https://schema.org','@type':'JobPosting',
  title:'Microsoft Dynamics 365 Project Manager',
  description:'<p>We are hiring a project manager.</p><p>You will lead delivery across finance and operations.</p><ul><li>5 years experience</li><li>D365 certification</li></ul>',
  identifier:{'@type':'PropertyValue',value:'R-2291'},
  hiringOrganization:{'@type':'Organization',name:'Some Employer'},
  jobLocation:{'@type':'Place',address:{'@type':'PostalAddress',addressLocality:'Dublin',addressCountry:'Ireland'}},
}) + '<div>Unrelated page furniture</div>';

let r = AP.fromJobPostingLd(document);
t('a JobPosting is found', r.found);
t('the title is read', r.title==='Microsoft Dynamics 365 Project Manager', r.title);
t('the company is read', r.company==='Some Employer', r.company);
t('the location is assembled', r.location==='Dublin, Ireland', r.location);
t('the requisition ID is read', r.jobId==='R-2291', r.jobId);
t('the description is complete, not truncated',
  /project manager/.test(r.description) && /D365 certification/.test(r.description), r.description);

// HTML in the description must become readable text, with block
// boundaries preserved -- otherwise sentences run together and keyword
// extraction reads "operations5 years".
t('HTML tags are stripped', !/[<>]/.test(r.description), r.description);
t('block boundaries survive as spaces',
  !/operations5|manager\.You/.test(r.description), r.description);
t('entities are decoded',
  AP.fromJobPostingLd(new JSDOM('<body>'+ld({'@type':'JobPosting',description:'R&amp;D &lt;team&gt; caf&quot;e'})+'</body>').window.document)
    .description === 'R&D <team> caf"e');

// Nested and array shapes both occur in the wild.
document.body.innerHTML = ld([{'@type':'WebPage'},{'@type':'JobPosting',title:'Engineer',description:'x'.repeat(200)}]);
t('a JobPosting inside an array is found', AP.fromJobPostingLd(document).title==='Engineer');
document.body.innerHTML = ld({'@context':'https://schema.org','@graph':[{'@type':'Organization'},{'@type':'JobPosting',title:'Analyst',description:'y'.repeat(200)}]});
t('a JobPosting nested in @graph is found', AP.fromJobPostingLd(document).title==='Analyst');

// Remote roles declare it instead of an address.
document.body.innerHTML = ld({'@type':'JobPosting',title:'Remote PM',jobLocationType:'TELECOMMUTE',description:'z'.repeat(200)});
t('a remote role reports Remote', AP.fromJobPostingLd(document).location==='Remote');

// Nothing may be invented.
document.body.innerHTML = '<div><h1>A job</h1><p>No structured data here.</p></div>';
r = AP.fromJobPostingLd(document);
t('no JSON-LD means nothing found', !r.found && r.title==='' && r.description==='');
document.body.innerHTML = '<script type="application/ld+json">{not valid json</script>';
t('malformed JSON-LD does not throw', AP.fromJobPostingLd(document).found===false);
document.body.innerHTML = ld({'@type':'Organization',name:'Not a job'});
t('a non-JobPosting is ignored', AP.fromJobPostingLd(document).found===false);

// ---- wiring: job detection must actually use it ----------------------
const contentJs=fs.readFileSync(path.join(DIR,'content.js'),'utf8');
t('job detection reads JobPosting JSON-LD',
  /AP\.fromJobPostingLd\(document\)/.test(contentJs), 'the strongest source would go unused');
t('the title prefers the structured value', /let title = ld\.title \|\|/.test(contentJs));
t('the company prefers the structured value', /let company = ld\.company \|\|/.test(contentJs));
t('the location prefers the structured value', /const rawLocation = ld\.location \|\|/.test(contentJs));
// A few sites put a one-line summary in JSON-LD and the real posting in
// the page, so the fuller of the two has to win rather than the first.
t('the FULLER description wins, whichever source it came from',
  /ldDesc\.length >= cssDesc\.length \? ldDesc : cssDesc/.test(contentJs),
  'a one-line JSON-LD summary would replace the real posting');

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
