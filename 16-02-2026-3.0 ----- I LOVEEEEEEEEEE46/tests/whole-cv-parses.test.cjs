// EVERYTHING, PARSED, ON ONE DOCUMENT.
//
// The per-feature suites each guard one fix. This one builds a whole CV
// in the shape the model really emits -- including the defects seen in
// live parses: a comma-joined company and location, an en dash, the
// malformed "+353: 0874261508" phone, a buzzword that leaves wreckage
// when removed -- and then checks every failure mode this project has
// actually hit, on the single artifact a recruiter would receive.
//
// It exists because those failures were never found by reasoning about
// the code. Each one was found by reading what a parser returned, and a
// regression in any of them is invisible until an application is already
// lost.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),Module=require('module');
const DIR=path.join(__dirname,'..');
global.window=global;
const load=(f)=>{const p=path.join(DIR,f);const m=new Module(p,null);m.filename=p;m.paths=Module._nodeModulePaths(DIR);m._compile(fs.readFileSync(p,'utf8'),p);return (m.exports&&m.exports.DocxGenerator)||m.exports;};
const DG=load('docx-generator.js');load('content-quality-engine.js');load('recruiter-audit.js');
const RA=global.RecruiterAudit;

// A realistic CV in the shape the model actually emits, including the
// defects seen in live parses: comma-joined company+location, US spelling,
// an en dash, a buzzword, an unfilled placeholder.
const RAW=['Maxmilliam Okafor',
'Dublin, IE | +353: 0874261508 | maxokafordev@gmail.com',
'https://linkedin.com/in/maxokafor | https://github.com/MaxmilliamOkafor','',
'PROFESSIONAL SUMMARY',
'Experienced Software Engineer with a proven ability to build high-performing teams.','',
'CORE COMPETENCIES',
'Machine Learning, MLOps, Data Engineering, Cloud Architecture','',
'PROFESSIONAL EXPERIENCE',
'Meta, Dublin, Ireland','Software Engineer','January 2023 – Present',
'- Re-architected the data-ingestion layer in Python and SQL on Apache Kafka, halving p95 latency.',
'- Built the MLOps CI/CD platform on Docker and Kubernetes, cutting release cycles to three days.','',
'SolimHealth, Dallas, Texas, United States','AI Product Manager','August 2022 – December 2022',
'- Built a HIPAA-compliant data-governance layer over PostgreSQL and Amazon S3.','',
'Citigroup, London, United Kingdom','Data Analyst','August 2017 – March 2021',
'- Developed fraud and risk-scoring models in scikit-learn and XGBoost.','',
'PROJECTS',
'SignalDesk, Real-Time Market-Sentiment Engine','Python, LLMs (RAG), Kafka, FastAPI, AWS',
'- Streams live financial news through an LLM extracting entities and sentiment.',
'Live demo: https://maxmilliamokafor.github.io/signaldesk/ | Code: https://github.com/MaxmilliamOkafor/signaldesk','',
'DriftGuard, Self-Healing MLOps Platform','Python, MLflow, Evidently, Docker, Kubernetes',
'- Watches a deployed model for drift and retrains automatically.',
'Live demo: https://maxmilliamokafor.github.io/driftguard/ | Code: https://github.com/MaxmilliamOkafor/driftguard','',
'TECHNICAL SKILLS',
'Python, SQL, Kafka, Airflow, AWS, Azure, Kubernetes, Docker, Terraform','',
'EDUCATION',
'Master of Science in Artificial Intelligence and Machine Learning - Distinction','Imperial College London','',
'Bachelor of Science in Computer Science - First Class Honours','University of Derby'].join('\n');

const out=RA.runRecruiterAudit({cvText:RAW,jdText:'kafka kubernetes mlops',jdTitle:'Software Engineer',
  jobKeywords:['Kafka','Kubernetes','MLOps'],
  education:[{institution:'Imperial College London',start_year:'2021',end_year:'2022'},
             {institution:'University of Derby',start_year:'2016',end_year:'2019'}]});
const built=DG.fromCvText(out.cvText,{name:'Maxmilliam Okafor'});
const tmp=path.join(os.tmpdir(),'verify'+Date.now());fs.mkdirSync(tmp,{recursive:true});
fs.writeFileSync(path.join(tmp,'d.docx'),Buffer.from(built.base64,'base64'));
cp.execSync('cd '+tmp+' && unzip -qo d.docx');
const xml=fs.readFileSync(path.join(tmp,'word','document.xml'),'utf8');
const listing=cp.execSync('cd '+tmp+' && unzip -l d.docx').toString();
fs.rmSync(tmp,{recursive:true,force:true});

const paras=xml.match(/<w:p>[\s\S]*?<\/w:p>/g)||[];
const textOf=(p)=>(p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)||[]).map(x=>x.replace(/<[^>]+>/g,'')).join('').replace(/&amp;/g,'&').replace(/&apos;/g,"'");
const plain=paras.map(textOf).filter(x=>x.trim());
const flat=plain.join('\n');

let P=0,F=0;
const chk=(n,ok,d)=>{ok?P++:F++;console.log((ok?'  PASS  ':'  FAIL  ')+n+(ok?'':'\n           >> '+d));};

console.log('=== DOCUMENT STRUCTURE ===');
chk('no tables',!/<w:tbl[ >]/.test(xml),'tables are read in parser-chosen order');
chk('no text boxes',!/<w:txbxContent/.test(xml),'text boxes are frequently skipped entirely');
chk('no columns',!/<w:cols [^>]*w:num="[2-9]"/.test(xml),'columns interleave');
chk('no images',!/<w:drawing/.test(xml),'images contribute no text');
chk('no header/footer part',!/header\d?\.xml|footer\d?\.xml/.test(listing),'many parsers never read them');
// The original auto-rejection cause was spacing:24 (1.2pt) on SECTION
// HEADINGS, which stopped OpenResume detecting a section at all. The
// name carries a deliberate 0.2pt, which four live parses extracted
// correctly, so the check has to name what it means rather than ban all
// tracking -- a blanket ban fails on a setting that is proven to work.
{
  const spaced = paras.filter((p) => /<w:spacing w:val="[1-9]\d*"\/>/.test(p));
  const headingSpaced = spaced.filter((p) => /<w:caps\/>/.test(p) || /^[A-Z][A-Z &]+$/.test(textOf(p).trim()));
  chk('no letter spacing on any section heading', headingSpaced.length === 0,
    JSON.stringify(headingSpaced.map(textOf)));
  const worst = Math.max(0, ...spaced.map((p) => +(/<w:spacing w:val="(\d+)"\/>/.exec(p) || [0, 0])[1]));
  chk('any tracking that exists is under half a point', worst <= 10,
    worst + ' twips (' + (worst / 20) + 'pt) -- 1.2pt is what broke section detection');
}
chk('no docProps (no author/generator)',!/docProps/.test(listing),listing);

console.log('\n=== TEXT HYGIENE ===');
chk('no en or em dash anywhere',!/[–—]/.test(flat),JSON.stringify((flat.match(/.{0,25}[–—].{0,25}/)||[''])[0]));
chk('phone is the tested format',/\+353 087 426 1508/.test(flat),(flat.match(/\+353[^|\n]*/)||[''])[0]);
chk('no unfilled placeholder',!/\[insert|\{\{|\bTBD\b/i.test(flat),'a prompt instruction reached the document');
chk('no "with a ability" style wreckage',!/\b(with|and)\s+(a|an)\s+(ability|experience)\b/i.test(flat)&&!/\bwith\s+in\b/i.test(flat),flat.slice(0,200));

console.log('\n=== WORK EXPERIENCE ===');
for(const co of ['Meta','SolimHealth','Citigroup']){
  const line=plain.filter(x=>x.indexOf(co)===0)[0]||'';
  chk('"'+co+'" is a bare company name',line.indexOf(co)===0&&!/,\s*(Dublin|Dallas|London)/.test(line),JSON.stringify(line));
}
// The reference-template grid: dates beside the company, location
// beside the title. Both tab-separated so they stay two text items.
chk('company and dates are one tabbed paragraph',
  paras.filter(p=>/Meta/.test(textOf(p))&&/January 2023/.test(textOf(p))&&/<w:tab\/>/.test(p)).length===1,'not tab-delimited');
chk('title and location are one tabbed paragraph',
  paras.filter(p=>/Software Engineer/.test(textOf(p))&&/Dublin/.test(textOf(p))&&/<w:tab\/>/.test(p)).length===1,'not tab-delimited');
chk('titles are separate from companies',plain.includes('Software Engineer'),'title welded to company');
chk('dates use a plain hyphen',/January 2023 - Present/.test(flat),(flat.match(/January 2023[^\n]*/)||[''])[0]);

console.log('\n=== EDUCATION (both degrees) ===');
const eduGap=(needle)=>{const p=paras.filter(x=>textOf(x).indexOf(needle)===0)[0]||'';const m=/w:before="(\d+)"/.exec(p);return m?+m[1]:0;};
chk('first degree present',/Master of Science/.test(flat),'missing');
chk('second degree present',/Bachelor of Science/.test(flat),'missing');
chk('second degree opens a new entry (gap)',eduGap('Bachelor of Science')>=150,'w:before='+eduGap('Bachelor of Science')+' -- folds into the first entry');
chk('graduation years restored',/2021 - 2022/.test(flat)&&/2016 - 2019/.test(flat),'Workday requires From/To years');

console.log('\n=== PROJECTS (both) ===');
chk('first project present',/SignalDesk/.test(flat),'missing');
chk('second project present',/DriftGuard/.test(flat),'missing');
chk('second project opens a new entry (gap)',eduGap('DriftGuard')>=150,'w:before='+eduGap('DriftGuard'));
chk('tech stack shares the title line',
  paras.filter(p=>/SignalDesk/.test(textOf(p))&&/FastAPI/.test(textOf(p))&&/<w:tab\/>/.test(p)).length===1,'stack on its own line');
chk('links fit one line',(plain.filter(x=>x.indexOf('Live demo')===0)[0]||'').length<=105,(plain.filter(x=>x.indexOf('Live demo')===0)[0]||'').length+' chars');
chk('links still URL-shaped',/\S+\.[a-z]+\/\S+/.test(plain.filter(x=>x.indexOf('Live demo')===0)[0]||''),'not extractable as a URL');

console.log('\n=== SECTION ORDER (reading order an ATS consumes) ===');
const want=['PROFESSIONAL SUMMARY','PROFESSIONAL EXPERIENCE','TECHNICAL SKILLS','PROJECTS','EDUCATION'];
const pos=want.map(w=>[w,flat.indexOf(w)]);
chk('every section present',pos.every(([,i])=>i>=0),JSON.stringify(pos));
chk('sections in order',JSON.stringify(pos)===JSON.stringify(pos.slice().sort((a,b)=>a[1]-b[1])),JSON.stringify(pos));
// The CV arrives with CORE COMPETENCIES and TECHNICAL SKILLS as separate
// sections. A parser finds the skills section by looking for the word
// "skill" in a heading and takes the first match, so two of them means
// one is dropped -- which is what a live parse showed, with the
// competencies coming back empty. One section, every term in it.
chk('exactly one heading a parser reads as skills',
  plain.filter(x=>/^[A-Z][A-Z ]*SKILLS$/.test(x.trim())).length===1,
  JSON.stringify(plain.filter(x=>/SKILL/i.test(x))));
chk('no competencies heading survives',!/CORE COMPETENCIES/.test(flat),'two skills sections');
for(const term of ['Machine Learning','MLOps','Data Engineering','Cloud Architecture','Terraform','Airflow'])
  chk('  kept: '+term,flat.indexOf(term)>=0,'the merge dropped a keyword');

console.log('\n=== ONE PAGE ===');
const m=DG.measureCv(out.cvText);
chk('fits a page',m.fitsOnePage,JSON.stringify(m));
console.log('  density: '+m.density+'  height '+m.heightTwips+'/'+m.pageHeightTwips);

console.log('\n'+P+' passed, '+F+' failed');
process.exit(F?1:0);
