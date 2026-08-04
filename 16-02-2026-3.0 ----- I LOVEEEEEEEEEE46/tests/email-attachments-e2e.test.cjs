// END TO END: a real generated DOCX must survive generation -> attachment
// selection -> MIME encoding -> decoding, and still open as a valid Word
// document. Every link was tested in isolation; this proves the chain.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const fs=require('fs'), cp=require('child_process');
global.window=global;
global.chrome={runtime:{id:'x',lastError:null,getManifest:()=>({})},tabs:{create:(o,cb)=>cb&&cb({id:1})},
  identity:{getRedirectURL:()=>'https://x.chromiumapp.org/'},
  storage:{local:{get:(k,cb)=>cb({}),set:(o,cb)=>cb&&cb(),remove:(k,cb)=>cb&&cb()}}};
const path=require('path'), Module=require('module');
const load=(f)=>{const file=path.join(__dirname,'..',f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
const DGmod=load('docx-generator.js'); const DG=DGmod.DocxGenerator||DGmod;
const F=load('followup-email.js');

// 1. Generate the real documents the extension would attach.
const CV=['Maxmilliam Okafor','Dublin  |  +353 874 261 508  |  maxokafordev@gmail.com','',
 'PROFESSIONAL SUMMARY','Engineer.','','WORK EXPERIENCE','Meta','Software Engineer',
 '01/2023 - Present','- Cut review queue 40%.',''].join('\n');
const CL=['Maxmilliam Okafor','Dublin','','Dear Hiring Manager,','','I am applying.','','Kind regards,','Maxmilliam'].join('\n');
const cv=DG.fromCvText(CV,{name:'Maxmilliam_Okafor_CV',filename:'Maxmilliam_Okafor_CV.docx'});
const cl=DG.fromCoverLetterText(CL,{name:'Maxmilliam_Okafor_Cover',filename:'Maxmilliam_Okafor_Cover.docx'});
t('CV DOCX generated', cv.success===true, cv.error);
t('cover letter DOCX generated', cl.success===true, cl.error);

// 2. Exactly the shape followupAttachments() produces.
const attachments=[
  {filename:cv.filename||'Maxmilliam_Okafor_CV.docx', base64:cv.base64},
  {filename:cl.filename||'Maxmilliam_Okafor_Cover.docx', base64:cl.base64},
];

// 3. Through the real MIME builder.
const raw=F.buildRaw({to:'recruiter@nortal.com',subject:'Application submitted - Principal Data Scientist',
  body:'Dear Hiring Manager,\n\nI have submitted my application.\n\nKind regards,\nMaxmilliam',
  fromName:'Maxmilliam Okafor', attachments});
const mime=Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');
t('message is multipart/mixed', /Content-Type: multipart\/mixed/.test(mime));
t('both parts marked as attachments', (mime.match(/Content-Disposition: attachment/g)||[]).length===2);
t('docx mime type declared', (mime.match(/wordprocessingml\.document/g)||[]).length===2);

// 4. Pull each attachment back out and prove it is a real .docx.
const b=/boundary="([^"]+)"/.exec(mime)[1];
const parts=mime.split('--'+b).filter(p=>/Content-Disposition: attachment/.test(p));
t('two attachment parts recovered', parts.length===2, String(parts.length));
parts.forEach((p,i)=>{
  const name=/filename="([^"]+)"/.exec(p)[1];
  const data=p.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim().replace(/\s+/g,'');
  const buf=Buffer.from(data,'base64');
  const f=path.join(require('os').tmpdir(),'jg-rt'+i+'-'+Date.now()+'.docx'); fs.writeFileSync(f,buf);
  t('['+name+'] is a ZIP (docx container)', buf[0]===0x50 && buf[1]===0x4B, 'magic '+buf.slice(0,2).toString('hex'));
  let ok=false, txt='';
  try {
    txt=cp.execSync('python3 -c "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);sys.stdout.write(z.read(\'word/document.xml\').decode(\'utf8\'))" '+f).toString();
    ok=true;
  } catch(e) {}
  t('['+name+'] opens and contains word/document.xml', ok, 'unreadable as docx');
  t('['+name+'] content intact after round trip', /Maxmilliam Okafor/.test(txt.replace(/<[^>]+>/g,'')), 'name missing');
  fs.unlinkSync(f);
});
const cvPart=parts.find(p=>/CV\.docx/.test(p));
t('CV bytes identical to what was generated',
  Buffer.from(cvPart.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim().replace(/\s+/g,''),'base64')
    .equals(Buffer.from(cv.base64,'base64')), 'bytes altered in transit');
console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
