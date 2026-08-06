// Account creation and sign-in on the ATS that demand it. The security
// properties here matter more than the convenience: a credential filler
// that fills on the wrong domain is a credential leak, not a feature.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP ats-account: jsdom not installed'); process.exit(0); }
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const fs=require('fs'),path=require('path');
const DIR=path.join(__dirname,'..');
let STORE={};
global.chrome={runtime:{id:'x'},storage:{local:{
  get:(k,cb)=>{const o={};(Array.isArray(k)?k:[k]).forEach(x=>{if(x in STORE)o[x]=STORE[x];});cb(o);},
  set:(o,cb)=>{Object.assign(STORE,o);cb&&cb();},
  remove:(k,cb)=>{(Array.isArray(k)?k:[k]).forEach(x=>delete STORE[x]);cb&&cb();},
}}};
const dom=new JSDOM('<body></body>',{url:'https://acme.wd1.myworkdayjobs.com/apply'});
global.window=dom.window; global.document=dom.window.document;
global.HTMLInputElement=dom.window.HTMLInputElement;
global.HTMLTextAreaElement=dom.window.HTMLTextAreaElement;
global.Event=dom.window.Event;
global.crypto=require('crypto').webcrypto;
const loadCjs=(f)=>{const Module=require('module');
  const file=path.join(DIR,f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};
const A=loadCjs('ats-account.js');

(async () => {

// ---- domain identity, which every security rule depends on ------------
t('a Workday tenant resolves to the employer domain',
  A.registrableDomain('acme.wd1.myworkdayjobs.com')==='myworkdayjobs.com');
t('www is ignored', A.registrableDomain('www.taleo.net')==='taleo.net');
t('a two-part TLD is kept whole', A.registrableDomain('jobs.acme.co.uk')==='acme.co.uk');
t('the same site matches itself across subdomains',
  A.sameSite('acme.wd1.myworkdayjobs.com','acme.wd5.myworkdayjobs.com'));
t('a different site never matches', !A.sameSite('taleo.net','taleo.net.evil.com'));
t('a look-alike domain never matches', !A.sameSite('myworkdayjobs.com','myworkdayjobs.co'));

// ---- generated passwords ----------------------------------------------
const pw=A.generatePassword(16);
t('a generated password is the requested length', pw.length===16, pw.length+'');
t('it satisfies upper/lower/digit/symbol rules',
  /[A-Z]/.test(pw)&&/[a-z]/.test(pw)&&/[0-9]/.test(pw)&&/[!@#$%*?_-]/.test(pw), pw);
t('it avoids characters that get mis-transcribed', !/[IlO01]/.test(pw), pw);
const many=new Set(); for(let i=0;i<200;i++) many.add(A.generatePassword(16));
t('passwords are not predictable', many.size===200, many.size+' unique of 200');
t('length is clamped to what ATS accept',
  A.generatePassword(4).length>=12 && A.generatePassword(999).length<=20);

// ---- one password per site, never reused ------------------------------
STORE={};
const c1=await A.ensureCredential('acme.wd1.myworkdayjobs.com','me@example.com','workday');
const c2=await A.ensureCredential('careers.taleo.net','me@example.com','taleo');
t('each site gets its own password', c1.password!==c2.password);
t('a breach at one site does not expose the other', c1.password!==c2.password);
const again=await A.ensureCredential('acme.wd5.myworkdayjobs.com','me@example.com','workday');
t('the same site keeps its existing password', again.password===c1.password,
  'a new password would lock the user out of the account they already made');
t('the real email is used, so confirmations arrive', c1.email==='me@example.com');
t('a credential is never created without an email',
  (await A.ensureCredential('example.org',''))===null);

// ---- RULE 1: only ever filled on its own domain -----------------------
const form=(kind)=>`<form>
  <input type="email" name="email" />
  ${kind==='signup'?'<input type="email" name="confirmEmail" placeholder="Confirm email" />':''}
  <input type="password" name="password" />
  ${kind==='signup'?'<input type="password" name="confirmPassword" />':''}
  <button type="submit">${kind==='signup'?'Create Account':'Sign In'}</button>
</form>`;

document.body.innerHTML=form('signup');
let r=await A.fillCredentialForm({document, location:{protocol:'https:',hostname:'acme.wd1.myworkdayjobs.com',href:'https://acme.wd1.myworkdayjobs.com/apply'}, email:'me@example.com'});
t('a registration form is filled', r.ok&&r.kind==='signup', JSON.stringify(r));
t('the password field is filled', document.querySelector('input[name="password"]').value.length>=12);
t('the confirm field matches',
  document.querySelector('input[name="confirmPassword"]').value===document.querySelector('input[name="password"]').value);
t('the confirm-email field matches', document.querySelector('input[name="confirmEmail"]').value==='me@example.com');

// The attack this rule exists to stop.
document.body.innerHTML=form('signin');
r=await A.fillCredentialForm({document, location:{protocol:'https:',hostname:'myworkdayjobs.com.evil.example',href:'https://myworkdayjobs.com.evil.example/login'}, email:'me@example.com'});
t('a look-alike domain gets nothing', !r.ok, JSON.stringify(r));
t('and no password reaches the page', document.querySelector('input[name="password"]').value==='' );

// ---- RULE 2: never over an insecure or credential-bearing URL ---------
document.body.innerHTML=form('signup');
r=await A.fillCredentialForm({document, location:{protocol:'http:',hostname:'acme.wd1.myworkdayjobs.com',href:'http://acme.wd1.myworkdayjobs.com/apply'}, email:'me@example.com'});
t('plain http is refused', !r.ok&&r.reason==='insecure-page', JSON.stringify(r));
t('nothing was filled over http', document.querySelector('input[name="password"]').value==='' );
r=await A.fillCredentialForm({document, location:{protocol:'https:',hostname:'acme.wd1.myworkdayjobs.com',href:'https://user:pw@acme.wd1.myworkdayjobs.com/apply'}, email:'me@example.com'});
t('a URL carrying embedded credentials is refused',
  !r.ok&&r.reason==='credentials-in-url', JSON.stringify(r));

// ---- signing in to an account made elsewhere --------------------------
STORE={};
document.body.innerHTML=form('signin');
r=await A.fillCredentialForm({document, location:{protocol:'https:',hostname:'careers.icims.com',href:'https://careers.icims.com/login'}, email:'me@example.com'});
t('signing in with no saved credential does not guess a password',
  !r.ok&&r.reason==='no-saved-credential', JSON.stringify(r));
t('and nothing is typed into the form', document.querySelector('input[name="password"]').value==='',
  'a wrong password can lock the account');

// ---- form recognition -------------------------------------------------
document.body.innerHTML=form('signup');
t('two password fields means registration', A.detectForm(document).kind==='signup');
document.body.innerHTML=form('signin');
t('one password field with sign-in wording means sign-in', A.detectForm(document).kind==='signin');
document.body.innerHTML='<form><input type="text" name="firstName" /></form>';
t('a form with no password is not a credential form', A.detectForm(document).kind==='none');
document.body.innerHTML='<form><input type="password" style="display:none" /></form>';
t('a hidden password field is ignored', A.detectForm(document).kind==='none');

// Filling must never submit on its own.
document.body.innerHTML=form('signup');
let submitted=false;
document.querySelector('button').addEventListener('click',()=>{submitted=true;});
await A.fillCredentialForm({document, location:{protocol:'https:',hostname:'acme.wd1.myworkdayjobs.com',href:'https://acme.wd1.myworkdayjobs.com/apply'}, email:'me@example.com'});
t('filling does not submit by itself', !submitted, 'creating an account must be a separate decision');
t('but the submit control is found for the caller', A.detectForm(document).submit!==null);

// ---- RULE 3: passwords never reach the trace --------------------------
const T=loadCjs('jg-trace.js');
STORE={};
await A.ensureCredential('acme.wd1.myworkdayjobs.com','me@example.com','workday');
const traced=JSON.stringify(T.redact({ ats_accounts: STORE['ats_accounts'] }));
t('the credential vault is redacted from the trace',
  traced.indexOf(STORE['ats_accounts']['myworkdayjobs.com'].password)===-1, traced.slice(0,200));
t('so is the Gmail token store', JSON.stringify(T.redact({followup_oauth_token:{access_token:'secret123'}})).indexOf('secret123')===-1);
const acct=fs.readFileSync(path.join(DIR,'ats-account.js'),'utf8');
t('the module never logs a password',
  !/console\.(log|warn|error)\([^)]*password/i.test(acct), 'a password would reach the console');

// ---- retrievable, or the generated password is lost -------------------
const list=await A.listCredentials();
t('saved accounts can be listed back', list.length===1&&list[0].password, JSON.stringify(list.length));
const popupJs=fs.readFileSync(path.join(DIR,'popup.js'),'utf8');
const popupHtml=fs.readFileSync(path.join(DIR,'popup.html'),'utf8');
t('and shown in the popup',
  /atsAccountsShow/.test(popupJs)&&/id="atsAccountsShowBtn"/.test(popupHtml),
  'a generated password you cannot read is a locked box');
t('the storage caveat is stated, not assumed',
  /not encrypted at rest/i.test(popupHtml), 'the user should know what the guarantee is');
await A.removeCredential('myworkdayjobs.com');
t('an account can be forgotten', (await A.listCredentials()).length===0);

// ---- Workday's own hooks, taken from a working implementation --------
// Its automation IDs are stable; label matching is not. And Workday will
// not create the account unless its checkbox is ticked -- fill everything
// correctly, press submit, and validation fails in a way that reads as a
// broken form.
STORE={};
document.body.innerHTML = `
  <div class="signUp-formWrap"><form>
    <input data-automation-id="email" type="text" />
    <input data-automation-id="password" type="password" />
    <input data-automation-id="verifyPassword" type="password" />
    <input data-automation-id="createAccountCheckbox" type="checkbox" />
    <button data-automation-id="createAccountSubmitButton">Create Account</button>
  </form></div>`;
let wd = A.detectForm(document, 'acme.wd1.myworkdayjobs.com');
t('Workday registration is recognised by its automation IDs',
  wd.kind==='signup' && wd.platform==='workday', JSON.stringify({kind:wd.kind,platform:wd.platform}));
t('its verifyPassword field is found', !!wd.confirm);
t('its consent checkbox is found', !!wd.agree);
t('its submit button is found', !!wd.submit);

r = await A.fillCredentialForm({document, location:{protocol:'https:',hostname:'acme.wd1.myworkdayjobs.com',href:'https://acme.wd1.myworkdayjobs.com/apply'}, email:'me@example.com'});
t('Workday registration fills', r.ok && r.kind==='signup', JSON.stringify(r));
t('the create-account box is ticked, or Workday refuses',
  document.querySelector('[data-automation-id="createAccountCheckbox"]').checked, 'validation would fail');
t('both password fields match',
  document.querySelector('[data-automation-id="password"]').value
  === document.querySelector('[data-automation-id="verifyPassword"]').value);

// Sign-in on Workday: one password field, its own submit button.
document.body.innerHTML = `
  <div class="emailLogin-formWrap"><form>
    <input data-automation-id="email" type="text" />
    <input data-automation-id="password" type="password" />
    <button data-automation-id="signInSubmitButton">Sign In</button>
  </form></div>`;
wd = A.detectForm(document, 'acme.wd1.myworkdayjobs.com');
t('Workday sign-in is distinguished from registration', wd.kind==='signin', wd.kind);
t('and uses the sign-in submit button', !!wd.submit);

// ---- iCIMS renders its form in an iframe -----------------------------
// A document-only search finds nothing there, and the account wall looks
// impassable when it is not.
const frameDoc = new JSDOM(`<body><form>
  <input type="email" name="email" />
  <input type="password" name="password" />
  <button type="submit">Sign In</button>
</form></body>`).window.document;
document.body.innerHTML = '<div class="iCIMS_LoginPage"><iframe id="icims_formFrame"></iframe></div>';
const iframeEl = document.querySelector('iframe');
Object.defineProperty(iframeEl, 'contentDocument', { get: () => frameDoc });
t('a credential form inside a same-origin frame is found',
  A.detectForm(document, 'careers.icims.com').kind==='signin', 'iCIMS would look impassable');

// A cross-origin frame throws on access; that must be handled, not worked
// around. Rebuild the DOM so this is a fresh element.
document.body.innerHTML = '<div class="iCIMS_LoginPage"><iframe id="blocked"></iframe></div>';
Object.defineProperty(document.querySelector('iframe'), 'contentDocument',
  { configurable: true, get: () => { throw new Error('cross-origin'); } });
let threw = false, kind = '';
try { kind = A.detectForm(document, 'careers.icims.com').kind; } catch (e) { threw = true; }
t('a cross-origin frame is skipped without throwing', !threw && kind === 'none', kind);

// ---- a failed registration must be visible ---------------------------
document.body.innerHTML = '<div data-automation-id="errorMessage">Email already in use</div>';
t('an ATS error message is read back',
  /already in use/.test(A.formError(document, 'acme.wd1.myworkdayjobs.com')),
  'a failed registration would look like success');
document.body.innerHTML = '<div role="alert">Password does not meet requirements</div>';
t('a generic alert is read too', /requirements/.test(A.formError(document, 'careers.example.com')));
document.body.innerHTML = '<p>All good</p>';
t('no error means no error', A.formError(document, 'x')==='');

// ---- the generated password must satisfy the strictest rules seen ----
// SpeedyApply's own validation: 8-20 characters, at least one uppercase.
for (let i=0;i<50;i++) {
  const p2=A.generatePassword(16);
  if (p2.length<8||p2.length>20||!/[A-Z]/.test(p2)) { t('generated passwords pass ATS validation', false, p2); break; }
  if (i===49) t('generated passwords pass the strictest observed ATS rules', true);
}

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
})();
