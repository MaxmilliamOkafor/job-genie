// Dates in a generated CV must be recognised as dates, readable, and bound
// to the role they belong to -- under every way a parser can treat a tab.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const path=require('path'), fs=require('fs'), Module=require('module');
const load=(f)=>{const file=path.join(__dirname,'..',f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
global.window=global;
const api=load('docx-generator.js').DocxGenerator||load('docx-generator.js');

const CV=['Maxmilliam Okafor','Dublin  |  +353 874 261 508  |  maxokafordev@gmail.com','',
 'WORK EXPERIENCE','Meta','Software Engineer','01/2023 - Present','- Built the API gateway.','',
 'SolimHealth','AI Product Manager (Contract, part-time)','02/2024 - 07/2025','- Trained the model.',''].join('\n');
const res=api.fromCvText(CV,{});
t('document generated', res && res.success===true, res && res.error);
const tmp=path.join(require('os').tmpdir(),'jg-dates-'+Date.now()+'.docx');
fs.writeFileSync(tmp, Buffer.from(res.base64,'base64'));
const xml=require('child_process').execSync(
  'python3 -c "import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(\'word/document.xml\').decode(\'utf8\'))" '+JSON.stringify(tmp)).toString();
fs.unlinkSync(tmp);
const extract=(mode)=>xml.replace(/<w:tab\/>/g,mode).replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,'');

t('MM/YYYY range is recognised as a date', !/01\/2023/.test(xml), 'raw MM/YYYY still present -> isDateLine missed it');
t('rendered as full month-year', /January 2023/.test(xml) && /February 2024/.test(xml), 'not prettified');
t('no numeric month/year survives', !/\d{1,2}\/\d{4}/.test(extract('\t')), 'slash form still present');
t('abbreviations expanded for consistency', !/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{4}/.test(extract('\t')), 'mixed abbreviated and full');
// Plain hyphen: ATS date parsers are documented against it, and an en
// dash is a needless gamble in the field where a parse failure costs an
// employment record.
t('plain hyphen separator, not an en dash', /January 2023 - Present/.test(extract('\t')) && !/\u2013/.test(extract('\t')), 'separator wrong');
t('right-aligned tab stop used', /w:val="right"/.test(xml));
for (const [label,mode] of [['dropped',''],['as \\t','\t'],['as space',' ']]) {
  const line=extract(mode).split('\n').find(l=>/Software Engineer/.test(l))||'';
  t('title and date share a line when tab is '+label, /Software Engineer/.test(line) && /January 2023/.test(line), JSON.stringify(line));
  t('  title never glues to the date ('+label+')', !/Engineer(January|\d)/.test(line), JSON.stringify(line));
}
const flat=extract('\t');
t('each role keeps its own date', /Software Engineer[\s\S]{0,40}January 2023/.test(flat) && /part-time\)[\s\S]{0,40}February 2024/.test(flat));
t('no orphaned date-only line remains', !/^\s*January 2023 - Present\s*$/m.test(flat), 'date still on its own line');
console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
