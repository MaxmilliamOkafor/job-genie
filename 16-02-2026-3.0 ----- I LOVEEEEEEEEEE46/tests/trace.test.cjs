// The tracer is the thing that turns "it crashed" into a cause. Its own
// correctness matters: a tracer that loses the error, or that leaks a
// credential into something the user pastes into a bug report, is worse
// than none.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
let STORE={};
global.chrome={runtime:{id:'x',getManifest:()=>({version:'3.4.0'})},storage:{local:{
  get:(k,cb)=>{const o={};(Array.isArray(k)?k:[k]).forEach(x=>{if(x in STORE)o[x]=STORE[x];});cb(o);},
  set:(o,cb)=>{Object.assign(STORE,o);cb&&cb();},
  remove:(k,cb)=>{(Array.isArray(k)?k:[k]).forEach(x=>delete STORE[x]);cb&&cb();},
}}};
const loadCjs=(f)=>{const fs=require('fs'),path=require('path'),Module=require('module');
  const file=path.join(__dirname,'..',f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
const T=loadCjs('jg-trace.js');

(async () => {
T.clear();

// ---- credentials must never reach something you paste into a report ----
const red=T.redact({password:'hunter2',apiKey:'co-key',token:'abc',Authorization:'Bearer xyz',
                    refresh_token:'r',name:'Aoife',nested:{secret:'s',ok:'fine'}});
for (const k of ['password','apiKey','token','Authorization','refresh_token'])
  t(k+' is redacted', red[k]==='[redacted]', JSON.stringify(red));
t('nested secrets are redacted too', red.nested.secret==='[redacted]', JSON.stringify(red.nested));
t('ordinary values survive', red.name==='Aoife'&&red.nested.ok==='fine', JSON.stringify(red));
t('a bearer value is caught even under a harmless key',
  T.redact({h:'Bearer abc123'}).h==='[redacted]');
t('a JWT-shaped value is caught by shape',
  T.redact({x:'eyJhbGciOiJIUzI1NiJ9abcdef'}).x==='[redacted]');

// ---- it must not blow up on the things a popup actually handles --------
t('a DOM-ish node is named, not serialised', /^\[dom /.test(T.redact({nodeType:1,tagName:'DIV',id:'x'})));
t('long strings are truncated', T.redact('x'.repeat(5000)).length<400);
t('deep objects terminate', JSON.stringify(T.redact({a:{b:{c:{d:{e:1}}}}})).length<200);
const cyc={a:1}; cyc.self=cyc;
let ok=true; try { T.redact(cyc); } catch(e){ ok=false; }
t('a cycle does not throw', ok);

// ---- instrumentation captures the failing call ------------------------
class Demo {
  good(a){ return a*2; }
  async slow(){ return 'done'; }
  bad(){ throw new Error('boom'); }
  async rejects(){ throw new Error('async boom'); }
}
const n=T.instrument(Demo.prototype,'demo');
t('methods are wrapped', n>=4, String(n));
const d=new Demo();
t('a wrapped method still returns its value', d.good(21)===42);
t('a wrapped async method still resolves', (await d.slow())==='done');
let threw=false; try { d.bad(); } catch(e){ threw=e.message==='boom'; }
t('a synchronous throw still propagates', threw);
let rejected=false; try { await d.rejects(); } catch(e){ rejected=e.message==='async boom'; }
t('a rejection still propagates', rejected);

const txt=T.asText();
t('the failing call is named in the trace', /bad\(\) threw synchronously/.test(txt), txt.slice(0,400));
t('the rejection is named too', /rejects\(\) rejected/.test(txt));
t('the error message is recorded', /boom/.test(txt));
t('timings are recorded', /"ms":/.test(txt));
t('arguments are recorded', /good →/.test(txt));

// ---- output is usable -------------------------------------------------
const snap=T.snapshot();
t('the snapshot counts entries', snap.entries>0, String(snap.entries));
t('the snapshot carries the version', snap.extension==='3.4.0', snap.extension);
t('the text export has a header', /Job Genie trace/.test(txt));
await T.persist();
t('the trace survives the popup closing', !!STORE['jg_trace'], Object.keys(STORE).join(','));
t('and can be read back', (await T.restore()).entries>0);

// ---- it must be possible to turn off and to reset ---------------------
T.clear();
t('clearing empties the buffer', T.snapshot().entries<=1, String(T.snapshot().entries));
T.setEnabled(false);
d.good(1);
const after=T.snapshot().entries;
T.setEnabled(true);
t('disabling stops recording', T.snapshot().entries===after);

// ---- wiring -----------------------------------------------------------
const fs=require('fs'),path=require('path');
const DIR=path.join(__dirname,'..');
const popupJs=fs.readFileSync(path.join(DIR,'popup.js'),'utf8');
const popupHtml=fs.readFileSync(path.join(DIR,'popup.html'),'utf8');
// Match the TAG, not a comment that happens to mention popup.js.
t('the tracer loads before the popup',
  popupHtml.indexOf('src=\'jg-trace.js\'')<popupHtml.indexOf('src=\'popup.js\'')
  || popupHtml.indexOf('src="jg-trace.js"')<popupHtml.indexOf('src="popup.js"'),
  'trace would not be loaded when popup.js runs');
t('the popup class is instrumented',
  /JGTrace\.instrument\(ATSTailor\.prototype/.test(popupJs), 'nothing would be traced');
t('instrumentation happens before construction',
  popupJs.indexOf('JGTrace.instrument(ATSTailor.prototype')<popupJs.indexOf('window.atsTailor = new ATSTailor()'),
  'constructor calls would be missed');
t('uncaught errors reach the trace', /JGTrace\.error\(/.test(popupJs));
t('the trace can be exported', /traceExport/.test(popupJs)&&/id="traceCopyBtn"/.test(popupHtml));
t('every export control has a handler',
  ['traceCopyBtn','traceSaveBtn','traceClearBtn']
    .every(id=>new RegExp("getElementById\\('"+id+"'\\)\\?\\.addEventListener").test(popupJs)));

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
})();
